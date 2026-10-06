globalThis.BC = {
  canonical(value) {
    try {
      const u = new URL(value, 'https://www.facebook.com');
      if (!['www.facebook.com','facebook.com','m.facebook.com'].includes(u.hostname)) return '';
      const p = u.pathname.replace(/\/+$/, '');
      if (p === '/profile.php' && /^\d+$/.test(u.searchParams.get('id') || '')) return `https://www.facebook.com/profile.php?id=${u.searchParams.get('id')}`;
      if (!/^\/[\w.-]+$/.test(p)) return '';
      if (/^\/(home\.php|friends|groups|watch|marketplace|reel|reels|stories|notifications|messages|settings|login|checkpoint|help|privacy|policies|gaming|photo|photos|search|pages|share|sharer\.php|recover|bookmarks|events|profile\.php)$/i.test(p)) return '';
      return `https://www.facebook.com${p}`;
    } catch {return '';}
  },
  csv(rows) {
    const keys=['Name','FacebookURL','FacebookID','Website','Address','Phone','Email'];
    const cell=v=>{let s=String(v??''); if (/^[\s]*[=+@-]/.test(s)) s="'"+s; return '"'+s.replace(/"/g,'""')+'"';};
    return '\uFEFF'+[keys.join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n');
  }
};
