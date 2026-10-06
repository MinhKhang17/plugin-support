let currentTabId = null;

const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnExport = document.getElementById('btnExport');
const statusDiv = document.getElementById('status');
const language = document.getElementById('language');
const words={vi:{language:'Ngôn ngữ',start:'Bắt đầu cào',stop:'Dừng',export:'Xuất CSV',status:'Trạng thái: ',ready:'Sẵn sàng',error:'Lỗi: hãy mở facebook.com (trang "Đang theo dõi") và tải lại trang (F5).'},zh:{language:'语言',start:'开始抓取',stop:'停止',export:'导出 CSV',status:'状态：',ready:'准备就绪',error:'错误：请打开 facebook.com 的“关注”页面并刷新页面（F5）。'}};
let locale='vi';
const t=key=>words[locale][key];
function statusText(value){if(locale!=='zh')return value;const match=String(value||'').match(/^Nghỉ (\d+)s để tránh bị chặn\.\.\.$/);if(match)return `为避免被限制，暂停 ${match[1]} 秒…`;return({'Đang cào...':'正在抓取…','Đã dừng':'已停止','Hoàn tất: đã đến cuối danh sách.':'完成：已到达列表末尾。'})[value]||value;}
function setLanguage(value){locale=value==='zh'?'zh':'vi';document.documentElement.lang=locale==='zh'?'zh-CN':'vi';document.getElementById('languageLabel').textContent=t('language');btnStart.textContent=t('start');btnStop.textContent=t('stop');render({running:btnStart.disabled,count:Number((btnExport.textContent.match(/\d+/)||[0])[0]),status:''});}

function render(state) {
  btnStart.disabled = state.running;
  btnStop.disabled = !state.running;
  btnExport.disabled = state.count === 0;
  btnExport.innerText = `${t('export')} (${state.count})`;
  statusDiv.innerText = t('status') + (state.status ? statusText(state.status) : (state.running ? (locale==='zh'?'正在抓取…':'Đang cào...') : t('ready')));
}

function send(action, cb) {
  if (currentTabId == null) return;
  chrome.tabs.sendMessage(currentTabId, { action }, (res) => {
    if (chrome.runtime.lastError) {
      statusDiv.innerText = t('error');
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

setLanguage(language.value);
language.addEventListener('change',()=>setLanguage(language.value));

btnStart.addEventListener('click', () => send('START', (res) => res && render(res)));
btnStop.addEventListener('click', () => send('STOP', (res) => res && render(res)));
btnExport.addEventListener('click', () => send('EXPORT'));

// Cập nhật realtime từ content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'STATE') render(msg.state);
});
