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
  let address={street:'',city:'',state:'',zip:'',country:''};
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
        if(urlLike)try {const u=new URL(value,location.href);if(/^https?:$/.test(u.protocol)){links.set(u.href,label.slice(0,160));if(/(^|\\.)(facebook\.com|fb\.com|fb\.me)$/i.test(u.hostname))facebookSignals.push({url:u.href,method,context:label.slice(0,160)});if(/(^|\\.)(instagram\.com|instagr\.am)$/i.test(u.hostname))instagramSignals.push({url:u.href,method,context:label.slice(0,160)});}u.searchParams.forEach(v=>values.push(v));}catch{}
        for(const found of value.match(/(?:https?:\/\/|www\.)[^\s<>"'`]+/gi)||[]) {
          try {const u=new URL(/^www\./i.test(found)?'https://'+found:found);if(/^https?:$/.test(u.protocol)){links.set(u.href,label.slice(0,160));if(/(^|\\.)(facebook\.com|fb\.com|fb\.me)$/i.test(u.hostname))facebookSignals.push({url:u.href,method,context:label.slice(0,160)});if(/(^|\\.)(instagram\.com|instagr\.am)$/i.test(u.hostname))instagramSignals.push({url:u.href,method,context:label.slice(0,160)});}}catch{}
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
    const US_STATES={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia',PR:'Puerto Rico',VI:'Virgin Islands'};
    const CA_PROVINCES={AB:'Alberta',BC:'British Columbia',MB:'Manitoba',NB:'New Brunswick',NL:'Newfoundland',NS:'Nova Scotia',NT:'Northwest Territories',NU:'Nunavut',ON:'Ontario',PE:'Prince Edward Island',QC:'Quebec',SK:'Saskatchewan',YT:'Yukon'};
    const STATE_MAP=new Map();
    for(const [code,name] of Object.entries(US_STATES)){
      STATE_MAP.set(code.toLowerCase(),{code,country:'US'});
      STATE_MAP.set(name.toLowerCase(),{code,country:'US'});
    }
    for(const [code,name] of Object.entries(CA_PROVINCES)){
      STATE_MAP.set(code.toLowerCase(),{code,country:'CA'});
      STATE_MAP.set(name.toLowerCase(),{code,country:'CA'});
    }
    function lookupState(str){
      if(!str||typeof str!=='string')return null;
      return STATE_MAP.get(str.trim().toLowerCase())||null;
    }
    function normalizeAddressObj({street='',city='',state='',zip='',country=''}={}){
      let s=String(street||'').trim().replace(/^[,\s;.-]+|[,\s;.-]+$/g,'');
      let c=String(city||'').trim().replace(/^[,\s;.-]+|[,\s;.-]+$/g,'');
      let r=String(state||'').trim();
      let z=String(zip||'').trim();
      let co=String(country||'').trim();
      if(/^(?:united states|usa|u\.s\.a\.?|u\.s\.?)$/i.test(co))co='US';
      if(/^(?:canada)$/i.test(co))co='CA';
      const stInfo=lookupState(r);
      if(stInfo){
        r=stInfo.code;
        if(!co)co=stInfo.country;
      }
      const zipMatch=z.match(/\b\d{5}(?:-\d{4})?\b/)||z.match(/\b[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d\b/);
      if(zipMatch)z=zipMatch[0].toUpperCase();
      s=s.replace(/^(?:(?:physical\s+|mailing\s+)?address|location|visit us(?:\s+at|\s+in)?|our address)\s*[:–-]\s*/i,'').trim();
      c=c.replace(/^(?:city of|located in|serving|in|at)\s+/i,'').trim();
      if(/^\d{1,5}\s+[A-Za-z]/i.test(c)&&!s){s=c;c='';}
      if(s.length>120)s=s.slice(0,120).trim();
      if(c.length>50)c=c.slice(0,50).trim();
      return {street:s,city:c,state:r,zip:z,country:co};
    }
    function parseAddressText(raw){
      if(!raw||typeof raw!=='string')return null;
      let text=raw.replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
      if(text.length<4||text.length>260)return null;
      if(/©|copyright|all rights reserved|isbn|tracking number|order #|terms of|privacy policy/i.test(text))return null;
      text=text.replace(/^(?:(?:physical\s+|mailing\s+)?address|location|visit us(?:\s+at|\s+in)?|we are located(?:\s+at|\s+in)?|our location|find us(?:\s+at|\s+in)?|office|headquarters|facility|kennel location)\s*[:–-]\s*/i,'');
      let country='';
      const countryMatch=text.match(/(?:,\s*|\s+)(USA|United States|U\.S\.A\.?|U\.S\.?|Canada)\s*$/i);
      if(countryMatch){
        country=/Canada/i.test(countryMatch[1])?'CA':'US';
        text=text.slice(0,countryMatch.index).trim();
      }
      text=text.replace(/\s*[,|•·;]\s*(?:phone|tel|call|email|fax|hours|mon|tue|wed|thu|fri|sat|sun|\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}).*$/i,'').trim();

      const stateZipRx=/(?:,\s*|\s+)([A-Za-z]{2}|[A-Za-z\s]{4,25})\s+(\d{5}(?:-\d{4})?|[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d)\s*$/i;
      const m=text.match(stateZipRx);
      if(m){
        const stInfo=lookupState(m[1]);
        if(stInfo){
          const state=stInfo.code;
          const zip=m[2].trim().toUpperCase();
          if(!country)country=stInfo.country;
          const before=text.slice(0,m.index).trim().replace(/,\s*$/,'');
          if(before){
            const parts=before.split(',').map(p=>p.trim()).filter(Boolean);
            if(parts.length>=2){
              const city=parts[parts.length-1];
              const street=parts.slice(0,-1).join(', ');
              return normalizeAddressObj({street,city,state,zip,country});
            } else if(parts.length===1){
              const streetSuffixRx=/^(.*?\b(?:street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|way|court|ct|circle|cir|trail|trl|parkway|pkwy|place|pl|highway|hwy|loop|box\s+\d+)\.?)\s+([A-Za-z][A-Za-z\s.'-]{1,40})$/i;
              const splitMatch=parts[0].match(streetSuffixRx);
              if(splitMatch){
                return normalizeAddressObj({street:splitMatch[1],city:splitMatch[2],state,zip,country});
              }
              if(/^\d{1,5}\s+[A-Za-z]/i.test(parts[0])){
                return normalizeAddressObj({street:parts[0],city:'',state,zip,country});
              }
              return normalizeAddressObj({street:'',city:parts[0],state,zip,country});
            }
          }
          return normalizeAddressObj({street:'',city:'',state,zip,country});
        }
      }

      const stateOnlyRx=/(?:,\s*|\s+)([A-Za-z]{2}|[A-Za-z\s]{4,25})\s*$/i;
      const m2=text.match(stateOnlyRx);
      if(m2){
        const stInfo=lookupState(m2[1]);
        const isStrictState=m2[1].length>2||m2[1]===m2[1].toUpperCase();
        if(stInfo&&isStrictState){
          const state=stInfo.code;
          if(!country)country=stInfo.country;
          const before=text.slice(0,m2.index).trim().replace(/,\s*$/,'');
          if(before){
            const parts=before.split(',').map(p=>p.trim()).filter(Boolean);
            if(parts.length>=2){
              const city=parts[parts.length-1];
              const street=parts.slice(0,-1).join(', ');
              return normalizeAddressObj({street,city,state,zip:'',country});
            } else if(parts.length===1){
              if(!/^\d{1,5}\s+[A-Za-z]/i.test(parts[0])){
                return normalizeAddressObj({street:'',city:parts[0],state,zip:'',country});
              }
            }
          }
        }
      }
      return null;
    }
    function isStreetCandidate(line){
      if(!line||typeof line!=='string')return false;
      const l=line.trim();
      if(l.length<3||l.length>90)return false;
      if(/@|http|www\.|©|copyright|phone|call us|email|mon|tue|wed|thu|fri|sat|sun/i.test(l))return false;
      if(/^\d{1,6}[A-Za-z]?\s+[A-Za-z0-9#]/i.test(l))return true;
      if(/^(?:p\.?o\.?\s*box|box\s+\d+|rural\s+route|rr\s+\d+)/i.test(l))return true;
      if(/\b(?:street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|way|court|ct|circle|cir|trail|trl|parkway|pkwy|place|pl|highway|hwy|route|rte|expressway|expy|loop|terrace|ter)\.?/i.test(l))return true;
      if(/\b(?:suite|ste|apt|apartment|unit|bldg|building|floor|fl|room|rm|lot)\b\s*[#A-Za-z0-9]/i.test(l))return true;
      return false;
    }
    function scanTextForAddress(text){
      if(!text||typeof text!=='string')return;
      const rawLines=text.split(/\r?\n/).map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
      for(let i=0;i<rawLines.length&&i<500;i++){
        const line=rawLines[i];
        if(line.length>250||line.length<4)continue;
        if(/©|copyright|all rights reserved|terms|privacy/i.test(line))continue;
        const parsed=parseAddressText(line);
        if(parsed){
          if(!parsed.street&&i>0){
            const prev=rawLines[i-1];
            if(isStreetCandidate(prev)){
              if(i>1&&/\b(?:suite|ste|apt|unit|bldg|floor)\b/i.test(prev)&&isStreetCandidate(rawLines[i-2])){
                parsed.street=rawLines[i-2]+', '+prev;
              } else {
                parsed.street=prev;
              }
            }
          }
          mergeAddress(parsed);
          if(address.street&&address.city&&address.state&&address.zip)break;
        }
      }
    }
    function extractMapsAddress(raw){
      if(!raw||typeof raw!=='string')return null;
      try {
        const u=new URL(raw,location.href);
        if(!/(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.apple\.com)/i.test(u.hostname+u.pathname))return null;
        let query=u.searchParams.get('q')||u.searchParams.get('query')||u.searchParams.get('daddr')||u.searchParams.get('destination')||u.searchParams.get('address')||'';
        if(!query&&u.pathname.includes('/place/')){
          const match=u.pathname.match(/\/place\/([^/]+)/);
          if(match)query=decodeURIComponent(match[1].replace(/\+/g,' '));
        }
        if(!query&&u.searchParams.get('pb')){
          const pb=decodeURIComponent(u.searchParams.get('pb'));
          const pbMatch=pb.match(/!2s([^!]+)/);
          if(pbMatch&&pbMatch[1].length>5&&!pbMatch[1].startsWith('0x')){
            query=pbMatch[1].replace(/\+/g,' ');
          }
        }
        if(query){
          query=query.replace(/\+/g,' ').trim();
          if(/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(query))return null;
          return parseAddressText(query);
        }
      }catch{}
      return null;
    }
    function mergeAddress(a) {
      if(!a)return;
      const norm=normalizeAddressObj(a);
      if(norm.street&&!address.street)address.street=norm.street;
      if(norm.city&&!address.city)address.city=norm.city;
      if(norm.state&&!address.state)address.state=norm.state;
      if(norm.zip&&!address.zip)address.zip=norm.zip;
      if(norm.country&&!address.country)address.country=norm.country;
    }
    // Chỉ đọc contact của tổ chức trong JSON-LD; bỏ Review/Person phụ trong trang.
    function readLD(obj,depth=0) {
      if(!obj||typeof obj!=='object'||depth>8)return;
      if(Array.isArray(obj)){obj.slice(0,100).forEach(v=>readLD(v,depth+1));return;}
      const types=[].concat(obj['@type']||[]).join(' ');
      if(/Organization|LocalBusiness|Store|ProfessionalService|PetStore|ContactPoint|Place|AnimalShelter|VeterinaryCare/i.test(types)) {
        if(typeof obj.email==='string')email(obj.email);
        if(typeof obj.telephone==='string')phone(obj.telephone,true);
        for(const u of [].concat(obj.sameAs||[]))if(typeof u==='string')links.set(u,'');
        readLD(obj.contactPoint,depth+1);
      }
      if(obj.address||obj.location||/PostalAddress/i.test(types)||obj.streetAddress||obj.addressLocality) {
        readAddressLD(obj.address||obj.location||obj);
      }
      readLD(obj['@graph'],depth+1);
      for(const k of Object.keys(obj)){
        if(obj[k]&&typeof obj[k]==='object'&&!['@graph','address','location'].includes(k)&&depth<3){
          readLD(obj[k],depth+1);
        }
      }
    }
    function readAddressLD(a,depth=0) {
      if(!a||depth>4)return;
      if(Array.isArray(a)){a.forEach(v=>readAddressLD(v,depth+1));return;}
      if(typeof a==='string'){mergeAddress(parseAddressText(a));return;}
      if(typeof a==='object'){
        const s=typeof a.streetAddress==='string'?a.streetAddress.trim():(Array.isArray(a.streetAddress)?a.streetAddress.join(', ').trim():'');
        const c=typeof a.addressLocality==='string'?a.addressLocality.trim():'';
        const r=typeof a.addressRegion==='string'?a.addressRegion.trim():'';
        const z=typeof a.postalCode==='string'?a.postalCode.trim():(typeof a.postalCode==='number'?String(a.postalCode):'');
        const co=typeof a.addressCountry==='string'?a.addressCountry.trim():(a.addressCountry?.name||a.addressCountry?.['@id']||'');
        if(s||c||r||z){
          mergeAddress(normalizeAddressObj({street:s,city:c,state:r,zip:z,country:co}));
        }
        if(a.address)readAddressLD(a.address,depth+1);
      }
    }
    for(const s of document.querySelectorAll('script[type="application/ld+json"]'))try{readLD(JSON.parse(s.textContent));}catch{}
    // Đọc địa chỉ từ microdata itemprop="address" và các thuộc tính con
    for(const el of document.querySelectorAll('[itemprop="address"]')) {
      const s=el.querySelector?.('[itemprop="streetAddress"]')?.getAttribute('content')||el.querySelector?.('[itemprop="streetAddress"]')?.textContent||'';
      const c=el.querySelector?.('[itemprop="addressLocality"]')?.getAttribute('content')||el.querySelector?.('[itemprop="addressLocality"]')?.textContent||'';
      const r=el.querySelector?.('[itemprop="addressRegion"]')?.getAttribute('content')||el.querySelector?.('[itemprop="addressRegion"]')?.textContent||'';
      const z=el.querySelector?.('[itemprop="postalCode"]')?.getAttribute('content')||el.querySelector?.('[itemprop="postalCode"]')?.textContent||'';
      const co=el.querySelector?.('[itemprop="addressCountry"]')?.getAttribute('content')||el.querySelector?.('[itemprop="addressCountry"]')?.textContent||'';
      if(s||c||r||z)mergeAddress({street:s.trim(),city:c.trim(),state:r.trim(),zip:z.trim(),country:co.trim()});
      else {
        const t=(el.getAttribute('content')||el.innerText||el.textContent||'').trim();
        if(t)scanTextForAddress(t);
      }
    }
    const sa=document.querySelector('[itemprop="streetAddress"]');
    const al=document.querySelector('[itemprop="addressLocality"]');
    const ar=document.querySelector('[itemprop="addressRegion"]');
    const pc=document.querySelector('[itemprop="postalCode"]');
    if(sa||al||ar||pc){
      const s=sa?.getAttribute('content')||sa?.textContent||'';
      const c=al?.getAttribute('content')||al?.textContent||'';
      const r=ar?.getAttribute('content')||ar?.textContent||'';
      const z=pc?.getAttribute('content')||pc?.textContent||'';
      if(s||c||r||z)mergeAddress({street:s.trim(),city:c.trim(),state:r.trim(),zip:z.trim(),country:''});
    }
    // Đọc địa chỉ từ thẻ semantic <address>
    for(const el of document.querySelectorAll('address')){
      const t=(el.innerText||el.textContent||'').trim();
      if(t)scanTextForAddress(t);
    }
    // Đọc địa chỉ từ data-* attributes (data-city, data-state, data-zip, data-address, ...)
    for(const el of document.querySelectorAll('[data-address],[data-city],[data-state],[data-zip],[data-postal-code],[data-postalcode],[data-region]')) {
      const s=el.getAttribute('data-address')||el.getAttribute('data-street')||'';
      const c=el.getAttribute('data-city')||'';
      const r=el.getAttribute('data-state')||el.getAttribute('data-region')||'';
      const z=el.getAttribute('data-zip')||el.getAttribute('data-postal-code')||el.getAttribute('data-postalcode')||'';
      const co=el.getAttribute('data-country')||'';
      if(s||c||r||z)mergeAddress({street:String(s).trim(),city:String(c).trim(),state:String(r).trim(),zip:String(z).trim(),country:String(co).trim()});
    }
    // Đọc địa chỉ từ link bản đồ Google Maps / Apple Maps và iframe
    for(const a of document.querySelectorAll('a[href*="maps.google."],a[href*="google.com/maps"],a[href*="maps.apple.com"]')) {
      const m=extractMapsAddress(a.getAttribute('href')||'');
      if(m)mergeAddress(m);
    }
    for(const iframe of document.querySelectorAll('iframe[src*="google.com/maps"],iframe[src*="maps.google."]')) {
      const m=extractMapsAddress(iframe.getAttribute('src')||'');
      if(m)mergeAddress(m);
    }
    // Khối địa chỉ footer / container
    for(const el of document.querySelectorAll('footer,[class*="footer" i],[class*="address" i],[id*="address" i],[class*="location" i],[id*="location" i]')) {
      const t=(el.innerText||'').trim();
      if(t&&t.length<1000)scanTextForAddress(t);
    }
    // Quét văn bản hiển thị toàn trang nếu còn thiếu trường địa chỉ
    if(!address.street||!address.city||!address.state||!address.zip) {
      scanTextForAddress(document.body?.innerText||'');
    }
  }
  collect();
  const viewportHeight=window.innerHeight||document.documentElement.clientHeight||1;
  if(document.documentElement.scrollHeight>viewportHeight*1.2) {
    window.scrollTo(0,Math.floor(document.documentElement.scrollHeight/(fastMode?2:2)));await delay(fastMode?300:200);collect();
    if(!fastMode){window.scrollTo(0,document.documentElement.scrollHeight);await delay(350);collect();}
  }
  if(!(document.body?.innerText||'').trim()&&!links.size&&!emails.size&&!phones.size&&!address.street&&!address.city)return {url:location.href,error:true,reason:'Trang trống hoặc chưa hiển thị được nội dung'};
  return {url:location.href,title,emails:[...emails].slice(0,50),phones:[...phones].slice(0,30),links:[...links].slice(0,2000).map(([url,text])=>({url,text})),facebookSignals:facebookSignals.slice(0,100),instagramSignals:instagramSignals.slice(0,100),address:{...address}};
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
