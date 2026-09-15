const https = require('https');
const zlib = require('zlib');
const cheerio = require('cheerio');
const { URL } = require('url');

function doRequest(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let buf = Buffer.concat(chunks);
        if (res.headers['content-encoding'] === 'gzip') buf = zlib.gunzipSync(buf);
        resolve(buf.toString('utf-8'));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function test() {
  const html = await doRequest('http://www.mee.gov.cn/ywdt/dfnews/202609/t20260911_1165793.shtml');
  const $ = cheerio.load(html);

  // 完整移除（和 fetchArticleContent 一样）
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

  // 输出所有带 class/id 的 div 的文本量，找最大的
  console.log('=== 所有带 class/id 的容器（按文本量排序 Top 20）===');
  const items = [];
  $('div, section, article, main').each((_, el) => {
    const e = $(el);
    const cls = e.attr('class') || '';
    const id = e.attr('id') || '';
    if (!cls && !id) return;
    const textLen = e.text().length;
    const pCount = e.find('p').length;
    if (textLen > 50) items.push({ cls, id, textLen, pCount });
  });
  items.sort((a, b) => b.textLen - a.textLen);
  items.slice(0, 20).forEach((x, i) => {
    console.log(`  ${i+1}. text=${x.textLen} p=${x.pCount}  id="${x.id}" class="${x.cls.slice(0,50)}"`);
  });

  // 同时看原始 HTML 里 .TRS_Editor 文本量到底是多少（移除前）
  console.log('\n=== 移除前的 .TRS_Editor 文本量 ===');
  const $2 = cheerio.load(html);
  const rawEditor = $2('.TRS_Editor').first();
  console.log('存在?', rawEditor.length > 0, '文本量:', rawEditor.text().length, 'img:', rawEditor.find('img').length, 'p:', rawEditor.find('p').length);
  if (rawEditor.length) console.log('前 300:', rawEditor.text().slice(0, 300));

  // 移除后再看 TRS_Editor
  const editor = $('.TRS_Editor').first();
  console.log('\n=== 移除后的 .TRS_Editor ===');
  console.log('存在?', editor.length > 0, '文本量:', editor.text().length);
  if (editor.length) console.log('前 300:', editor.text().slice(0, 300));
}
test().catch(e => console.error(e));
