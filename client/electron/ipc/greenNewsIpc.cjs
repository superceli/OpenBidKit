function registerGreenNewsIpc({ greenNewsStore, greenNewsSpiderService }) {
  const { ipcMain } = require('electron');

  ipcMain.handle('green-news:list', (_event, payload = {}) => {
    const { keyword, limit, offset } = payload || {};
    return greenNewsStore.listNews({ keyword, limit, offset });
  });

  ipcMain.handle('green-news:count', (_event, payload = {}) => {
    const { keyword } = payload || {};
    return greenNewsStore.countNews({ keyword });
  });

  ipcMain.handle('green-news:detail', async (_event, newsId) => {
    const item = greenNewsStore.getNews(newsId);
    if (!item) return null;
    // content 为空则尝试爬取详情页正文
    if (!item.content && greenNewsSpiderService && greenNewsSpiderService.crawlDetailAndUpdate) {
      try {
        const enriched = await greenNewsSpiderService.crawlDetailAndUpdate(newsId);
        if (enriched) return enriched;
      } catch {
        // 详情爬取失败，返回原始 item
      }
    }
    return item;
  });

  ipcMain.handle('green-news:delete', (_event, newsId) => {
    return greenNewsStore.deleteNews(newsId);
  });

  ipcMain.handle('green-news:clear-all', () => {
    return greenNewsStore.clearAll();
  });

  ipcMain.handle('green-news:crawl', async (_event, payload = {}) => {
    return greenNewsSpiderService.runSpider(payload);
  });

  ipcMain.handle('green-news:status', () => {
    return {
      running: greenNewsSpiderService.isRunning(),
      pythonAvailable: greenNewsSpiderService.hasPython(),
    };
  });
}

module.exports = { registerGreenNewsIpc };
