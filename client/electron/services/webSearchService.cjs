'use strict';

/**
 * 客户端联网搜索服务。
 *
 * 用于 DeepSeek 等不支持原生 web_search 工具的模型：在调用 AI 前，
 * 由本地通过搜索引擎抓取企业工商基础信息，提取结构化字段后注入 Prompt，
 * 避免模型凭空编造企业注册信息。
 *
 * 策略：
 * 1. 多组关键词在 Bing + 百度并行搜索
 * 2. 从百度搜索结果的 JSON 嵌入数据（abstract 字段）提取工商信息摘要
 * 3. 从搜索结果详情页全文中提取字段
 * 4. 多来源合并 + 合法性校验
 */

const SEARCH_TIMEOUT_MS = 15000;
const PAGE_FETCH_TIMEOUT_MS = 12000;
const MAX_DETAIL_PAGES = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 过滤掉内容多为截断摘要的聚合站
const BLOCKED_DOMAINS = ['aiqicha.baidu.com', 'aiqicha.com', 'tianyancha.com', 'qcc.com', 'qixin.com'];

function buildBingUrl(keyword) {
  const q = encodeURIComponent(keyword);
  return `https://cn.bing.com/search?q=${q}&ensearch=0`;
}

function buildBaiduUrl(keyword) {
  const q = encodeURIComponent(keyword);
  return `https://www.baidu.com/s?wd=${q}`;
}

function getHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  };
}

function stripHtmlTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\u003C/g, '<')
    .replace(/\\u003E/g, '>')
    .replace(/\\u002F/g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBlockedUrl(url) {
  const normalized = String(url || '').toLowerCase();
  return BLOCKED_DOMAINS.some((domain) => normalized.includes(domain));
}

/**
 * 从 Bing 搜索结果页提取条目。
 */
function parseBingResults(html) {
  const results = [];
  const blockRegex = /<li[^>]*class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi;
  let blockMatch;
  while ((blockMatch = blockRegex.exec(html)) !== null) {
    const block = blockMatch[1];
    const linkMatch = block.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const url = linkMatch ? linkMatch[1] : '';
    if (!url || isBlockedUrl(url)) continue;
    const title = stripHtmlTags(linkMatch ? linkMatch[2] : '');
    const pMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = stripHtmlTags(pMatch ? pMatch[1] : '');
    if (title || snippet) {
      results.push({ title, snippet, url });
    }
  }
  return results;
}

/**
 * 从百度搜索结果页提取条目。
 * 百度现在大量使用 JSON 嵌入数据，需要从 abstract 字段和 basicList 提取。
 * @param {string} html
 * @param {string} [companyName] 传入时做页面级公司名校验，页面提及公司则所有片段都可使用
 */
function parseBaiduResults(html, companyName) {
  const results = [];

  // 页面级公司名验证：只要页面提到目标公司，该页的所有片段都视为相关
  const coreName2 = companyName ? companyName.replace(/(有限责任公司|股份有限公司|有限公司)$/, '') : '';
  const pageMentionsCompany = companyName
    ? html.includes(companyName) || (coreName2 && html.includes(coreName2))
    : false;

  // 方法1：提取 JSON 中的 basicList 字段（百度爱企查结构化工商数据，最可靠）
  // 格式: {"entName":"XX公司","basicList":["法定代表人：张三",...]}
  // 只提取与目标公司 entName 在同一 JSON 对象中的 basicList，避免混入其他公司数据
  if (companyName) {
    // 找到包含目标公司名的 JSON 对象，再从中提取 basicList
    const entNameRegex = new RegExp(`"entName"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*${companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^"\\\\]|\\\\.)*)"`, 'g');
    let entMatch;
    while ((entMatch = entNameRegex.exec(html)) !== null) {
      // 从 entName 位置向后查找最近的 basicList（在同一对象内，通常紧跟其后）
      const afterEnt = html.substring(entMatch.index, entMatch.index + 3000);
      const blInObj = afterEnt.match(/"basicList"\s*:\s*\[([^\]]*)\]/);
      if (blInObj) {
        const items = blInObj[1].match(/"((?:[^"\\]|\\.)*)"/g);
        if (items) {
          for (const item of items) {
            const text = item.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
            if (text && text.length > 4) {
              results.push({ title: '', snippet: text, url: '', pageMentionsCompany: true });
            }
          }
        }
      }
    }
  } else {
    // 无公司名时退化为提取所有 basicList
    const basicListRegex = /"basicList"\s*:\s*\[([^\]]*)\]/g;
    let blMatch;
    while ((blMatch = basicListRegex.exec(html)) !== null) {
      const items = blMatch[1].match(/"((?:[^"\\]|\\.)*)"/g);
      if (items) {
        for (const item of items) {
          const text = item.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
          if (text && text.length > 4) {
            results.push({ title: '', snippet: text, url: '', pageMentionsCompany });
          }
        }
      }
    }
  }

  // 方法1b：提取 JSON 中的 summaryData/generalLines 文本（包含注册地址、经营范围等）
  // 格式: "generalLines":[{"data":[{"text":"XX公司成立于...,位于...,经营范围..."}]}]
  const summaryRegex = /"generalLines"\s*:\s*\[([\s\S]*?)\](?=\s*[,}])/g;
  let sumMatch;
  while ((sumMatch = summaryRegex.exec(html)) !== null) {
    const textItems = sumMatch[1].match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g);
    if (textItems) {
      for (const t of textItems) {
        const m = t.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (!m) continue;
        const text = m[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/<em>/g, '').replace(/<\/em>/g, '').replace(/\s+/g, ' ').trim();
        if (text && text.length > 10) {
          // 只使用包含目标公司名的摘要，避免混入同页其他公司
          const belongsToCompany = !companyName || text.includes(companyName) || (coreName2 && text.includes(coreName2));
          if (belongsToCompany) {
            results.push({ title: '', snippet: text, url: '', pageMentionsCompany: true });
          }
        }
      }
    }
  }

  // 方法2：提取 JSON 中的 abstract 字段（百度知识卡片和聚合数据）
  // 注意：abstract 可能来自同页其他公司，不使用 pageMentionsCompany，需片段级校验
  const abstractRegex = /"abstract"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let absMatch;
  while ((absMatch = abstractRegex.exec(html)) !== null) {
    const text = absMatch[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (text && text.length > 10) {
      results.push({ title: '', snippet: text, url: '', pageMentionsCompany: false });
    }
  }

  // 方法3：提取 c-container 块中的链接和摘要
  const blockRegex = /<div[^>]*class="[^"]*c-container[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let blockMatch;
  while ((blockMatch = blockRegex.exec(html)) !== null) {
    const block = blockMatch[1];
    const linkMatch = block.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const url = linkMatch ? linkMatch[1] : '';
    if (url && isBlockedUrl(url)) continue;
    const title = stripHtmlTags(linkMatch ? linkMatch[2] : '');
    const abstractMatch = block.match(/<(?:span|div|p)[^>]*class="[^"]*(?:c-abstract|content-right|c-span-last|c-color-text)[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div|p)>/i);
    const snippet = stripHtmlTags(abstractMatch ? abstractMatch[1] : '');
    if (title || snippet) {
      results.push({ title, snippet, url, pageMentionsCompany: false });
    }
  }

  // 方法4：直接从 HTML 中提取包含工商字段关键词的文本块
  // 严格要求文本块本身包含目标公司名（完整或核心），避免混入同页其他公司数据
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const rawMatches = text.match(/[^<>]{0,100}(?:法定代表人|注册资本|成立[日期时间]|注册地址|统一社会信用代码|企业类型|经营范围|联系电话)[^<>]{0,200}/g);
  if (rawMatches) {
    for (const raw of rawMatches) {
      const cleaned = raw.replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleaned.length <= 15) continue;
      // 必须文本块本身包含目标公司名（完整或核心），否则跳过
      if (companyName && !cleaned.includes(companyName) && !(coreName2 && cleaned.includes(coreName2))) {
        continue;
      }
      results.push({ title: '', snippet: cleaned, url: '', pageMentionsCompany: true });
    }
  }

  return results;
}

async function fetchSearchResults(url, parser, companyName) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(),
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const text = await response.text();
    return parser(text, companyName);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 从纯文本中提取工商字段。
 * 支持"字段：值"、"字段值"（无冒号）、"字段为值"等多种格式。
 */
function extractFieldsFromText(text) {
  const fields = {};

  const patterns = {
    legalRepresentative: [
      /法定代表人[：:\s为是]*(?:为|是)?\s*([\u4e00-\u9fa5·]{2,4}?)(?=注册资本|成立|注册地|统一|企业类|经营范|联系电|登记|存续|$)/,
      /法人[：:\s为是]*(?:为|是)?\s*([\u4e00-\u9fa5·]{2,4}?)(?=注册资本|成立|注册地|统一|企业类|经营范|联系电|登记|存续|$)/,
    ],
    registeredCapital: [
      /注册资本[：:\s为是]*(?:为|是|人民币)?\s*([0-9]+\.?[0-9]*\s*[万亿]?\s*(?:元人民币|元|万)?)/,
      /注册资金[：:\s为是]*(?:为|是|人民币)?\s*([0-9]+\.?[0-9]*\s*[万亿]?\s*(?:元人民币|元|万)?)/,
    ],
    establishedDate: [
      /成立[日期时间][：:\s为是]*(?:为|是)?\s*(\d{4}[-/年.]\d{1,2}[-/月.]?\d{0,2}日?)/,
      /成立于[：:\s]*(\d{4}[-/年.]\d{1,2}[-/月.]?\d{0,2}日?)/,
      /(\d{4})[-/年.](\d{1,2})[-/月.]?(\d{0,2})日?[\s\S]{0,30}成立/,
    ],
    registeredAddress: [
      /注册地址[：:\s为是位于]*(?:为|是|位于)?\s*([^\n，,;；。]{4,120})/,
      /注册地[：:\s为是位于]*(?:为|是|位于)?\s*([^\n，,;；。]{4,120})/,
      /企业地址[：:\s为是位于]*(?:为|是|位于)?\s*([^\n，,;；。]{4,120})/,
      /公司地址[：:\s为是位于]*(?:为|是|位于)?\s*([^\n，,;；。]{4,120})/,
      /位于\s*([^\n，,;；。]{4,120}(?:省|市|区|县|路|号|街|镇|乡|村|园))/,
    ],
    unifiedSocialCreditCode: [
      /统一社会信用代码[：:\s为是]*(?:为|是)?\s*([0-9A-HJ-NPQRTUWXY]{18})/,
      /社会信用代码[：:\s为是]*(?:为|是)?\s*([0-9A-HJ-NPQRTUWXY]{18})/,
      /信用代码[：:\s为是]*(?:为|是)?\s*([0-9A-HJ-NPQRTUWXY]{18})/,
    ],
    enterpriseType: [
      /企业类型[：:\s为是]*(?:为|是)?\s*([^\s,，;；。\n"{}[\]\\]{2,30})/,
      /公司类型[：:\s为是]*(?:为|是)?\s*([^\s,，;；。\n"{}[\]\\]{2,30})/,
    ],
    businessScope: [
      /经营范围[：:\s为是包括]*(?:为|是|包括)?\s*([^\n。"{}[\]\\]{4,300})/,
    ],
    phone: [
      /联系电话[：:\s为是]*(?:为|是)?\s*(1[3-9]\d{9}|0\d{2,3}[-\s]?\d{7,8})/,
      /电话[：:\s为是]*(?:为|是)?\s*(1[3-9]\d{9}|0\d{2,3}[-\s]?\d{7,8})/,
    ],
  };

  for (const [key, regexList] of Object.entries(patterns)) {
    for (const regex of regexList) {
      const match = text.match(regex);
      if (match && match[1]) {
        let value = match[1].trim();
        value = value.replace(/[，,;；。\s]+$/, '');

        if (key === 'establishedDate') {
          if (match[2] && match[3] !== undefined) {
            const month = match[2].padStart(2, '0');
            const day = match[3] ? match[3].padStart(2, '0') : '01';
            value = `${match[1]}年${month}月${day}日`;
          } else {
            // 规范化：2014-10-13 → 2014年10月13日
            const dateMatch = value.match(/(\d{4})[-/.](\d{1,2})[-/.]?(\d{0,2})/);
            if (dateMatch) {
              const y = dateMatch[1];
              const m = dateMatch[2].padStart(2, '0');
              const d = dateMatch[3] ? dateMatch[3].padStart(2, '0') : '01';
              value = `${y}年${m}月${d}日`;
            }
          }
        }

        if (key === 'registeredCapital') {
          // 规范化：200万 → 200万元人民币；200万元人 → 200万元人民币
          value = value.replace(/元人$/, '元人民币').replace(/元人民$/, '元人民币');
          if (/[0-9]/.test(value) && !/元/.test(value)) {
            value = value + '元人民币';
          }
        }

        if (key === 'businessScope') {
          // 清理搜索结果截断标记
          value = value.replace(/\.\.\.\s*\.\.\.$/, '').replace(/\s+\.\.\.$/, '').replace(/\.\.\.$/, '').trim();
        }

        if (key === 'enterpriseType') {
          // 清理 JSON 残留和无效值
          value = value.replace(/[\\"]/g, '').trim();
          // 排除"变更""记录"等非企业类型值
          if (/^(变更|记录|信息|详情|更多)$/.test(value)) value = '';
        }

        // 注册地址需包含地址关键词才视为有效，否则继续尝试下一个 pattern
        if (key === 'registeredAddress' && !/(省|市|区|县|镇|乡|路|号|街|村|园|道)/.test(value)) {
          continue;
        }

        fields[key] = value;
        break;
      }
    }
  }

  return fields;
}

/**
 * 合并多来源字段，优先保留非空值（已提取的值不被空值覆盖）。
 * 同一字段多次出现时取最长值（通常更完整）。
 */
function mergeFields(...sources) {
  const merged = {};
  for (const src of sources) {
    if (!src) continue;
    for (const [key, value] of Object.entries(src)) {
      if (value) {
        if (!merged[key] || value.length > merged[key].length) {
          merged[key] = value;
        }
      }
    }
  }
  return merged;
}

/**
 * 字段合法性校验，过滤明显错误的值。
 */
function validateFields(fields) {
  const result = { ...fields };

  // 注册地址校验：必须包含省/市/区/县/镇/路/街/道/号/村/园等关键词
  if (result.registeredAddress) {
    const addr = result.registeredAddress;
    const hasValidToken = /(省|市|区|县|镇|乡|路|街|道|号|村|园|厦|栋|层|大厦|广场|中心|开发区|工业园)/.test(addr);
    if (!hasValidToken || addr.length < 6 || /(景区|旅游|风景|景点)/.test(addr)) {
      delete result.registeredAddress;
    }
  }

  // 注册资本校验：必须包含数字
  if (result.registeredCapital && !/[0-9]/.test(result.registeredCapital)) {
    delete result.registeredCapital;
  }

  // 成立日期校验：必须包含4位数字年份
  if (result.establishedDate && !/\d{4}/.test(result.establishedDate)) {
    delete result.establishedDate;
  }

  // 统一社会信用代码校验：必须是18位
  if (result.unifiedSocialCreditCode && !/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(result.unifiedSocialCreditCode)) {
    delete result.unifiedSocialCreditCode;
  }

  // 法定代表人校验：2-15个中文字符
  if (result.legalRepresentative) {
    const name = result.legalRepresentative;
    if (!/^[\u4e00-\u9fa5·]{2,15}$/.test(name)) {
      delete result.legalRepresentative;
    }
  }

  // 经营范围校验：长度合理
  if (result.businessScope && (result.businessScope.length < 4 || result.businessScope.length > 500)) {
    delete result.businessScope;
  }

  // 企业类型校验：应包含"公司""企业""有限""合伙"等关键词
  if (result.enterpriseType && !/(公司|企业|有限|合伙|独资|个体)/.test(result.enterpriseType)) {
    delete result.enterpriseType;
  }

  return result;
}

const FIELD_LABELS = {
  legalRepresentative: '法定代表人',
  registeredCapital: '注册资本',
  establishedDate: '成立日期',
  registeredAddress: '注册地址',
  unifiedSocialCreditCode: '统一社会信用代码',
  enterpriseType: '企业类型',
  businessScope: '经营范围',
  phone: '联系电话',
};

function businessFieldsToMarkdown(fields) {
  const lines = [];
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    if (fields[key]) {
      lines.push(`- ${label}：${fields[key]}`);
    }
  }
  return lines.join('\n');
}

function createWebSearchService() {
  /**
   * 搜索企业工商基础信息。
   * @param {string} companyName 企业全称
   * @returns {Promise<{results: Array, businessFields: Record<string,string>}>}
   */
  async function searchForBusinessInfo(companyName) {
    const name = String(companyName || '').trim();
    if (!name) return { results: [], businessFields: {} };

    // 提取公司核心名称（去掉"有限公司/有限责任公司/股份有限公司"等后缀），用于模糊匹配
    const coreName = name.replace(/(有限责任公司|股份有限公司|有限公司)$/, '').trim();

    /**
     * 判断一段文本是否与目标公司相关。
     * 必须包含完整公司名，或包含核心名称 + 公司特征词（公司/企业/科技/有限）。
     */
    function isCompanyRelated(text) {
      if (!text) return false;
      if (text.includes(name)) return true;
      // 核心名 + 公司特征词，避免把同行业其他公司的数据混入
      if (coreName && text.includes(coreName) && /(公司|企业|有限|科技|工商)/.test(text)) return true;
      return false;
    }

    // 多组关键词定向搜索（精简数量，避免触发搜索引擎反爬）
    const keywords = [
      `${name} 工商信息`,
      `${name} 天眼查 法定代表人 注册资本`,
      `${name} 统一社会信用代码 注册地址 经营范围`,
    ];

    const allItems = [];
    const tycTexts = []; // 天眼查来源文本（优先使用）
    const otherTexts = []; // 其他来源文本
    try {
      // 百度搜索：串行执行并加延迟，避免触发安全验证
      for (let i = 0; i < keywords.length; i++) {
        if (i > 0) await sleep(800);
        const baiduResults = await fetchSearchResults(buildBaiduUrl(keywords[i]), parseBaiduResults, name);
        for (const item of baiduResults) {
          allItems.push(item);
          if (item.snippet && (item.pageMentionsCompany || isCompanyRelated(item.snippet))) {
            // 天眼查数据特征：包含"天眼查"或"统一社会信用代码"+18位编码
            if (item.snippet.includes('天眼查') || /统一社会信用代码\s*[0-9A-HJ-NPQRTUWXY]{18}/.test(item.snippet)) {
              tycTexts.push(item.snippet);
            } else {
              otherTexts.push(item.snippet);
            }
          }
        }
      }

      // Bing 搜索：并行执行
      const bingTasks = keywords.map((keyword) => fetchSearchResults(buildBingUrl(keyword), parseBingResults));
      const bingSettled = await Promise.allSettled(bingTasks);
      for (const result of bingSettled) {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
          for (const item of result.value) {
            allItems.push(item);
            if (item.snippet && isCompanyRelated(item.snippet)) {
              if (item.snippet.includes('天眼查') || /统一社会信用代码\s*[0-9A-HJ-NPQRTUWXY]{18}/.test(item.snippet)) {
                tycTexts.push(item.snippet);
              } else {
                otherTexts.push(item.snippet);
              }
            }
          }
        }
      }
    } catch {
      // 搜索失败不阻塞主流程
    }

    // 优先从天眼查来源提取，再用其他来源补充缺失字段
    let fields = {};
    if (tycTexts.length > 0) {
      fields = extractFieldsFromText(tycTexts.join(' \n '));
    }
    if (otherTexts.length > 0) {
      const otherFields = extractFieldsFromText(otherTexts.join(' \n '));
      fields = mergeFields(fields, otherFields);
    }

    // 尝试抓取详情页补充字段（仅对缺失字段）
    const missingFields = Object.keys(FIELD_LABELS).filter((k) => !fields[k]);
    if (missingFields.length > 0) {
      const detailUrls = [];
      for (const item of allItems) {
        // 只抓取与目标公司相关的结果页面
        if (item.url && !isBlockedUrl(item.url) && !detailUrls.includes(item.url) && isCompanyRelated(item.snippet)) {
          detailUrls.push(item.url);
        }
      }
      const pagesToFetch = detailUrls.slice(0, MAX_DETAIL_PAGES);
      if (pagesToFetch.length > 0) {
        const pageTasks = pagesToFetch.map((url) => fetchDetailPage(url));
        const pageResults = await Promise.allSettled(pageTasks);
        for (const pageResult of pageResults) {
          if (pageResult.status !== 'fulfilled' || !pageResult.value) continue;
          const pageText = stripHtmlTags(pageResult.value);
          // 只从包含目标公司名的页面内容中提取字段
          if (!isCompanyRelated(pageText)) continue;
          const pageFields = extractFieldsFromText(pageText);
          fields = mergeFields(fields, pageFields);
        }
      }
    }

    fields = validateFields(fields);
    return { results: allItems, businessFields: fields };
  }

  /**
   * 抓取详情页 HTML。
   */
  async function fetchDetailPage(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAGE_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: getHeaders(),
        signal: controller.signal,
      });
      if (!response.ok) return '';
      const buffer = await response.arrayBuffer();
      let text;
      try {
        text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
        if (text.includes('\uFFFD\uFFFD\uFFFD')) {
          text = new TextDecoder('gbk', { fatal: false }).decode(buffer);
        }
      } catch {
        text = new TextDecoder('gbk', { fatal: false }).decode(buffer);
      }
      return text;
    } catch {
      return '';
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 判断是否需要客户端预搜索。
   */
  function needsClientSideSearch(modelName) {
    const name = String(modelName || '').toLowerCase();
    return name.includes('deepseek') || name.includes('ds-') || name.includes('doubao');
  }

  return {
    searchForBusinessInfo,
    businessFieldsToMarkdown,
    needsClientSideSearch,
    FIELD_LABELS,
  };
}

module.exports = { createWebSearchService };
