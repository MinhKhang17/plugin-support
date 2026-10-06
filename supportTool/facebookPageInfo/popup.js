const $ = (id) => document.getElementById(id);
const DEFAULT = {
  queue: [],
  index: 0,
  results: [],
  running: false,
  status: '',
  concurrency: 5,
  activeTabs: 0
};

async function getState() {
  return { ...DEFAULT, ...(await chrome.storage.local.get(Object.keys(DEFAULT))) };
}

function render(s) {
  const total = s.queue.length;
  $('btnStart').disabled = s.running;
  $('btnStop').disabled = !s.running;
  $('btnExport').disabled = s.results.length === 0;
  $('btnExport').innerText = `Xuất CSV (${s.results.length})`;
  $('concurrency').disabled = s.running;
  $('concurrency').value = String(s.concurrency || 5);
  const done = s.index;
  $('fill').style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
  let statusText = s.status || 'Sẵn sàng';
  if (total) statusText += ` — ${done}/${total}`;
  if (s.running && s.activeTabs > 0) statusText += ` (${s.activeTabs} tab đang mở)`;
  $('status').innerText = 'Trạng thái: ' + statusText;
}

function parseUrls(text) {
  const out = new Set();
  const badPath = /^(about|home|watch|marketplace|gaming|friends|messages|notifications|settings|help|login|checkpoint|recover|me|groups|stories|live|saved|favorites|bookmarks|menu|search)?$/i;
  text.split(/\s+/).forEach((tok) => {
    tok = tok.trim().replace(/[,;]+$/, '');
    if (!tok) return;
    if (!/^https?:\/\//i.test(tok)) tok = 'https://' + tok.replace(/^\/+/, '');
    try {
      const u = new URL(tok);
      if (/(^|\.)facebook\.com$/.test(u.hostname) || u.hostname === 'fb.com' || u.hostname === 'm.facebook.com') {
        u.hostname = 'www.facebook.com';
        let path = u.pathname.replace(/\/+$/, '') || '/';
        // Bỏ qua trang chủ / feed — tránh quét nhầm profile của mình
        if (path === '/' || badPath.test(path.replace(/^\//, ''))) return;
        if (u.pathname === '/profile.php' || u.pathname.startsWith('/profile.php')) {
          if (!u.searchParams.get('id')) return;
        } else {
          u.search = '';
          u.hash = '';
        }
        const final = u.toString().replace(/\/+$/, '');
        if (final && final !== 'https://www.facebook.com') out.add(final);
      }
    } catch (_) {}
  });
  return [...out];
}

$('btnStart').addEventListener('click', async () => {
  const urls = parseUrls($('urls').value);
  const concurrency = Math.min(5, Math.max(1, parseInt($('concurrency').value, 10) || 5));
  const s = await getState();

  if (urls.length) {
    await chrome.storage.local.set({
      queue: urls,
      index: 0,
      results: [],
      running: true,
      status: 'Đang chạy...',
      concurrency,
      activeTabs: 0
    });
    $('urls').value = '';
  } else if (s.queue.length && s.index < s.queue.length) {
    await chrome.storage.local.set({
      running: true,
      status: 'Đang chạy...',
      concurrency,
      activeTabs: 0
    });
  } else {
    $('status').innerText = 'Chưa có link hợp lệ nào.';
    return;
  }
  chrome.runtime.sendMessage({ action: 'RUN' });
});

$('btnStop').addEventListener('click', async () => {
  await chrome.storage.local.set({ running: false, status: 'Đã dừng', activeTabs: 0 });
});

$('btnReset').addEventListener('click', async () => {
  await chrome.storage.local.set({ ...DEFAULT, running: false, activeTabs: 0 });
});

const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

$('btnExport').addEventListener('click', async () => {
  const { results } = await getState();
  const head = [
    'STT', 'Link gốc', 'Link cuối', 'Tên', 'Loại trang',
    'Người theo dõi', 'Lượt thích', 'Bạn bè', 'Giới thiệu',
    'Website', 'Email', 'Điện thoại', 'Instagram', 'Avatar', 'Trạng thái'
  ];
  let csv = '\uFEFF' + head.join(',') + '\n';
  results.forEach((r, i) => {
    csv += [
      i + 1, r.sourceUrl, r.finalUrl, r.name, r.category,
      r.followers, r.likes, r.friends, r.bio,
      r.website, r.email, r.phone, r.instagram || '', r.avatar, r.status
    ].map(esc).join(',') + '\n';
  });
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `fb_pages_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

chrome.storage.onChanged.addListener(async () => render(await getState()));
(async () => {
  const s = await getState();
  render(s);
  if (s.running) chrome.runtime.sendMessage({ action: 'RUN' });
})();
