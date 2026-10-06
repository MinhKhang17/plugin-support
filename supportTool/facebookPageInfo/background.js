let loopActive = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const KEYS = ['queue', 'index', 'results', 'running', 'status', 'concurrency', 'activeTabs'];
const getState = async () => ({
  queue: [], index: 0, results: [], running: false, status: '',
  concurrency: 5, activeTabs: 0,
  ...(await chrome.storage.local.get(KEYS))
});

async function longSleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await sleep(Math.min(3000, end - Date.now()));
    try { await chrome.runtime.getPlatformInfo(); } catch (_) {}
    if (!(await getState()).running) return;
  }
}

function waitTabComplete(tabId, timeout = 45000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve(ok);
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') finish(true);
    };
    chrome.tabs.onUpdated.addListener(listener);
    const timer = setTimeout(() => finish(false), timeout);
    chrome.tabs.get(tabId).then((t) => {
      if (t && t.status === 'complete') finish(true);
    }).catch(() => finish(false));
  });
}

/**
 * Chạy TRONG trang Facebook – tự chứa hoàn toàn.
 * Cải tiến mạnh phần liên hệ: email, phone, Instagram, website.
 * Lấy từ: DOM links, text, meta, aria-label, section Giới thiệu / Contact.
 */
async function extractProfile(opts) {
  opts = opts || {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

  // Chờ nội dung chính
  for (let i = 0; i < 35; i++) {
    const h1 = document.querySelector('div[role="main"] h1, h1[dir="auto"]');
    if (h1 && (h1.innerText || '').trim()) break;
    await sleep(350);
  }
  await sleep(rnd(1000, 2000));

  // Scroll để load thêm nội dung (About page thường dài)
  try {
    for (let s = 0; s < 4; s++) {
      window.scrollBy(0, 400 + s * 100);
      await sleep(350);
    }
    window.scrollTo(0, 0);
    await sleep(400);
  } catch (_) {}

  const main = document.querySelector('div[role="main"]') || document.body;
  const allText = (main.innerText || main.textContent || '');
  const fullText = allText.replace(/\s+/g, ' ');
  const lines = allText.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  const meta = (sel) => {
    const el = document.querySelector(sel);
    return el ? (el.getAttribute('content') || '').trim() : '';
  };

  // ---------- helpers liên hệ ----------
  const emails = new Set();
  const phones = new Set();
  const instagrams = new Set();
  const websites = new Set();

  const addEmail = (e) => {
    if (!e) return;
    e = e.trim().toLowerCase();
    if (!e || e.length > 80) return;
    if (/facebook\.com|example\.|test@|noreply|no-reply/i.test(e)) return;
    if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(e)) return;
    emails.add(e);
  };

  const addPhone = (p) => {
    if (!p) return;
    const raw = String(p).trim();
    const digits = raw.replace(/\D/g, '');
    // Bỏ số quá ngắn / quá dài / số ảo FB
    if (digits.length < 9 || digits.length > 15) return;
    if (/^0{5,}|^1{5,}|^123456/.test(digits)) return;
    // Chuẩn hóa nhẹ
    phones.add(raw.replace(/\s+/g, ' ').trim());
  };

  const addIg = (u) => {
    if (!u) return;
    try {
      let h = u;
      if (!/^https?:/i.test(h)) h = 'https://' + h.replace(/^\/+/, '');
      const url = new URL(h);
      if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return;
      let user = url.pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
      if (!user || /^(p|reel|stories|explore|accounts)/i.test(user)) return;
      instagrams.add('https://www.instagram.com/' + user);
    } catch (_) {}
  };

  const addWeb = (u) => {
    if (!u) return;
    try {
      let h = u;
      if (!/^https?:/i.test(h)) h = 'https://' + h.replace(/^\/+/, '');
      const url = new URL(h);
      if (/(^|\.)(facebook|fb|messenger|meta|instagram|whatsapp)\.(com|me|net)$/i.test(url.hostname)) return;
      if (url.hostname.includes('fbcdn') || url.hostname.includes('fb.com')) return;
      websites.add(url.href);
    } catch (_) {}
  };

  // 1) Link mailto / tel / external
  main.querySelectorAll('a[href]').forEach((a) => {
    const href = a.href || a.getAttribute('href') || '';
    const text = (a.innerText || a.textContent || '').trim();

    if (/^mailto:/i.test(href)) {
      try { addEmail(decodeURIComponent(href.slice(7).split('?')[0])); } catch (_) {}
    }
    if (/^tel:/i.test(href)) {
      try { addPhone(decodeURIComponent(href.slice(4))); } catch (_) {}
    }

    // Facebook l.facebook.com redirect
    try {
      const u = new URL(href);
      if (/(^|\.)l\.facebook\.com$|(^|\.)lm\.facebook\.com$/i.test(u.hostname)) {
        const real = u.searchParams.get('u');
        if (real) {
          const decoded = decodeURIComponent(real);
          if (/instagram\.com/i.test(decoded)) addIg(decoded);
          else addWeb(decoded);
        }
      } else if (/instagram\.com/i.test(u.hostname)) {
        addIg(href);
      } else {
        addWeb(href);
      }
    } catch (_) {}

    // Text của link đôi khi là email/phone
    if (/@/.test(text)) addEmail(text);
    if (/^[\d\s+().\-]{9,}$/.test(text)) addPhone(text);
  });

  // 2) Regex trên toàn bộ text
  (allText.match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi) || []).forEach(addEmail);

  // Số điện thoại: ưu tiên format VN + quốc tế
  const phoneRes = [
    /(?:\+?84|0)[\s.\-]?(?:\d[\s.\-]?){8,10}\d/g,           // VN
    /\+\d{1,3}[\s.\-]?\(?\d{1,4}\)?[\s.\-]?\d{3,4}[\s.\-]?\d{3,4}(?:[\s.\-]?\d{2,4})?/g,
    /(?:\(?0?\d{2,4}\)?[\s.\-]?)?\d{3,4}[\s.\-]?\d{3,4}(?:[\s.\-]?\d{2,4})?/g
  ];
  phoneRes.forEach((re) => {
    (allText.match(re) || []).forEach(addPhone);
  });

  // Instagram trong text (instagram.com/xxx hoặc @handle gần chữ Instagram)
  (allText.match(/(?:instagram\.com\/|@)([A-Za-z0-9._]{2,30})/gi) || []).forEach((m) => {
    const user = m.replace(/^instagram\.com\//i, '').replace(/^@/, '');
    if (user && !/^(p|reel|stories|explore)/i.test(user)) {
      instagrams.add('https://www.instagram.com/' + user);
    }
  });

  // 3) Aria-label / title chứa "Email", "Phone", "Call", "Gọi", "Nhắn tin"
  main.querySelectorAll('[aria-label], [title]').forEach((el) => {
    const label = (el.getAttribute('aria-label') || el.getAttribute('title') || '').toLowerCase();
    const txt = (el.innerText || el.textContent || '').trim();
    if (/email|thư điện|gmail|mail/i.test(label) && /@/.test(txt)) addEmail(txt);
    if (/phone|điện thoại|gọi|call|số/i.test(label)) addPhone(txt);
    if (/instagram/i.test(label)) {
      if (/instagram\.com/i.test(txt) || /^@?[\w.]+$/.test(txt)) addIg(txt.includes('instagram') ? txt : 'https://instagram.com/' + txt.replace(/^@/, ''));
    }
  });

  // 4) Các dòng gần nhãn "Email", "Điện thoại", "Website", "Instagram"
  const contactLabels = /^(email|e-mail|thư điện tử|điện thoại|phone|mobile|số điện thoại|website|web|instagram|ig|liên hệ|contact|call|gọi)$/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] || '';
    if (contactLabels.test(line)) {
      if (/email|mail|thư/i.test(line)) addEmail(next);
      if (/điện thoại|phone|mobile|gọi|call|số/i.test(line)) addPhone(next);
      if (/website|web/i.test(line)) addWeb(next);
      if (/instagram|ig/i.test(line)) addIg(next.includes('instagram') ? next : 'https://instagram.com/' + next.replace(/^@/, ''));
    }
    // Dạng "Email: xxx@yyy.com"
    const mEmail = line.match(/(?:email|e-mail|thư điện tử)\s*[:·\-–]\s*(.+)/i);
    if (mEmail) addEmail(mEmail[1]);
    const mPhone = line.match(/(?:điện thoại|phone|mobile|số điện thoại|call)\s*[:·\-–]\s*(.+)/i);
    if (mPhone) addPhone(mPhone[1]);
    const mWeb = line.match(/(?:website|web|trang web)\s*[:·\-–]\s*(.+)/i);
    if (mWeb) addWeb(mWeb[1]);
    const mIg = line.match(/(?:instagram|ig)\s*[:·\-–]\s*(.+)/i);
    if (mIg) addIg(mIg[1].includes('instagram') ? mIg[1] : 'https://instagram.com/' + mIg[1].replace(/^@/, ''));
  }

  // 5) JSON-LD / script type application/ld+json nếu có
  try {
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try {
        const j = JSON.parse(s.textContent);
        const arr = Array.isArray(j) ? j : [j];
        arr.forEach((obj) => {
          if (obj.email) addEmail(obj.email);
          if (obj.telephone) addPhone(obj.telephone);
          if (obj.url) addWeb(obj.url);
          if (obj.sameAs) {
            (Array.isArray(obj.sameAs) ? obj.sameAs : [obj.sameAs]).forEach((u) => {
              if (/instagram/i.test(u)) addIg(u);
              else addWeb(u);
            });
          }
        });
      } catch (_) {}
    });
  } catch (_) {}

  // ===== Nếu chỉ lấy contact (opts.about === true) =====
  if (opts.about || opts.contactOnly) {
    return {
      email: [...emails].slice(0, 5).join(' | '),
      phone: [...phones].slice(0, 5).join(' | '),
      instagram: [...instagrams].slice(0, 3).join(' | '),
      website: [...websites].slice(0, 3).join(' | ')
    };
  }

  // ===== TÊN =====
  let name = '';
  for (const h of main.querySelectorAll('h1')) {
    const t = (h.innerText || h.textContent || '').trim().split('\n')[0].trim();
    if (t && t.length > 0 && t.length < 120 && !/facebook/i.test(t)) {
      name = t;
      break;
    }
  }
  if (!name) name = meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]');
  name = name.replace(/\s*[|·]\s*Facebook\s*$/i, '').trim();

  // ===== SỐ LIỆU =====
  const numPat = '([\\d.,]+\\s*(?:[KMB]|N|Tr|nghìn|triệu|tỷ)?)';
  const findNum = (patterns) => {
    for (const re of patterns) {
      const m = fullText.match(re);
      if (m) return m[1].replace(/\s+/g, ' ').trim();
    }
    return '';
  };
  const followers = findNum([
    new RegExp(numPat + '\\s*(?:người theo dõi|followers?)', 'i'),
    new RegExp('(?:người theo dõi|followers?)\\s*[:·]?\\s*' + numPat, 'i')
  ]);
  const likes = findNum([
    new RegExp(numPat + '\\s*(?:lượt thích|likes?)', 'i'),
    new RegExp('(?:lượt thích|likes?)\\s*[:·]?\\s*' + numPat, 'i')
  ]);
  const friends = findNum([
    new RegExp(numPat + '\\s*(?:người bạn|bạn bè|friends?)', 'i'),
    new RegExp('(?:người bạn|bạn bè|friends?)\\s*[:·]?\\s*' + numPat, 'i')
  ]);

  // ===== CATEGORY =====
  let category = '';
  const catMatch = fullText.match(/(?:Trang|Page)\s*[·•|]\s*([^\n·•|]{2,60})/i);
  if (catMatch) category = catMatch[1].trim();
  if (!category) {
    for (const el of main.querySelectorAll('span, div')) {
      const t = (el.innerText || '').trim();
      if (/^(Trang|Page)\s*[·•]/.test(t) && t.length < 80) {
        category = t.replace(/^(Trang|Page)\s*[·•]\s*/i, '').trim();
        break;
      }
    }
  }

  // ===== BIO =====
  let bio = meta('meta[property="og:description"]') || meta('meta[name="description"]') || '';
  bio = bio.replace(/\s+/g, ' ').trim().slice(0, 600);
  if (bio.length < 20) {
    for (const line of lines) {
      if (line.length > 30 && line.length < 400 &&
          !/theo dõi|followers|thích|likes|bạn bè|friends|Trang ·|Page ·/i.test(line) &&
          !/^https?:\/\//i.test(line) && !/@/.test(line)) {
        bio = line;
        break;
      }
    }
  }

  // ===== AVATAR =====
  let avatar = meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]') || '';

  const isPage = !!category ||
    /(^|\s)(Trang|Page)\s*[·•]/i.test(fullText) ||
    (!/profile\.php\?id=/i.test(location.href) && /\/(pages|pg)\//i.test(location.href));

  // Contact đã lấy được ngay trên main page
  const contactFromMain = {
    email: [...emails].slice(0, 5).join(' | '),
    phone: [...phones].slice(0, 5).join(' | '),
    instagram: [...instagrams].slice(0, 3).join(' | '),
    website: [...websites].slice(0, 3).join(' | ')
  };

  return {
    name,
    category,
    followers,
    likes,
    friends,
    bio,
    avatar,
    isPage,
    ...contactFromMain
  };
}

// ---------- Định danh trang để tránh nhảy sang profile của mình ----------
const SYSTEM_PATHS = /^(about|photos|posts|reels|videos|reviews|community|events|shops|services|mentions|details|contact|home|watch|marketplace|gaming|friends|messages|notifications|settings|help|login|checkpoint|recover|me|pages|pg|groups|stories|live|saved|favorites|bookmarks|menu|search|watchparty)$/i;

function pageIdentity(pageUrl) {
  try {
    const x = new URL(pageUrl);
    if (!/(^|\.)facebook\.com$/i.test(x.hostname) && x.hostname !== 'fb.com') return null;

    // profile.php?id=...
    if (x.pathname === '/profile.php' || x.pathname.startsWith('/profile.php')) {
      const id = x.searchParams.get('id');
      if (id && /^\d+$/.test(id)) return { type: 'id', value: id };
      return null;
    }

    // /people/Name/123456  hoặc /pages/... 
    const people = x.pathname.match(/^\/people\/[^/]+\/(\d+)/i);
    if (people) return { type: 'id', value: people[1] };

    let parts = x.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    // bỏ segment phụ
    while (parts.length > 1 && SYSTEM_PATHS.test(parts[parts.length - 1])) parts.pop();
    if (parts.length === 0) return null;

    const first = parts[0];
    if (SYSTEM_PATHS.test(first)) return null;
    // username hợp lệ
    if (!/^[A-Za-z0-9.\-]+$/.test(first) || first.length < 2) return null;
    return { type: 'user', value: first.toLowerCase() };
  } catch (_) {
    return null;
  }
}

/** URL hiện tại còn thuộc đúng trang đích không? */
function urlMatchesIdentity(currentUrl, ident) {
  if (!ident) return false;
  try {
    const x = new URL(currentUrl);
    if (/\/(checkpoint|login|recover|two_factor)\b/i.test(x.pathname)) return false;
    // Trang chủ / feed → không phải trang đích
    if (x.pathname === '/' || x.pathname === '' || /^\/(home|watch|marketplace)\b/i.test(x.pathname)) {
      return false;
    }
    if (ident.type === 'id') {
      if (x.searchParams.get('id') === ident.value) return true;
      if (x.pathname.includes('/' + ident.value)) return true;
      // /people/Name/ID
      if (new RegExp('/' + ident.value + '(/|$)').test(x.pathname)) return true;
      return false;
    }
    // username
    const path = x.pathname.toLowerCase();
    return path === '/' + ident.value ||
      path.startsWith('/' + ident.value + '/') ||
      path.includes('/' + ident.value + '/');
  } catch (_) {
    return false;
  }
}

function aboutUrlsOf(pageUrl, ident) {
  const urls = [];
  if (!ident) return urls;
  try {
    if (ident.type === 'id') {
      const id = ident.value;
      urls.push(`https://www.facebook.com/profile.php?id=${id}&sk=about`);
      urls.push(`https://www.facebook.com/profile.php?id=${id}&sk=about_contact_and_basic_info`);
    } else {
      const u = ident.value;
      urls.push(`https://www.facebook.com/${u}/about`);
      urls.push(`https://www.facebook.com/${u}/about_contact_and_basic_info`);
      urls.push(`https://www.facebook.com/${u}/about_details`);
    }
  } catch (_) {}
  return [...new Set(urls)];
}

function isBadRedirect(url) {
  try {
    const x = new URL(url);
    const p = x.pathname.replace(/\/+$/, '') || '/';
    // checkpoint / login
    if (/\/(checkpoint|login|recover|two_factor)\b/i.test(p)) return 'checkpoint';
    // trang chủ, feed, me
    if (p === '/' || p === '' || /^\/(home|watch|marketplace|me)\b/i.test(p)) return 'home';
    return null;
  } catch (_) {
    return 'invalid';
  }
}

async function scrapeOne(url) {
  let tabId = null;
  const ident = pageIdentity(url);

  // URL gốc không hợp lệ (facebook.com/, /home, ...) → bỏ qua, không mở
  if (!ident) {
    return {
      sourceUrl: url,
      status: 'Bỏ qua: không phải link trang/profile hợp lệ (tránh quét nhầm trang cá nhân)'
    };
  }

  try {
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id;

    const st0 = await getState();
    await chrome.storage.local.set({ activeTabs: (st0.activeTabs || 0) + 1 });

    const loaded = await waitTabComplete(tabId, 45000);
    if (!loaded) {
      return { sourceUrl: url, status: 'Timeout tải trang' };
    }

    let cur;
    try {
      cur = await chrome.tabs.get(tabId);
    } catch (_) {
      return { sourceUrl: url, status: 'Tab bị đóng' };
    }

    const bad = isBadRedirect(cur.url);
    if (bad === 'checkpoint') {
      return {
        fatal: true,
        status: 'Facebook yêu cầu đăng nhập/xác minh (checkpoint). Đã dừng.'
      };
    }
    if (bad || !urlMatchesIdentity(cur.url, ident)) {
      return {
        sourceUrl: url,
        finalUrl: cur.url,
        status: 'Bỏ qua: Facebook redirect khỏi trang đích (có thể về trang cá nhân của bạn)'
      };
    }

    await sleep(rand(800, 1600));

    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractProfile
    });
    const data = (res && res.result) || {};
    let status = data.name ? 'OK' : 'Không đọc được tên';

    let email = data.email || '';
    let phone = data.phone || '';
    let instagram = data.instagram || '';
    let website = data.website || '';

    // Chỉ mở About nếu còn thiếu contact VÀ URL about thuộc đúng identity
    const needContact = !email || !phone || !instagram;
    if (needContact) {
      const aboutList = aboutUrlsOf(cur.url, ident);
      for (const about of aboutList) {
        if (email && phone && instagram) break;
        try {
          await sleep(rand(1000, 2200));
          await chrome.tabs.update(tabId, { url: about });
          await sleep(900);
          await waitTabComplete(tabId, 30000);
          await sleep(rand(600, 1200));

          let after;
          try {
            after = await chrome.tabs.get(tabId);
          } catch (_) {
            break;
          }

          // Nếu redirect sang trang khác / profile mình → dừng về About, không cào
          if (isBadRedirect(after.url) || !urlMatchesIdentity(after.url, ident)) {
            // quay lại trang gốc nếu cần (không bắt buộc)
            break;
          }

          const [r2] = await chrome.scripting.executeScript({
            target: { tabId },
            func: extractProfile,
            args: [{ about: true }]
          });
          const c = (r2 && r2.result) || {};
          if (c.email && !email) email = c.email;
          if (c.phone && !phone) phone = c.phone;
          if (c.instagram && !instagram) instagram = c.instagram;
          if (c.website && !website) website = c.website;
        } catch (_) {
          // thử URL about tiếp theo
        }
      }
      if (!email && !phone && data.isPage) {
        status += ' (không thấy liên hệ công khai)';
      }
    }

    if (!data.isPage && !email && !phone) {
      status += ' – trang cá nhân';
    }

    delete data.isPage;

    return {
      sourceUrl: url,
      finalUrl: cur.url,
      name: data.name || '',
      category: data.category || '',
      followers: data.followers || '',
      likes: data.likes || '',
      friends: data.friends || '',
      bio: data.bio || '',
      website: website || data.website || '',
      email: email || '',
      phone: phone || '',
      instagram: instagram || '',
      avatar: data.avatar || '',
      status
    };
  } catch (e) {
    return { sourceUrl: url, status: 'Lỗi: ' + (e.message || String(e)) };
  } finally {
    if (tabId) {
      try { await chrome.tabs.remove(tabId); } catch (_) {}
    }
    try {
      const st = await getState();
      await chrome.storage.local.set({
        activeTabs: Math.max(0, (st.activeTabs || 1) - 1)
      });
    } catch (_) {}
  }
}

// ---------- 5 luồng độc lập: claim index tuần tự bằng mutex in-memory ----------
let claimLock = Promise.resolve();

function claimNext() {
  let result;
  claimLock = claimLock.then(async () => {
    const s = await getState();
    if (!s.running || s.index >= s.queue.length) {
      result = null;
      return;
    }
    const idx = s.index;
    await chrome.storage.local.set({ index: idx + 1 });
    result = { idx, url: s.queue[idx] };
  }).catch(() => {
    result = null;
  });
  return claimLock.then(() => result);
}

async function runLoop() {
  if (loopActive) return;
  loopActive = true;

  try {
    // Worker độc lập: mỗi worker tự claim URL → mở tab riêng → cào → đóng
    const worker = async (workerId) => {
      while (true) {
        const s = await getState();
        if (!s.running) break;

        const item = await claimNext();
        if (!item) break;

        await chrome.storage.local.set({
          status: `Đang xử lý... (${item.idx + 1}/${s.queue.length}) · ${s.concurrency || 5} luồng`
        });

        const row = await scrapeOne(item.url);

        if (row.fatal) {
          await chrome.storage.local.set({
            running: false,
            status: row.status,
            activeTabs: 0
          });
          return;
        }

        // Append kết quả an toàn (mutex nhẹ)
        await claimLock.then(async () => {
          const cur = await getState();
          cur.results.push(row);
          await chrome.storage.local.set({ results: cur.results });
        });

        const after = await getState();
        if (!after.running) break;

        // Nghỉ giữa job của worker này (các worker khác vẫn chạy song song)
        if (after.index > 0 && after.index % 50 === 0) {
          await chrome.storage.local.set({ status: 'Nghỉ dài để tránh checkpoint...' });
          await longSleep(rand(20000, 40000));
        } else {
          // Delay ngắn hơn khi 5 luồng — mỗi worker nghỉ riêng
          await longSleep(rand(2500, 5500));
        }
      }
    };

    const s0 = await getState();
    const n = Math.min(5, Math.max(1, parseInt(s0.concurrency, 10) || 5));
    await chrome.storage.local.set({ concurrency: n, activeTabs: 0 });

    const workers = [];
    for (let i = 0; i < n; i++) {
      workers.push(worker(i + 1));
    }
    await Promise.all(workers);

    const end = await getState();
    if (end.running) {
      await chrome.storage.local.set({
        running: false,
        status: end.index >= end.queue.length ? 'Hoàn tất' : 'Đã dừng',
        activeTabs: 0
      });
    }
  } finally {
    loopActive = false;
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'RUN') runLoop();
});
