const STORAGE_KEY = 'gmcBatch';
// Keep the Maps UI in English from the first page as well as search navigation.
const MAPS_HOME = 'https://www.google.com/maps/?hl=en';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Google Maps Collector] Đã cài đặt.');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_BATCH') {
    startBatch(message).then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.action === 'STOP_BATCH') {
    stopBatch(message).then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

async function startBatch(message) {
  let tab = message.tabId ? await getTab(message.tabId) : null;
  if (!tab || !isMapsUrl(tab.url)) {
    tab = await chrome.tabs.create({ url: MAPS_HOME, active: true });
    await waitForTabComplete(tab.id);
  }
  await ensureContentScript(tab.id);
  const result = await sendToTab(tab.id, {
    action: 'START_BATCH', keyword: message.keyword, areas: message.areas, tabId: tab.id,
  });
  if (!result?.ok) throw new Error(result?.error || 'Không thể khởi chạy trên Google Maps.');
  await chrome.storage.local.set({ gmcLastTabId: tab.id });
  return { ok: true, tabId: tab.id };
}

async function stopBatch(message) {
  const stored = await chrome.storage.local.get([STORAGE_KEY, 'gmcLastTabId']);
  const tabId = message.tabId || stored[STORAGE_KEY]?.tabId || stored.gmcLastTabId;
  if (tabId) {
    try {
      const response = await sendToTab(tabId, { action: 'STOP_BATCH' });
      if (response?.ok) return { ok: true };
    } catch (_) { /* tab may have been closed */ }
  }
  const fresh = await chrome.storage.local.get(STORAGE_KEY);
  const state = fresh[STORAGE_KEY];
  if (state?.status === 'running') {
    state.status = 'stopped';
    state.phase = 'stopped';
    state.message = `Đã dừng tại khu vực ${state.currentArea || ''}. Dữ liệu đã cào được giữ lại.`;
    state.finishedAt = new Date().toISOString();
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  }
  return { ok: true };
}

async function ensureContentScript(tabId) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const [{ result: ready }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => Boolean(globalThis.__GMC_CONTENT_READY__),
    });
    if (ready) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
}

function sendToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

function getTab(tabId) {
  return new Promise(resolve => chrome.tabs.get(tabId, tab => {
    if (chrome.runtime.lastError) resolve(null);
    else resolve(tab);
  }));
}

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error('Google Maps tải quá lâu. Hãy thử mở trang Google Maps rồi chạy lại.'));
    }, 45000);
    const onUpdated = (updatedId, info) => {
      if (updatedId === tabId && info.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId, tab => {
      if (!chrome.runtime.lastError && tab.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    });
  });
}

function isMapsUrl(url = '') { return /^https:\/\/www\.google\.com\/maps(?:\/|$)/i.test(url); }
