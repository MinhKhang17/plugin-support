(() => {
  if (window.__fbFollowingScraperLoaded) return;
  window.__fbFollowingScraperLoaded = true;

  let isRunning = false;
  let statusText = '';
  const extractedUsers = new Map(); // key: URL chuẩn hóa -> tự động chống trùng

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  const RESERVED = new Set([
    'friends', 'groups', 'watch', 'photo', 'photos', 'stories', 'marketplace',
    'gaming', 'reel', 'reels', 'events', 'pages', 'notifications', 'messages',
    'bookmarks', 'help', 'policies', 'settings', 'login', 'hashtag', 'search',
    'videos', 'posts', 'permalink.php', 'share', 'ads', 'business', 'privacy',
    'about', 'recover', 'places', 'fundraisers', 'saved', 'memories', 'ai'
  ]);

  // Trả về URL profile chuẩn hóa, hoặc null nếu không phải trang cá nhân
  function normalizeProfileUrl(href) {
    let u;
    try { u = new URL(href); } catch { return null; }
    if (!/(^|\.)facebook\.com$/.test(u.hostname)) return null;

    const segs = u.pathname.split('/').filter(Boolean);
    if (segs.length === 1 && segs[0] === 'profile.php') {
      const id = u.searchParams.get('id');
      return id ? `https://www.facebook.com/profile.php?id=${id}` : null;
    }
    if (segs.length === 1 && !RESERVED.has(segs[0].toLowerCase())) {
      return `https://www.facebook.com/${segs[0]}`;
    }
    return null;
  }

  function findAvatar(a) {
    let node = a;
    for (let i = 0; i < 6 && node; i++, node = node.parentElement) {
      const img = node.querySelector('img');
      if (img && img.src) return img.src;
      const svgImg = node.querySelector('image');
      if (svgImg) {
        const src = svgImg.getAttribute('xlink:href') || svgImg.getAttribute('href');
        if (src) return src;
      }
    }
    return '';
  }

  // Trả về số người mới thu thập được
  function scrapeDOM() {
    const main = document.querySelector('div[role="main"]') || document.body;
    const before = extractedUsers.size;

    main.querySelectorAll('a[role="link"][href]').forEach((a) => {
      const url = normalizeProfileUrl(a.href);
      if (!url || extractedUsers.has(url)) return;

      const name = (a.innerText || '').split('\n')[0].trim();
      if (!name) return; // link chỉ chứa ảnh -> bỏ qua, link tên sẽ được lấy sau

      extractedUsers.set(url, { name, url, avatar: findAvatar(a) });
    });

    return extractedUsers.size - before;
  }

  function pushState() {
    try {
      chrome.runtime.sendMessage({ action: 'STATE', state: getState() }, () => {
        void chrome.runtime.lastError; // popup đóng thì bỏ qua
      });
    } catch (_) {}
  }

  function getState() {
    return { running: isRunning, count: extractedUsers.size, status: statusText };
  }

  function scrollToBottom() {
    const el = document.scrollingElement || document.documentElement;
    window.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }

  async function startAutoScroll() {
    let stalledRounds = 0;
    let nextRestAt = 500;

    while (isRunning) {
      const added = scrapeDOM();
      statusText = 'Đang cào...';
      pushState();

      // Nghỉ dài sau mỗi ~500 người để giảm nguy cơ bị giới hạn
      if (extractedUsers.size >= nextRestAt) {
        nextRestAt += 500;
        const rest = rand(15000, 30000);
        statusText = `Nghỉ ${Math.round(rest / 1000)}s để tránh bị chặn...`;
        pushState();
        await sleep(rest);
        if (!isRunning) break;
      }

      scrollToBottom();
      await sleep(rand(2500, 4500));
      scrapeDOM();

      if (added === 0) {
        stalledRounds++;
        // Cuộn lên chút rồi xuống lại để kích hoạt tải thêm
        window.scrollBy(0, -400);
        await sleep(1000);
        scrollToBottom();
        await sleep(1500);
        if (stalledRounds >= 4) {
          statusText = 'Hoàn tất: đã đến cuối danh sách.';
          isRunning = false;
        }
      } else {
        stalledRounds = 0;
      }
    }

    if (!statusText.startsWith('Hoàn tất')) statusText = 'Đã dừng';
    pushState();
  }

  function exportToCSV() {
    const data = Array.from(extractedUsers.values());
    if (data.length === 0) return;

    let csv = '\uFEFFSTT,Họ và Tên,Profile URL,Avatar URL\n';
    data.forEach((u, i) => {
      const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
      csv += [i + 1, esc(u.name), esc(u.url), esc(u.avatar)].join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fb_following_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
    if (req.action === 'START') {
      if (!isRunning) {
        isRunning = true;
        statusText = 'Đang cào...';
        startAutoScroll();
      }
    } else if (req.action === 'STOP') {
      isRunning = false;
      statusText = 'Đã dừng';
    } else if (req.action === 'EXPORT') {
      exportToCSV();
    }
    sendResponse(getState());
    return false;
  });
})();
