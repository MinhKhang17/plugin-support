// popup.js - Popup 控制逻辑

const MAPS_URL = 'https://www.google.com/maps/search/%E7%89%99%E7%A7%91%E8%AF%8A%E6%89%80/@10.7341171,106.7116703,15z/data=!3m1!4b1?entry=ttu&g_ep=EgoyMDI2MDQyOS4wIKXMDSoASAFQAw%3D%3D';

let currentTabId = null;
let isCollecting = false;
let localData = [];

// 初始化
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id;

  const isOnMaps = tab?.url?.includes('google.com/maps');

  if (!isOnMaps) {
    renderNotOnMaps();
    return;
  }

  // 获取当前状态
  try {
    const status = await sendToContent({ action: 'GET_STATUS' });
    isCollecting = status?.isCollecting || false;
    const dataRes = await sendToContent({ action: 'GET_DATA' });
    localData = dataRes?.data || [];
  } catch (e) {
    isCollecting = false;
    localData = [];
  }

  renderMain();
}

// 渲染非 Maps 页面
function renderNotOnMaps() {
  document.getElementById('main-content').innerHTML = `
    <div class="not-maps">
      <div class="icon">🗺️</div>
      <h2>请先打开 Google Maps</h2>
      <p>此插件需要在 Google Maps 搜索结果页使用。<br>点击下方按钮打开牙科诊所搜索页。</p>
      <button class="open-maps-btn" id="open-maps-btn">
        📍 打开牙科诊所地图
      </button>
    </div>
  `;
  document.getElementById('open-maps-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: MAPS_URL });
    window.close();
  });
}

// 渲染主界面
function renderMain() {
  document.getElementById('main-content').innerHTML = `
    <div class="status-bar">
      <div class="status-dot ${isCollecting ? 'running' : localData.length > 0 ? 'done' : ''}" id="status-dot"></div>
      <span id="status-text">${isCollecting ? '正在采集中...' : localData.length > 0 ? '采集完成' : '就绪'}</span>
      <span id="count-badge">${localData.length} 家</span>
    </div>
    <div class="progress-wrap">
      <div class="progress-bar ${isCollecting ? 'animate' : ''}" id="progress-bar" style="width:${localData.length > 0 ? '100%' : '0%'}"></div>
    </div>

    <div class="btn-group">
      <button class="btn btn-primary" id="btn-start" ${isCollecting ? 'disabled' : ''}>
        ${isCollecting ? '⏳ 采集中...' : '▶ 开始采集'}
      </button>
      <button class="btn btn-danger" id="btn-stop" ${!isCollecting ? 'disabled' : ''}>
        ⏹ 停止
      </button>
      <button class="btn btn-secondary" id="btn-clear" ${localData.length === 0 ? 'disabled' : ''}>
        🗑 清空
      </button>
    </div>

    <div class="export-group">
      <button class="btn-export btn-csv" id="btn-csv" ${localData.length === 0 ? 'disabled' : ''}>
        📊 导出 CSV
      </button>
      <button class="btn-export btn-json" id="btn-json" ${localData.length === 0 ? 'disabled' : ''}>
        {} 导出 JSON
      </button>
      <button class="btn-export btn-html" id="btn-html" ${localData.length === 0 ? 'disabled' : ''}>
        🌐 导出 HTML
      </button>
    </div>

    <div class="tip">
      <strong>提示：</strong>插件会自动滚动并采集所有可见商家。<br>
      请保持 Google Maps 标签页在前台以获得最佳效果。
    </div>

    <div class="data-section">
      <div class="section-title">已采集商家预览</div>
      <div class="data-list" id="data-list">
        ${renderDataList()}
      </div>
    </div>
  `;

  // 绑定事件
  document.getElementById('btn-start').addEventListener('click', startCollect);
  document.getElementById('btn-stop').addEventListener('click', stopCollect);
  document.getElementById('btn-clear').addEventListener('click', clearData);
  document.getElementById('btn-csv').addEventListener('click', exportCSV);
  document.getElementById('btn-json').addEventListener('click', exportJSON);
  document.getElementById('btn-html').addEventListener('click', exportHTML);
}

// 渲染数据列表
function renderDataList() {
  if (localData.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">🏪</div>
        <div class="empty-text">暂无数据，点击"开始采集"</div>
      </div>
    `;
  }
  return localData.slice(0, 30).map((item, i) => `
    <div class="data-item">
      <div class="item-name">${i + 1}. ${escapeHtml(item.name || '未知商家')}</div>
      <div class="item-meta">
        ${item.rating ? `<span class="item-rating">★ ${item.rating}</span>` : ''}
        ${item.reviewCount ? `<span class="item-reviews">(${escapeHtml(item.reviewCount)})</span>` : ''}
        ${item.category ? `<span class="item-cat">${escapeHtml(item.category)}</span>` : ''}
      </div>
      ${item.address ? `<div class="item-addr">📍 ${escapeHtml(item.address)}</div>` : ''}
    </div>
  `).join('');
}

// 开始采集
async function startCollect() {
  isCollecting = true;
  updateUI();

  // 先聚焦到地图标签页
  if (currentTabId) {
    await chrome.tabs.update(currentTabId, { active: true });
  }

  // 监听进度消息
  chrome.runtime.onMessage.addListener(onProgressMessage);

  try {
    const result = await sendToContent({ action: 'START_COLLECT' }, 120000);
    if (result?.data) {
      localData = result.data;
    }
  } catch (e) {
    console.error('采集出错:', e);
    alert('采集出错: ' + (e.message || '未知错误，请刷新页面后重试'));
  }

  chrome.runtime.onMessage.removeListener(onProgressMessage);
  isCollecting = false;
  updateUI();
}

// 进度消息处理
function onProgressMessage(msg) {
  if (msg.action === 'PROGRESS') {
    const statusText = document.getElementById('status-text');
    const countBadge = document.getElementById('count-badge');
    if (statusText) statusText.textContent = msg.message;
    if (countBadge) countBadge.textContent = `${msg.count} 家`;

    // 同步本地数据
    if (msg.count > localData.length) {
      sendToContent({ action: 'GET_DATA' }).then(res => {
        if (res?.data) {
          localData = res.data;
          const list = document.getElementById('data-list');
          if (list) list.innerHTML = renderDataList();
        }
      }).catch(() => {});
    }
  }
}

// 停止采集
async function stopCollect() {
  try {
    const result = await sendToContent({ action: 'STOP_COLLECT' });
    if (result?.count !== undefined) {
      const dataRes = await sendToContent({ action: 'GET_DATA' });
      localData = dataRes?.data || localData;
    }
  } catch (e) {}
  isCollecting = false;
  updateUI();
}

// 清空数据
async function clearData() {
  try {
    await sendToContent({ action: 'CLEAR_DATA' });
  } catch (e) {}
  localData = [];
  updateUI();
}

// 更新 UI 状态
function updateUI() {
  const dot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const countBadge = document.getElementById('count-badge');
  const progressBar = document.getElementById('progress-bar');
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  const btnClear = document.getElementById('btn-clear');
  const btnCsv = document.getElementById('btn-csv');
  const btnJson = document.getElementById('btn-json');
  const btnHtml = document.getElementById('btn-html');
  const dataList = document.getElementById('data-list');

  if (!dot) return;

  dot.className = `status-dot ${isCollecting ? 'running' : localData.length > 0 ? 'done' : ''}`;
  statusText.textContent = isCollecting ? '正在采集中...' : localData.length > 0 ? `采集完成，共 ${localData.length} 家商家` : '就绪';
  countBadge.textContent = `${localData.length} 家`;

  progressBar.className = `progress-bar ${isCollecting ? 'animate' : ''}`;
  progressBar.style.width = isCollecting ? '' : localData.length > 0 ? '100%' : '0%';

  btnStart.disabled = isCollecting;
  btnStart.innerHTML = isCollecting ? '⏳ 采集中...' : '▶ 开始采集';
  btnStop.disabled = !isCollecting;
  btnClear.disabled = localData.length === 0 || isCollecting;
  btnCsv.disabled = localData.length === 0;
  btnJson.disabled = localData.length === 0;
  btnHtml.disabled = localData.length === 0;

  if (dataList) dataList.innerHTML = renderDataList();
}

// 导出 CSV
function exportCSV() {
  const headers = ['序号', '商家名称', '评分', '评价数', '类别', '地址', '营业状态', '电话', '官网', '地图链接', '采集时间'];
  const rows = localData.map((item, i) => [
    i + 1,
    item.name,
    item.rating,
    item.reviewCount,
    item.category,
    item.address,
    item.openStatus,
    item.phone,
    item.website,
    item.url,
    item.collectedAt,
  ].map(v => `"${String(v || '').replace(/"/g, '""')}"`));

  const csvContent = '\uFEFF' + [headers.map(h => `"${h}"`).join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadFile(csvContent, `gmaps_商家数据_${getTimestamp()}.csv`, 'text/csv;charset=utf-8');
}

// 导出 JSON
function exportJSON() {
  const jsonContent = JSON.stringify({
    exportTime: new Date().toISOString(),
    total: localData.length,
    data: localData,
  }, null, 2);
  downloadFile(jsonContent, `gmaps_商家数据_${getTimestamp()}.json`, 'application/json');
}

// 导出 HTML
function exportHTML() {
  const tableRows = localData.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(item.name || '')}</strong></td>
      <td><span class="rating">${item.rating ? '★ ' + item.rating : '-'}</span></td>
      <td>${escapeHtml(item.reviewCount || '-')}</td>
      <td><span class="category">${escapeHtml(item.category || '-')}</span></td>
      <td>${escapeHtml(item.address || '-')}</td>
      <td><span class="status ${item.openStatus?.includes('关闭') ? 'closed' : 'open'}">${escapeHtml(item.openStatus || '-')}</span></td>
      <td>${escapeHtml(item.phone || '-')}</td>
      <td>${item.website ? `<a href="${item.website}" target="_blank">访问官网</a>` : '-'}</td>
      <td><a href="${item.url}" target="_blank">Google Maps</a></td>
    </tr>
  `).join('');

  const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google Maps 商家采集报告 - ${getTimestamp()}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #f8fafc;
      --surface: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --text-muted: #64748b;
      --primary: #3b82f6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 40px 20px;
      line-height: 1.5;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    .header {
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid var(--border);
    }
    .header h1 { font-size: 24px; color: var(--text); margin-bottom: 8px; }
    .header p { color: var(--text-muted); font-size: 14px; }
    .card {
      background: var(--surface);
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
      overflow: hidden;
      border: 1px solid var(--border);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }
    th, td {
      padding: 16px;
      border-bottom: 1px solid var(--border);
    }
    th {
      background: #f1f5f9;
      font-weight: 600;
      color: #334155;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover { background: #f8fafc; }
    a {
      color: var(--primary);
      text-decoration: none;
      font-weight: 500;
    }
    a:hover { text-decoration: underline; }
    .rating {
      color: #f59e0b;
      font-weight: 600;
      font-size: 14px;
    }
    .category {
      background: #f1f5f9;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 12px;
      color: #475569;
    }
    .status {
      font-size: 12px;
      font-weight: 500;
    }
    .status.open { color: #10b981; }
    .status.closed { color: #ef4444; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📍 Google Maps 商家采集报告</h1>
      <p>共采集到 <strong>${localData.length}</strong> 家商家 · 采集时间：${new Date().toLocaleString()}</p>
    </div>
    <div class="card">
      <table>
        <thead>
          <tr>
            <th>序号</th>
            <th>商家名称</th>
            <th>评分</th>
            <th>评价数</th>
            <th>类别</th>
            <th>地址</th>
            <th>状态</th>
            <th>电话</th>
            <th>官网</th>
            <th>链接</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;

  downloadFile(htmlContent, `gmaps_商家数据_${getTimestamp()}.html`, 'text/html;charset=utf-8');
}

// 下载文件
function downloadFile(content, filename, mimeType) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  chrome.downloads.download({ url, filename, saveAs: true }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
}

// 向 content script 发消息
function sendToContent(msg, timeout = 30000) {
  return new Promise((resolve, reject) => {
    if (!currentTabId) { reject(new Error('未找到标签页')); return; }
    const timer = setTimeout(() => reject(new Error('请求超时，请刷新页面后重试')), timeout);
    chrome.tabs.sendMessage(currentTabId, msg, (resp) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || '无法连接到页面，请刷新 Google Maps 后重试'));
      } else {
        resolve(resp);
      }
    });
  });
}

// 时间戳
function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// HTML 转义
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 启动
init();
