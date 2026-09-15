const https = require('https');
const zlib = require('zlib');
const cheerio = require('cheerio');
const TurndownService = require('turndown');
const { URL } = require('url');

function doRequest(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let buf = Buffer.concat(chunks);
        if (res.headers['content-encoding'] === 'gzip') buf = zlib.gunzipSync(buf);
        resolve({ status: res.statusCode, body: buf.toString('utf-8'), len: buf.length });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function test() {
  const articleUrl = 'http://www.mee.gov.cn/ywdt/dfnews/202609/t20260911_1165793.shtml';
  const r = await doRequest(articleUrl);
  console.log('fetch: status=', r.status, 'len=', r.len);
  if (r.status !== 200) { console.log('响应前 300:', r.body.slice(0, 300)); return; }

  const html = r.body;
  const $ = cheerio.load(html);

  // 完整复制 fetchArticleContent 流程，每步打日志
  $('script, style, nav, header, footer, aside, iframe, noscript, form, button, input, textarea, select').remove();
  $('.ad, .ads, .ad-banner, .share, .share-box, .share-btns, .recommend, .related, .related-links, .recommend-rel, .recommend-int, .sidebar, .comment, .comments, .comment-list, .comment-box, .pagination, .page-nav').remove();
  $('.crumb, .crumbs, .crumbsNav, .breadcrumb').remove();
  $('.stbzCBaseXq, .stbzXq, .xqYdFx, .ydfxBox, .content-footer').remove();
  $('.link-url-wrapper, .link-url-mask, .link-url-inner, .link-p, .leave-tip, .leave-modal').remove();
  $('.search, .search-box, .searchWord, .searchbox, .headerSearch, .logoSearch, .logoSearchBox, .logoSearchR').remove();
  $('.lang-switch, .fan_en, .language, .lang-en, .fan_yuan').remove();
  $('.hot, .hot-search, .hotSearch, .recommend-search').remove();
  $('.print, .font-size, .tool-bar, .toolBar').remove();
  $('.download, .print-version').remove();

  console.log('移除后 body 文本:', $('body').text().length);

  // 找 img
  let imgCount = 0;
  $('img').each((_, el) => {
    const e = $(el);
    const src = e.attr('src') || e.attr('data-src') || e.attr('data-original') || '';
    if (src && !src.startsWith('data:') && !src.startsWith('javascript:')) {
      e.attr('src', src.startsWith('/') ? new URL(src, articleUrl).href : new URL(src, articleUrl).href);
      imgCount++;
    } else { e.remove(); }
  });
  console.log('图片处理后 img 数量:', imgCount);

  // 找正文容器
  const selectors = [
    'div.TRS_Editor', 'div#TRS_Editor',
    'div.pages_content', 'div#pages_content', 'div.pages_content_2',
    'div.con_text', 'div#content', 'div#docContent', 'div.article-content',
    'div.wzsmCenter', 'div.stbzXq', 'div.stbzCBaseXq', 'div.innerBg', 'div.innerCenter',
  ];
  let body = null, bestTextLen = 0;
  for (const sel of selectors) {
    const el = $(sel);
    if (!el.length) continue;
    const textLen = el.first().text().length;
    console.log(`  selector [${sel}]: match=${el.length}, textLen=${textLen}`);
    if (textLen > bestTextLen) { bestTextLen = textLen; body = el.first(); }
    if (/TRS_Editor|pages_content|con_text|article-content|wzsmCenter/.test(sel) && textLen > 100) {
      body = el.first(); break;
    }
  }

  if (!body) {
    console.log('精确 selector 全 miss，开始兜底扫 div...');
    const divs = [];
    $('div').each((_, el) => {
      const e = $(el);
      const pCount = e.find('p').length;
      const textLen = e.text().length;
      if (pCount >= 2 && textLen > 200) divs.push({ e: e.first(), pCount, textLen });
    });
    divs.sort((a, b) => (b.pCount * 3 + b.textLen / 1000) - (a.pCount * 3 + a.textLen / 1000));
    if (divs[0]) { body = divs[0].e; console.log(`兜底选中: p=${divs[0].pCount} text=${divs[0].textLen}`); }
    else { body = $('body'); console.log('⚠️ 最终 fallback 到 body，body text=', body.text().length); }
  }

  console.log('选中容器内文本量:', body.text().length, 'HTML 量:', (body.html() || '').length);
  console.log('容器内 img:', body.find('img').length);

  // Turndown
  const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', hr: '---' });
  td.remove(['script','style']);
  const md = td.turndown(body.html() || body.text());
  const cleaned = md.replace(/\[(javascript:|#)[^\]]*\]\([^)]*\)/g, '').replace(/!\[正文图片\]\([^)]*\)/g, '').replace(/\[[^\]]*\]\(javascript:[^)]*\)/g, '').replace(/\[[^\]]*\]\(#\)/g, '').replace(/\n{3,}/g, '\n\n').trim();
  console.log('\nMarkdown 长度:', md.length, '清理后:', cleaned.length);
  console.log('前 500:\n', cleaned.slice(0, 500));
}
test().catch(e => console.error(e));
