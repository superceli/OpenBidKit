// 绿色新闻爬虫 —— 纯 Node.js 实现
// 两大搜索源：国家能源局、生态环境部
const cheerio = require('cheerio');
const TurndownService = require('turndown');
const { URL } = require('node:url');

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const PAGE_DELAY_MS = 200;
const FETCH_KEYWORD = '绿色低碳';

// 本地关键词白名单：API 模糊搜索不准，需要本地再过滤
// 只要标题或摘要含以下任一关键词，就算"绿色相关"
const GREEN_KEYWORDS = [
  '绿色', '低碳', '双碳', '碳达峰', '碳中和', '碳排放', '碳交易', '碳汇',
  '减排', '节能', '降碳', '非化石', '清洁能源', '可再生', '新能源',
  '光伏', '风电', '储能', '氢能', '生物质', '地热能',
  '生态', '环保', '污染治理', '大气', '水治理', '土壤修复',
  '可持续', '循环经济', '绿色转型', '绿色发展', '绿色制造', '绿色建筑',
  'ESG', '可持续发展',
];

// 预编译正则（大小写不敏感）
const GREEN_KEYWORDS_RE = new RegExp(GREEN_KEYWORDS.map(
  (kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
).join('|'), 'i');

function isGreenRelated(title, summary = '') {
  const hay = (title || '') + ' ' + (summary || '');
  return GREEN_KEYWORDS_RE.test(hay);
}
const PER_SOURCE_LIMIT = 50; // 默认每个源 50 条，两个源共 100 条

// ---------- 工具 ----------

async function safeFetch(url, options = {}) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...(options.headers || {}),
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString('utf-8');
  } catch {
    return null;
  }
}

function absUrl(base, href) {
  if (!href) return '';
  try { return new URL(href, base).toString(); } catch { return ''; }
}

function cleanText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function parseDateLoose(raw) {
  if (!raw) return '';
  const s = raw.replace(/[年月./日\-:]/g, '-').replace(/\s+/g, '-').replace(/^-|-$/g, '');
  const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return raw.slice(0, 20);
}

// 去掉栏目前缀（如 "要闻动态"、"专题专栏"）
const SECTION_PREFIX_RE = /^(要闻动态|法规标准|信息公开|专题专栏|政策文件|环境质量|业务工作|机关党建|政务服务|互动交流|中央生态环境保护督察|中央环保督察)/;

function stripSectionPrefix(title) {
  return title.replace(SECTION_PREFIX_RE, '').trim();
}

// ---------- 源 1：国家能源局（WAS5 JSON API，按时间排序） ----------

async function neaSearchApi(keyword, pageNo = 1, pageSize = 20) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const r = await fetch('https://www.nea.gov.cn/was5/web/conwebsite/getNewsFromAllData', {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.nea.gov.cn/',
      },
      body: `pageNo=${pageNo}&pageSize=${pageSize}&siteId=11200&keyword=${encodeURIComponent(keyword)}&sort=1&isInclude=1`,
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function parseNeaApiItem(raw) {
  const strip = (s) => (s || '').replace(/<[^>]+>/g, '').trim();

  let url = '';
  try {
    if (Array.isArray(raw.originUrl)) {
      url = raw.originUrl[0] || '';
    } else if (typeof raw.originUrl === 'string' && raw.originUrl) {
      const urls = JSON.parse(raw.originUrl);
      if (Array.isArray(urls)) url = urls[0] || '';
    }
  } catch { /* ignore */ }
  if (!url) url = raw.pubUrl || '';

  let published_at = '';
  if (raw.releaseDate) {
    const m = String(raw.releaseDate).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) published_at = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  if (!published_at && raw.createtime) {
    try {
      const d = new Date(raw.createtime);
      if (!Number.isNaN(d.getTime())) {
        published_at = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    } catch { /* ignore */ }
  }

  const title = strip(raw.title || raw.linkTitle);
  const summary = strip(raw.description || raw.introTitle);
  if (!title || !url) return null;
  return { title, url, source: '国家能源局', published_at, summary };
}

async function fetchNea(perSourceLimit = PER_SOURCE_LIMIT) {
  // 关键词"绿色低碳"，按时间排序（sort=1），取指定条数
  const d = await neaSearchApi(FETCH_KEYWORD, 1, perSourceLimit);
  if (!d || d.code !== 200 || !d.content?.result) return [];
  const items = [];
  for (const raw of d.content.result) {
    const item = parseNeaApiItem(raw);
    if (item) items.push(item);
  }
  return items;
}

// ---------- 源 3：生态环境部（WAS5 HTML 搜索，按时间排序） ----------

async function fetchMeePage(pageNo) {
  const CHANNEL_ID = '270514';
  const url = `https://www.mee.gov.cn/was5/web/search?channelid=${CHANNEL_ID}&searchword=${encodeURIComponent(FETCH_KEYWORD)}&page=${pageNo}&orderby=-docreltime&searchscope=`;
  const html = await safeFetch(url, { Referer: 'https://www.mee.gov.cn/' });
  if (!html) return [];

  const $ = cheerio.load(html);
  const out = [];

  $('a').each((_, el) => {
    const href = absUrl('https://www.mee.gov.cn/', $(el).attr('href') || '');
    const text = cleanText($(el).text());
    // MEE 文章 URL 固定模式：/yyyyyy/t20yyyymmdd_xxxxxxxx.shtml
    // 严格校验，排除搜索页自身的 banner/导航/离开门户提示
    if (
      text.length > 8 && text.length < 150 &&
      /t20\d{6,}/.test(href) && /\/20\d{4}\//.test(href) &&
      /\.s?html?$/.test(href) &&
      !/即将离开|是否继续|离开门户|继续访问/.test(text)
    ) {
      const title = stripSectionPrefix(text) || text;
      let dateText = '';
      const m = href.match(/(20\d{2})(\d{2})(\d{2})/);
      if (m) dateText = `${m[1]}-${m[2]}-${m[3]}`;
      out.push({
        title, url: href, source: '生态环境部',
        published_at: parseDateLoose(dateText), summary: '',
      });
    }
  });
  return out;
}

async function fetchMee(perSourceLimit = PER_SOURCE_LIMIT) {
  // MEE 每页 ~10 条，根据需要的条数动态翻页，最多翻 10 页
  const pages = Math.min(10, Math.max(1, Math.ceil(perSourceLimit / 10)));
  const items = [];
  for (let page = 1; page <= pages; page++) {
    items.push(...await fetchMeePage(page));
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
  }
  // 去重
  const seen = new Set();
  const unique = [];
  for (const it of items) {
    const key = it.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(it);
  }
  unique.sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''));
  return unique.slice(0, perSourceLimit);
}

// ---------- 详情页正文爬取 ----------

const turndown = new TurndownService({
  headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-',
});
turndown.remove(['script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe', 'noscript', 'form', 'button']);

async function fetchArticleContent(articleUrl) {
  const html = await safeFetch(articleUrl);
  if (!html) return null;
  const $ = cheerio.load(html);

  // 先记录发布日期（从完整 HTML 里找，正文容器可能没）
  let pubDate = '';
  const dateMatch = html.match(/(20\d{2})[-年.\/](\d{1,2})[-月.\/](\d{1,2})/);
  if (dateMatch) pubDate = parseDateLoose(dateMatch[0]);

  // 移除全站通用垃圾 + MEE/各部委专属垃圾（在提取正文容器之前先清掉）
  $('script, style, nav, header, footer, aside, iframe, noscript, form, button, input, textarea, select').remove();
  $('.ad, .ads, .ad-banner, .share, .share-box, .share-btns, .recommend, .related, .related-links, .recommend-rel, .recommend-int, .sidebar, .comment, .comments, .comment-list, .comment-box, .pagination, .page-nav').remove();
  $('.crumb, .crumbs, .crumbsNav, .breadcrumb').remove();                 // 面包屑
  // 注意：.stbzXq / .stbzCBaseXq 可能是正文容器的父元素（包裹 TRS_Editor），不能整体移除
  // 只移除专题页工具栏/相关阅读区域，保留正文父容器
  $('.xqYdFx, .ydfxBox').remove();                    // MEE 专题页相关阅读
  $('.stbzXq .stbz_toolbar, .stbzXq .stbzShare, .stbzCBaseXq .stbz_toolbar, .stbzCBaseXq .stbzShare').remove();
  $('.link-url-wrapper, .link-url-mask, .link-url-inner, .link-p, .leave-tip, .leave-modal').remove(); // 外链跳转提示
  $('.search, .search-box, .searchWord, .searchbox, .headerSearch, .logoSearch, .logoSearchBox, .logoSearchR').remove();
  $('.lang-switch, .fan_en, .language, .lang-en, .fan_yuan').remove();   // 语言切换
  $('.hot, .hot-search, .hotSearch, .recommend-search').remove();        // 热门搜索
  $('.print, .font-size, .tool-bar, .toolBar').remove();                // 打印/字号工具栏
  $('.download, .print-version').remove();

  // 补全所有 img 的 src（懒加载 data-src / data-original -> src）
  $('img').each((_, el) => {
    const e = $(el);
    const src = e.attr('src') || e.attr('data-src') || e.attr('data-original') || e.attr('data-original-src') || e.attr('_src') || e.attr('lazy-src') || e.attr('src2') || '';
    if (src && !src.startsWith('data:') && !src.startsWith('javascript:')) {
      e.attr('src', src);
      // 绝对化相对路径
      if (src.startsWith('/')) e.attr('src', new URL(src, articleUrl).href);
      else if (!/^https?:\/\//i.test(src)) e.attr('src', new URL(src, articleUrl).href);
    } else {
      e.remove(); // 无效图片直接丢
    }
  });

  // 正文容器 selector —— 通用 + 各部委特有（TRS CMS 几乎所有中央政府网站都用）
  const selectors = [
    'div.TRS_Editor', 'div#TRS_Editor',                       // TRS CMS 标准正文容器（MEE/NEA 等）
    'div.pages_content', 'div#pages_content', 'div.pages_content_2',
    'div.con_text', 'div#content', 'div#docContent', 'div.article-content', 'div#article-content',
    'div.content', 'div#artContent', 'div.text', 'div.main-content',
    'div.wzsmCenter', 'div.stbzXq', 'div.stbzCBaseXq', 'div.innerBg', 'div.innerCenter',
    'div.content-area', 'div.contentBox', 'div.detail', 'div.detail-content', 'div.article-detail',
    'div.text_content', 'div.contents', 'div.news-content', 'div.news-content-box',
    'article', 'main',
  ];
  let body = null;
  let bestTextLen = 0;
  for (const sel of selectors) {
    const el = $(sel);
    if (!el.length) continue;
    const textLen = el.first().text().length;
    // 优先选 TRS_Editor 这类小而纯的；如果没匹配到，fallback 到文本量最大的容器
    if (textLen > bestTextLen) { bestTextLen = textLen; body = el.first(); }
    // 但 TRS_Editor 类精确匹配直接用（如果有文本）
    if (/TRS_Editor|pages_content|con_text|article-content|wzsmCenter/.test(sel) && textLen > 100) {
      body = el.first(); break;
    }
  }
  if (!body) {
    // 最后兜底：找所有 div 里 p 段落最多且文本量最大的那个
    const divs = [];
    $('div').each((_, el) => {
      const e = $(el);
      const pCount = e.find('p').length;
      const textLen = e.text().length;
      if (pCount >= 2 && textLen > 200) divs.push({ el: e.first(), pCount, textLen });
    });
    divs.sort((a, b) => (b.pCount * 3 + b.textLen / 1000) - (a.pCount * 3 + a.textLen / 1000));
    body = divs[0]?.el || $('body');
  }

  const plainText = cleanText(body.text());
  const summary = plainText.slice(0, 150);

  // Turndown 转 Markdown —— Turndown 默认会把 <img src="xxx" alt="yyy"> 转成 ![yyy](xxx)
  const md = turndown.turndown(body.html() || plainText);
  // 清理：移除 markdown 的 javascript: 链接、纯空白 alt 占位图、多余空行
  const cleaned = md
    .replace(/\[(javascript:|#)[^\]]*\]\([^)]*\)/g, '')   // [javascript:]() [javascript:void(0)]()
    .replace(/!\[正文图片\]\([^)]*\)/g, '')                 // 占位图（MEE/NEA 专题专栏的图片 alt）
    .replace(/\[[^\]]*\]\(javascript:[^)]*\)/g, '')         // [点击进入](javascript:xxx)
    .replace(/\[[^\]]*\]\(#\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!cleaned || cleaned.length < 20) return null;

  return { content: cleaned, summary, published_at: pubDate };
}

// ---------- 主入口 ----------

async function runCrawl(perSourceLimit = PER_SOURCE_LIMIT) {
  // API 搜索不准，请求 3 倍的量再本地关键词过滤
  const fetchAsk = perSourceLimit * 3;

  const fetchers = [
    { fn: fetchNea,    category: '国家能源局' },
    { fn: fetchMee,    category: '生态环境部' },
  ];

  const all = [];
  for (const { fn, category } of fetchers) {
    try {
      const items = await fn(fetchAsk);
      for (const it of items) {
        if (!isGreenRelated(it.title, it.summary)) continue;
        it.category = category;
        all.push(it);
      }
    } catch { /* ignore */ }
  }

  // 去重（URL + 标题）
  const seenUrl = new Set();
  const seenTitle = new Set();
  const unique = [];
  for (const it of all) {
    const urlKey = it.url.toLowerCase();
    const titleKey = it.title.replace(/\s+/g, '').toLowerCase();
    if (seenUrl.has(urlKey) || seenTitle.has(titleKey)) continue;
    seenUrl.add(urlKey);
    seenTitle.add(titleKey);
    unique.push(it);
  }

  // 每个源不超过 perSourceLimit
  const grouped = {};
  for (const it of unique) (grouped[it.category] ||= []).push(it);
  const picked = [];
  for (const cat of Object.keys(grouped)) {
    const bucket = grouped[cat].sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''));
    picked.push(...bucket.slice(0, perSourceLimit));
  }

  return picked;
}

// ---------- Service 工厂 ----------

function createGreenNewsSpiderService({ app, store }) {
  let running = false;
  function isRunning() { return running; }
  function hasPython() { return true; }

  async function runSpider(payload = {}) {
    if (running) return { success: false, message: '爬虫正在运行中，请稍候' };
    const { perSourceLimit = PER_SOURCE_LIMIT } = payload;
    const limit = Math.max(5, Math.min(200, Number(perSourceLimit) || PER_SOURCE_LIMIT));
    running = true;
    try {
      const items = await runCrawl(limit);
      if (items.length === 0) {
        return { success: true, message: '本次未抓取到新闻条目', total: 0 };
      }
      // 每次抓取先清空旧数据，再写入最新的
      store.clearAll();
      const { inserted } = store.batchInsertNews(items);
      return {
        success: true,
        message: `抓取最新 ${inserted} 条（每源 ${limit}）`,
        total: inserted, inserted, skipped: 0,
      };
    } catch (e) {
      return { success: false, message: `爬虫执行失败：${e.message}` };
    } finally {
      running = false;
    }
  }

  async function crawlDetailAndUpdate(newsId) {
    const item = store.getNews(newsId);
    if (!item || !item.url) return null;
    const detail = await fetchArticleContent(item.url);
    if (!detail) return null;
    store.updateNewsContent(newsId, detail.content, detail.summary, detail.published_at);
    return { ...item, ...detail };
  }

  return { runSpider, isRunning, hasPython, crawlDetailAndUpdate };
}

module.exports = { createGreenNewsSpiderService };
