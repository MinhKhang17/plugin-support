const STORAGE_KEY = 'gmcBatch';
let activeTab = null;
let batchState = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;
  document.getElementById('csv-file').addEventListener('change', importCSV);
  document.getElementById('start-btn').addEventListener('click', startBatch);
  document.getElementById('stop-btn').addEventListener('click', stopBatch);
  document.getElementById('clear-btn').addEventListener('click', clearResults);
  document.getElementById('export-all-btn').addEventListener('click', exportAll);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      batchState = changes[STORAGE_KEY].newValue || null;
      renderState();
    }
  });
  await refreshState();
  setInterval(() => { if (batchState?.status === 'running') refreshState(); }, 1000);
}

async function refreshState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  batchState = stored[STORAGE_KEY] || null;
  renderState();
}

async function importCSV(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const rows = parseCSV(text.replace(/^\uFEFF/, ''));
    if (!rows.length) throw new Error('Tệp CSV không có dữ liệu.');
    const first = rows[0].map(value => value.trim().toLocaleLowerCase('vi'));
    const headerIndex = first.findIndex(value => /^(khu ?vuc|khu vực|area|region|location|địa điểm|tỉnh thành)$/.test(value));
    const column = headerIndex >= 0 ? headerIndex : 0;
    const start = headerIndex >= 0 ? 1 : 0;
    const areas = [...new Set(rows.slice(start).map(row => (row[column] || '').trim()).filter(Boolean))];
    if (!areas.length) throw new Error('Không tìm thấy khu vực ở cột đầu tiên hoặc cột Khu vực/Area.');
    document.getElementById('areas').value = areas.join('\n');
    document.getElementById('file-name').textContent = `Đã đọc ${areas.length} khu vực từ ${file.name}`;
    showNotice(`Đã nạp ${areas.length} khu vực từ CSV.`, 'success');
  } catch (error) {
    showNotice(error.message || 'Không thể đọc tệp CSV.');
  }
}

function parseCSV(text) {
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === ';' || char === '\t')) {
      row.push(value); value = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(value); value = '';
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
    } else value += char;
  }
  row.push(value);
  if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}

function parseAreas(text) {
  return [...new Set(text.split(/[\n,;]+/).map(area => area.trim()).filter(Boolean))];
}

async function startBatch() {
  const keyword = document.getElementById('keyword').value.trim();
  const areas = parseAreas(document.getElementById('areas').value);
  if (!keyword) return showNotice('Vui lòng nhập từ khóa cần tìm.');
  if (!areas.length) return showNotice('Vui lòng nhập hoặc import ít nhất một khu vực.');
  if (areas.length > 200) return showNotice('Tối đa 200 khu vực cho một lần chạy để tránh quá tải.');

  setBusy(true);
  showNotice('Đang khởi chạy Google Maps…', 'success');
  try {
    const result = await sendRuntime({
      action: 'START_BATCH',
      keyword,
      areas,
      tabId: activeTab?.id || null,
    });
    if (!result?.ok) throw new Error(result?.error || 'Không thể khởi chạy công cụ.');
    await refreshState();
  } catch (error) {
    showNotice(error.message || 'Không thể kết nối với tiện ích. Hãy thử tải lại Google Maps.');
  } finally {
    if (batchState?.status === 'running') renderState();
    else setBusy(false);
  }
}

async function stopBatch() {
  try {
    await sendRuntime({ action: 'STOP_BATCH', tabId: batchState?.tabId || activeTab?.id || null });
    await refreshState();
  } catch (error) { showNotice(error.message); }
}

async function clearResults() {
  if (batchState?.status === 'running') return showNotice('Hãy dừng lượt cào trước khi xóa dữ liệu.');
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
    batchState = null;
    renderState();
    showNotice('Đã xóa dữ liệu đã lưu.', 'success');
  } catch (error) { showNotice(error.message); }
}

function renderState() {
  const state = batchState;
  const running = state?.status === 'running';
  const areas = state?.areas || [];
  const results = state?.resultsByArea || {};
  const total = Object.values(results).reduce((sum, list) => sum + list.length, 0);
  const doneCount = areas.filter(area => state?.completedAreas?.includes(area)).length;
  document.getElementById('status-text').textContent = running
    ? (state.message || `Đang xử lý ${state.currentArea || ''}…`)
    : state?.status === 'done' ? 'Đã hoàn tất lượt cào' : state?.status === 'stopped' ? 'Đã dừng' : state?.status === 'error' ? 'Có lỗi khi cào dữ liệu' : 'Sẵn sàng';
  document.getElementById('counts').textContent = `${doneCount}/${areas.length} khu vực · ${total} địa điểm`;
  document.getElementById('progress-bar').style.width = areas.length ? `${Math.round(doneCount / areas.length * 100)}%` : '0%';
  document.getElementById('start-btn').disabled = running;
  document.getElementById('stop-btn').disabled = !running;
  document.getElementById('clear-btn').disabled = running;
  document.getElementById('export-all-btn').disabled = total === 0;

  const list = document.getElementById('area-list');
  if (!areas.length) {
    list.innerHTML = '<div class="empty">Chưa có dữ liệu. Nhập từ khóa và khu vực để bắt đầu.</div>';
    return;
  }
  list.innerHTML = areas.map((area, index) => {
    const count = (results[area] || []).length;
    const complete = state?.completedAreas?.includes(area);
    const isCurrent = running && state.currentArea === area;
    const label = isCurrent ? 'Đang cào…' : complete ? 'Hoàn tất' : count ? 'Có dữ liệu' : 'Đang chờ';
    return `<div class="area"><div class="area-info"><div class="area-name">${escapeHtml(area)}</div><div class="area-meta">${label} · ${count} địa điểm</div></div><button data-area-index="${index}" ${count ? '' : 'disabled'}>Xuất CSV</button></div>`;
  }).join('');
  list.querySelectorAll('button[data-area-index]').forEach(button => {
    button.addEventListener('click', () => exportArea(areas[Number(button.dataset.areaIndex)]));
  });
}

function exportAll() {
  const rows = Object.entries(batchState?.resultsByArea || {}).flatMap(([area, data]) => data.map(item => ({ ...item, area })));
  if (!rows.length) return;
  downloadCSV(rows, `gmaps_${safeName(batchState.keyword)}_tong-hop_${timestamp()}.csv`);
}

function exportArea(area) {
  const rows = (batchState?.resultsByArea?.[area] || []).map(item => ({ ...item, area }));
  if (!rows.length) return;
  downloadCSV(rows, `gmaps_${safeName(batchState.keyword)}_${safeName(area)}_${timestamp()}.csv`);
}

const CSV_COLUMNS = [
  ['name', 'Name'], ['address', 'Address'], ['website', 'Website'],
  ['url', 'GoogleMapsURL'], ['rating', 'Rating'], ['phone', 'Phone'], ['coordinates', 'Coordinates'],
];

function downloadCSV(data, filename) {
  // Keep headers unquoted and ASCII-only for Google Maps/My Maps import.
  const lines = [CSV_COLUMNS.map(([, label]) => label).join(',')];
  data.forEach((item, index) => {
    lines.push(CSV_COLUMNS.map(([key]) => csvCell(key === 'index' ? index + 1 : item[key])).join(','));
  });
  // UTF-8 BOM lets Excel on Windows detect Vietnamese characters correctly
  // when the CSV is opened directly instead of imported through a wizard.
  const blob = new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: false }, () => {
    if (chrome.runtime.lastError) showNotice(`Không thể tải tệp: ${chrome.runtime.lastError.message}`);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function sendRuntime(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

function setBusy(busy) {
  document.getElementById('start-btn').disabled = busy;
}

function showNotice(message, type = 'error') {
  const notice = document.getElementById('notice');
  notice.textContent = message;
  notice.classList.add('show');
  notice.style.borderColor = type === 'success' ? '#285b47' : '#735c21';
  notice.style.background = type === 'success' ? '#18352b' : '#332a17';
  notice.style.color = type === 'success' ? '#a9e4c7' : '#f3d689';
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => notice.classList.remove('show'), 6000);
}

function safeName(value) {
  return String(value || 'du-lieu').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 60);
}

function timestamp() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])); }
