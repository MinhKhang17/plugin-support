const $ = (s) => document.querySelector(s);
const I18N = {"k0": {"vi": "AKC Marketplace · Thu thập dữ liệu", "zh": "AKC Marketplace 采集器"}, "k1": {"vi": "Chạy thử (3 trang)", "zh": "小批量验证"}, "k2": {"vi": "Chạy toàn bộ", "zh": "全量"}, "k3": {"vi": "Tạm dừng", "zh": "暂停"}, "k4": {"vi": "Tiếp tục", "zh": "继续"}, "k5": {"vi": "Đặt lại", "zh": "重置"}, "k6": {"vi": "Trạng thái:", "zh": "状态:"}, "k7": {"vi": "Giai đoạn:", "zh": "阶段:"}, "k8": {"vi": "Trang danh sách:", "zh": "列表页:"}, "k9": {"vi": "Trang cơ sở:", "zh": "机构页:"}, "k10": {"vi": "Mẫu kiểm tra:", "zh": "调试样本:"}, "k11": {"vi": "Xuất CSV", "zh": "导出 CSV"}, "k12": {"vi": "Xuất báo cáo HTML", "zh": "导出 HTML 报表"}, "k13": {"vi": "Xuất HTML mẫu kiểm tra", "zh": "导出调试样本HTML"}, "k14": {"vi": "Mẫu URL danh sách (3 phần)", "zh": "列表页 URL 模板 (3 段式)"}, "k15": {"vi": "① Tiền tố + ② Dãy + ③ Hậu tố", "zh": "① 固定前缀 + ② 序列 + ③ 固定后缀"}, "k16": {"vi": "① Tiền tố", "zh": "① 前缀"}, "k17": {"vi": "② Loại dãy", "zh": "② 序列类型"}, "k18": {"vi": "Số 1–740", "zh": "数字 1~740"}, "k19": {"vi": "Chữ a–z", "zh": "字母 a~z"}, "k20": {"vi": "② Bắt đầu / kết thúc", "zh": "② 起 / 止"}, "k21": {"vi": "③ Hậu tố", "zh": "③ 后缀"}, "k22": {"vi": "Lưu cài đặt", "zh": "保存设置"}, "k23": {"vi": "Khôi phục mặc định", "zh": "恢复默认"}, "k24": {"vi": "Sau khi sửa mẫu URL, hãy bắt đầu lượt chạy mới. XPath có hiệu lực từ trang tiếp theo.", "zh": "改 URL 模板后需重新点\"小批量/全量\"才会生效（序列在开始时生成）。XPath 改动下一页即时生效。"}, "k25": {"vi": "Bộ chọn dữ liệu (có thể sửa XPath)", "zh": "选择器设置 (XPath 可改)"}, "k26": {"vi": "XPath liên kết cơ sở trên trang danh sách", "zh": "列表页机构链接 XPath"}, "k27": {"vi": "XPath phần about-text", "zh": "about-text XPath"}, "k28": {"vi": "XPath phần basic-operations", "zh": "basic-operations XPath"}, "k29": {"vi": "XPath phần tử cần loại trừ (ngăn bằng |)", "zh": "排除元素 XPath（其内容不采集，多个用 | 并列）"}, "k30": {"vi": "Các XPath được lưu bằng nút “Lưu cài đặt” ở phía trên. Dùng | để nối nhiều phần tử loại trừ.", "zh": "三个 XPath 及排除 XPath 均在\"列表页 URL 模板\"区一并保存。多个排除项用 | 并列，例如：//div[@class=\"a\"] | //div[@class=\"b\"]"}, "k31": {"vi": "Giữ trình duyệt mở. Thời gian nghỉ có thể kéo dài khi máy ngủ hoặc trình duyệt trì hoãn. Nếu đang xử lý trang mà bị gián đoạn, tiện ích tạm dừng để bạn kiểm tra rồi bấm Tiếp tục.", "zh": "请保持浏览器运行。休眠或浏览器调度可能延长等待；页面处理中断后暂停，请检查后点击继续。"}, "pacing": {"vi": "Thông số thu thập · v1.2.0", "zh": "采集参数 · v1.2.0"}, "params": {"vi": "1 trang/lần · nghỉ 15 giây giữa các trang · nghỉ 120 giây sau mỗi 20 trang. Thời gian nghỉ tính sau khi trang xử lý xong; nghỉ 120 giây thay cho 15 giây ở cuối đợt.", "zh": "每次1页；页间等待15秒；每20页等待120秒。处理结束后开始计时；批次休息替代15秒页间等待。"}, "counter": {"vi": "Tổng trang đã xử lý:", "zh": "已处理总页数："}, "next": {"vi": "Chờ trang tiếp theo:", "zh": "下一页等待："}, "reason": {"vi": "Lý do tạm dừng:", "zh": "暂停原因："}, "limits": {"vi": "Áp dụng cho cả trang danh sách và trang cơ sở. Tự dừng khi thấy 403/429, dấu hiệu CAPTCHA, trang rỗng hoặc hết thời gian chờ.", "zh": "列表页与机构页统一计数。检测到403/429、验证码、空数据或超时后自动暂停。"}};
Object.assign(I18N, {
  k32: { vi: 'Số web cơ sở mở đồng thời (1–5)', zh: '同时打开的机构网页数（1–5）' },
  k33: { vi: 'Tăng tốc ở giai đoạn lấy thông tin cơ sở. Khuyến nghị 2–3; quá cao có thể bị website giới hạn.', zh: '加速机构信息采集阶段。建议设为2–3；过高可能触发网站限流。' },
  k31: { vi: 'Giữ trình duyệt mở. Lỗi tải/trích xuất tạm thời sẽ tự thử lại; chỉ 403 hoặc CAPTCHA mới cần kiểm tra thủ công.', zh: '请保持浏览器运行。临时加载/提取错误会自动重试；只有 403 或验证码需要人工检查。' },
  pacing: { vi: 'Thông số thu thập · v1.3.0', zh: '采集参数 · v1.3.0' },
  params: { vi: '1 trang/lần · nghỉ 2 giây giữa các trang · nghỉ 10 giây sau mỗi 20 trang. Timeout tải/trích xuất: 90 giây; lỗi tạm thời tự thử lại tối đa 4 lần theo backoff.', zh: '每次1页；页间等待2秒；每20页等待10秒。加载/提取超时为90秒；临时错误按退避最多自动重试4次。' },
  limits: { vi: 'Áp dụng cho cả trang danh sách và trang cơ sở. 429 tôn trọng Retry-After rồi tự tiếp tục; chỉ 403 hoặc CAPTCHA tự dừng.', zh: '列表页与机构页统一计数。429遵守 Retry-After 后自动继续；只有403或验证码会自动暂停。' }
});
const UI = {
 vi: { listing:'Thu thập trang danh sách', breeder:'Thu thập trang cơ sở', idle:'Chưa chạy', running:'Đang chạy', paused:'Đã tạm dừng', done:'Hoàn tất', confirm:'Xóa toàn bộ tiến độ và kết quả đã lưu?', empty:'Chưa có mẫu kiểm tra. Hãy chạy thử trước.', saved:'Đã lưu. XPath có hiệu lực từ trang tiếp theo; mẫu URL từ lượt chạy mới.', restored:'Đã khôi phục mặc định.' },
 zh: { listing:'列表页采集', breeder:'机构页采集', idle:'未开始', running:'运行中', paused:'已暂停', done:'已完成', confirm:'确定清空所有采集进度？', empty:'暂无调试样本，请先运行。', saved:'已保存。XPath 下一页生效；URL 模板下次开始生效。', restored:'已恢复默认。' }
};
let currentLanguage = 'vi';
function t(key) { return UI[currentLanguage][key] || key; }
function applyLanguage() {
 document.documentElement.lang = currentLanguage === 'vi' ? 'vi' : 'zh-CN';
 document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = I18N[el.dataset.i18n][currentLanguage]);
 $('#language').value = currentLanguage;
 refresh();
}
(async () => {
 const saved = await chrome.storage.local.get('uiLanguage');
 currentLanguage = saved.uiLanguage === 'zh' ? 'zh' : 'vi';
 applyLanguage();
})();
$('#language').addEventListener('change', async (e) => {
 currentLanguage = e.target.value === 'zh' ? 'zh' : 'vi';
 await chrome.storage.local.set({ uiLanguage: currentLanguage });
 applyLanguage();
});

// 弹窗逻辑：控制 + 进度刷新 + 导出(CSV/HTML/调试样本) + 配置(URL模板/XPath)


const getState = () => chrome.runtime.sendMessage({ type: 'getState' });

async function refresh() {
  const s = await getState();
  if (!s) return;
  $('#status').textContent = t(s.status);
  $('#processed').textContent = String(s.completedPages || 0);
  const wait = s.status === 'running' ? Math.max(0, Math.ceil((Math.max(s.nextAllowedAt || 0, s.retryNotBefore || 0) - Date.now()) / 1000)) : 0;
  $('#countdown').textContent = wait ? `${wait} ${currentLanguage === 'vi' ? 'giây' : '秒'}` : '—';
  const reasons = {
    MANUAL: ['Người dùng tạm dừng', '用户暂停'],
    HTTP_403: ['HTTP 403: truy cập bị từ chối', 'HTTP 403：拒绝访问'],
    HTTP_429: ['HTTP 429: quá nhiều yêu cầu', 'HTTP 429：请求过多'],
    CAPTCHA_OR_BLOCK: ['Phát hiện trang xác minh hoặc chặn truy cập', '检测到验证或拦截页面'],
    NO_DATA: ['Không có dữ liệu phù hợp; kiểm tra trang và XPath', '无匹配数据；请检查页面与XPath'],
    LOAD_TIMEOUT: ['Tải trang quá 45 giây', '页面加载超过45秒'],
    EXTRACT_TIMEOUT: ['Trích xuất quá 45 giây', '提取超过45秒'],
    INTERRUPTED: ['Trang đang xử lý bị gián đoạn', '页面处理中断'],
    UNSUPPORTED_HOST: ['Chỉ hỗ trợ marketplace.akc.org', '仅支持marketplace.akc.org']
  };
  $('#stopReason').textContent = reasons[s.stopReason]?.[currentLanguage === 'vi' ? 0 : 1] || s.stopReason || '—';
  if (s.status === 'paused' && s.retryNotBefore > Date.now()) $('#stopReason').textContent += ` · Retry-After: ${new Date(s.retryNotBefore).toLocaleString()}`;

  $('#phase').textContent = s.phase === 'listing' ? t('listing') : t('breeder');
  $('#listProg').textContent = `${s.stats.listingPagesDone} / ${s.totalPages}`;
  $('#breedProg').textContent = `${s.stats.breedersDone} / ${s.stats.breedersTotal}`;
  $('#dbg').textContent = String((s.debugSamples || []).length);
  $('#errs').textContent = (s.errors || []).slice(-3).join('  |  ');
}
setInterval(refresh, 1000);
refresh();

$('#startTest').onclick = () => chrome.runtime.sendMessage({ type: 'start', mode: 'test' });
$('#startFull').onclick = () => chrome.runtime.sendMessage({ type: 'start', mode: 'full' });
$('#pause').onclick = () => chrome.runtime.sendMessage({ type: 'pause' });
$('#resume').onclick = () => chrome.runtime.sendMessage({ type: 'resume' });
$('#reset').onclick = () => { if (confirm(t('confirm'))) chrome.runtime.sendMessage({ type: 'reset' }); };

// ---------- 导出 ----------
function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: false });
}
function toCSV(results) {
  const cols = [
    ['breederName', '机构名'], ['breed', '品种'], ['website', '官网'],
    ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['phone', '电话'],
    ['email', '邮箱'], ['contact', '负责人'], ['address', '地址'], ['remark', '备注'], ['url', '链接']
  ];
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  let out = '﻿' + '序号' + ',' + cols.map((c) => esc(c[1])).join(',') + '\n';
  results.forEach((r, i) => {
    out += (i + 1) + ',' + cols.map((c) => esc(r[c[0]])).join(',') + '\n';
  });
  return out;
}
function toHTML(results) {
  const escHtml = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  const rows = results.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.breederName || ''}</td><td>${r.breed || ''}</td>
      <td>${r.website ? `<a href="${r.website}" target="_blank">${r.website}</a>` : ''}</td>
      <td>${r.facebook ? `<a href="${r.facebook}" target="_blank">FB</a>` : ''}</td>
      <td>${r.phone || ''}</td><td>${r.email || ''}</td>
      <td>${r.contact || ''}</td><td>${r.address || ''}</td>
      <td>${escHtml(r.remark)}</td>
      <td><a href="${r.url}" target="_blank">打开</a></td>
    </tr>`).join('');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
    <title>AKC 培育机构采集报表</title>
    <style>body{font:13px system-ui;padding:16px}table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #ccc;padding:6px;text-align:left;vertical-align:top}
    th{background:#f1f5f9}</style></head><body>
    <h2>AKC 培育机构采集报表 (${results.length} 条)</h2>
    <table><thead><tr>
      <th>#</th>
      <th>机构名</th><th>品种</th><th>官网</th><th>Facebook</th><th>电话</th>
      <th>邮箱</th><th>负责人</th><th>地址</th><th>备注</th><th>链接</th>
    </tr></thead><tbody>${rows}</tbody></table></body></html>`;
}
$('#expCsv').onclick = async () => {
  const { results } = await chrome.runtime.sendMessage({ type: 'export' });
  download(`akc-breeders-${ts()}.csv`, toCSV(results), 'text/csv;charset=utf-8');
};
$('#expHtml').onclick = async () => {
  const { results } = await chrome.runtime.sendMessage({ type: 'export' });
  download(`akc-breeders-${ts()}.html`, toHTML(results), 'text/html;charset=utf-8');
};
$('#expDbg').onclick = async () => {
  const { debugSamples } = await chrome.runtime.sendMessage({ type: 'export' });
  if (!debugSamples.length) { alert(t('empty')); return; }
  debugSamples.forEach((d, i) => download(`akc-debug-${ts()}-${i + 1}.html`, d.html, 'text/html;charset=utf-8'));
};

// ---------- 配置: 列表页 URL 模板 + XPath ----------
async function loadCfg() {
  const cfg = await chrome.runtime.sendMessage({ type: 'getConfig' });
  if (!cfg) return;
  $('#cfgPrefix').value = cfg.listingPrefix || '';
  $('#cfgSuffix').value = cfg.listingSuffix || '';
  $('#cfgConcurrentTabs').value = cfg.concurrentTabs || 3;
  $('#cfgSeqType').value = cfg.listingSeqType || 'number';
  $('#cfgSeqStart').value = cfg.listingSeqStart;
  $('#cfgSeqEnd').value = cfg.listingSeqEnd;
  $('#cfgListing').value = cfg.listingAnchorXPath || '';
  $('#cfgAbout').value = cfg.aboutXPath || '';
  $('#cfgBasic').value = cfg.basicXPath || '';
  $('#cfgExclude').value = cfg.excludeXPath || '';
}
loadCfg();

async function saveCfg() {
  const config = {
    listingPrefix: $('#cfgPrefix').value,
    listingSuffix: $('#cfgSuffix').value,
    concurrentTabs: Math.max(1, Math.min(5, parseInt($('#cfgConcurrentTabs').value, 10) || 3)),
    listingSeqType: $('#cfgSeqType').value,
    listingSeqStart: $('#cfgSeqStart').value,
    listingSeqEnd: $('#cfgSeqEnd').value,
    listingAnchorXPath: $('#cfgListing').value.trim(),
    aboutXPath: $('#cfgAbout').value.trim(),
    basicXPath: $('#cfgBasic').value.trim(),
    excludeXPath: $('#cfgExclude').value.trim()
  };
  await chrome.runtime.sendMessage({ type: 'saveConfig', config });
  $('#cfgMsg').textContent = t('saved');
  setTimeout(() => { $('#cfgMsg').textContent = ''; }, 4000);
}
$('#saveCfg').onclick = saveCfg;
$('#resetCfg').onclick = async () => {
  await chrome.runtime.sendMessage({ type: 'saveConfig', config: {} });
  await loadCfg();
  $('#cfgMsg').textContent = t('restored');
  setTimeout(() => { $('#cfgMsg').textContent = ''; }, 3000);
};
