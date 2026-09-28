const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { load } = require('cheerio');
const { applyRangeEdits } = require('../utils/textEdit.cjs');
const { extractAiSource } = require('../utils/aiSourceExtraction.cjs');
const { AI_IMAGE_STYLES } = require('./aiImageStyles.cjs');

const AI_IMAGE_STYLE_OPTIONS = Object.entries(AI_IMAGE_STYLES).map(([key, { label, usage }]) => `${key}=${label}（${usage}）`).join('；');

// Agent 的源码路径和正文图片引用均限定为当前工作区内的相对路径。
function resolveImageWorkspaceFile(workspaceDir, file) {
  if (!file || file.includes('\\') || path.isAbsolute(file) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(file) || file.split('/').includes('..')) {
    throw new Error('图片或源码路径必须是当前工作区内使用正斜杠的相对路径');
  }
  return path.join(workspaceDir, file);
}

// 完成正文时检查真实图片引用，未生成的占位不得作为最终结果提交。
function validateContentImageReferences(workspaceDir, html) {
  const $ = require('cheerio').load(html, null, false);
  $('img').each((_index, element) => {
    const reference = $(element).attr('data-yb-asset-ref');
    if (!reference) throw new Error(`图片尚未生成或未填写 data-yb-asset-ref：${$(element).attr('alt') || '未命名图片'}`);
    const file = resolveImageWorkspaceFile(workspaceDir, reference);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`正文引用的图片文件不存在：${reference}`);
  });
}

// 读取最新正文并保留原文位置；不重新序列化 HTML，避免改变正文和图组布局。
function readSectionImages(workspaceDir, section) {
  const file = resolveImageWorkspaceFile(workspaceDir, section.file);
  const html = fs.readFileSync(file, 'utf8');
  const $ = load(html, { sourceCodeLocationInfo: true }, false);
  const ids = new Set();
  const images = $('figure').toArray().map(figure => {
    const node = $(figure);
    const id = node.attr('id');
    if (!id?.trim() || ids.has(id)) throw new Error(`小节 ${section.id} 的 figure id 为空或重复：${id || '空'}`);
    ids.add(id);
    const image = node.find('img');
    const prompt = node.find('template[data-yb-role="prompt"]');
    const generation = node.attr('data-yb-generation');
    const frameSize = node.attr('data-yb-size');
    if (node.find('figure').length || image.length !== 1 || prompt.length !== 1 || !prompt.text().trim()) {
      throw new Error(`图片 ${id} 必须有一个 img 和一个非空提示词，不能嵌套 figure`);
    }
    if (!['aiImage', 'htmlImage', 'mermaid'].includes(generation) || !['square', 'wide', 'tall', 'panorama'].includes(frameSize)) {
      throw new Error(`图片 ${id} 的生成方式或画框比例无效`);
    }
    const reference = image.attr('data-yb-asset-ref') || '';
    const table = node.closest('table');
    const layout = table.length ? table.attr('data-yb-preset') || '' : 'single';
    const exists = reference ? fs.existsSync(resolveImageWorkspaceFile(workspaceDir, reference))
      && fs.statSync(resolveImageWorkspaceFile(workspaceDir, reference)).isFile() : false;
    return {
      image_id: `${encodeURIComponent(section.id)}/${encodeURIComponent(id)}`,
      section_id: section.id, file: section.file, figure_id: id,
      generation, frame_size: frameSize, prompt: prompt.text().trim(),
      alt: image.attr('alt') || '', caption: node.find('figcaption').text().trim(),
      asset_ref: reference, asset_exists: exists,
      reused_original: reference.startsWith('原图/') || Boolean(section.restored_content?.images?.some(item => item.asset_ref === reference)),
      fit: node.attr('data-yb-fit') || '',
      layout, table: table[0], image_text_left: layout === 'imageText' && node.closest('td').prevAll('td').length === 0,
      location: image[0].sourceCodeLocation,
    };
  });
  if ($('img').length !== images.length) throw new Error(`小节 ${section.id} 存在 figure 之外的图片，请先修复正文结构`);
  return { file, html, images };
}

// 仅替换或插入图片引用属性；位置来自解析器，其他原始字符保持不变。
function imageReferenceEdit(html, image, assetRef) {
  const location = image.location;
  if (!location?.startTag) throw new Error(`无法定位图片原始标签：${image.image_id}`);
  const attribute = location.attrs?.['data-yb-asset-ref'];
  const value = assetRef.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const text = `data-yb-asset-ref="${value}"`;
  if (attribute) return { start: attribute.startOffset, end: attribute.endOffset, newText: text };
  const tag = html.slice(location.startTag.startOffset, location.startTag.endOffset);
  const closing = tag.search(/\s*\/?>$/);
  if (closing < 0) throw new Error(`无法定位图片标签结尾：${image.image_id}`);
  const offset = location.startTag.startOffset + closing;
  return { start: offset, end: offset, newText: ` ${text}` };
}

// 并发源码模型只处理当前图片；布局规范随请求提供，不依赖主会话上下文。
function buildImageSourcePrompt(kind, frameSize) {
  const common = '你负责生成投标文件中一张独立配图的源码。只返回源码，不输出 Markdown 围栏或解释。仅使用本次请求提供的内容和数据，不虚构事实、数值或承诺；你没有检索、文件写入或渲染工具，不负责正文编排、生成其他图片或回填正文。';
  if (kind === 'mermaid') {
    return `${common}\n生成 Mermaid 源码：流程图使用 flowchart，思维导图使用 mindmap，实体关系图使用 erDiagram。使用合法语法，正确处理中文标签，节点与连线清晰，避免过度密集。不要生成 HTML。`;
  }
  const height = { square: 1240, wide: 827, tall: 1653, panorama: 698 }[frameSize];
  if (!height) throw new Error('HTML 配图必须提供合法的 frame_size：square、wide、tall 或 panorama');
  return `${common}
生成完整独立 HTML 文档，可用 HTML/CSS/SVG 绘图，不受正文受限 HTML 标签限制；不使用脚本、外部资源或网络依赖。
画布比例为 ${frameSize}，固定设计尺寸为1240×${height}px，以 body 为画布，宽高包含程序统一设置的四周40px内边距，内部可用区域为1160×${height - 80}px；程序按2倍像素输出。保持 body 的 Flex/Grid 布局，不额外包一层画布或重复添加外层边距。
采用正式简洁的配色、清晰层次、统一字体和线条，正文及节点文字不小于24px。标题和主体共同利用可用空间，主体用 Flex/Grid 分配剩余高度，卡片、节点及图形均衡分布，不在底部留下大块空白。
内容不得侵入边距或超出画布，不通过无意义文字、拉伸图形、空卡片或整体缩小内容填满版面，不用隐藏溢出来掩盖裁切。`;
}

// 图片与独立源码均保存在当前工作区；源码生成使用文本队列，转图继续复用本地渲染。
function createContentGenerationImageTools({ aiService, signal, localImageRenderService, onActivity, htmlImageOptimization = false, sections = [], getSections = () => sections, beforeApply = () => {} }, { Type, workspaceDir }) {
  // 进度只发给业务程序，不增加模型上下文或工具调用。
  const report = (step, label, items, extra = {}) => onActivity?.({ progress: { step, label, unit: '张', items, ...extra } });
  const imageProgress = result => ({ id: result.image_id, status: result.status || 'rendering', kind: result.kind,
    source_ready: Boolean(result.source_file), source_file: result.source_file, asset_ref: result.asset_ref });
  // 图片和源码每次生成独立文件，失败或重新生成不会覆盖已有产物。
  function saveImage(buffer, extension) {
    const assetRef = `图片/${crypto.randomUUID()}${extension}`;
    fs.mkdirSync(path.join(workspaceDir, '图片'), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, assetRef), buffer);
    return assetRef;
  }

  // 返回紧凑文字结果及结构化详情，不把图片二进制塞进模型上下文。
  function toolResult(result, text = result) {
    return { content: [{ type: 'text', text: JSON.stringify(text) }], details: result };
  }

  // 按小节合并回填，同一小节原子保存、失败整节不写；批量回填工具与生成、转图后的逐张回填共用。
  function applyImageReferences(items, combinedSignal) {
    const targets = getTargets();
    const groups = new Map();
    const results = new Map();
    for (const item of items) {
      try {
        const parts = item.image_id.split('/');
        const id = decodeURIComponent(parts[0]);
        if (parts.length !== 2 || !targets.has(id)) throw new Error('图片不属于本次目标小节，请使用清单中的 image_id');
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(item);
      } catch (error) { results.set(item.image_id, { image_id: item.image_id, status: 'error', error: error.message }); }
    }
    for (const [id, group] of groups) {
      combinedSignal?.throwIfAborted();
      try {
        const { file, html, images: current } = readSectionImages(workspaceDir, targets.get(id));
        const edits = [];
        for (const item of group) {
          const image = current.find(image => image.image_id === item.image_id);
          if (!image) throw new Error(`图片标识不存在：${item.image_id}`);
          const asset = resolveImageWorkspaceFile(workspaceDir, item.asset_ref);
          if (!fs.existsSync(asset) || !fs.statSync(asset).isFile()) throw new Error(`图片文件不存在：${item.asset_ref}`);
          if (!/\.(?:png|jpe?g|webp|gif|bmp)$/i.test(item.asset_ref)) throw new Error('回填必须使用图片资源，不能使用 HTML/Mermaid 源码');
          if (image.asset_ref === item.asset_ref) continue;
          if (image.asset_ref !== item.previous_asset_ref) throw new Error(`图片引用已变化，请刷新清单：${item.image_id}`);
          edits.push(imageReferenceEdit(html, image, item.asset_ref));
        }
        if (edits.length) {
          const edited = applyRangeEdits(html, edits);
          if (edited.errors.length) throw new Error(edited.errors.join('；'));
          combinedSignal?.throwIfAborted();
          const temporary = `${file}.images.tmp`;
          try { fs.writeFileSync(temporary, edited.content, 'utf8'); fs.renameSync(temporary, file); }
          finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
        }
        for (const item of group) results.set(item.image_id, { image_id: item.image_id, section_id: id, status: 'success', asset_ref: item.asset_ref });
      } catch (error) {
        for (const item of group) results.set(item.image_id, { image_id: item.image_id, section_id: id, status: 'error', error: error.message });
      }
    }
    return items.map(item => results.get(item.image_id));
  }

  // 生成前读取最新正文确认图片位置，记录原引用供成功后回填；找不到的图片不请求模型。
  function readImageReferences(images) {
    const targets = getTargets();
    const references = new Map();
    const errors = new Map();
    for (const id of new Set(images.map(image => decodeURIComponent(image.image_id.split('/')[0])))) {
      try {
        if (!targets.has(id)) throw new Error('图片不属于本次目标小节，请使用清单中的 image_id');
        for (const image of readSectionImages(workspaceDir, targets.get(id)).images) references.set(image.image_id, image.asset_ref);
      } catch (error) { errors.set(id, error.message); }
    }
    return image => {
      if (image.image_id.split('/').length === 2 && references.has(image.image_id)) return references.get(image.image_id);
      throw new Error(errors.get(decodeURIComponent(image.image_id.split('/')[0])) || `正文中不存在该图片，请使用清单中的 image_id：${image.image_id}`);
    };
  }

  // 首次生成和源码修复共用转图逻辑；源码一就绪即进入已有本地队列。
  async function renderImage(result, combinedSignal) {
    combinedSignal.throwIfAborted();
    const renderer = localImageRenderService || require('./localImageRenderService.cjs').getLocalImageRenderService();
    const pauseOptions = { isPauseRequested: () => combinedSignal.aborted, createPauseError: () => combinedSignal.reason };
    const source = fs.readFileSync(resolveImageWorkspaceFile(workspaceDir, result.source_file), 'utf8');
    report('images', '正在生成图片与本地转图', [imageProgress(result)]);
    const rendered = result.kind === 'html'
      ? await renderer.renderHtmlToPng(source, { ...pauseOptions, frameSize: result.frame_size, checkLayout: htmlImageOptimization })
      : await renderer.renderMermaidToPng(source, pauseOptions);
    combinedSignal.throwIfAborted();
    Object.assign(result, {
      asset_ref: saveImage(rendered.buffer, '.png'), width: rendered.width, height: rendered.height,
      ...(result.kind === 'html' ? { layout_issues: rendered.layout_issues } : {}),
      status: result.kind === 'html' && rendered.layout_issues?.length ? 'needs_repair' : 'success',
    });
  }

  // 等待整批退出后返回结果；每张成功后立即回填正文，暂停时已完成图片已落入正文。
  // details 保留逐项完整结果供程序和会话恢复，模型文本只列未成功或未回填项。
  async function runImageBatch(images, toolSignal, onUpdate, processImage) {
    const combinedSignal = AbortSignal.any([signal, toolSignal].filter(Boolean));
    combinedSignal.throwIfAborted();
    beforeApply();
    if (new Set(images.map(image => image.image_id)).size !== images.length) throw new Error('同一批图片的 image_id 不能重复');
    const previousReference = readImageReferences(images);
    report('images', '正在生成图片与本地转图', images.map(image => ({ id: image.image_id, kind: image.kind, status: image.source_file ? 'rendering' : 'generating', source_ready: Boolean(image.source_file) })));
    let completed = 0;
    const results = await Promise.all(images.map(async image => {
      const result = { image_id: image.image_id, kind: image.kind,
        ...(image.source_file ? { source_file: image.source_file } : {}),
        ...(image.kind === 'html' ? { frame_size: image.frame_size } : {}),
        stage: image.source_file ? 'render' : 'generate' };
      try {
        combinedSignal.throwIfAborted();
        const previous = previousReference(image);
        await processImage(image, result, combinedSignal);
        if (result.status === 'success') {
          result.stage = 'complete';
          // 回填为同步读写，成功图片不因随后暂停而丢失；失败保留图片地址供批量回填工具重试。
          const [applied] = applyImageReferences([{ image_id: image.image_id, asset_ref: result.asset_ref, previous_asset_ref: previous }]);
          Object.assign(result, applied.status === 'success' ? { applied: true } : { applied: false, previous_asset_ref: previous, apply_error: applied.error });
        }
      } catch (error) {
        Object.assign(result, { status: combinedSignal.aborted ? 'cancelled' : 'error', error: error.message });
      }
      report('images', '正在生成图片与本地转图', [imageProgress(result)]);
      onUpdate?.(toolResult({ completed: ++completed, total: images.length, result }));
      return result;
    }));
    const applied = results.filter(result => result.applied !== undefined);
    if (applied.length) report('image-apply', '正在回填图片地址', applied.map(result => ({ id: result.image_id, status: result.applied ? 'success' : 'error' })));
    const unresolved = results.filter(result => result.status !== 'success' || !result.applied);
    const cancelled = combinedSignal.aborted ? { cancelled: true } : {};
    const output = toolResult({ results, ...cancelled }, { total: results.length, applied: results.length - unresolved.length, unresolved, ...cancelled });
    if (unresolved.length) output.isError = true;
    return output;
  }

  // 主流程在编排与还原后提供最终目标；单节修改仍直接传入固定目标。
  const getTargets = () => new Map(getSections().map(section => [section.id, section]));
  return [{
    name: 'list-section-images', label: '读取正文图片清单', executionMode: 'sequential',
    description: '读取本轮目标小节的最新 HTML，按小节返回每张图片的 image_id、生成方式、比例、适配方式、提示词、图注、当前引用及文件存在状态；没有图片的小节不列出。summary 汇总本轮新增图片数、生成方式分布、各布局组数，以及缺少图注、data-yb-fit 或有效引用的 image_id，布局核对和分布统计直接使用 summary。image_id 原样传给图片工具及回填工具，不自行拼接。reused_original 为原方案图片，只复用、不重新生成。默认读取全部目标，可按 section_ids 只刷新待修复小节。',
    parameters: Type.Object({ section_ids: Type.Optional(Type.Array(Type.String(), { uniqueItems: true })) }, { additionalProperties: false }),
    async execute(_callId, { section_ids }, toolSignal) {
      const combinedSignal = AbortSignal.any([signal, toolSignal].filter(Boolean));
      combinedSignal.throwIfAborted();
      const targets = getTargets();
      report('image-list', '正在整理正文图片清单', (section_ids || [...targets.keys()]).map(id => ({ id, status: 'running' })), { unit: '节' });
      const parsed = [];
      const results = (section_ids || [...targets.keys()]).map(id => {
        combinedSignal.throwIfAborted();
        try {
          if (!targets.has(id)) throw new Error(`不能读取非目标小节：${id}`);
          const { images } = readSectionImages(workspaceDir, targets.get(id));
          parsed.push(...images);
          // 小节 ID 和文件已由分组给出，布局等统计信息汇总到 summary。
          return { section_id: id, status: 'success', images: images.map(({ location, section_id, file, layout, table, image_text_left, ...image }) => image) };
        } catch (error) { return { section_id: id, status: 'error', error: error.message }; }
      });
      report('image-list', '图片清单检查完成', results.map(result => ({ id: result.section_id, status: result.status })), { unit: '节', done: true });
      const images = results.flatMap(result => result.images || []);
      const added = parsed.filter(image => !image.reused_original);
      const count = (list, key) => list.reduce((counts, item) => ({ ...counts, [key(item)]: (counts[key(item)] || 0) + 1 }), {});
      const tables = new Set(added.filter(image => image.table).map(image => image.table));
      const summary = {
        new_images: added.length, reused_original_images: parsed.length - added.length,
        new_images_by_generation: { aiImage: 0, htmlImage: 0, mermaid: 0, ...count(added, image => image.generation) },
        new_layout_groups: { single: added.filter(image => image.layout === 'single').length, imageText: 0, threeImages: 0, fourImages: 0,
          ...count([...tables], table => table.attribs['data-yb-preset'] || 'unknown') },
        missing_caption: parsed.filter(image => !image.caption && !image.image_text_left).map(image => image.image_id),
        missing_fit: parsed.filter(image => !image.fit).map(image => image.image_id),
        missing_asset: parsed.filter(image => !image.asset_exists).map(image => image.image_id),
      };
      const items = images.filter(image => !image.reused_original).map(image => ({ id: image.image_id, kind: ({ aiImage: 'ai', htmlImage: 'html', mermaid: 'mermaid' })[image.generation], ...(image.asset_exists ? { status: 'success', asset_ref: image.asset_ref } : {}) }));
      if (results.every(result => result.status === 'success')) report('images', `图片清单已整理，复用原图 ${images.filter(image => image.reused_original).length} 张`, items, { inventory: results.filter(result => result.status === 'success').map(result => result.section_id) });
      return toolResult({ summary, results: results.filter(result => result.status !== 'success' || result.images.length) });
    },
  }, {
    name: 'apply-section-images', label: '批量回填正文图片', executionMode: 'sequential',
    description: '图片工具已自动回填成功图片，本工具只用于重试 applied=false 的项或修复原图引用。image_id 使用清单标识，asset_ref 使用图片工具返回值，previous_asset_ref 使用图片工具返回的 previous_asset_ref 或清单中的原引用（未填写时为空字符串）。按小节合并保存，只修改 img 的 data-yb-asset-ref。引用已变化则先刷新清单；同一地址重复提交不会重复修改。未成功的项不要提交，原图直接复用。检查每项结果，只在本次所需回填全部成功后标记任务完成。',
    parameters: Type.Object({ images: Type.Array(Type.Object({
      image_id: Type.String({ minLength: 1 }), asset_ref: Type.String({ minLength: 1 }), previous_asset_ref: Type.String(),
    }, { additionalProperties: false }), { minItems: 1 }) }, { additionalProperties: false }),
    async execute(_callId, { images }, toolSignal) {
      const combinedSignal = AbortSignal.any([signal, toolSignal].filter(Boolean));
      combinedSignal.throwIfAborted();
      beforeApply();
      report('image-apply', '正在回填图片地址', images.map(image => ({ id: image.image_id, status: 'running' })));
      if (new Set(images.map(item => item.image_id)).size !== images.length) throw new Error('同一批回填的 image_id 不能重复');
      const ordered = applyImageReferences(images, combinedSignal);
      report('image-apply', '正在回填图片地址', ordered.map(item => ({ id: item.image_id, status: item.status })));
      return toolResult({ results: ordered });
    },
  }, {
    name: 'generate-section-images', label: '批量生成正文图片', executionMode: 'sequential',
    description: `通过 images 一次提交本轮全部待生成 AI、HTML、Mermaid 图片，image_id 原样使用正文图片清单标识，不按类型或小批次拆分。AI 使用生图队列，HTML/Mermaid 使用文本队列生成源码，每张源码完成后立即进入对应本地渲染队列；超限自动排队。每张成功后程序立即回填正文图片引用，无须再调用回填工具。返回 total、applied（已成功并回填的数量）和 unresolved；unresolved 只列未成功或回填失败的项，含 status、stage、asset_ref、source_file、error，回填失败另有 apply_error 与 previous_asset_ref，可刷新清单后用回填工具重试。${htmlImageOptimization ? 'HTML 返回 needs_repair 时，按 layout_issues 修改源码后转图，直到成功。' : ''}有 source_file 的失败项直接修复并调用 render 工具，不重新生成源码；无源码的失败项才重试生成。暂停结果保留已完成产物，恢复仅补未完成项。`,
    parameters: Type.Object({ images: Type.Array(Type.Union(['ai', 'html', 'mermaid'].map(kind => Type.Object({
      image_id: Type.String({ minLength: 1, description: '正文图片清单中的 image_id，批内唯一。' }),
      kind: Type.Literal(kind),
      prompt: Type.String({ minLength: 1, description: kind === 'ai'
        ? '按主体、可见元素、视角景别与构图、环境光线依次正向描述画面，写出区分本图的具体视觉元素；保留与正文画框一致的宽高比例及构图方向。画面形式由 style 决定，不写冲突的风格描述；品牌、水印和无关文字的限制由程序统一追加，无须重复罗列。'
        : '图片表达目的、准确内容和数据；保留与正文画框一致的宽高比例及构图方向，不只给文件路径或要求模型检索。' }),
      ...(kind === 'ai' ? {
        size: Type.String({ minLength: 1, pattern: '\\S', description: '逐图依据正文 data-yb-size 选择对应比例的具体尺寸：square=1:1、wide=3:2、tall=3:4、panorama=16:9；当前金龙 gpt-image-2-1k 的 tall 使用 768x1024。不得传画框名称或省略尺寸。' }),
        title: Type.Optional(Type.String({ description: '简短图名，便于区分每张图片。' })),
        style: Type.Union(Object.keys(AI_IMAGE_STYLES).map(value => Type.Literal(value)), { description: `必填，按该图 template 中注明的画面形式选择：${AI_IMAGE_STYLE_OPTIONS}。` }),
      } : kind === 'html' ? {
        frame_size: Type.Union(['square', 'wide', 'tall', 'panorama'].map(value => Type.Literal(value)), { description: '与正文 figure 的 data-yb-size 一致。' }),
      } : {}),
    }, { additionalProperties: false }))), { minItems: 1 }) }, { additionalProperties: false }),
    async execute(_callId, { images }, toolSignal, onUpdate) {
      return runImageBatch(images, toolSignal, onUpdate, async (image, result, combinedSignal) => {
        const { image_id, kind, prompt, frame_size } = image;
        if (kind === 'ai') {
          const { image_id: _id, kind: _kind, ...params } = image;
          if (!params.size?.trim()) throw new Error('请补充本张 AI 图片的 size，尺寸比例应与正文画框一致');
          if (!Object.hasOwn(AI_IMAGE_STYLES, params.style)) throw new Error(`请为本张 AI 图片选择有效的 style：${Object.keys(AI_IMAGE_STYLES).join('、')}`);
          const generated = await aiService.generateImage({ ...params, signal: combinedSignal });
          combinedSignal.throwIfAborted();
          // 生图服务的本地路径和预览地址只供程序复制，不写入模型上下文。
          Object.assign(result, { status: 'success', asset_ref: saveImage(fs.readFileSync(generated.file_path), path.extname(generated.file_path)) });
        } else {
          if (!['html', 'mermaid'].includes(kind)) throw new Error('图片 kind 必须为 ai、html 或 mermaid');
          const response = await aiService.chat({
            signal: combinedSignal, logTitle: `Agent 配图源码-${kind}-${image_id}`,
            messages: [{ role: 'system', content: buildImageSourcePrompt(kind, frame_size) }, { role: 'user', content: prompt }],
          });
          combinedSignal.throwIfAborted();
          const source = extractAiSource(response, kind);
          result.source_file = saveImage(Buffer.from(source, 'utf8'), kind === 'html' ? '.html' : '.mmd');
          result.stage = 'render';
          await renderImage(result, combinedSignal);
        }
      });
    },
  }, ...['html', 'mermaid'].map(kind => ({
    name: `render-${kind}-image`, label: kind === 'html' ? '批量 HTML 转图片' : '批量 Mermaid 转图片',
    description: `将本轮全部待渲染的 ${kind === 'html' ? 'HTML' : 'Mermaid'} 文件通过 images 一次提交，单张也使用一项数组，不逐张或分小批等待。读取工作区已有的 ${kind === 'html' ? '独立配图 HTML，按正文 data-yb-size 对应的 frame_size 固定画布截图，画布内四周保留 40px 边距' : 'Mermaid 源文件'}，由现有本地渲染队列控制并发并转为 PNG。每张成功后程序立即回填正文图片引用。返回 total、applied 和 unresolved，unresolved 只列未成功或回填失败的项及其 status、源码路径、error 或 apply_error。${kind === 'html' && htmlImageOptimization ? '返回 needs_repair 时，按 layout_issues 修改源码后重新渲染，直到成功。' : ''}只对失败或需要修正的项修改源码后重新提交，保留其他结果。`,
    executionMode: 'sequential',
    parameters: Type.Object({
      images: Type.Array(Type.Object({
        image_id: Type.String({ minLength: 1, description: '本批唯一的图片标识，沿用源码生成时的 image_id，用于对应正文图片。' }),
        source_file: Type.String({ minLength: 1, description: '当前工作区内的源码相对路径，如 图片/实施流程.html 或 图片/实施流程.mmd；使用 UTF-8，不带 Markdown 围栏。' }),
        ...(kind === 'html' ? { frame_size: Type.Union(['square', 'wide', 'tall', 'panorama'].map(value => Type.Literal(value)), { description: '与正文 figure 的 data-yb-size 一致。设计尺寸：square=1240×1240，wide=1240×827，tall=1240×1653，panorama=1240×698；尺寸包含四周40px内边距。按此尺寸编写HTML，程序以2倍像素输出。' }) } : {}),
      }, { additionalProperties: false }), { minItems: 1 }),
    }, { additionalProperties: false }),
    // 修复时只重新渲染已有源码，复用与首次生成相同的结果和取消处理。
    async execute(_callId, { images }, toolSignal, onUpdate) {
      return runImageBatch(images.map(image => ({ ...image, kind })), toolSignal, onUpdate,
        async (_image, result, combinedSignal) => renderImage(result, combinedSignal));
    },
  }))];
}

module.exports = { createContentGenerationImageTools, validateContentImageReferences };
