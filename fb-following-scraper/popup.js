let currentTabId = null;

const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnExport = document.getElementById('btnExport');
const statusDiv = document.getElementById('status');

function render(state) {
  btnStart.disabled = state.running;
  btnStop.disabled = !state.running;
  btnExport.disabled = state.count === 0;
  btnExport.innerText = `Xuất CSV (${state.count})`;
  statusDiv.innerText = 'Trạng thái: ' + (state.status || (state.running ? 'Đang cào...' : 'Sẵn sàng'));
}

function send(action, cb) {
  if (currentTabId == null) return;
  chrome.tabs.sendMessage(currentTabId, { action }, (res) => {
    if (chrome.runtime.lastError) {
      statusDiv.innerText =
        'Lỗi: hãy mở facebook.com (trang "Đang theo dõi") và tải lại trang (F5).';
      return;
    }
    if (cb) cb(res);
  });
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs[0]) return;
  currentTabId = tabs[0].id;
  send('GET_STATE', (res) => res && render(res));
});

btnStart.addEventListener('click', () => send('START', (res) => res && render(res)));
btnStop.addEventListener('click', () => send('STOP', (res) => res && render(res)));
btnExport.addEventListener('click', () => send('EXPORT'));

// Cập nhật realtime từ content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'STATE') render(msg.state);
});
