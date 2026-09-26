document.addEventListener('DOMContentLoaded', () => {
  const copyBtn = document.getElementById('copyBtn');
  const copyURLBtn = document.getElementById('copyURLBtn');
  const copyPageURLBtn = document.getElementById('copyPageURLBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const helpBtn = document.getElementById('helpBtn');
  const facebookIDInput = document.getElementById('facebookID');
  const facebookURLInput = document.getElementById('facebookURL');
  const pageURLInput = document.getElementById('pageURL');
  const resultDiv = document.getElementById('result');
  const errorDiv = document.getElementById('error');
  const noDataDiv = document.getElementById('noData');
  const loadingDiv = document.getElementById('loading');
  const helpModal = document.getElementById('helpModal');
  const closeBtn = document.querySelector('.close');

  initializeFacebookID();

  copyBtn.addEventListener('click', () => copyToClipboard(facebookIDInput.value, copyBtn));
  copyURLBtn.addEventListener('click', () => copyToClipboard(facebookURLInput.value, copyURLBtn));
  copyPageURLBtn.addEventListener('click', () => copyToClipboard(pageURLInput.value, copyPageURLBtn));
  refreshBtn.addEventListener('click', () => initializeFacebookID());
  helpBtn.addEventListener('click', () => helpModal.style.display = 'flex');
  closeBtn.addEventListener('click', () => helpModal.style.display = 'none');

  function initializeFacebookID() {
    showLoading();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      const currentURL = currentTab.url;

      if (!currentURL.includes('facebook.com')) {
        showError('请在 Facebook 网站上使用此插件');
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: extractFacebookIDContent
      }, (injectionResults) => {
        if (chrome.runtime.lastError) {
          showError('页面读取失败，请尝试刷新网页后重试。');
          return;
        }

        const result = injectionResults[0].result;
        if (result) {
          displayFacebookID(result, currentURL);
        } else {
          showNoData();
        }
      });
    });
  }

  /**
   * [核心抓取函数] - 注入到网页执行
   */
  function extractFacebookIDContent() {
    // 1. 排除当前登录用户 ID (c_user)
    let currentUserId = null;
    const cookieMatch = document.cookie.match(/c_user=(\d+)/);
    if (cookieMatch) currentUserId = cookieMatch[1];

    const pathname = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);

    // 2. 快速路径：URL 包含 ID
    if (pathname === '/profile.php' && urlParams.has('id')) return urlParams.get('id');
    const fixedRouteMatch = pathname.match(/\/(?:groups|events|watch)\/(\d+)/);
    if (fixedRouteMatch) return fixedRouteMatch[1];

    // 3. 精准定位法：基于 Vanity (用户名) 的 JSON 块匹配
    const pathSegments = pathname.split('/').filter(Boolean);
    let vanity = pathSegments[0];
    const reserved = ['home', 'watch', 'marketplace', 'gaming', 'groups', 'events', 'messages'];

    if (vanity && !reserved.includes(vanity)) {
      const safeVanity = vanity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const scripts = document.querySelectorAll('script');

      for (let i = scripts.length - 1; i >= 0; i--) {
        const text = scripts[i].textContent;
        if (!text) continue;

        // 核心：定位包含当前 vanity 的 JSON 对象 {} 块
        const objectBlockRegex = new RegExp(`\\{[^\\}]*?"(?:vanity|url_vanity)":"${safeVanity}"[^\\}]*\\}`, 'i');
        const blockMatch = text.match(objectBlockRegex);

        if (blockMatch) {
          const blockText = blockMatch[0];
          // 在该块内寻找数字 ID
          const idMatch = blockText.match(/"id":"(\d{5,})"/);
          if (idMatch && idMatch[1] !== currentUserId) return idMatch[1];
        }
      }
    }

    // 4. 权重候选项方案 (针对特殊页面)
    let candidates = [];
    const scripts = document.querySelectorAll('script');
    const weightPatterns = [
      { reg: /"userID":"(\d{5,})"/, w: 100 },
      { reg: /"pageID":"(\d{5,})"/, w: 100 },
      { reg: /"delegate_page_id":"(\d{5,})"/, w: 90 },
      { reg: /"entity_id":"(\d{5,})"/, w: 80 },
      { reg: /"profile_id":"(\d{5,})"/, w: 70 }
    ];

    for (let i = scripts.length - 1; i >= 0; i--) {
      const text = scripts[i].textContent;
      if (!text) continue;
      weightPatterns.forEach(p => {
        const m = text.match(p.reg);
        if (m && m[1] !== currentUserId) candidates.push({ id: m[1], w: p.w });
      });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.w - a.w);
      return candidates[0].id;
    }

    return null;
  }

  function displayFacebookID(facebookID, pageURL) {
    facebookIDInput.value = facebookID;
    facebookURLInput.value = `https://www.facebook.com/profile.php?id=${facebookID}`;
    pageURLInput.value = pageURL;
    hideAllStates();
    resultDiv.style.display = 'block';
    verifyFacebookID(facebookID, pageURL);
  }

  /**
   * 验证机制：通过 Fetch 检查重定向
   */
  function verifyFacebookID(facebookID, currentURL) {
    let statusEl = document.getElementById('dynamicVerifyStatus');
    statusEl.innerHTML = '🔄 正在向 Facebook 服务器验证 ID 归属...';
    statusEl.style.borderLeftColor = '#2196f3';

    fetch(`https://www.facebook.com/profile.php?id=${facebookID}`, { method: 'GET', redirect: 'follow' })
      .then(response => {
        const finalUrl = response.url.split('?')[0].split('#')[0].replace(/\/$/, '').toLowerCase();
        const currentClean = currentURL.split('?')[0].split('#')[0].replace(/\/$/, '').toLowerCase();

        if (finalUrl === currentClean || finalUrl.includes(currentClean) || currentClean.includes(finalUrl)) {
          statusEl.style.borderLeftColor = '#4caf50';
          statusEl.innerHTML = `✅ <strong>验证通过！</strong><br>服务器确认该 ID 100% 匹配当前页面。`;
        } else {
          statusEl.style.borderLeftColor = '#ff9800';
          statusEl.innerHTML = `⚠️ <strong>已抓取候选 ID</strong><br>建议复制 URL 在新标签页手动确认。`;
        }
      })
      .catch(() => {
        statusEl.innerHTML = '⚠️ 无法连接服务器，请手动验证 ID。';
      });
  }

  function showLoading() { hideAllStates(); loadingDiv.style.display = 'block'; }
  function showError(msg) { hideAllStates(); errorDiv.textContent = msg; errorDiv.style.display = 'block'; }
  function showNoData() { hideAllStates(); noDataDiv.style.display = 'block'; }
  function hideAllStates() {
    resultDiv.style.display = 'none';
    errorDiv.style.display = 'none';
    noDataDiv.style.display = 'none';
    loadingDiv.style.display = 'none';
  }

  function copyToClipboard(text, button) {
    navigator.clipboard.writeText(text).then(() => {
      const originalText = button.textContent;
      button.textContent = '已复制 ✓';
      button.classList.add('copied');
      setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove('copied');
      }, 2000);
    });
  }
});