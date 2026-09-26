// Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('[GMaps Collector] Extension installed');
});

// 处理下载请求
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'DOWNLOAD_FILE') {
    const blob = new Blob([msg.content], { type: msg.mimeType });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
      url: url,
      filename: msg.filename,
      saveAs: true
    }, (downloadId) => {
      sendResponse({ downloadId });
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
    return true;
  }
});
