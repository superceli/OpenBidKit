import { useEffect, useRef, useState } from 'react';
import { AppDialog, EmptyState, InlineSpinner, MarkdownRenderer, useToast } from '../../../shared/ui';
import type { GreenNewsItem, GreenNewsMutationResult } from '../../../shared/types/ipc';

type CategoryFilter = '全部' | '国家能源局' | '生态环境部';

const CATEGORY_FILTERS: CategoryFilter[] = ['全部', '国家能源局', '生态环境部'];
const PAGE_SIZE = 20;

function parseISO(iso: string): Date | null {
  if (!iso) return null;
  try { return new Date(iso); } catch { return null; }
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  const d = parseISO(iso);
  if (!d || Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function relativeTime(iso: string): string {
  const d = parseISO(iso);
  if (!d) return '';
  const diff = Date.now() - d.getTime();
  const hours = Math.floor(diff / 3600_000);
  const days = Math.floor(hours / 24);
  if (hours < 1) return '刚刚';
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  return formatDate(iso);
}

function GreenNewsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [items, setItems] = useState<GreenNewsItem[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [debouncedKw, setDebouncedKw] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('全部');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<GreenNewsItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<GreenNewsItem | null>(null);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [crawlLimit, setCrawlLimit] = useState(50); // 每个源 50 条，两源共 100
  const searchTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(() => {
      setDebouncedKw(keyword.trim());
      setPage(1);
    }, 300);
    return () => { if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current); };
  }, [keyword]);

  const reload = async () => {
    setLoading(true);
    try {
      const all = await window.lvcert.greenNews.list({ keyword: debouncedKw, limit: 1000 });
      const filtered = category === '全部' ? all : all.filter((i) => i.category === category);
      filtered.sort((a, b) => {
        const ta = parseISO(b.published_at || b.crawled_at)?.getTime() || 0;
        const tb = parseISO(a.published_at || a.crawled_at)?.getTime() || 0;
        return ta - tb;
      });
      setTotal(filtered.length);
      const start = (page - 1) * PAGE_SIZE;
      setItems(filtered.slice(start, start + PAGE_SIZE));
    } catch (e) {
      showToast(`加载新闻失败：${(e as Error).message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [debouncedKw, category, page]);

  useEffect(() => {
    const el = document.querySelector('.green-news-list-scroll');
    el?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openDetail = async (news: GreenNewsItem) => {
    setSelected(news);
    if (!news.content) {
      setDetailLoading(true);
      try {
        const full = await window.lvcert.greenNews.detail(news.news_id);
        if (full) setSelected(full);
      } catch (e) {
        showToast(`加载详情失败：${(e as Error).message}`, 'error');
      } finally {
        setDetailLoading(false);
      }
    }
  };

  const doDelete = async () => {
    if (!deleteConfirm) return;
    let res: GreenNewsMutationResult = { success: false, message: '' };
    try {
      res = await window.lvcert.greenNews.delete(deleteConfirm.news_id);
    } catch (e) {
      res = { success: false, message: (e as Error).message };
    }
    showToast(res.message, res.success ? 'success' : 'error');
    if (res.success) {
      setDeleteConfirm(null);
      if (selected?.news_id === deleteConfirm.news_id) setSelected(null);
      void reload();
    }
  };

  const doClearAll = async () => {
    let res: GreenNewsMutationResult = { success: false, message: '' };
    try {
      res = await window.lvcert.greenNews.clearAll();
    } catch (e) {
      res = { success: false, message: (e as Error).message };
    }
    showToast(res.message, res.success ? 'success' : 'error');
    if (res.success) {
      setClearAllConfirm(false);
      setSelected(null);
      void reload();
    }
  };

  const handleCrawl = async () => {
    const perSourceLimit = Math.max(5, Math.min(200, crawlLimit || 50));
    setCrawling(true);
    showToast('正在抓取新闻，请稍候…', 'info', { duration: 2000 });
    try {
      const res = await window.lvcert.greenNews.crawl({ perSourceLimit });
      showToast(res.message, res.success ? 'success' : 'error', { duration: 4000 });
      if (res.success) void reload();
    } catch (e) {
      showToast(`爬虫执行失败：${(e as Error).message}`, 'error');
    } finally {
      setCrawling(false);
    }
  };

  return (
    <div className="green-news-page">
      <section className="green-news-panel" aria-label="绿色新闻">
        <div className="green-news-head">
          <div className="green-news-head-title">
            <span className="section-kicker">绿色新闻</span>
            <h3>行业资讯</h3>
          </div>
          <div className="green-news-head-actions">
            <div className="green-news-count">共 <strong>{total}</strong> 条</div>
            <input
              type="text"
              className="green-news-search"
              placeholder="搜索标题、摘要或来源"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              aria-label="搜索新闻"
            />
            <div className="green-news-limit-group">
              <span className="green-news-limit-label">每源</span>
              <input
                type="number"
                className="green-news-limit-input"
                min={5}
                max={200}
                value={crawlLimit}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setCrawlLimit(v);
                }}
                aria-label="每源爬取条数"
                title="每个来源爬取的条数（5-200），总条数约为输入值 × 2"
              />
              <span className="green-news-limit-label">条</span>
            </div>
            <button
              type="button"
              className="primary-action"
              onClick={handleCrawl}
              disabled={crawling}
            >{crawling ? '抓取中…' : '立即抓取'}</button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => setClearAllConfirm(true)}
              disabled={total === 0}
            >清空</button>
          </div>
        </div>

        <div className="green-news-filters">
          {CATEGORY_FILTERS.map((c) => (
            <button
              key={c}
              type="button"
              className={`green-news-chip ${category === c ? 'is-active' : ''}`}
              onClick={() => { setCategory(c); setPage(1); }}
            >{c}</button>
          ))}
        </div>

        <div className="green-news-list-scroll">
          {loading ? (
            <div className="green-news-loading">
              <InlineSpinner />
              <span>加载中…</span>
            </div>
          ) : total === 0 ? (
            <EmptyState
              title="暂无新闻"
              hint={debouncedKw
                ? `没有找到包含「${debouncedKw}」的新闻。`
                : category !== '全部'
                  ? `当前分类「${category}」下暂无新闻。`
                  : '点击「立即抓取」从国家能源局、生态环境部搜索绿色低碳资讯。'}
            >
              <button type="button" className="primary-action" onClick={handleCrawl} disabled={crawling}>
                {crawling ? '抓取中…' : '立即抓取'}
              </button>
            </EmptyState>
          ) : (
            <ul className="green-news-list">
              {items.map((item) => (
                <li
                  key={item.news_id}
                  className="green-news-row"
                  onClick={() => openDetail(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(item); } }}
                >
                  <span className={`green-news-tag cat-${item.category || '绿色低碳'}`}>{item.category || '绿色低碳'}</span>
                  <span className="green-news-row-main">
                    <strong className="green-news-row-title">{item.title}</strong>
                    {item.summary && <span className="green-news-row-summary">{item.summary}</span>}
                    <span className="green-news-row-meta">
                      <span>{item.source}</span>
                      <span className="dot">·</span>
                      <span>{item.published_at ? formatDate(item.published_at) : relativeTime(item.crawled_at)}</span>
                    </span>
                  </span>
                  <button
                    type="button"
                    className="green-news-row-del"
                    title="删除"
                    aria-label="删除此条"
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item); }}
                  >删除</button>
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 && !loading && total > 0 && (
            <div className="green-news-pager">
              <button type="button" className="secondary-action" disabled={page <= 1} onClick={() => setPage(1)}>首页</button>
              <button type="button" className="secondary-action" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</button>
              <span className="green-news-pager-info">第 {page} / {totalPages} 页</span>
              <button type="button" className="secondary-action" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>下一页</button>
              <button type="button" className="secondary-action" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>尾页</button>
            </div>
          )}
        </div>
      </section>

      {/* 详情弹窗 */}
      <AppDialog
        open={!!selected}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
        kicker={selected?.category || '新闻'}
        title={selected?.title || ''}
        cardClassName="green-news-detail-dialog"
        actions={
          selected?.url ? (
            <>
              <a
                className="secondary-action green-news-ext-link"
                href={selected.url}
                target="_blank"
                rel="noreferrer"
                onClick={async (e) => { e.preventDefault(); await window.lvcert.openExternal(selected.url); }}
              >查看原文</a>
              <button type="button" className="primary-action" onClick={() => setSelected(null)}>关闭</button>
            </>
          ) : (
            <button type="button" className="primary-action" onClick={() => setSelected(null)}>关闭</button>
          )
        }
      >
        {selected && (
          <div className="green-news-detail-body">
            <div className="green-news-meta">
              <span>来源：{selected.source || '-'}</span>
              <span>发布：{selected.published_at ? formatDate(selected.published_at) : '-'}</span>
              <span>抓取：{relativeTime(selected.crawled_at)}</span>
            </div>
            {selected.summary && <p className="green-news-detail-summary">{selected.summary}</p>}
            {detailLoading ? (
              <div className="green-news-detail-loading">
                <InlineSpinner />
                <span>加载正文…</span>
              </div>
            ) : selected.content ? (
              <MarkdownRenderer allowRawHtml={false}>{selected.content}</MarkdownRenderer>
            ) : (
              <p className="green-news-no-content">该条目暂未抓取正文，可点击「查看原文」跳转到源网站阅读。</p>
            )}
          </div>
        )}
      </AppDialog>

      <AppDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}
        kicker="删除新闻"
        title="确认删除这条新闻？"
        description={deleteConfirm?.title || ''}
        cardClassName="green-news-confirm-dialog"
        actions={
          <>
            <button type="button" className="secondary-action" onClick={() => setDeleteConfirm(null)}>取消</button>
            <button type="button" className="primary-action" onClick={doDelete}>删除</button>
          </>
        }
      />

      <AppDialog
        open={clearAllConfirm}
        onOpenChange={setClearAllConfirm}
        kicker="清空全部"
        title={`确定要清空全部 ${total} 条新闻吗？`}
        description="此操作不可恢复，请确认后再执行。"
        cardClassName="green-news-confirm-dialog"
        actions={
          <>
            <button type="button" className="secondary-action" onClick={() => setClearAllConfirm(false)}>取消</button>
            <button type="button" className="primary-action" onClick={doClearAll}>全部清空</button>
          </>
        }
      />
    </div>
  );
}

export default GreenNewsPage;
