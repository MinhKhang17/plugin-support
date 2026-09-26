// Google Maps Collector: chạy lần lượt một truy vấn cho mỗi khu vực.
globalThis.__GMC_CONTENT_READY__ = true;
const STORAGE_KEY = 'gmcBatch';
let runnerActive = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_BATCH') {
    beginBatch(message).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.action === 'STOP_BATCH') {
    stopBatch().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.action === 'GET_BATCH_STATUS') {
    chrome.storage.local.get(STORAGE_KEY).then(value => sendResponse(value[STORAGE_KEY] || null));
    return true;
  }
});

async function beginBatch(message) {
  if (runnerActive) throw new Error('Đang có lượt cào chạy trên tab này.');
  const keyword = String(message.keyword || '').trim();
  const areas = [...new Set((message.areas || []).map(value => String(value).trim()).filter(Boolean))];
  if (!keyword || !areas.length) throw new Error('Thiếu từ khóa hoặc danh sách khu vực.');

  const state = {
    keyword, areas, currentIndex: 0, currentArea: areas[0], currentQuery: makeQuery(keyword, areas[0]),
    resultsByArea: {}, completedAreas: [], errorsByArea: {}, status: 'running', phase: 'searching',
    startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), tabId: message.tabId || null,
    message: `Chuẩn bị tìm kiếm: ${makeQuery(keyword, areas[0])}`,
  };
  await saveState(state);
  void runBatch();
}

async function resumeBatch() {
  if (location.hostname !== 'www.google.com') return;
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const state = stored[STORAGE_KEY];
  if (state?.status === 'running') void runBatch();
}

async function runBatch() {
  if (runnerActive) return;
  runnerActive = true;
  try {
    let state = await getState();
    while (state?.status === 'running') {
      const area = state.areas[state.currentIndex];
      if (!area) {
        state.status = 'done';
        state.phase = 'done';
        state.message = `Hoàn tất ${state.completedAreas.length} khu vực.`;
        state.finishedAt = new Date().toISOString();
        await saveState(state);
        break;
      }

      state.currentArea = area;
      state.currentQuery = makeQuery(state.keyword, area);
      state.message = `Đang mở tìm kiếm: ${state.currentQuery}`;
      await saveState(state);

      if (!matchesCurrentQuery(state.currentQuery)) {
        const target = makeSearchUrl(state.currentQuery);
        location.assign(target);
        return;
      }

      state.phase = 'loading';
      state.message = `Đang tải kết quả tại ${area}…`;
      await saveState(state);
      const panel = await waitForListPanel(90000);
      if (!panel) {
        state.errorsByArea[area] = 'Không tìm thấy danh sách kết quả sau 90 giây.';
        if (await finishArea(state, area, [])) return;
        state = await getState();
        continue;
      }

      state.phase = 'collecting';
      state.message = `Đang cào kết quả tại ${area}…`;
      await saveState(state);
      const data = await collectResults(panel, state.keyword, area);
      state = await getState();
      if (state.status !== 'running') break;
      if (await finishArea(state, area, data)) return;
      state = await getState();
    }
  } catch (error) {
    const state = await getState();
    if (state?.status === 'running') {
      state.status = 'error';
      state.phase = 'error';
      state.message = `Đã xảy ra lỗi: ${error.message || 'không xác định'}`;
      state.finishedAt = new Date().toISOString();
      await saveState(state);
    }
    console.error('[Google Maps Collector]', error);
  } finally {
    runnerActive = false;
  }
}

async function finishArea(state, area, data) {
  state.resultsByArea[area] = data;
  if (!state.completedAreas.includes(area)) state.completedAreas.push(area);
  state.currentIndex += 1;
  const nextArea = state.areas[state.currentIndex];
  if (!nextArea) {
    state.status = 'done';
    state.phase = 'done';
    state.message = `Hoàn tất ${state.completedAreas.length} khu vực.`;
    state.finishedAt = new Date().toISOString();
    await saveState(state);
    return false;
  }

  state.currentArea = nextArea;
  state.currentQuery = makeQuery(state.keyword, nextArea);
  state.phase = 'searching';
  state.message = `Đang chuyển sang khu vực tiếp theo: ${nextArea}`;
  await saveState(state);
  location.assign(makeSearchUrl(state.currentQuery));
  return true;
}

async function collectResults(panel, keyword, area) {
  const found = new Map();
  let idleRounds = 0;
  for (let attempt = 0; attempt < 100; attempt++) {
    const before = found.size;
    for (const item of extractVisibleItems()) {
      const key = canonicalPlaceUrl(item.url) || `${item.name}|${item.address}`;
      if (key && !found.has(key)) found.set(key, { ...item, keyword, area });
    }
    const added = found.size - before;
    if (added === 0) idleRounds++;
    else idleRounds = 0;

    const state = await getState();
    if (!state) break;
    state.resultsByArea[area] = [...found.values()];
    state.message = `Đang cào ${area}: đã tìm thấy ${found.size} địa điểm…`;
    state.currentCount = found.size;
    await saveState(state);
    if (state.status !== 'running') break;

    if (idleRounds >= 5 && isEndOfResults()) break;
    if (idleRounds >= 10) break;
    panel = findListPanel() || panel;
    panel.scrollTop += Math.max(350, Math.floor(panel.clientHeight * 0.8));
    await sleep(1100);
  }
  return [...found.values()];
}

function findListPanel() {
  const selectors = ['[role="feed"]', '.m6QErb[aria-label]', '.m6QErb.DxyBCb', 'div[aria-label*="Kết quả"]', 'div[aria-label*="Results"]'];
  for (const selector of selectors) {
    const matches = [...document.querySelectorAll(selector)];
    const panel = matches.find(el => el.scrollHeight > el.clientHeight + 50);
    if (panel) return panel;
    if (matches[0]) return matches[0];
  }
  return null;
}

async function waitForListPanel(timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const panel = findListPanel();
    if (panel && panel.querySelector('a[href*="/maps/place/"]')) return panel;
    const state = await getState();
    if (state?.status !== 'running') return null;
    await sleep(700);
  }
  return null;
}

function extractVisibleItems() {
  const anchors = [...document.querySelectorAll('a[href*="/maps/place/"]')];
  const cards = new Set();
  for (const anchor of anchors) {
    const card = anchor.closest('.Nv2PK') || anchor.closest('[data-result-index]') || anchor.closest('[role="article"]') || anchor;
    cards.add(card);
  }
  const results = [];
  for (const card of cards) {
    try {
      const item = extractCardData(card);
      if (item?.name) results.push(item);
    } catch (_) { /* bỏ qua thẻ không đọc được */ }
  }
  return results;
}

function extractCardData(card) {
  const link = card.matches('a[href*="/maps/place/"]') ? card : card.querySelector('a[href*="/maps/place/"]');
  const url = link?.href || '';
  if (!url) return null;
  const container = card.matches('a') ? (card.closest('.Nv2PK') || card.parentElement?.parentElement || card) : card;
  const fullText = container.innerText || '';
  const name = link.getAttribute('aria-label')?.trim() ||
    container.querySelector('.fontHeadlineSmall, .qBF1Pd, h3')?.textContent?.trim() ||
    decodePlaceName(url);
  const aria = [...container.querySelectorAll('[role="img"][aria-label]')].map(el => el.getAttribute('aria-label')).join(' ');

  let rating = '';
  let reviewCount = '';
  const ratingMatch = `${aria} ${fullText}`.match(/([0-5](?:[.,]\d)?)\s*(?:sao|stars?|trên 5|\/ 5)?\s*\(?\s*([\d.,]+)?\s*(?:đánh giá|lượt đánh giá|reviews?|review)\s*\)?/i);
  if (ratingMatch) {
    rating = ratingMatch[1].replace(',', '.');
    reviewCount = (ratingMatch[2] || '').replace(/[.,]/g, '');
  }
  if (!rating) {
    const plainRating = fullText.match(/(?:^|\s)([0-5][.,]\d)\s*\((\d[\d.,]*)\)/);
    if (plainRating) { rating = plainRating[1].replace(',', '.'); reviewCount = plainRating[2].replace(/[.,]/g, ''); }
  }

  const textLines = fullText.split('\n').map(value => value.trim()).filter(Boolean);
  let category = '';
  const categoryEl = container.querySelector('.W4Efsd');
  if (categoryEl) category = categoryEl.textContent.split('·').map(value => value.trim()).find(value => value && !/\d/.test(value)) || '';
  if (!category) category = textLines.find(value => value.length > 2 && value.length < 45 && !/\d|đánh giá|reviews?|\bsao\b/i.test(value) && value !== name) || '';

  const openMatch = fullText.match(/(Đang mở cửa|Đã đóng cửa|Sắp đóng cửa|Mở cửa 24 giờ|Mở cửa|Tạm đóng|Temporarily closed|Permanently closed|Open 24 hours|Open|Closed)[^\n]*/i);
  const openStatus = openMatch ? openMatch[0].trim() : '';
  const phoneMatch = fullText.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  let phone = phoneMatch ? phoneMatch[0].trim() : '';
  if (/\b(?:AM|PM)\b|giờ/i.test(phone)) phone = '';

  let address = '';
  const candidates = textLines.filter(value => value !== name && value !== category && value !== openStatus && value.length > 5 && value.length < 160);
  address = candidates.find(value => /\d|đường|phường|quận|huyện|tỉnh|thành phố|street|road|avenue|district|ward/i.test(value) && !/đánh giá|reviews?|\bsao\b/i.test(value)) || '';

  let website = '';
  for (const anchor of container.querySelectorAll('a[href]')) {
    try {
      const href = new URL(anchor.href);
      const target = href.searchParams.get('q') || href.searchParams.get('url') || href.href;
      if (/^https?:\/\//.test(target) && !/google\./i.test(new URL(target).hostname) && !target.includes('/maps/')) { website = target; break; }
    } catch (_) { /* bỏ qua URL lỗi */ }
  }
  return { name, rating, reviewCount, category, address, openStatus, phone, website, url, collectedAt: new Date().toISOString() };
}

function isEndOfResults() {
  if (document.querySelector('.HlvSq, [aria-label*="đã hiển thị tất cả" i], [aria-label*="end of list" i]')) return true;
  return /đã hiển thị tất cả|không còn kết quả|end of results|no more results/i.test(document.body.innerText || '');
}

function makeQuery(keyword, area) { return `${keyword} ${area}`.trim(); }
// Force Google Maps to render search results in English, independent of browser locale.
function makeSearchUrl(query) {
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;
}
function matchesCurrentQuery(query) {
  const match = location.pathname.match(/\/maps\/search\/([^/]+)/i);
  if (!match) return false;
  try { return normalize(decodeURIComponent(match[1]).replace(/\+/g, ' ')) === normalize(query); }
  catch (_) { return normalize(match[1]) === normalize(query); }
}
function normalize(value) { return String(value).normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase(); }
function canonicalPlaceUrl(value) { try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch (_) { return value; } }
function decodePlaceName(url) { try { return decodeURIComponent(new URL(url).pathname.split('/place/')[1]?.split('/')[0] || '').replace(/\+/g, ' '); } catch (_) { return ''; } }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function getState() { const stored = await chrome.storage.local.get(STORAGE_KEY); return stored[STORAGE_KEY] || null; }
async function saveState(state) { state.updatedAt = new Date().toISOString(); await chrome.storage.local.set({ [STORAGE_KEY]: state }); }
async function stopBatch() {
  const state = await getState();
  if (!state || state.status !== 'running') return;
  state.status = 'stopped';
  state.phase = 'stopped';
  state.message = `Đã dừng tại khu vực ${state.currentArea || ''}. Dữ liệu đã cào được giữ lại.`;
  state.finishedAt = new Date().toISOString();
  await saveState(state);
}

void resumeBatch();
console.log('[Google Maps Collector] Đã sẵn sàng.');
