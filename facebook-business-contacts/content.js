(() => {
  const visible=e=>!!(e.getClientRects().length && getComputedStyle(e).visibility!=='hidden');
  const root=()=>[...document.querySelectorAll('[role="dialog"]')].filter(visible).at(-1)||document.querySelector('[role="main"]')||document.body;
  const uniq=a=>[...new Set(a.filter(Boolean))];
  globalThis.BusinessCollector = {
    collect(scroll) {
      const box=root(), rows=[];
      for(const a of box.querySelectorAll('a[href]')) {
        if(!visible(a)||a.closest('[role="article"]')) continue;
        const url=BC.canonical(a.href), name=(a.innerText||a.getAttribute('aria-label')||'').trim();
        if(!url||!name||name.length>160||/^(follow|following|followers|like|message|see all|theo dõi|đang theo dõi|nhắn tin|xem tất cả)$/i.test(name)) continue;
        rows.push({Name:name,FacebookURL:url});
      }
      if(scroll){
        const containers=[box,...box.querySelectorAll('div')].filter(e=>e.scrollHeight>e.clientHeight+120 && /auto|scroll/.test(getComputedStyle(e).overflowY));
        const target=containers.sort((a,b)=>b.clientHeight-a.clientHeight)[0];
        if(target)target.scrollBy(0,Math.max(400,target.clientHeight*.8)); else window.scrollBy(0,Math.max(500,innerHeight*.8));
      }
      return rows;
    },
    extract() {
      const box=root();
      // Read only visible content, excluding posts and site navigation.
      const lines=(box.innerText||'').split('\n').map(x=>x.trim()).filter(Boolean);
      const text=lines.join('\n');
      if(document.querySelector('input[type="password"]')||/\/checkpoint|\/login/.test(location.pathname)||/temporarily blocked|try again later|tạm thời bị chặn|bạn tạm thời bị chặn/i.test(text)) return {state:'blocked'};
      const category=lines.find(x=>/^(Page|Trang)\s*[·•:—–-]/i.test(x));
      const business=/breeder|kennel|pet service|pet store|pet supplies|animal shelter|business|company|store|shop|restaurant|hotel|service|retail|product|farm|clinic|real estate|agency|contractor|veterinarian|nhân giống|trại chó|cửa hàng|doanh nghiệp|công ty|dịch vụ|nhà hàng|khách sạn|trang trại|phòng khám/i;
      if(!category || !business.test(category))return {state:'unverified'};
      // Only About/Intro contact blocks, never feed articles or comments.
      const nodes=[...box.querySelectorAll('a[href]')].filter(a=>visible(a)&&!a.closest('[role="article"], [role="navigation"]'));
      const contactLines=[];
      const walker=document.createTreeWalker(box,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){
        const n=walker.currentNode, e=n.parentElement;
        if(e&&visible(e)&&!e.closest('[role="article"], [role="navigation"],script,style'))contactLines.push(n.textContent.trim());
      }
      const contactText=contactLines.join('\n');
      const emails=uniq([...contactText.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map(m=>m[0].toLowerCase()));
      for(const a of nodes.filter(a=>a.href.startsWith('mailto:')))emails.push(a.href.slice(7).split('?')[0]);
      let phones=nodes.filter(a=>a.href.startsWith('tel:')).map(a=>decodeURIComponent(a.href.slice(4)));
      // Whole-line phone matches avoid dates, Facebook IDs and unrelated numeric text.
      for(const line of contactLines){
        const v=line.replace(/^(phone|mobile|telephone|điện thoại|di động)\s*:?\s*/i,'').trim();
        if(/^\+?[\d() .-]+$/.test(v)&&/[+() .-]/.test(v)&&v.replace(/\D/g,'').length>=10&&v.replace(/\D/g,'').length<=15)phones.push(v);
      }
      const seen=new Set(); phones=phones.filter(p=>{let k=p.replace(/\D/g,'');if(k.length===11&&k[0]==='1')k=k.slice(1);if(seen.has(k))return false;seen.add(k);return true;});
      const addresses=[];
      for(let i=0;i<contactLines.length;i++){
        if(/^(address|địa chỉ)$/i.test(contactLines[i])){
          const next=contactLines[i+1]||'';
          if(next.length>5&&!/^(contact|phone|email|website|thông tin|điện thoại|trang web)/i.test(next))addresses.push(next);
          const prev=contactLines[i-1]||'';
          if(/\d/.test(prev)&&/,/.test(prev)&&!/@/.test(prev))addresses.push(prev);
        }
      }
      for(const a of nodes){
        let href=a.href;try{const u=new URL(href);if(u.hostname==='l.facebook.com')href=u.searchParams.get('u')||'';}catch{}
        if(/(?:google\.[^/]+\/maps|maps\.google\.|bing\.com\/maps)/i.test(href)){
          const label=a.innerText.trim();if(label&&!/^(get directions|directions|chỉ đường)$/i.test(label))addresses.push(label);
        }
      }
      return {state:'done',Name:box.querySelector('h1')?.innerText.trim()||'',Address:uniq(addresses).join('; '),Phone:uniq(phones).join('; '),Email:uniq(emails).join('; ')};
    }
  };
})();
