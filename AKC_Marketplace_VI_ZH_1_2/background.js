// ============================================================
// AKC Marketplace 采集器 - 后台调度 (MV3 service worker)
// 流程: Stage A 列表页(模板生成的序列) -> Stage B 去重机构链接 -> Stage C 机构页提取8字段
// 采用真实标签页加载 + content 注入执行 XPath，保证 React 渲染后的内容可被采集。
// 列表页 URL 与所有 XPath 均可由弹窗配置修改 (config)。
// ============================================================

const DEBUG_MAX = 2; // 调试模式保存的样本页数量

// ---------- 可修改的配置 (默认值，弹窗可改) ----------
const DEFAULT_CONFIG = {
  // 列表页 URL 三段式: prefix + 序列 + suffix
  listingPrefix: 'https://marketplace.akc.org/puppies/all-breeds?page=',
  listingSuffix: '',
  listingSeqType: 'number',   // number | alpha
  listingSeqStart: 1,         // 数字起始 或 字母起始(如 a)
  listingSeqEnd: 740,         // 数字结束 或 字母结束(如 z)
  concurrentTabs: 3,          // Number of breeder pages loaded in parallel (1-5)
  // XPath
  listingAnchorXPath: '//div[@class="sc-ipZHIp hrvESM"]/a',
  aboutXPath: '//div[@class="about-text"]',
  basicXPath: '//div[@class="basic-operations"]',
  // Do not exclude the social icon container: its anchors are often the only
  // visible Facebook link on an AKC breeder page.
  excludeXPath: '//div[@class="sc-jWBwVP bSslwA"]'
};
async function getConfig() {
  const r = await chrome.storage.local.get('config');
  const cfg = Object.assign({}, DEFAULT_CONFIG, r.config || {});
  // Migrate only the old shipped default (`?page=1/`) to AKC's canonical URL.
  if (cfg.listingPrefix === DEFAULT_CONFIG.listingPrefix && cfg.listingSuffix === '/' &&
      cfg.listingSeqType === 'number' && cfg.listingSeqStart === 1 && cfg.listingSeqEnd === 740) {
    cfg.listingSuffix = '';
    await chrome.storage.local.set({ config: cfg });
  }
  return cfg;
}
async function saveConfig(cfg) {
  const merged = Object.assign({}, DEFAULT_CONFIG, cfg || {});
  await chrome.storage.local.set({ config: merged });
  return merged;
}

// 根据配置构建列表页 URL 序列(完整 URL 数组)
function buildListingSequence(cfg) {
  const pre = String(cfg.listingPrefix == null ? '' : cfg.listingPrefix);
  const suf = String(cfg.listingSuffix == null ? '' : cfg.listingSuffix);
  const out = [];
  if (cfg.listingSeqType === 'alpha') {
    const a = String(cfg.listingSeqStart || 'a').charAt(0).toLowerCase();
    const z = String(cfg.listingSeqEnd || 'z').charAt(0).toLowerCase();
    let c = a.charCodeAt(0);
    const end = z.charCodeAt(0);
    for (; c <= end; c++) out.push(pre + String.fromCharCode(c) + suf);
  } else {
    let s = parseInt(cfg.listingSeqStart, 10); if (isNaN(s)) s = 1;
    let e = parseInt(cfg.listingSeqEnd, 10); if (isNaN(e)) e = 740;
    if (e < s) [s, e] = [e, s];
    for (let i = s; i <= e; i++) out.push(pre + i + suf);
  }
  return out;
}

// ---------- 状态读写 ----------
// 工具栏角标: 最小化时也能看到进度
async function updateBadge(s) {
  if (!s) { await chrome.action.setBadgeText({ text: '' }); return; }
  let text = '', color = '#64748b';
  if (s.status === 'running') {
    color = '#2563eb';
    text = s.phase === 'listing' ? String(s.stats.listingPagesDone) : String(s.stats.breedersDone);
  } else if (s.status === 'done') {
    color = '#16a34a'; text = 'OK';
  } else if (s.status === 'paused') {
    color = '#d97706'; text = 'II';
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
}
async function getState() {
  const r = await chrome.storage.local.get('state');
  if (!r.state) return null;
  return Object.assign({ runId: 'legacy', completedPages: (r.state.stats?.listingPagesDone || 0) + (r.state.stats?.breedersDone || 0), nextAllowedAt: 0, retryNotBefore: 0, activeTabId: null, inProgressUrls: [], retry: { url: null, count: 0, lastError: null }, skipped: [] }, r.state);
}
async function saveState(s) {
  await chrome.storage.local.set({ state: s });
  await updateBadge(s);
}
function defaultState(mode, seq) {
  const totalPages = mode === 'full' ? seq.length : Math.min(3, seq.length); // test 仅前 3 个
  return {
    version: 3,
    runId: crypto.randomUUID(),
    completedPages: 0, nextAllowedAt: 0, retryNotBefore: 0,
    activeTabId: null, inProgressUrl: null, inProgressUrls: [], stopReason: null,
    // Persisted so an MV3 worker restart does not turn a transient failure into a pause.
    retry: { url: null, count: 0, lastError: null },
    skipped: [],
    status: 'idle',                 // idle | running | paused | done
    mode: mode || 'test',          // test | full
    phase: 'listing',              // listing | breeder
    listingSeq: seq,               // 列表页完整 URL 序列
    totalPages: totalPages,        // 本模式要采的列表页数
    listingCursor: 1,              // 下一个待采的列表页(1-based 索引)
    breederLinks: [],              // Stage B: 去重后的机构 base URL
    breederDone: [],               // 已采完的机构 URL
    results: [],                   // 提取到的机构记录
    debug: true,                   // 调试模式: 保存样本原始 HTML
    debugSamples: [],              // [{url, html}]
    errors: [],
    stats: { listingPagesDone: 0, breedersDone: 0, breedersTotal: 0 }
  };
}

// ---------- 页面内采集函数 (注入到目标页执行) ----------
// 注意: 此函数运行在页面上下文，只能使用页面内能访问的全局对象(document/location/XPathResult)。
function scrapePage(task) {
  const cfg = task.config || {};
  return new Promise((resolve) => {
    const finish = (value) => {
      const problem = detectBlock();
      resolve(problem ? { blocked: problem } : value);
    };
    function detectBlock() {
      const title = document.title || '';
      const text = (document.body?.innerText || '').slice(0, 6000);
      const challengeText = /verify (?:that )?you are (?:a )?human|checking your browser|unusual traffic|please complete (?:the )?(?:captcha|security check)/i;
      const challengeTitle = /just a moment|attention required|verify (?:you are )?human|access denied/i;
      const visibleChallenge = [...document.querySelectorAll(
        'iframe[src*="captcha"],iframe[src*="challenges.cloudflare.com"],#challenge-running,#challenge-stage,[id*="captcha"],[class*="captcha"]'
      )].some(el => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return r.width > 80 && r.height > 30 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      // A phrase anywhere in an ordinary AKC page is not enough: require a real
      // visible challenge, or corroborating title + page message. HTTP 403/429 is
      // handled independently by the response observer.
      return visibleChallenge || (challengeTitle.test(title) && challengeText.test(text))
        ? 'CAPTCHA_OR_BLOCK' : null;
    }
    const RENDER_WAIT = 4000; // Fallback when React has not exposed its data nodes yet.
    const CONTENT_SETTLE_WAIT = 2000; // Normal case: data nodes are already present.

    const waitFor = (pred, timeout) => new Promise((res) => {
      const start = Date.now();
      const tick = () => {
        try {
          const value = pred();
          if (value) return res(value);
        } catch (e) {}
        if (Date.now() - start > timeout) return res(false);
        setTimeout(tick, 300);
      };
      tick();
    });

    const xpathFirst = (xp) => {
      if (!xp) return null;
      try {
        const r = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return r.singleNodeValue;
      } catch (e) { return null; }
    };
    const xpathAll = (xp) => {
      const out = [];
      if (!xp) return out;
      try {
        const it = document.evaluate(xp, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < it.snapshotLength; i++) out.push(it.snapshotItem(i));
      } catch (e) {}
      return out;
    };

    const extractListing = () => {
      const RE = /\/breeder\/([^/]+)\/[^/]+\/\d+/; // /breeder/<slug>/<breed>/<id>
      const set = new Set();
      const collect = (root) => {
        root.querySelectorAll('a').forEach((a) => {
          const m = (a.getAttribute('href') || '').match(RE);
          if (m) set.add(location.origin + '/breeder/' + m[1]); // 向上两级 = /breeder/<slug>
        });
      };
      const nodes = xpathAll(cfg.listingAnchorXPath);
      nodes.forEach((n) => {
        if (n.nodeName === 'A') {
          const m = (n.getAttribute('href') || '').match(RE);
          if (m) set.add(location.origin + '/breeder/' + m[1]);
        } else {
          collect(n);
        }
      });
      if (set.size === 0) collect(document); // 兜底
      // AKC normally exposes the last page in its pagination controls.  Reading it
      // lets us stop at the real end instead of sending unnecessary requests up to
      // the configured ceiling (740 by default).
      const pageNumbers = [...document.querySelectorAll('a[href*="page="], [data-page]')]
        .map((el) => {
          const fromData = Number(el.getAttribute('data-page'));
          if (Number.isInteger(fromData) && fromData > 0) return fromData;
          try {
            const href = el.href || el.getAttribute('href') || '';
            return Number(new URL(href, location.href).searchParams.get('page'));
          } catch (e) { return 0; }
        })
        .filter((n) => Number.isInteger(n) && n > 0);
      return { links: [...set], lastPage: pageNumbers.length ? Math.max(...pageNumbers) : null };
    };

    const extractBreeder = (debug) => {
      // URL 归一化: 兼容 https:// 与 www. 裸域
      const firstUrl = (text) => {
        if (!text) return '';
        const m = text.match(/(https?:\/\/[^\s<>"\)$]+)|(www\.[^\s<>"\)$]+)/i);
        if (!m) return '';
        let u = m[0];
        if (/^www\./i.test(u)) u = 'https://' + u;
        return u.replace(/[),;]+$/, '');
      };
      const hostOf = (href) => { try { return new URL(href, location.href).hostname.toLowerCase(); } catch (e) { return ''; } };
      // A Facebook host alone is not enough: share dialogs are site widgets, not
      // the breeder's Facebook profile.
      const isFb = (href) => {
        const h = hostOf(href);
        if (!(h.endsWith('facebook.com') || h.endsWith('fb.me'))) return false;
        return !/(?:facebook\.com\/(?:sharer(?:\.php)?|share\.php|dialog\/|plugins\/)|fb\.me\/share)/i.test(href);
      };
      const isIg = (href) => hostOf(href).endsWith('instagram.com');

      // Links on breeder pages are commonly icon-only, image-only, SVG-only, or
      // rendered as a div with data-href/onclick.  Read the DOM before applying
      // the optional exclusion XPath, then inspect the usual link-like attributes
      // as well as redirect query parameters and escaped URLs in handlers/scripts.
      const fbFromValue = (value) => {
        if (value == null) return '';
        // Remove JavaScript's escaping from `https:\/\/...` before parsing it.
        const values = [String(value).replace(/&amp;/gi, '&').split('\\').join('')];
        for (let i = 0; i < values.length && i < 12; i++) {
          const raw = values[i];
          try {
            const decoded = decodeURIComponent(raw);
            if (decoded !== raw) values.push(decoded);
          } catch (e) { /* malformed percent escape */ }
          try {
            const url = new URL(raw, location.href);
            if (isFb(url.href)) return url.href;
            url.searchParams.forEach((v) => values.push(v));
          } catch (e) { /* an onclick fragment or plain text */ }
          const urls = raw.match(/(?:https?:\/\/|www\.)[^\s<>"'`]+/gi) || [];
          for (const match of urls) {
            const url = match.split('\\').join('');
            const absolute = /^www\./i.test(url) ? 'https://' + url : url;
            if (isFb(absolute)) return absolute.replace(/[),;]+$/, '');
          }
        }
        return '';
      };
      const FB_ATTRS = ['href', 'data-href', 'data-url', 'data-link', 'data-link-url', 'data-redirect-url', 'data-original-url', 'data-facebook', 'content', 'onclick'];
      const collectFbCandidates = () => {
        const candidates = [];
        const add = (value) => { const fb = fbFromValue(value); if (fb && !candidates.includes(fb)) candidates.push(fb); };
        document.querySelectorAll(FB_ATTRS.map((a) => '[' + a + ']').join(',')).forEach((el) => {
          FB_ATTRS.forEach((attr) => add(el.getAttribute(attr)));
          // Covers an image/SVG nested inside a normal anchor, including anchors
          // whose link is applied by a surrounding button-like wrapper.
          const parentLink = el.closest('a, [role="link"]');
          if (parentLink) FB_ATTRS.forEach((attr) => add(parentLink.getAttribute(attr)));
        });
        // Last fallback for framework payloads / JSON-LD and inline JS where no
        // element attribute survives into the rendered icon.
        document.querySelectorAll('script[type="application/ld+json"], script:not([src]), meta').forEach((el) => add(el.textContent || el.getAttribute('content')));
        return candidates;
      };
      const preExcludeFbCandidates = collectFbCandidates();

      // 排除指定元素内的内容(默认 sc-jWBwVP bSslwA): 连同其文字与链接一并从 DOM 中移除, 避免被采集
      if (cfg.excludeXPath) {
        xpathAll(cfg.excludeXPath).forEach((n) => { if (n.parentNode) n.parentNode.removeChild(n); });
      }
      const aboutEl = xpathFirst(cfg.aboutXPath) || document.querySelector('div.about-text');
      const basicEl = xpathFirst(cfg.basicXPath) || document.querySelector('div.basic-operations');
      const aboutText = aboutEl ? aboutEl.innerText.trim() : '';
      const basicText = basicEl ? basicEl.innerText.trim() : '';
      const combined = aboutText + '\n' + basicText;
      // 带标签文本解析 URL, 容忍标签与 URL 之间的任意同行文字
      // 例: "Facebook: AmStaffs - https://www.facebook.com/LBKAmStaffs/"
      const findLabeledUrl = (label, text) => {
        const m = text.match(new RegExp(label + '\\s*[^\\n]*?(https?://[^\\s<>"\\)]+|www\\.[^\\s<>"\\)]+)', 'i'));
        return m ? firstUrl(m[1] || m[0]) : '';
      };
      // 把 basic-operations 解析成 标签:值 映射 (主数据源)
      const kv = {};
      basicText.split('\n').forEach((line) => {
        const m = line.match(/^\s*([A-Za-z][\w\s\/&.\-]*?)\s*:\s*(.+)$/);
        if (m) kv[m[1].trim().toLowerCase()] = m[2].trim();
      });

      const links = [...document.querySelectorAll('a')].map((a) => ({ href: a.href || '', text: (a.innerText || '').trim() }));
      // 按域名严格判定, 避免把非 Facebook/Instagram 的链接误采
      const isSocial = (href) => {
        const h = hostOf(href);
        return h.endsWith('facebook.com') || h.endsWith('fb.me') || h.endsWith('instagram.com')
          || h.endsWith('twitter.com') || h.endsWith('x.com') || h.endsWith('linkedin.com')
          || h.endsWith('youtube.com') || h.endsWith('pinterest.com');
      };
      const fbLink = links.find((l) => isFb(l.href));
      const igLink = links.find((l) => isIg(l.href));

      const title = document.title || '';
      const h1 = (document.querySelector('h1') || {}).innerText || '';

      // 机构名 / 品种 / 负责人 / 地址: 优先 basic-operations 标签, 兜底标题/正则
      const breederName = kv['kennel name'] || (title.split(' - ')[0] || h1 || '').trim();
      const breed = kv['breeds']
        || (title.match(/(.+?)\s+Puppies for Sale/i) || [])[1]
        || h1.replace(/Puppies for Sale/i, '').trim() || '';
      const contact = kv['breeder name']
        || (combined.match(/(?:contact|breeder|owner)\s*[:\-]\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i) || [])[1] || '';
      const address = kv['location']
        || (combined.match(/in\s+([A-Za-z .]+,\s*[A-Z]{2}(?:\s*\d{5})?)/i) || [])[1]
        || (combined.match(/([A-Za-z .]+,\s*[A-Z]{2}\s*\d{5})/) || [])[1] || '';

      // 官网: basic-operations 优先, 否则 about-text 首个非社媒站(合并二级官网)
      let website = kv['website'] ? firstUrl(kv['website']) : '';
      if (!website) {
        website = findLabeledUrl('Website', aboutText) || findLabeledUrl('Site', aboutText) || findLabeledUrl('URL', aboutText);
        if (!website) {
          const cand = aboutText.match(/https?:\/\/[^\s<>"\)$]+|www\.[^\s<>"\)$]+/gi) || [];
          for (const c of cand) {
            const u = firstUrl(c);
            if (!isSocial(u)) { website = u; break; }
          }
        }
      }

      // Facebook: labels -> ordinary anchors -> hidden/icon/image/data/JS links
      // found before exclusions (all candidates must be real Facebook profile URLs).
      let facebook = (kv['facebook'] && isFb(firstUrl(kv['facebook']))) ? firstUrl(kv['facebook']) : '';
      if (!facebook) {
        const fl = findLabeledUrl('Facebook', aboutText) || findLabeledUrl('Facebook', basicText);
        if (fl && isFb(fl)) facebook = fl;
      }
      if (!facebook && fbLink) facebook = fbLink.href;
      if (!facebook) facebook = preExcludeFbCandidates[0] || '';

      // Instagram
      let instagram = kv['instagram'] ? firstUrl(kv['instagram']) : '';
      if (!instagram && igLink) instagram = igLink.href;

      // 电话 / 邮箱: 一般在 about-text, 先看 basic-operations 标签, 再正则
      const phoneRe = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
      const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
      let phone = kv['phone'] ? (kv['phone'].match(phoneRe) || [])[0] : '';
      if (!phone) phone = (combined.match(phoneRe) || [])[0] || '';
      let email = kv['email'] ? (kv['email'].match(emailRe) || [])[0] : '';
      if (!email) email = (combined.match(emailRe) || [])[0] || '';

      const rec = {
        url: location.href,
        breederName: breederName,
        breed: breed,
        website: website,
        facebook: facebook,
        instagram: instagram,
        phone: phone,
        email: email,
        contact: contact,
        address: address,
        remark: combined,
        aboutText: aboutText,
        basicText: basicText
      };
      if (debug) rec._rawHtml = document.documentElement.outerHTML;
      return rec;
    };

    if (task.type === 'listing') {
      waitFor(() => document.querySelectorAll('a[href*="/breeder/"]').length > 0
        ? 'content' : (document.readyState === 'complete' ? 'complete' : false), 30000)
        .then((ready) => setTimeout(() => {
          const listing = extractListing();
          finish({ type: 'listing', links: listing.links, lastPage: listing.lastPage });
        }, ready === 'content' ? CONTENT_SETTLE_WAIT : RENDER_WAIT));
    } else {
      waitFor(() => document.querySelector('div.about-text') || document.querySelector('div.basic-operations')
        ? 'content' : (document.readyState === 'complete' ? 'complete' : false), 30000)
        .then((ready) => setTimeout(() => finish({ type: 'breeder', record: extractBreeder(task.debug) }),
          ready === 'content' ? CONTENT_SETTLE_WAIT : RENDER_WAIT));
    }
  });
}


// Pacing uses persisted deadlines; browser suspension may extend, never shorten waits.
const PACING = Object.freeze({
  pageGapMs: 2000, batchSize: 20, batchRestMs: 10000,
  timeoutMs: 90000, retryBaseMs: 30000, retryMaxMs: 15 * 60000,
  rateLimitFallbackMs: 5 * 60000, maxRetries: 4
});
let wakeTimer, inflight = 0;
let stateQueue = Promise.resolve();
const faults = new Map();
const ownedTabs = new Set();
function atomic(fn) {
  const result = stateQueue.then(fn);
  stateQueue = result.catch(() => {});
  return result;
}
function nextDeadline(count, now = Date.now()) {
  return now + (count % PACING.batchSize === 0 ? PACING.batchRestMs : PACING.pageGapMs);
}
function retryDeadline(headers, now = Date.now()) {
  const value = (headers || []).find(h => h.name.toLowerCase() === 'retry-after')?.value;
  if (!value) return 0;
  if (/^\d+$/.test(value.trim())) return now + Number(value.trim()) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(now, date) : 0;
}
function arm(at) {
  clearTimeout(wakeTimer);
  const deadline = Math.max(Date.now(), at || 0);
  chrome.alarms.create('nextPage', { when: deadline });
  wakeTimer = setTimeout(() => pump(), Math.max(0, deadline - Date.now()));
}
async function stopTimers() {
  clearTimeout(wakeTimer);
  await chrome.alarms.clear('nextPage');
}
chrome.webRequest.onHeadersReceived.addListener(details => {
  if (!ownedTabs.has(details.tabId) || ![403, 429].includes(details.statusCode)) return;
  const fault = { code: 'HTTP_' + details.statusCode, retryAt: retryDeadline(details.responseHeaders) };
  faults.set(details.tabId, fault);
  void atomic(async () => {
    const s = await getState();
    if (!s || s.activeTabId !== details.tabId || s.status !== 'running') return;
    // 429 is a recoverable server instruction.  Do not pause the run: processPage
    // will retry this same URL after the supplied Retry-After deadline.
    s.retryNotBefore = Math.max(s.retryNotBefore || 0, fault.retryAt);
    await chrome.storage.local.set({ serverRetryAt: s.retryNotBefore });
    s.errors = [...s.errors, fault.code + ': ' + details.url].slice(-20);
    await saveState(s);
  });
}, { urls: ['https://marketplace.akc.org/*'], types: ['main_frame', 'xmlhttprequest'] }, ['responseHeaders']);
function waitTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const done = (err) => { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); err ? reject(err) : resolve(); };
    const listener = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    const timer = setTimeout(() => done(new Error('LOAD_TIMEOUT')), PACING.timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then(t => { if (t.status === 'complete') done(); }, done);
  });
}
async function processPage(url, type, debug, cfg, runId) {
  const parsed = new URL(url);
  if (parsed.origin !== 'https://marketplace.akc.org') throw new Error('UNSUPPORTED_HOST');
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
  ownedTabs.add(tab.id);
  let timer;
  try {
    const proceed = await atomic(async () => {
      const s = await getState();
      if (!s || s.runId !== runId || s.status !== 'running') return false;
      s.activeTabId = tab.id; s.inProgressUrl = url; await saveState(s); return true;
    });
    if (!proceed) throw new Error('CANCELLED');
    await chrome.tabs.update(tab.id, { url });
    await waitTabComplete(tab.id);
    if (faults.has(tab.id)) throw new Error(faults.get(tab.id).code);
    const output = await Promise.race([
      chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scrapePage, args: [{ type, debug, config: cfg }] }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('EXTRACT_TIMEOUT')), PACING.timeoutMs); })
    ]);
    if (faults.has(tab.id)) throw new Error(faults.get(tab.id).code);
    const data = output?.[0]?.result;
    if (data?.blocked) throw new Error(data.blocked);
    // Empty listing pages are normal at the end of a paginated result set.
    if (!data || (type === 'listing' && !Array.isArray(data.links)) ||
        (type === 'breeder' && !data.record?.aboutText && !data.record?.basicText)) throw new Error('NO_DATA');
    return data;
  } finally {
    clearTimeout(timer); faults.delete(tab.id); ownedTabs.delete(tab.id);
    await chrome.tabs.remove(tab.id).catch(() => {});
    await atomic(async () => {
      const s = await getState();
      if (s?.runId === runId && s.activeTabId === tab.id) { s.activeTabId = null; await saveState(s); }
    });
  }
}
function retryDelay(error, attempt) {
  if (error === 'HTTP_429') return PACING.rateLimitFallbackMs;
  return Math.min(PACING.retryBaseMs * (2 ** Math.max(0, attempt - 1)), PACING.retryMaxMs);
}
function isManualStop(error) {
  return error === 'HTTP_403' || error === 'CAPTCHA_OR_BLOCK' || error === 'UNSUPPORTED_HOST';
}
async function pump() {
  const cfg = await getConfig();
  const parallelLimit = Math.max(1, Math.min(5, Number.parseInt(cfg.concurrentTabs, 10) || 1));
  if (inflight >= parallelLimit) return;
  let runId;
  let task;
  try {
    task = await atomic(async () => {
      const s = await getState();
      if (!s || s.status !== 'running') return null;
      // Listing pages discover the breeder queue and remain serial. Breeder pages
      // use reservations so several hidden tabs never receive the same URL.
      if (s.phase === 'listing' && s.activeTabId != null) return null;
      if (s.phase === 'listing' && s.activeTabId != null) {
        // A terminated worker left an unfinished page. Retain the cursor and retry it.
        await chrome.tabs.remove(s.activeTabId).catch(() => {});
        s.activeTabId = null;
        const previous = s.retry?.url === s.inProgressUrl ? s.retry.count : 0;
        const attempt = previous + 1;
        s.retry = { url: s.inProgressUrl, count: attempt, lastError: 'INTERRUPTED' };
        if (attempt > PACING.maxRetries) {
          s.status = 'paused'; s.stopReason = 'INTERRUPTED';
          await saveState(s); return null;
        }
        s.nextAllowedAt = Date.now() + retryDelay('INTERRUPTED', attempt);
        s.errors = [...s.errors, `INTERRUPTED: retry ${attempt}/${PACING.maxRetries}`].slice(-20);
        await saveState(s); arm(s.nextAllowedAt); return null;
      }
      const due = Math.max(s.nextAllowedAt || 0, s.retryNotBefore || 0);
      if (Date.now() < due) { arm(due); return null; }
      if (s.phase === 'listing' && s.listingCursor > s.totalPages) s.phase = 'breeder';
      const url = s.phase === 'listing' ? s.listingSeq[s.listingCursor - 1] : s.breederLinks.find(l => !s.breederDone.includes(l) && !(s.inProgressUrls || []).includes(l));
      if (!url) {
        if (s.phase === 'breeder' && (s.inProgressUrls || []).length) return null;
        s.status = 'done'; s.nextAllowedAt = 0; await saveState(s); await stopTimers(); return null;
      }
      s.inProgressUrl = url;
      if (s.phase === 'breeder') s.inProgressUrls = [...new Set([...(s.inProgressUrls || []), url])];
      await saveState(s);
      return { runId: s.runId, url, type: s.phase, debug: s.debug && s.debugSamples.length < DEBUG_MAX };
    });
    if (!task) return;
    inflight++;
    // Fill the remaining configured slots immediately; listing discovery stays serial.
    if (task.type === 'breeder') void pump();
    runId = task.runId;
    const data = await processPage(task.url, task.type, task.debug, cfg, runId);
    await atomic(async () => {
      const s = await getState();
      if (s?.runId !== runId || s.status !== 'running') return;
      if (task.type === 'listing') {
        s.breederLinks = [...new Set([...s.breederLinks, ...data.links])];
        // Never increase a user-selected limit; only shorten it when AKC exposes
        // a valid final page at or beyond the page currently being processed.
        if (Number.isInteger(data.lastPage) && data.lastPage >= s.listingCursor) {
          s.totalPages = Math.min(s.totalPages, data.lastPage);
        }
        s.listingCursor++; s.stats.listingPagesDone = s.listingCursor - 1;
      } else {
        s.results.push(data.record);
        if (task.debug && data.record._rawHtml) s.debugSamples.push({ url: task.url, html: data.record._rawHtml });
        s.breederDone.push(task.url); s.stats.breedersDone = s.breederDone.length;
        s.inProgressUrls = (s.inProgressUrls || []).filter((url) => url !== task.url);
      }
      s.stats.breedersTotal = s.breederLinks.length;
      s.completedPages++; s.inProgressUrl = null; s.stopReason = null;
      s.retry = { url: null, count: 0, lastError: null };
      if (s.listingCursor > s.totalPages && s.breederDone.length === s.breederLinks.length) {
        s.status = 'done'; s.nextAllowedAt = 0; await saveState(s); await stopTimers();
      } else {
        s.nextAllowedAt = nextDeadline(s.completedPages); await saveState(s); arm(s.nextAllowedAt);
      }
    });
  } catch (e) {
    await atomic(async () => {
      const s = await getState();
      if (!s || (runId && s.runId !== runId) || s.status !== 'running') return;
      const error = e.message || 'ERROR';
      if (isManualStop(error)) {
        s.status = 'paused'; s.stopReason = error;
        s.errors = [...s.errors, error].slice(-20);
        await saveState(s); await stopTimers();
        return;
      }
      const url = task?.url || s.inProgressUrl;
      s.inProgressUrls = (s.inProgressUrls || []).filter((item) => item !== url);
      const previous = s.retry?.url === url ? s.retry.count : 0;
      const attempt = previous + 1;
      s.retry = { url, count: attempt, lastError: error };
      s.errors = [...s.errors, `${error}: retry ${attempt}/${PACING.maxRetries}`].slice(-20);
      if (attempt <= PACING.maxRetries) {
        // Keep the same cursor. Retry-After, when supplied, always wins over backoff.
        s.nextAllowedAt = Math.max(Date.now() + retryDelay(error, attempt), s.retryNotBefore || 0);
        s.stopReason = null;
        await saveState(s); arm(s.nextAllowedAt);
        return;
      }
      // A permanently bad/empty page must not stop hundreds of later pages.
      s.skipped = [...(s.skipped || []), { url, type: s.phase, error, at: Date.now() }].slice(-100);
      if (s.phase === 'listing') {
        s.listingCursor++; s.stats.listingPagesDone = s.listingCursor - 1;
      } else if (url && !s.breederDone.includes(url)) {
        s.breederDone.push(url); s.stats.breedersDone = s.breederDone.length;
      }
      s.completedPages++; s.inProgressUrl = null;
      s.retry = { url: null, count: 0, lastError: null };
      s.stopReason = null;
      s.nextAllowedAt = nextDeadline(s.completedPages);
      await saveState(s); arm(s.nextAllowedAt);
    });
  } finally {
    if (task) inflight = Math.max(0, inflight - 1);
    // A completed slot may start another breeder page after the normal pacing delay.
    void pump();
  }
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  atomic(async () => {
    if (msg.type === 'getState') return getState();
    if (msg.type === 'getConfig') return getConfig();
    if (msg.type === 'saveConfig') return { ok: true, config: await saveConfig(msg.config) };
    if (msg.type === 'export') { const s = await getState(); return { results: s?.results || [], debugSamples: s?.debugSamples || [] }; }
    const s = await getState();
    if (msg.type === 'start' || msg.type === 'reset') {
      await stopTimers();
      if (s?.activeTabId != null) await chrome.tabs.remove(s.activeTabId).catch(() => {});
      const seq = msg.type === 'start' ? buildListingSequence(await getConfig()) : [];
      const fresh = defaultState(msg.mode || 'test', seq);
      if (msg.type === 'start') {
        fresh.status = 'running';
        // Restart/reset cannot erase a server-supplied Retry-After deadline.
        fresh.retryNotBefore = Math.max(s?.retryNotBefore || 0, (await chrome.storage.local.get('serverRetryAt')).serverRetryAt || 0);
        fresh.nextAllowedAt = Math.max(s?.nextAllowedAt || 0, fresh.retryNotBefore);
      }
      await saveState(fresh);
      if (msg.type === 'start') arm(Math.max(Date.now() + 500, fresh.nextAllowedAt));
    } else if (msg.type === 'pause' && s) {
      s.status = 'paused'; s.stopReason = 'MANUAL';
      s.nextAllowedAt = Math.max(s.nextAllowedAt || 0, Date.now() + PACING.pageGapMs);
      await saveState(s); await stopTimers();
    } else if (msg.type === 'resume' && s?.status === 'paused') {
      s.status = 'running'; s.stopReason = null;
      s.nextAllowedAt = Math.max(s.nextAllowedAt || 0, s.retryNotBefore || 0, Date.now() + PACING.pageGapMs);
      await saveState(s); arm(s.nextAllowedAt);
    }
    return { ok: true };
  }).then(sendResponse, e => sendResponse({ ok: false, error: String(e.message || e) }));
  return true;
});
async function initialize() { await chrome.alarms.create('pump', { periodInMinutes: 1 }); await pump(); }
chrome.runtime.onInstalled.addListener(() => { void initialize(); });
chrome.runtime.onStartup.addListener(() => { void initialize(); });
chrome.alarms.onAlarm.addListener(alarm => { if (['pump', 'nextPage'].includes(alarm.name)) void pump(); });
