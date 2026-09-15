const crypto = require('node:crypto');

function now() {
  return new Date().toISOString();
}

function createNewsId() {
  return `news-${crypto.randomUUID()}`;
}

function newsFromRow(row) {
  if (!row) return null;
  return {
    news_id: row.news_id,
    title: row.title,
    source: row.source || '',
    url: row.url || '',
    summary: row.summary || '',
    content: row.content || '',
    category: row.category || '绿色低碳',
    published_at: row.published_at || '',
    crawled_at: row.crawled_at,
  };
}

function createGreenNewsStore({ db }) {
  // 检查 url 是否已存在
  const existsByUrlStmt = db.prepare('SELECT 1 FROM green_news WHERE url = ? LIMIT 1');

  // 列表查询（支持关键词搜索）
  function listNews({ keyword = '', limit = 50, offset = 0 } = {}) {
    const kw = String(keyword || '').trim();
    if (!kw) {
      return db.prepare(`
        SELECT news_id, title, source, url, summary, category, published_at, crawled_at
        FROM green_news
        ORDER BY crawled_at DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset).map(newsFromRow);
    }
    const like = `%${kw}%`;
    return db.prepare(`
      SELECT news_id, title, source, url, summary, category, published_at, crawled_at
      FROM green_news
      WHERE title LIKE ? OR summary LIKE ? OR content LIKE ? OR source LIKE ?
      ORDER BY crawled_at DESC
      LIMIT ? OFFSET ?
    `).all(like, like, like, like, limit, offset).map(newsFromRow);
  }

  // 总数（用于搜索）
  function countNews({ keyword = '' } = {}) {
    const kw = String(keyword || '').trim();
    if (!kw) {
      return db.prepare('SELECT COUNT(*) as c FROM green_news').get().c;
    }
    const like = `%${kw}%`;
    return db.prepare(`
      SELECT COUNT(*) as c FROM green_news
      WHERE title LIKE ? OR summary LIKE ? OR content LIKE ? OR source LIKE ?
    `).get(like, like, like, like).c;
  }

  // 单条详情
  function getNews(newsId) {
    const row = db.prepare(`
      SELECT news_id, title, source, url, summary, content, category, published_at, crawled_at
      FROM green_news WHERE news_id = ?
    `).get(newsId);
    return newsFromRow(row);
  }

  // 按 url 查找（用于爬虫去重）
  function findByUrl(url) {
    if (!url) return null;
    const row = db.prepare('SELECT news_id FROM green_news WHERE url = ? LIMIT 1').get(url);
    return row ? row.news_id : null;
  }

  // 批量 upsert —— 爬虫结果入库，自动按 url 去重
  function batchInsertNews(items) {
    if (!Array.isArray(items) || items.length === 0) return { inserted: 0, skipped: 0 };
    const tx = db.transaction((list) => {
      const inserted = [];
      const skipped = [];
      const nowTs = now();
      const stmt = db.prepare(`
        INSERT INTO green_news (news_id, title, source, url, summary, content, category, published_at, crawled_at)
        VALUES (@news_id, @title, @source, @url, @summary, @content, @category, @published_at, @crawled_at)
      `);
      for (const item of list) {
        try {
          stmt.run({
            news_id: createNewsId(),
            title: String(item.title || '').trim(),
            source: String(item.source || '').trim(),
            url: String(item.url || '').trim(),
            summary: String(item.summary || '').trim(),
            content: String(item.content || '').trim(),
            category: String(item.category || '绿色低碳').trim(),
            published_at: String(item.published_at || '').trim(),
            crawled_at: nowTs,
          });
          inserted.push(item);
        } catch (e) {
          // UNIQUE(url) 冲突 → 跳过
          skipped.push(item);
        }
      }
      return { inserted: inserted.length, skipped: skipped.length };
    });
    return tx(items);
  }

  // 删除单条
  function deleteNews(newsId) {
    const result = db.prepare('DELETE FROM green_news WHERE news_id = ?').run(newsId);
    return { success: result.changes > 0, message: result.changes > 0 ? '已删除' : '新闻不存在' };
  }

  // 清空全部
  function clearAll() {
    db.prepare('DELETE FROM green_news').run();
    return { success: true };
  }

  // 更新正文（详情页爬取后回写）
  function updateNewsContent(newsId, content, summary, publishedAt) {
    const sets = [];
    const params = [];
    if (content !== undefined) { sets.push('content = ?'); params.push(content); }
    if (summary !== undefined) { sets.push('summary = ?'); params.push(summary); }
    if (publishedAt !== undefined && publishedAt) { sets.push('published_at = ?'); params.push(publishedAt); }
    if (sets.length === 0) return 0;
    params.push(newsId);
    const result = db.prepare(`UPDATE green_news SET ${sets.join(', ')} WHERE news_id = ?`).run(...params);
    return result.changes;
  }

  return {
    listNews,
    countNews,
    getNews,
    findByUrl,
    batchInsertNews,
    deleteNews,
    clearAll,
    updateNewsContent,
  };
}

module.exports = { createGreenNewsStore };
