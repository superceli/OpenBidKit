const https = require('https');
const zlib = require('zlib');
const cheerio = require('cheerio');

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

  // 找 .TRS_Editor 的所有祖先节点，看哪个祖先有我们的移除 class
  const editor = $('.TRS_Editor').first();
  console.log('TRS_Editor 存在:', editor.length);
  let node = editor;
  let depth = 0;
  while (node.length && depth < 10) {
    const tag = node.get(0)?.tagName?.toLowerCase();
    const cls = node.attr('class') || '';
    const id = node.attr('id') || '';
    const rmMatch = cls.split(/\s+/).filter(c => c && /^(ad|ads|share|recommend|related|sidebar|comment|pagination|crumb|crumbs|link-url|search|lang|hot|print|download|content-footer|stbzCBaseXq|link-p|leave)/i.test(c));
    console.log(`  depth ${depth}: <${tag} id="${id}" class="${cls.slice(0,60)}" ${rmMatch.length ? '⚠️ 匹配移除: ' + rmMatch.join(',') : ''}`);
    node = node.parent();
    depth++;
  }

  // 看有没有祖先含 .link-url-wrapper
  console.log('\n=== .TRS_Editor 祖先中是否含 link-url ===');
  const parentClasses = [];
  let n = editor;
  while (n.length && n.attr) {
    const cls = n.attr('class') || '';
    if (cls) parentClasses.push(cls);
    n = n.parent();
  }
  console.log('祖先 class 链:', parentClasses);

  // 直接搜 HTML 里 TRS_Editor 周围 1000 字符
  const idx = html.indexOf('TRS_Editor');
  console.log('\n=== TRS_Editor 周围 HTML ===');
  console.log(html.slice(Math.max(0, idx - 500), idx + 500));
}
test().catch(e => console.error(e));
