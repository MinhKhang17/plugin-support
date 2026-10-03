export const uniq = values => [...new Set(values.filter(Boolean))];
export function normalizeURL(input) {
  let s = String(input || '').trim().replace(/^['"]|['"]$/g, '');
  if (!s || /^(?:javascript|data|file|chrome|mailto|tel):/i.test(s)) return '';
  if (s.startsWith('//')) s = 'https:' + s;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  try {
    let u = new URL(s);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return '';
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return '';
    if (/(^|\.)google\.com$/.test(u.hostname) && u.pathname === '/url') {
      const target = u.searchParams.get('q') || u.searchParams.get('url');
      if (target && /^https?:\/\//i.test(target)) u = new URL(target);
    }
    if (u.username || u.password) return '';
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|msclkid$)/i.test(key)) u.searchParams.delete(key);
    }
    return u.href;
  } catch {return '';}
}
export function recoveryURLs(input) {
  const clean = normalizeURL(input);
  if (!clean) return [];
  const u = new URL(clean), noQuery = new URL(clean);
  noQuery.search = '';
  const root = new URL('/', u);
  const alt = new URL(root);
  if (alt.hostname.startsWith('www.')) alt.hostname = alt.hostname.slice(4);
  else if (alt.hostname.split('.').length === 2) alt.hostname = 'www.' + alt.hostname;
  return uniq([clean, noQuery.href, root.href, alt.href]);
}
export function parseCSV(text, delimiter) {
  text = text.replace(/^\uFEFF/, '');
  if (!delimiter) {
    let quoted = false, counts = {',':0, ';':0, '\t':0};
    for (let i=0;i<text.length;i++) {
      const ch = text[i];
      if (ch === '"') {if (quoted && text[i+1] === '"') i++; else quoted = !quoted;}
      else if (!quoted && /[\r\n]/.test(ch)) break;
      else if (!quoted && ch in counts) counts[ch]++;
    }
    delimiter = Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
  }
  const rows=[]; let row=[], cell='', quoted=false;
  for (let i=0;i<text.length;i++) {
    const ch=text[i];
    if (ch==='"') {
      if (quoted && text[i+1]==='"') {cell+='"';i++;}
      else if (quoted || cell==='') quoted=!quoted;
      else cell+=ch;
    } else if (!quoted && ch===delimiter) {row.push(cell);cell='';}
    else if (!quoted && (ch==='\r'||ch==='\n')) {
      row.push(cell);if(row.some(v=>v.trim())) rows.push(row);row=[];cell='';
      if(ch==='\r' && text[i+1]==='\n') i++;
    } else cell+=ch;
  }
  if(quoted) throw new Error('CSV có dấu nháy chưa đóng. Hãy kiểm tra file.');
  row.push(cell);if(row.some(v=>v.trim())) rows.push(row);
  return rows;
}
export function detectWebsiteColumn(header) {
  const aliases=['website','websiteurl','web','url','linkweb','linkwebsite','trangweb','websitegoc','官网'];
  return header.findIndex(h=>aliases.includes(h.toLowerCase().replace(/[\s_\-]/g,'')));
}
export function makeRecords(table, column, hasHeader=true) {
  const header=hasHeader?table[0]:[];
  const nameCol=header.findIndex(x=>/^(name|tên|商家名称)$/i.test(x.trim()));
  const areaCol=header.findIndex(x=>/^(area|khu vực)$/i.test(x.trim()));
  return table.slice(hasHeader?1:0).map((r,i)=>({
    row:i+(hasHeader?2:1), name:r[nameCol]||'', area:r[areaCol]||'',
    original:(r[column]||'').trim(), url:normalizeURL(r[column])
  }));
}
export function csvString(rows, headers) {
  const escape=value=>{
    let s=String(value??'');
    // Ngăn Excel thực thi công thức từ nội dung website. Số điện thoại + vẫn là văn bản.
    if (/^[\s]*[=+@-]/.test(s)) s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  };
  return '\uFEFF'+[headers,...rows.map(r=>headers.map(k=>r[k]??''))].map(r=>r.map(escape).join(',')).join('\r\n')+'\r\n';
}
export function primaryEmail(emails, url) {
  let host='';try{host=new URL(url).hostname.replace(/^www\./,'');}catch{}
  const score=e=>(e.toLowerCase().endsWith('@'+host)?100:0)+(/@gmail\.com$/i.test(e)?40:0)+(/^(info|contact|hello|office|sales|enquiries)@/i.test(e)?10:0)-(/^(noreply|no-reply|privacy|abuse)@/i.test(e)?100:0);
  return [...emails].sort((a,b)=>score(b)-score(a))[0]||'';
}
export function facebookURL(raw) {
  try {
    let u = new URL(raw);
    if (!/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(u.hostname)) return '';
    if(/(^|\.)fb\.me$/.test(u.hostname)) u=new URL('https://www.facebook.com/'+u.pathname.replace(/^\//,''));
    if (u.pathname==='/l.php') return '';
    u.hostname='www.facebook.com';u.protocol='https:';u.hash='';
    const parts=u.pathname.split('/').filter(Boolean);
    if (!parts.length || /^(sharer(?:\.php)?|share(?:\.php)?|dialog|plugins|login(?:\.php)?|recover|help|privacy|policies|watch|reel|groups|events|photo(?:\.php)?|story\.php|permalink\.php)$/i.test(parts[0])) return '';
    if(parts[0]==='profile.php') {
      const id=u.searchParams.get('id');if(!/^\d{5,}$/.test(id||''))return '';
      u.search='';u.searchParams.set('id',id);
    } else {
      // Bỏ URL bài đăng nhưng giữ phần nhận diện trang.
      if(parts[0]==='pages'||parts[0]==='people') u.pathname='/'+parts.slice(0,3).join('/')+'/';
      else u.pathname='/'+parts[0]+'/';
      u.search='';
    }
    return u.href;
  }catch{return '';}
}
export function numericFacebookID(raw) {
  const clean=facebookURL(raw);if(!clean)return '';
  const u=new URL(clean);
  if(u.pathname==='/profile.php')return u.searchParams.get('id')||'';
  const parts=u.pathname.split('/').filter(Boolean);
  if(parts.length===1 && /^\d{5,}$/.test(parts[0]))return parts[0];
  if(['people','pages'].includes(parts[0]) && /^\d{5,}$/.test(parts[2]||''))return parts[2];
  return '';
}
export function instagramURL(raw) {
  try {
    const u=new URL(raw);
    if(!/(^|\.)(instagram\.com|instagr\.am)$/.test(u.hostname))return '';
    const part=u.pathname.split('/').filter(Boolean)[0]||'';
    if(!part||/^(accounts|explore|p|reel|reels|stories|direct|about|developer|legal|privacy|terms)$/i.test(part))return '';
    u.hostname='www.instagram.com';u.protocol='https:';u.pathname='/'+part+'/';u.search='';u.hash='';
    return u.href;
  }catch{return '';}
}
