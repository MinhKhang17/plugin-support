// =============================================
// Google Maps 商家采集器 - Content Script
// =============================================

let isCollecting = false;
let collectedData = [];
let collectedUrls = new Set();

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'START_COLLECT') {
    startCollection(sendResponse);
    return true; // 保持异步响应
  }
  if (msg.action === 'STOP_COLLECT') {
    isCollecting = false;
    sendResponse({ status: 'stopped', count: collectedData.length });
  }
  if (msg.action === 'GET_DATA') {
    sendResponse({ data: collectedData, count: collectedData.length });
  }
  if (msg.action === 'CLEAR_DATA') {
    collectedData = [];
    collectedUrls.clear();
    sendResponse({ status: 'cleared' });
  }
  if (msg.action === 'GET_STATUS') {
    sendResponse({ isCollecting, count: collectedData.length });
  }
});

// 发送进度到 popup
function sendProgress(message, count) {
  chrome.runtime.sendMessage({
    action: 'PROGRESS',
    message,
    count
  }).catch(() => {});
}

// 主采集函数
async function startCollection(sendResponse) {
  if (isCollecting) {
    sendResponse({ status: 'already_running' });
    return;
  }

  isCollecting = true;
  collectedData = [];
  collectedUrls.clear();

  try {
    sendProgress('开始采集...', 0);

    // 找到结果列表容器
    const listPanel = findListPanel();
    if (!listPanel) {
      sendProgress('❌ 未找到商家列表，请确认在 Google Maps 搜索结果页', 0);
      isCollecting = false;
      sendResponse({ status: 'error', message: '未找到商家列表' });
      return;
    }

    let noNewDataCount = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 80;

    while (isCollecting && scrollAttempts < maxScrollAttempts) {
      // 采集当前可见的商家
      const items = extractVisibleItems();
      let newItemsCount = 0;

      for (const item of items) {
        if (!collectedUrls.has(item.url)) {
          collectedUrls.add(item.url);
          collectedData.push(item);
          newItemsCount++;
        }
      }

      sendProgress(`已采集 ${collectedData.length} 家商家...`, collectedData.length);

      // 检查是否到底
      if (newItemsCount === 0) {
        noNewDataCount++;
        if (noNewDataCount >= 5) {
          // 检查是否有"结束"标志
          if (isEndOfResults()) {
            sendProgress(`✅ 采集完成！共 ${collectedData.length} 家商家`, collectedData.length);
            break;
          }
        }
      } else {
        noNewDataCount = 0;
      }

      // 滚动加载更多
      scrollListPanel(listPanel);
      await sleep(1200);
      scrollAttempts++;
    }

    isCollecting = false;
    sendResponse({ status: 'done', count: collectedData.length, data: collectedData });

  } catch (err) {
    console.error('[GMaps Collector]', err);
    isCollecting = false;
    sendResponse({ status: 'error', message: err.message });
  }
}

// 找到左侧结果列表
function findListPanel() {
  // Google Maps 结果列表的各种选择器
  const selectors = [
    '[role="feed"]',
    'div[aria-label*="结果"]',
    'div[aria-label*="Results"]',
    'div[aria-label*="result"]',
    '.m6QErb[aria-label]',
    '.m6QErb.DxyBCb',
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

// 提取当前可见的商家卡片
function extractVisibleItems() {
  const results = [];

  // 商家列表项选择器
  const cardSelectors = [
    'a[href*="/maps/place/"]',
    '[data-result-index]',
    '.hfpxzc',
  ];

  let cards = [];
  for (const sel of cardSelectors) {
    const found = document.querySelectorAll(sel);
    if (found.length > 0) {
      cards = Array.from(found);
      break;
    }
  }

  for (const card of cards) {
    try {
      const item = extractCardData(card);
      if (item && item.name) {
        results.push(item);
      }
    } catch (e) {
      // 跳过解析失败的卡片
    }
  }

  return results;
}

// 从单个卡片提取数据
function extractCardData(card) {
  // 1. 获取链接 URL
  let url = '';
  const linkEl = card.tagName === 'A' ? card : card.querySelector('a[href*="/maps/place/"]');
  if (linkEl) {
    url = linkEl.href || '';
  }
  if (!url || !url.includes('/maps/place/')) return null;

  // 2. 获取父容器
  let container = card;
  if (card.tagName === 'A') {
    container = card.closest('.Nv2PK') || card.closest('[jsaction]') || card.parentElement?.parentElement?.parentElement || card;
  }

  // 3. 名称
  let name = '';
  if (linkEl) name = linkEl.getAttribute('aria-label') || '';
  if (!name) {
    const nameEl = container.querySelector('.fontHeadlineSmall, .qBF1Pd, h3');
    if (nameEl) name = nameEl.textContent.trim();
  }

  // 4. 提取容器内的所有有意义的文本节点，用于兜底解析
  const allTexts = [];
  try {
    const textWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    let textNode;
    while ((textNode = textWalker.nextNode())) {
      const text = textNode.nodeValue.trim();
      // 排除干扰字符和商家名自身
      if (text && text !== '·' && text !== name && !text.includes('★') && text.length < 100) {
        allTexts.push(text);
      }
    }
  } catch(e) {}
  
  const fullText = container.innerText || '';

  // 5. 评分和评价数
  let rating = '';
  let reviewCount = '';
  
  // 优先通过 aria-label 找 (例如 aria-label="4.5 颗星，120 条评价")
  const ratingImg = container.querySelector('[role="img"][aria-label*="星"], [role="img"][aria-label*="star"]');
  if (ratingImg) {
    const ariaLabel = ratingImg.getAttribute('aria-label');
    const rMatch = ariaLabel.match(/([\d.,]+)\s*(颗星|stars?)/i);
    if (rMatch) rating = rMatch[1];
    const cMatch = ariaLabel.match(/([\d,]+)\s*(条评价|条评论|reviews?)/i);
    if (cMatch) reviewCount = cMatch[1].replace(/,/g, '');
  }

  // 备用：从文本提取评分和评价
  if (!rating || !reviewCount) {
    // 匹配类似 "4.5 (120)" 的结构
    const rrMatch = fullText.match(/([\d.,]{3})\s*\(([\d,]+)\)/);
    if (rrMatch) {
      if (!rating) rating = rrMatch[1];
      if (!reviewCount) reviewCount = rrMatch[2].replace(/,/g, '');
    }
  }

  // 6. 类别
  let category = '';
  const categoryEl = container.querySelector('.W4Efsd .W4Efsd span') || container.querySelector('.W4Efsd');
  if (categoryEl) {
    const spans = categoryEl.querySelectorAll('span');
    for (const sp of spans) {
      const txt = sp.textContent.trim();
      if (txt && !txt.includes('·') && !txt.match(/[\d()]/) && txt.length < 50) {
        category = txt;
        break;
      }
    }
    if (!category) category = categoryEl.textContent.trim().split('·')[0].trim();
  }
  
  // 备用：通过文本特征找类别
  if (!category || category.includes('星') || category.match(/\d/)) {
    const possibleCategories = allTexts.filter(t => 
      t.length > 2 && t.length < 40 && 
      !t.match(/[\d()（）]/) && 
      !t.includes('星') && 
      !t.includes('star') &&
      !t.includes('评论') &&
      !t.includes('review') &&
      !/营业|关闭|Open|Closed|24 小时/i.test(t)
    );
    if (possibleCategories.length > 0) category = possibleCategories[0];
  }

  // 7. 营业状态
  let openStatus = '';
  const statusMatch = fullText.match(/(营业中|已关闭|即将关闭|24 小时营业|Open\s*24 hours|Open|Closed)[^\n]*/i);
  if (statusMatch) {
    openStatus = statusMatch[0].split('⋅')[0].trim();
  }

  // 8. 电话
  let phone = '';
  const phoneMatch = fullText.match(/(\+?\d{2,}[\d\s\-().]{6,})/);
  if (phoneMatch) {
    const p = phoneMatch[1].trim();
    if (!p.includes('小时') && !p.includes('hours') && !p.includes('AM') && !p.includes('PM')) {
      phone = p;
    }
  }

  // 9. 地址
  let address = '';
  const addrCandidates = allTexts.filter(t => 
    (t.length > 5 && t.length < 150) && 
    t !== category && 
    t !== name && 
    !t.includes(openStatus || 'NO_MATCH') &&
    (!phone || !t.includes(phone))
  );
  
  // 优先找包含特定地址特征的文本
  for (const text of addrCandidates) {
    if (/(street|road|ave|blvd|đường|phố|quận|phường|路|街|号|区|市|省|tỉnh)/i.test(text) || /\d{1,4}/.test(text)) {
      address = text;
      break;
    }
  }
  
  // 如果还是没有，且类别在文本数组中，取其后一项
  if (!address && category) {
     const idx = allTexts.indexOf(category);
     if (idx !== -1 && idx + 1 < allTexts.length) {
         const nextText = allTexts[idx+1];
         if (nextText.length > 5 && !/营业|Open|Closed/i.test(nextText)) {
             address = nextText;
         }
     }
  }

  // 10. 商家网址 (Website)
  let website = '';
  const links = container.querySelectorAll('a');
  for (const a of links) {
    let href = a.href || '';
    // 排除地图自身的链接
    if (href && !href.includes('/maps/place/') && !href.includes('/search?')) {
      // 检查是否是 Google 的重定向链接
      if (href.includes('google.com/url?')) {
        try {
          const urlObj = new URL(href);
          const q = urlObj.searchParams.get('q') || urlObj.searchParams.get('url');
          if (q) href = q;
        } catch(e) {}
      }
      // 如果最终是一个外部链接，则认为是商家官网
      if (href.startsWith('http') && !href.includes('google.com')) {
        website = href;
        break;
      }
    }
  }

  // 备用：从 URL 解析名称
  let nameFromUrl = '';
  if (!name) {
    try {
      const match = url.match(/\/maps\/place\/([^/@]+)/);
      if (match) {
        nameFromUrl = decodeURIComponent(match[1]).replace(/\+/g, ' ');
      }
    } catch (e) {}
  }

  return {
    name: name || nameFromUrl,
    rating,
    reviewCount,
    category,
    address,
    openStatus,
    phone,
    website,
    url,
    collectedAt: new Date().toISOString(),
  };
}

// 提取文本的辅助函数
function extractText(container, selectors) {
  if (!container) return '';
  for (const sel of selectors) {
    const el = container.querySelector(sel);
    if (el && el.textContent.trim()) {
      return el.textContent.trim();
    }
  }
  return '';
}

// 滚动结果列表
function scrollListPanel(panel) {
  panel.scrollTop += 400;
}

// 检测是否到达结果末尾
function isEndOfResults() {
  const endIndicators = [
    '.HlvSq',  // "已显示所有结果"
    '[aria-label*="已显示所有结果"]',
    '[aria-label*="end of list"]',
  ];
  for (const sel of endIndicators) {
    if (document.querySelector(sel)) return true;
  }

  // 检查文字
  const bodyText = document.body.innerText;
  if (bodyText.includes('已显示所有结果') || bodyText.includes('end of results') || bodyText.includes('No more results')) {
    return true;
  }

  return false;
}

// 辅助：延迟
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('[GMaps Collector] Content script loaded ✓');
