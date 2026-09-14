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
 * 2. 直接搜索企查查（qcc.com），扩展工商信息参考来源
 * 3. 从百度搜索结果的 JSON 嵌入数据（abstract 字段）提取工商信息摘要
 * 4. 从搜索结果详情页全文中提取字段
 * 5. 多来源合并 + 合法性校验
 */

const SEARCH_TIMEOUT_MS = 15000;
const PAGE_FETCH_TIMEOUT_MS = 12000;
const MAX_DETAIL_PAGES = 5;
const WAYBACK_TIMEOUT_MS = 10000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 过滤掉内容多为截断摘要的聚合站（企查查、爱企查已作为直接搜索源，不再屏蔽）
const BLOCKED_DOMAINS = ['tianyancha.com', 'qixin.com'];

function buildBingUrl(keyword) {
  const q = encodeURIComponent(keyword);
  return `https://cn.bing.com/search?q=${q}&ensearch=0`;
}

function buildBaiduUrl(keyword) {
  const q = encodeURIComponent(keyword);
  return `https://www.baidu.com/s?wd=${q}`;
}

function buildQccUrl(keyword) {
  const q = encodeURIComponent(keyword);
  return `https://www.qcc.com/web/search?key=${q}`;
}

function buildAiqichaUrl(keyword) {
  const q = encodeURIComponent(keyword);
  return `https://aiqicha.baidu.com/s?q=${q}`;
}

/**
 * 构造 Bing site: 限定搜索 URL。
 * 用于在主搜索无果时，定向从特定权威站点（如国家企业信用信息公示系统 gsxt.gov.cn）抓快照。
 * @param {string} keyword 关键词
 * @param {string} site 限定域名，如 'gsxt.gov.cn'
 */
function buildBingSiteUrl(keyword, site) {
  const q = encodeURIComponent(`${keyword} site:${site}`);
  return `https://cn.bing.com/search?q=${q}&ensearch=0`;
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
 * 从企查查搜索结果页提取条目。
 * 企查查（qcc.com）搜索页可能包含 SSR 嵌入的 JSON 结构化数据或 HTML 文本块，
 * 均从中提取工商字段值，扩展可参考的网页来源。
 * @param {string} html
 * @param {string} [companyName] 传入时做页面级公司名校验，页面提及公司则所有片段都可使用
 */
function parseQccResults(html, companyName) {
  const results = [];
  const coreName2 = companyName ? companyName.replace(/(有限责任公司|股份有限公司|有限公司)$/, '') : '';
  const pageMentionsCompany = companyName
    ? html.includes(companyName) || (coreName2 && html.includes(coreName2))
    : false;

  // 方法1：从 JSON 数据中提取工商字段值
  // 企查查可能在 SSR 或 window.__INITIAL_STATE__ 中嵌入结构化数据
  // 字段名可能为驼峰命名：legalPerson、regCapital、startDate、address、creditNo 等
  const jsonFieldPatterns = [
    { regex: /"(?:legalPerson|legalRepresentative|operName|legalName|legal)"\s*:\s*"([^"]{1,50})"/g, label: '法定代表人' },
    { regex: /"(?:regCap|regCapital|capital|registeredCapital|regCapitalStr)"\s*:\s*"([^"]{1,100})"/g, label: '注册资本' },
    { regex: /"(?:startDate|estiblishTime|foundDate|establishDate)"\s*:\s*"([^"]{1,30})"/g, label: '成立日期' },
    { regex: /"(?:address|regAddress|regLocation|companyAddress)"\s*:\s*"([^"]{1,200})"/g, label: '注册地址' },
    { regex: /"(?:creditNo|unifiedSocialCreditCode|creditCode|creditNoStr)"\s*:\s*"([0-9A-HJ-NPQRTUWXY]{18})"/g, label: '统一社会信用代码' },
    { regex: /"(?:companyType|entType|econType|companyOrgType)"\s*:\s*"([^"]{1,50})"/g, label: '企业类型' },
    { regex: /"(?:businessScope|scope|opsScope|opScope|businessScopeStr)"\s*:\s*"([^"]{1,500})"/g, label: '经营范围' },
    { regex: /"(?:phoneNumber|tel|phone|contactPhone)"\s*:\s*"([^"]{1,30})"/g, label: '联系电话' },
  ];
  for (const { regex, label } of jsonFieldPatterns) {
    let fieldMatch;
    while ((fieldMatch = regex.exec(html)) !== null) {
      const value = fieldMatch[1]
        .replace(/\\u003C/g, '<')
        .replace(/\\u003E/g, '>')
        .replace(/\\"/g, '"')
        .replace(/\\n/g, ' ')
        .replace(/\\t/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (value && value.length > 1) {
        results.push({ title: '', snippet: `${label}：${value}`, url: '', pageMentionsCompany: true });
      }
    }
  }

  // 方法2：从 HTML 文本中提取包含工商字段关键词的文本块
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const rawMatches = text.match(/[^<>]{0,100}(?:法定代表人|注册资本|成立[日期时间]|注册地址|统一社会信用代码|企业类型|经营范围|联系电话)[^<>]{0,200}/g);
  if (rawMatches) {
    for (const raw of rawMatches) {
      const cleaned = raw
        .replace(/\\"/g, '"')
        .replace(/\\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned.length <= 15) continue;
      if (companyName && !cleaned.includes(companyName) && !(coreName2 && cleaned.includes(coreName2))) {
        continue;
      }
      results.push({ title: '', snippet: cleaned, url: '', pageMentionsCompany: true });
    }
  }

  return results;
}

/**
 * 从爱企查搜索结果页提取条目。
 * 爱企查（aiqicha.baidu.com）是百度系企业信息聚合站，搜索页常 SSR 嵌入 JSON。
 * 字段命名接近企查查，但部分字段为 pid/entName 等。
 * @param {string} html
 * @param {string} [companyName] 传入时做页面级公司名校验
 */
function parseAiqichaResults(html, companyName) {
  const results = [];
  const coreName2 = companyName ? companyName.replace(/(有限责任公司|股份有限公司|有限公司)$/, '') : '';
  const pageMentionsCompany = companyName
    ? html.includes(companyName) || (coreName2 && html.includes(coreName2))
    : false;

  // 方法1：从 JSON 中提取工商字段值
  // 爱企查 SSR 数据字段名可能为：legalPerson、regCap、startDate、address、unifiedCode、companyType、scope 等
  const jsonFieldPatterns = [
    { regex: /"(?:legalPerson|legalRepresentative|operName|legalName|legal)"\s*:\s*"([^"]{1,50})"/g, label: '法定代表人' },
    { regex: /"(?:regCap|regCapital|capital|registeredCapital|regCapStr)"\s*:\s*"([^"]{1,100})"/g, label: '注册资本' },
    { regex: /"(?:startDate|estiblishTime|foundDate|establishDate|startDateStr)"\s*:\s*"([^"]{1,30})"/g, label: '成立日期' },
    { regex: /"(?:address|regAddress|regLocation|companyAddress|addr)"\s*:\s*"([^"]{1,200})"/g, label: '注册地址' },
    { regex: /"(?:unifiedCode|unifiedSocialCreditCode|creditCode|creditNo)"\s*:\s*"([0-9A-HJ-NPQRTUWXY]{18})"/g, label: '统一社会信用代码' },
    { regex: /"(?:companyType|entType|econType|companyOrgType|economicType)"\s*:\s*"([^"]{1,50})"/g, label: '企业类型' },
    { regex: /"(?:businessScope|scope|opsScope|opScope|businessScopeStr)"\s*:\s*"([^"]{1,500})"/g, label: '经营范围' },
    { regex: /"(?:phoneNumber|tel|phone|contactPhone|telephone)"\s*:\s*"([^"]{1,30})"/g, label: '联系电话' },
  ];
  for (const { regex, label } of jsonFieldPatterns) {
    let fieldMatch;
    while ((fieldMatch = regex.exec(html)) !== null) {
      const value = fieldMatch[1]
        .replace(/\\u003C/g, '<')
        .replace(/\\u003E/g, '>')
        .replace(/\\"/g, '"')
        .replace(/\\n/g, ' ')
        .replace(/\\t/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (value && value.length > 1) {
        results.push({ title: '', snippet: `${label}：${value}`, url: '', pageMentionsCompany: true });
      }
    }
  }

  // 方法2：从 HTML 文本中提取包含工商字段关键词的文本块
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const rawMatches = text.match(/[^<>]{0,100}(?:法定代表人|注册资本|成立[日期时间]|注册地址|统一社会信用代码|企业类型|经营范围|联系电话)[^<>]{0,200}/g);
  if (rawMatches) {
    for (const raw of rawMatches) {
      const cleaned = raw
        .replace(/\\"/g, '"')
        .replace(/\\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned.length <= 15) continue;
      if (companyName && !cleaned.includes(companyName) && !(coreName2 && cleaned.includes(coreName2))) {
        continue;
      }
      results.push({ title: '', snippet: cleaned, url: '', pageMentionsCompany: true });
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

// 企查查 cookie jar：跨请求维护 antiparser 等反爬 cookie，单进程内有效
let qccCookieJar = '';
let qccWarmupAt = 0; // 上次 warmup 时间戳（ms），用于节流避免频繁预热
const QCC_WARMUP_INTERVAL_MS = 60_000;

/**
 * 从 fetch 响应的 Set-Cookie 头收集 cookie，合并进企查查 cookie jar。
 * Node undici 支持 response.headers.getSetCookie()，老版本 fallback 到 'set-cookie'。
 */
function updateQccCookies(response) {
  try {
    let setCookies = [];
    if (typeof response.headers.getSetCookie === 'function') {
      setCookies = response.headers.getSetCookie();
    } else {
      const raw = response.headers.get('set-cookie');
      if (raw) setCookies = [raw];
    }
    if (!setCookies || setCookies.length === 0) return;
    const map = new Map();
    // 解析已有 jar
    if (qccCookieJar) {
      for (const part of qccCookieJar.split('; ').filter(Boolean)) {
        const idx = part.indexOf('=');
        if (idx > 0) map.set(part.slice(0, idx), part.slice(idx + 1));
      }
    }
    // 合并新 cookie（同名覆盖）
    for (const sc of setCookies) {
      const pair = String(sc).split(';')[0];
      const idx = pair.indexOf('=');
      if (idx > 0) map.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
    qccCookieJar = Array.from(map, ([k, v]) => `${k}=${v}`).join('; ');
  } catch {
    // cookie 解析失败不阻塞主流程
  }
}

/**
 * 判断企查查响应是否命中反爬虫（验证码页/登录跳转/纯空检测页）。
 */
function isQccAntiSpider(html, statusCode) {
  if (!html) return true;
  // 非典型状态码直接判反爬
  if (statusCode === 403 || statusCode === 405 || statusCode === 412) return true;
  const lower = html.toLowerCase();
  if (lower.includes('请输入验证码') || lower.includes('人机验证')) return true;
  if (lower.includes('为了您的访问安全') || lower.includes('访问过于频繁')) return true;
  if (/<title[^>]*>\s*(登录|验证|安全验证|访问验证)/i.test(html)) return true;
  if (/window\.location(?:\.href)?\s*=\s*["'][^"']*\/(login|verify|user\/login)/i.test(html)) return true;
  // 检测页通常结构极简：剥除脚本后正文极短
  const stripped = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\s+/g, '');
  if (stripped.length < 100) return true;
  return false;
}

/**
 * 企查查首页 warmup：访问主页以换取 antiparser 基础 cookie。
 * 60 秒内只预热一次。
 */
async function warmupQcc() {
  const now = Date.now();
  if (now - qccWarmupAt < QCC_WARMUP_INTERVAL_MS) return;
  qccWarmupAt = now;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const headers = getHeaders();
    headers['Referer'] = 'https://www.baidu.com/';
    if (qccCookieJar) headers['Cookie'] = qccCookieJar;
    const response = await fetch('https://www.qcc.com/', {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    updateQccCookies(response);
  } catch {
    // warmup 失败忽略，主请求会自行处理
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 请求企查查搜索页（带 cookie 处理与反爬重试）。
 * 流程：
 * 1. 先 warmup 首页换取基础 cookie（节流）
 * 2. 带 cookie 访问搜索页；响应再更新 cookie
 * 3. 命中反爬 → 再 warmup + 重试一次
 * 4. 仍命中 → 放弃返回 []
 */
async function fetchQccResults(url, parser, companyName) {
  await warmupQcc();
  const tryFetch = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    try {
      const headers = getHeaders();
      headers['Referer'] = 'https://www.qcc.com/';
      if (qccCookieJar) headers['Cookie'] = qccCookieJar;
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      updateQccCookies(response);
      const statusCode = response.status;
      if (!response.ok && statusCode !== 200) {
        return { antiSpider: statusCode === 403 || statusCode === 405 || statusCode === 412, text: '' };
      }
      const text = await response.text();
      return { antiSpider: isQccAntiSpider(text, statusCode), text };
    } catch {
      return { antiSpider: false, text: '' };
    } finally {
      clearTimeout(timer);
    }
  };

  let result = await tryFetch();
  if (result.antiSpider && !result.text) {
    // 状态码命中反爬：强制重新 warmup 再重试一次
    qccWarmupAt = 0;
    await warmupQcc();
    result = await tryFetch();
  } else if (result.antiSpider && result.text) {
    // 内容命中反爬：直接重试一次
    result = await tryFetch();
  }

  if (!result.text || result.antiSpider) return [];
  return parser(result.text, companyName);
}

// 爱企查 cookie jar：与企查查分开维护，避免不同站点 cookie 互窜
let aiqichaCookieJar = '';
let aiqichaWarmupAt = 0;

function updateAiqichaCookies(response) {
  try {
    let setCookies = [];
    if (typeof response.headers.getSetCookie === 'function') {
      setCookies = response.headers.getSetCookie();
    } else {
      const raw = response.headers.get('set-cookie');
      if (raw) setCookies = [raw];
    }
    if (!setCookies || setCookies.length === 0) return;
    const map = new Map();
    if (aiqichaCookieJar) {
      for (const part of aiqichaCookieJar.split('; ').filter(Boolean)) {
        const idx = part.indexOf('=');
        if (idx > 0) map.set(part.slice(0, idx), part.slice(idx + 1));
      }
    }
    for (const sc of setCookies) {
      const pair = String(sc).split(';')[0];
      const idx = pair.indexOf('=');
      if (idx > 0) map.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
    aiqichaCookieJar = Array.from(map, ([k, v]) => `${k}=${v}`).join('; ');
  } catch {
    // cookie 解析失败不阻塞
  }
}

/**
 * 爱企查反爬检测。复用 qcc 的通用反爬特征，并加 aiqicha.baidu.com 专属特征。
 */
function isAiqichaAntiSpider(html, statusCode) {
  if (!html) return true;
  if (statusCode === 403 || statusCode === 405 || statusCode === 412) return true;
  const lower = html.toLowerCase();
  if (lower.includes('请输入验证码') || lower.includes('人机验证')) return true;
  if (lower.includes('为了您的访问安全') || lower.includes('访问过于频繁')) return true;
  if (/<title[^>]*>\s*(登录|验证|安全验证|访问验证)/i.test(html)) return true;
  // 爱企查未登录搜索页常跳到 /login 或返回极简登录引导页
  if (/window\.location(?:\.href)?\s*=\s*["'][^"']*\/(login|user\/login)/i.test(html)) return true;
  // 爱企查搜索结果靠 SPA 渲染时 SSR 极简：剥除脚本后正文极短视为反爬
  const stripped = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\s+/g, '');
  if (stripped.length < 100) return true;
  return false;
}

/**
 * 爱企查 warmup：访问百度首页拿 BAIDUID 等基础 cookie（爱企查是百度子站共享 BAIDUID）。
 */
async function warmupAiqicha() {
  const now = Date.now();
  if (now - aiqichaWarmupAt < QCC_WARMUP_INTERVAL_MS) return;
  aiqichaWarmupAt = now;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const headers = getHeaders();
    headers['Referer'] = 'https://www.baidu.com/';
    if (aiqichaCookieJar) headers['Cookie'] = aiqichaCookieJar;
    const response = await fetch('https://www.baidu.com/', {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    updateAiqichaCookies(response);
  } catch {
    // warmup 失败忽略
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 请求爱企查搜索页（带 cookie 处理与反爬重试）。
 * 复用 qcc 同样的重试策略：warmup → 带cookie请求 → 命中反爬则warmup+重试 → 仍失败返回[]
 */
async function fetchAiqichaResults(url, parser, companyName) {
  await warmupAiqicha();
  const tryFetch = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    try {
      const headers = getHeaders();
      headers['Referer'] = 'https://aiqicha.baidu.com/';
      if (aiqichaCookieJar) headers['Cookie'] = aiqichaCookieJar;
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      updateAiqichaCookies(response);
      const statusCode = response.status;
      if (!response.ok && statusCode !== 200) {
        return { antiSpider: statusCode === 403 || statusCode === 405 || statusCode === 412, text: '' };
      }
      const text = await response.text();
      return { antiSpider: isAiqichaAntiSpider(text, statusCode), text };
    } catch {
      return { antiSpider: false, text: '' };
    } finally {
      clearTimeout(timer);
    }
  };

  let result = await tryFetch();
  if (result.antiSpider && !result.text) {
    aiqichaWarmupAt = 0;
    await warmupAiqicha();
    result = await tryFetch();
  } else if (result.antiSpider && result.text) {
    result = await tryFetch();
  }

  if (!result.text || result.antiSpider) return [];
  return parser(result.text, companyName);
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

      // Bing + 企查查 + 爱企查：并行执行（聚合站带 cookie 处理与反爬重试）
      const bingTasks = keywords.map((keyword) => fetchSearchResults(buildBingUrl(keyword), parseBingResults));
      const qccTask = fetchQccResults(buildQccUrl(name), parseQccResults, name);
      const aiqichaTask = fetchAiqichaResults(buildAiqichaUrl(name), parseAiqichaResults, name);
      const parallelSettled = await Promise.allSettled([...bingTasks, qccTask, aiqichaTask]);
      for (const result of parallelSettled) {
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
    let missingFields = Object.keys(FIELD_LABELS).filter((k) => !fields[k]);
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

    // 渐进式兜底：主搜索字段缺失过半时，依次尝试
    // 1) Bing site:gsxt.gov.cn 定向抓国家企业信用信息公示系统快照
    // 2) 仍未补齐 → 宽松关键词（仅公司名）再搜一轮 Bing + 百度
    fields = validateFields(fields);
    let strategy = Object.keys(fields).length > 0 ? 'main' : 'none';

    missingFields = Object.keys(FIELD_LABELS).filter((k) => !fields[k]);
    const minFieldsThreshold = Math.ceil(Object.keys(FIELD_LABELS).length / 2);
    if (missingFields.length >= minFieldsThreshold) {
      // 兜底1：Bing site:gsxt.gov.cn
      // gsxt.gov.cn 详情页有图形校验，不能直接 fetch；改用 Wayback Machine 历史快照，
      // 无存档则退化为只用 Bing snippet
      try {
        const gsxtUrl = buildBingSiteUrl(name, 'gsxt.gov.cn');
        const gsxtResults = await fetchSearchResults(gsxtUrl, parseBingResults);
        const gsxtTexts = [];
        for (const item of gsxtResults) {
          allItems.push(item);
          if (item.snippet && isCompanyRelated(item.snippet)) {
            gsxtTexts.push(item.snippet);
          }
          // 通过 Wayback 抓历史快照（避免触发 gsxt 图形校验）
          if (item.url && isCompanyRelated(item.snippet)) {
            const pageText = await fetchWaybackPage(item.url);
            if (pageText && isCompanyRelated(pageText)) {
              gsxtTexts.push(stripHtmlTags(pageText));
            }
          }
        }
        if (gsxtTexts.length > 0) {
          const gsxtFields = extractFieldsFromText(gsxtTexts.join(' \n '));
          fields = mergeFields(fields, gsxtFields);
          if (Object.keys(fields).length > 0) strategy = 'gsxt-fallback';
        }
      } catch {
        // gsxt 兜底失败继续下一策略
      }

      // 兜底2：宽松关键词二次搜索（仅公司名 + 工商字段名）
      const stillMissing = Object.keys(FIELD_LABELS).filter((k) => !fields[k]);
      if (stillMissing.length > 0) {
        try {
          const relaxedKeywords = [
            `${coreName || name} 工商注册信息 法定代表人 注册资本`,
            `${coreName || name} 统一社会信用代码 注册地址 经营范围 企业类型`,
          ];
          const relaxedBingTasks = relaxedKeywords.map((kw) => fetchSearchResults(buildBingUrl(kw), parseBingResults));
          const relaxedSettled = await Promise.allSettled(relaxedBingTasks);
          const relaxedTexts = [];
          for (const r of relaxedSettled) {
            if (r.status !== 'fulfilled' || !Array.isArray(r.value)) continue;
            for (const item of r.value) {
              allItems.push(item);
              if (item.snippet && isCompanyRelated(item.snippet)) {
                relaxedTexts.push(item.snippet);
              }
            }
          }
          if (relaxedTexts.length > 0) {
            const relaxedFields = extractFieldsFromText(relaxedTexts.join(' \n '));
            fields = mergeFields(fields, relaxedFields);
            if (Object.keys(fields).length > 0 && strategy === 'none') strategy = 'relaxed';
          }
        } catch {
          // 宽松搜索失败不阻塞
        }
      }
    }

    fields = validateFields(fields);
    if (Object.keys(fields).length === 0) strategy = 'none';
    return { results: allItems, businessFields: fields, strategy };
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
   * 通过 Wayback Machine 历史快照抓取页面 HTML。
   *
   * 用于 gsxt.gov.cn 等有图形校验/反爬的权威站点：不直接请求原 URL，
   * 而是查询 archive.org 是否存档该页面，再抓存档快照内容。
   * 流程：
   * 1. 查询 availability API，获取最近存档快照 URL
   * 2. 抓取快照页（archive.org 自身无图形校验）
   * 3. 若无存档，返回空字符串，调用方按 snippet 兜底
   *
   * @param {string} originalUrl 原 gsxt 详情页 URL
   * @returns {Promise<string>} 存档页面 HTML（无存档时返回 ''）
   */
  async function fetchWaybackPage(originalUrl) {
    if (!originalUrl) return '';
    const availabilityUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(originalUrl)}`;
    const availController = new AbortController();
    const availTimer = setTimeout(() => availController.abort(), WAYBACK_TIMEOUT_MS);
    let snapshotUrl = '';
    try {
      const response = await fetch(availabilityUrl, {
        method: 'GET',
        headers: getHeaders(),
        signal: availController.signal,
      });
      if (response.ok) {
        const data = await response.json();
        const closest = data?.archived_snapshots?.closest;
        if (closest?.available && closest?.url) {
          snapshotUrl = closest.url;
        }
      }
    } catch {
      // availability 查询失败直接放弃
    } finally {
      clearTimeout(availTimer);
    }
    if (!snapshotUrl) return '';

    const snapController = new AbortController();
    const snapTimer = setTimeout(() => snapController.abort(), PAGE_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(snapshotUrl, {
        method: 'GET',
        headers: getHeaders(),
        signal: snapController.signal,
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
      clearTimeout(snapTimer);
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
