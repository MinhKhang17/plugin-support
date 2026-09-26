/**
 * Facebook ID Finder - Content Script
 * 该脚本在 Facebook 页面加载时运行，提取用户 ID
 */

// 从网页源代码中提取 Facebook ID 的多种方法
function extractFacebookID() {
  let facebookID = null;

  // 方法 1: 从 URL 中提取（如果 URL 中包含 ID）
  const urlMatch = window.location.href.match(/facebook\.com\/(?:profile\.php\?id=)?(\d+)/);
  if (urlMatch && urlMatch[1]) {
    facebookID = urlMatch[1];
    console.log('从 URL 提取的 ID:', facebookID);
    return facebookID;
  }

  // 方法 2: 从网页源代码中搜索 "userID" 或 "profileID"
  const pageHTML = document.documentElement.outerHTML;
  
  // 搜索 "userID" 关键词
  const userIDMatch = pageHTML.match(/"userID":"?(\d+)"?/);
  if (userIDMatch && userIDMatch[1]) {
    facebookID = userIDMatch[1];
    console.log('从 userID 字段提取的 ID:', facebookID);
    return facebookID;
  }

  // 搜索 "profileID" 关键词
  const profileIDMatch = pageHTML.match(/"profileID":"?(\d+)"?/);
  if (profileIDMatch && profileIDMatch[1]) {
    facebookID = profileIDMatch[1];
    console.log('从 profileID 字段提取的 ID:', facebookID);
    return facebookID;
  }

  // 方法 3: 从 Open Graph 标签中提取
  const ogURLMeta = document.querySelector('meta[property="og:url"]');
  if (ogURLMeta) {
    const ogURL = ogURLMeta.getAttribute('content');
    const ogMatch = ogURL.match(/\/(\d+)(?:\/|$)/);
    if (ogMatch && ogMatch[1]) {
      facebookID = ogMatch[1];
      console.log('从 Open Graph 提取的 ID:', facebookID);
      return facebookID;
    }
  }

  // 方法 4: 从 Android App URI 中提取
  const androidURIMeta = document.querySelector('meta[property="al:android:url"]');
  if (androidURIMeta) {
    const androidURI = androidURIMeta.getAttribute('content');
    const androidMatch = androidURI.match(/\/(\d+)/);
    if (androidMatch && androidMatch[1]) {
      facebookID = androidMatch[1];
      console.log('从 Android URI 提取的 ID:', facebookID);
      return facebookID;
    }
  }

  // 方法 5: 从 script 标签中搜索 ID
  const scripts = document.querySelectorAll('script');
  for (let script of scripts) {
    if (script.textContent) {
      // 搜索 "id":"数字" 的模式
      const idMatch = script.textContent.match(/"id":"(\d{15,})/);
      if (idMatch && idMatch[1]) {
        facebookID = idMatch[1];
        console.log('从 script 标签提取的 ID:', facebookID);
        return facebookID;
      }

      // 搜索 profile_id 的模式
      const profileMatch = script.textContent.match(/profile_id[":=]+(\d+)/);
      if (profileMatch && profileMatch[1]) {
        facebookID = profileMatch[1];
        console.log('从 profile_id 提取的 ID:', facebookID);
        return facebookID;
      }
    }
  }

  return facebookID;
}

// 监听来自 popup 的消息请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getFacebookID') {
    const facebookID = extractFacebookID();
    sendResponse({ facebookID: facebookID });
  }
});

// 页面加载完成后，自动尝试提取 ID 并存储
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const facebookID = extractFacebookID();
    if (facebookID) {
      // 将 ID 存储到 localStorage，以便 popup 可以访问
      localStorage.setItem('facebookID', facebookID);
      localStorage.setItem('facebookIDTimestamp', new Date().getTime());
    }
  }, 1000);
});

// 如果页面已经加载完成，立即执行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      const facebookID = extractFacebookID();
      if (facebookID) {
        localStorage.setItem('facebookID', facebookID);
        localStorage.setItem('facebookIDTimestamp', new Date().getTime());
      }
    }, 1000);
  });
} else {
  setTimeout(() => {
    const facebookID = extractFacebookID();
    if (facebookID) {
      localStorage.setItem('facebookID', facebookID);
      localStorage.setItem('facebookIDTimestamp', new Date().getTime());
    }
  }, 1000);
}
