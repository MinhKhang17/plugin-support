// Các hàm tự chứa để chrome.scripting.executeScript chạy trong tab đích.
export async function scanPage(fastMode=false) {
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const title=(document.title||'').trim();
  const firstText=(document.body?.innerText||'').slice(0,12000);
  const isFB=/(^|\.)facebook\.com$/.test(location.hostname);
  const visible=e=>!!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
  const challenge=Array.from(document.querySelectorAll('#challenge-running,#challenge-stage')).some(visible);
  const wall=/^(just a moment|attention required|verify you are human|security check|access denied)/i.test(title) ||
    /verify (?:that )?you are human|checking your browser|complete the security check|xác minh bạn là con người/i.test(firstText.slice(0,3000));
  if(challenge||wall) return {url:location.href,blocked:true,reason:'Trang yêu cầu xác minh hoặc chặn truy cập'};
  if(isFB && (/\/(login|checkpoint|recover)(?:[/.]|$)/.test(location.pathname) || /^(log in|login|đăng nhập).*facebook/i.test(title))) {
    return {url:location.href,blocked:true,reason:'Facebook yêu cầu đăng nhập hoặc xác minh'};
  }
  const errorTitle=/^(404\b|403\b|500\b|502\b|503\b|page not found|not found|this site can.t be reached|trang web này không thể)/i.test(title);
  const errorBody=/\b(ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED|ERR_CONNECTION_TIMED_OUT|DNS_PROBE_FINISHED_NXDOMAIN)\b/.test(firstText)||
    (firstText.length<3500 && /(?:^|\n)\s*(404(?:\s*[-:|]?\s*(?:error|not found|page not found))?|page not found|this page (?:isn.t|is not) available)\s*(?:\n|$)/i.test(firstText));
  if(errorTitle||errorBody) return {url:location.href,error:true,reason:'Trang lỗi hoặc không tồn tại'};
  const emails=new Set(),phones=new Set(),links=new Map(),facebookSignals=[],instagramSignals=[];
  let staticSourcesCollected=false;
  const seenAnchors=new WeakSet(),seenData=new WeakSet(),seenCloudflare=new WeakSet(),seenProperties=new WeakSet();
  const emailRx=/[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,24}/g;
  function email(s) {
    for(let v of s.match(emailRx)||[]) {
      v=v.replace(/^[.]+|[.]+$/g,'').toLowerCase();
      if(/\.(png|jpg|jpeg|gif|svg|webp|css|js|woff2?)$/i.test(v))continue;
      if(/@(example\.(com|org|net)|sentry\.io|wixpress\.com)$/.test(v)||/^(email|yourname|youremail)@/.test(v))continue;
      emails.add(v);
    }
  }
  function phone(s, trusted=false) {
    s=s.replace(/^tel:/i,'').split(/[?;]/)[0].trim();
    try{s=decodeURIComponent(s);}catch{}
    const digits=s.replace(/\D/g,'');
    if(digits.length<7||digits.length>15)return;
    if(!trusted && digits.length!==10 && !(digits.length===11&&digits[0]==='1') && !s.startsWith('+'))return;
    if(/^(\d)\1+$/.test(digits))return;
    if(![...phones].some(p=>p.replace(/\D/g,'')===digits))phones.add(s);
  }
  function collect() {
    let text=document.body?.innerText||'';
    text=text.replace(/\s*\[(?:at|AT)\]\s*/g,'@').replace(/\s*\[(?:dot|DOT)\]\s*/g,'.');
    email(text);
    // Social profiles are often icon-only links, images/SVG inside an anchor, or
    // button-like elements using data-href / onclick rather than an ordinary URL.
    // Return every usable HTTP URL here; the runner applies the strict Facebook
    // validation before following one.
    const addLink=(raw,label='',method='anchor',allowRelative=false)=>{
      if(!raw)return;
      const values=[String(raw).replace(/&amp;/gi,'&').split('\\').join('')];
      for(let i=0;i<values.length&&i<12;i++) {
        const value=values[i];
        // Script/meta text is not a URL. Parsing it as a relative URL created
        // enormous bogus URLs on Squarespace (`/Static = window.Static...`).
        const urlLike=/^(?:https?:)?\/\//i.test(value)||allowRelative;
        if(urlLike)try {const u=new URL(value,location.href);if(/^https?:$/.test(u.protocol)){links.set(u.href,label.slice(0,160));if(/(^|\.)(facebook\.com|fb\.com|fb\.me)$/i.test(u.hostname))facebookSignals.push({url:u.href,method,context:label.slice(0,160)});if(/(^|\.)(instagram\.com|instagr\.am)$/i.test(u.hostname))instagramSignals.push({url:u.href,method,context:label.slice(0,160)});}u.searchParams.forEach(v=>values.push(v));}catch{}
        for(const found of value.match(/(?:https?:\/\/|www\.)[^\s<>"'`]+/gi)||[]) {
          try {const u=new URL(/^www\./i.test(found)?'https://'+found:found);if(/^https?:$/.test(u.protocol)){links.set(u.href,label.slice(0,160));if(/(^|\.)(facebook\.com|fb\.com|fb\.me)$/i.test(u.hostname))facebookSignals.push({url:u.href,method,context:label.slice(0,160)});if(/(^|\.)(instagram\.com|instagr\.am)$/i.test(u.hostname))instagramSignals.push({url:u.href,method,context:label.slice(0,160)});}}catch{}
        }
      }
    };
    for(const a of document.querySelectorAll('a[href]')) {
      if(seenAnchors.has(a))continue;
      seenAnchors.add(a);
      const href=a.getAttribute('href')||'';
      if(/^mailto:/i.test(href)) {
        let v=href.slice(7).split('?')[0];try{v=decodeURIComponent(v);}catch{}
        email(v);
      } else if(/^tel:/i.test(href))phone(href,true);
      else {
        addLink(href,(a.innerText||a.getAttribute('aria-label')||a.getAttribute('title')||'').trim(),'anchor/icon',true);
      }
    }
    // These sources do not change during scrolling. Scan once only: repeatedly
    // parsing large Squarespace/GoDaddy framework payloads can exceed the script
    // execution timeout before the ordinary Facebook anchor is returned.
    if(!staticSourcesCollected) {
      staticSourcesCollected=true;
      for(const el of document.querySelectorAll('[data-href],[data-url],[data-link],[data-redirect-url],[data-original-url],[data-facebook],[onclick],meta[content]')) {
        if(seenData.has(el))continue;
        seenData.add(el);
        const label=(el.innerText||el.getAttribute('aria-label')||el.getAttribute('title')||'').trim();
        for(const attr of ['data-href','data-url','data-link','data-redirect-url','data-original-url','data-facebook','onclick','content'])addLink(el.getAttribute(attr),label,attr==='content'?'meta':'data/onclick');
        const parent=el.closest?.('a,[role="link"]');
        if(parent)for(const attr of ['href','data-href','data-url','data-link','onclick'])addLink(parent.getAttribute(attr),label,'icon/image parent link',true);
      }
      // Framework payloads and JSON-LD can contain a public profile URL without
      // a rendered anchor. Avoid parsing scripts which cannot contain Facebook.
      for(const script of document.querySelectorAll('script:not([src])')) {
        const text=script.textContent||'';
        if(/(?:facebook\.com|fb\.com|fb\.me|instagram\.com|instagr\.am)/i.test(text))addLink(text,'',script.type==='application/ld+json'?'JSON-LD':'inline script');
      }
    }
    for(const el of document.querySelectorAll('[data-cfemail]')) {
      if(seenCloudflare.has(el))continue;
      seenCloudflare.add(el);
      const hex=el.getAttribute('data-cfemail');
      if(!hex||!/^[a-f0-9]+$/i.test(hex)||hex.length%2)continue;
      const k=parseInt(hex.slice(0,2),16);let s='';
      for(let i=2;i<hex.length;i+=2)s+=String.fromCharCode(parseInt(hex.slice(i,i+2),16)^k);
      email(s);
    }
    const phonePattern=/(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)|\d{2,4})[ .-]\d{3,4}[ .-]\d{3,4}(?:[ .-]\d{1,4})?/g;
    for(const line of text.split('\n')) {
      if(/©|copyright|isbn|order number|tracking|registration|license/i.test(line))continue;
      for(const m of line.match(phonePattern)||[])phone(m);
    }
    for(const el of document.querySelectorAll('[itemprop="email"],[itemprop="telephone"]')) {
      if(seenProperties.has(el))continue;
      seenProperties.add(el);
      if(el.getAttribute('itemprop')==='email')email(el.getAttribute('content')||el.textContent||'');
      else phone(el.getAttribute('content')||el.textContent||'',true);
    }
    // Chỉ đọc contact của tổ chức trong JSON-LD; bỏ Review/Person phụ trong trang.
    function readLD(obj,depth=0) {
      if(!obj||typeof obj!=='object'||depth>8)return;
      if(Array.isArray(obj)){obj.slice(0,100).forEach(v=>readLD(v,depth+1));return;}
      const types=[].concat(obj['@type']||[]).join(' ');
      if(/Organization|LocalBusiness|Store|ProfessionalService|PetStore|ContactPoint/i.test(types)) {
        if(typeof obj.email==='string')email(obj.email);
        if(typeof obj.telephone==='string')phone(obj.telephone,true);
        for(const u of [].concat(obj.sameAs||[]))if(typeof u==='string')links.set(u,'');
        readLD(obj.contactPoint,depth+1);
      }
      readLD(obj['@graph'],depth+1);
    }
    for(const s of document.querySelectorAll('script[type="application/ld+json"]'))try{readLD(JSON.parse(s.textContent));}catch{}
  }
  collect();
  const viewportHeight=window.innerHeight||document.documentElement.clientHeight||1;
  if(document.documentElement.scrollHeight>viewportHeight*1.2) {
    window.scrollTo(0,Math.floor(document.documentElement.scrollHeight/(fastMode?2:2)));await delay(fastMode?300:200);collect();
    if(!fastMode){window.scrollTo(0,document.documentElement.scrollHeight);await delay(350);collect();}
  }
  if(!(document.body?.innerText||'').trim()&&!links.size&&!emails.size&&!phones.size)return {url:location.href,error:true,reason:'Trang trống hoặc chưa hiển thị được nội dung'};
  return {url:location.href,title,emails:[...emails].slice(0,50),phones:[...phones].slice(0,30),links:[...links].slice(0,2000).map(([url,text])=>({url,text})),facebookSignals:facebookSignals.slice(0,100),instagramSignals:instagramSignals.slice(0,100)};
}

export function scanFacebookID() {
  if(!/(^|\.)facebook\.com$/.test(location.hostname))return {id:'',method:'',candidates:[]};
  if(/\/(login|checkpoint|recover)(?:[/.]|$)/.test(location.pathname))return {id:'',method:'',candidates:[]};
  const currentUserId=document.cookie.match(/(?:^|;\s*)c_user=(\d+)/)?.[1]||'';
  const scripts=[...document.querySelectorAll('script')].map(s=>s.textContent||'');
  const isValid=id=>/^\d{5,}$/.test(id||'')&&id!==currentUserId;
  function direct(raw) {
    try {
      const u=new URL(raw,location.href);
      if(!/(^|\.)facebook\.com$/.test(u.hostname))return '';
      if(u.pathname==='/profile.php'&&isValid(u.searchParams.get('id')))return u.searchParams.get('id');
      const p=u.pathname.split('/').filter(Boolean);
      if(p.length===1&&isValid(p[0]))return p[0];
      if(['pages','people'].includes(p[0])&&isValid(p[2]))return p[2];
    }catch{}
    return '';
  }
  // Prefer page-owned metadata and script data. The address bar is only a
  // fallback below because redirects/profile URLs can be misleading.
  const vanity=location.pathname.split('/').filter(Boolean)[0]||'';
  const reserved=['home','watch','marketplace','gaming','groups','events','messages','login','login.php','profile.php','pages','people'];
  const vanityIDs=new Set();
  if(vanity&&!reserved.includes(vanity)) {
    const safe=vanity.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re=new RegExp('\\{[^{}]*"(?:vanity|url_vanity)"\\s*:\\s*"'+safe+'"[^{}]*\\}','gi');
    for(const text of scripts)for(const block of text.match(re)||[]) {
      const candidate=block.match(/"id"\s*:\s*"?(\d{5,})"?/)?.[1];
      if(isValid(candidate))vanityIDs.add(candidate);
    }
  }
  if(vanityIDs.size===1)return {id:[...vanityIDs][0],method:'ID trong đối tượng khớp tên trang',candidates:[]};
  const metaIDs=new Set();
  for(const selector of ['meta[property="og:url"]','link[rel="canonical"]']) {
    const el=document.querySelector(selector),raw=el?.content||el?.href||'';
    const v=direct(raw);if(v)metaIDs.add(v);
  }
  for(const el of document.querySelectorAll('meta[property="al:android:url"],meta[property="al:ios:url"]')) {
    const v=(el.content||'').match(/^fb:\/\/(?:page|profile)\/(\d{5,})(?:[/?]|$)/)?.[1];
    if(isValid(v))metaIDs.add(v);
  }
  if(metaIDs.size===1)return {id:[...metaIDs][0],method:'Metadata của trang',candidates:[]};
  // Kế thừa các trường ứng viên từ extension mẫu, không tự nhận ứng viên là ID đã xác minh.
  const candidates=new Set([...vanityIDs,...metaIDs]);
  for(const text of scripts)for(const m of text.matchAll(/"(?:pageID|delegate_page_id|entity_id|profile_id|userID)"\s*:\s*"?(\d{5,})"?/g)) {
    if(isValid(m[1]))candidates.add(m[1]);
  }
  const urlID=direct(location.href);
  if(urlID)return {id:urlID,method:'ID URL (dự phòng; không có metadata/script xác nhận)',candidates:[...candidates].slice(0,20)};
  return {id:'',method:'',candidates:[...candidates].slice(0,20)};
}
