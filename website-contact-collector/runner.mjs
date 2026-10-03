import {normalizeURL,recoveryURLs,uniq,primaryEmail,facebookURL,numericFacebookID,instagramURL} from './core.mjs';
import {scanPage,scanFacebookID} from './extract.mjs';

export class Paused extends Error {}
export class Blocked extends Error {}
export const emptyResult=record=>({SourceRow:record.row,Name:record.name,Area:record.area,Website:record.original,
  ResolvedURL:'',Email:'',Gmail:'',Phone:'',AllEmails:'',AllPhones:'',FacebookURL:'',FacebookID:'',FacebookIDStatus:'',
  FacebookIDCandidates:'',FacebookSource:'',FacebookMethod:'',FacebookSearchStatus:'',InstagramURL:'',InstagramSource:'',InstagramSearchStatus:'',EmailSource:'',PhoneSource:'',Status:'Chờ xử lý',Notes:''});
export const headers=Object.keys(emptyResult({row:0,name:'',area:'',original:''}));

export class Runner {
  constructor(onChange) {this.onChange=onChange;this.running=false;this.tabId=null;this.controller=null;this.state=null;this.workers=[];this.saveCounter=0;}
  async load() {
    const {contactJob}=await chrome.storage.local.get('contactJob');
    this.state=contactJob||{records:[],results:[],index:0,partial:null,activeUrls:[],visitedUrls:[],manualEdits:{},settings:{delay:1,timeout:30,maxContact:3,maxFacebookPages:12,parallel:3,active:true,pauseOnBlock:true,fastMode:false,forceFacebookID:false,socialSearch:'facebook'},status:'Sẵn sàng',log:[]};
    this.state.settings={delay:1,timeout:30,maxContact:3,maxFacebookPages:12,parallel:3,active:true,pauseOnBlock:true,fastMode:false,forceFacebookID:false,socialSearch:'facebook',...this.state.settings};
    this.state.activeUrls=[];
    this.state.visitedUrls=this.state.visitedUrls||[];
    this.state.manualEdits=this.state.manualEdits||{};
    if(this.state.status==='Đang chạy')this.state.status='Đã tạm dừng — nhấn Tiếp tục';
    this.onChange(this.state);return this.state;
  }
  async save(force=false) {
    this.onChange(this.state);
    if(this.running&&!force&&++this.saveCounter%5!==0)return;
    await chrome.storage.local.set({contactJob:this.state});
    if(force)this.saveCounter=0;
  }
  // Progress is represented by the active URLs and counters; do not retain a
  // navigation log, which made the dashboard unnecessarily tall and noisy.
  log(text) {}
  trackVisited(url) {
    if(!url||this.state.visitedUrls.includes(url))return;
    this.state.visitedUrls.push(url);
    this.onChange(this.state);
  }
  applyManual(index,result) {return this.state.manualEdits?.[index]?{...result,...this.state.manualEdits[index]}:result;}
  async saveManualEdit(index,values) {
    if(!Number.isInteger(index)||!this.state.records[index])throw new Error('Dòng cần chỉnh sửa không hợp lệ.');
    if(!this.state.results[index])throw new Error('Chỉ có thể sửa dòng đã hoàn thành.');
    this.state.manualEdits[index]={...values};
    if(this.state.results[index])this.state.results[index]=this.applyManual(index,this.state.results[index]);
    await this.save();
  }
  check() {if(this.controller?.signal.aborted)throw new Paused('Đã tạm dừng');}
  async bounded(promise,ms=15000) {
    this.check();const signal=this.controller?.signal;
    return new Promise((resolve,reject)=>{
      const finish=(fn,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);fn(value);};
      const abort=()=>finish(reject,new Paused('Đã tạm dừng'));
      const timer=setTimeout(()=>finish(reject,new Error('Quá thời gian chờ')),ms);
      signal?.addEventListener('abort',abort,{once:true});
      promise.then(v=>finish(resolve,v),e=>finish(reject,e));
    });
  }
  async wait(ms) {await this.bounded(new Promise(r=>setTimeout(r,ms)),ms+1000);}
  async setJob(records,settings) {
    if(this.running)throw new Error('Hãy tạm dừng trước khi nhập danh sách mới.');
    this.state={records,results:[],index:0,partial:null,activeUrls:[],visitedUrls:[],manualEdits:{},settings,status:'Sẵn sàng',log:[]};await this.save();
  }
  async pause() {
    this.controller?.abort();
    if(this.tabId!==null)try{await chrome.tabs.update(this.tabId,{url:'about:blank'});}catch{}
    await Promise.all(this.workers.map(async worker=>{if(worker.tabId!==null)try{await chrome.tabs.update(worker.tabId,{url:'about:blank'});}catch{}}));
  }
  async reset() {
    if(this.running)throw new Error('Hãy tạm dừng trước khi đặt lại dữ liệu.');
    this.state.results=[];this.state.index=0;this.state.partial=null;this.state.activeUrls=[];this.state.visitedUrls=[];this.state.manualEdits={};
    this.state.status='Sẵn sàng';this.state.log=[];await this.save();
  }
  makeWorker() {
    const worker=new Runner(()=>{});
    // Workers have independent tabs and temporary state. Only the parent writes
    // completed rows to storage, preventing concurrent checkpoint writes.
    worker.state={settings:{...this.state.settings,active:this.state.settings.parallel===1&&this.state.settings.active},partial:null,log:[]};
    worker.controller=this.controller;
    worker.save=async()=>{};
    worker.log=text=>this.log(text);
    worker.onNavigate=url=>{
      worker.currentURL=url;
      this.state.activeUrls=this.workers.map(w=>w.currentURL).filter(Boolean);
      this.onChange(this.state);
    };
    worker.onVisit=url=>this.trackVisited(url);
    return worker;
  }
  async navigate(url) {
    this.check();
    this.onVisit?.(url);
    this.onNavigate?.(url);
    if(this.tabId===null) {
      const tab=await this.bounded(chrome.tabs.create({url:'about:blank',active:this.state.settings.active}));
      this.tabId=tab.id;
    }
    try {await this.bounded(chrome.tabs.get(this.tabId));}catch(e){if(e instanceof Paused)throw e;this.tabId=null;throw new Paused('Tab thu thập đã đóng. Nhấn Tiếp tục để tạo tab mới.');}
    await this.bounded(chrome.tabs.update(this.tabId,{url,active:this.state.settings.active}));
    const timeout=this.state.settings.fastMode?Math.min(5,Math.max(3,Number(this.state.settings.timeout)||5)):this.state.settings.timeout;
    const deadline=Date.now()+timeout*1000;
    while(Date.now()<deadline) {
      this.check();await this.wait(150);
      let tab;try{tab=await this.bounded(chrome.tabs.get(this.tabId));}catch(e){if(e instanceof Paused)throw e;this.tabId=null;throw new Paused('Tab thu thập đã đóng.');}
      if(tab.status==='complete' && tab.url && tab.url!=='about:blank') {
        await this.wait(250);return tab.url;
      }
    }
    throw new Error('Trang tải quá '+timeout+' giây');
  }
  async inject(func,args=[]) {
    const data=await this.bounded(chrome.scripting.executeScript({target:{tabId:this.tabId},func,args}),18000);
    this.check();
    if(!data[0]?.result)throw new Error('Không đọc được nội dung trang');
    return data[0].result;
  }
  async visit(url) {
    await this.navigate(url);
    const result=await this.inject(scanPage,[Boolean(this.state.settings.fastMode)]);
    if(result.blocked)throw new Blocked(result.reason+' · '+result.url);
    if(result.error)throw new Error(result.reason);
    return result;
  }
  async process(record) {
    const result=emptyResult(record);this.state.partial=result;
    if(!record.url) {result.Status=record.original?'URL không hợp lệ':'Không có website';return result;}
    let emails=[],phones=[],emailSources=new Map(),phoneSources=new Map(),fbLinks=[],instagramLinks=[],contacts=[],facebookPages=[];
    const fbEvidence=new Map(),instagramEvidence=new Map();
    let successfulPages=0;
    const notes=[];
    const pageDelay=()=>this.state.settings.parallel>1?Math.min(Number(this.state.settings.delay)||0,0.25):Number(this.state.settings.delay)||0;
    const fastMode=Boolean(this.state.settings.fastMode);
    const socialSearch=['facebook','instagram','both'].includes(this.state.settings.socialSearch)?this.state.settings.socialSearch:'facebook';
    const wantsFacebook=socialSearch==='facebook'||socialSearch==='both';
    const wantsInstagram=socialSearch==='instagram'||socialSearch==='both';
    const hasContactData=()=>emails.length>0&&phones.length>0;
    const hostOf=url=>{try{return new URL(url).hostname.replace(/^www\./,'');}catch{return '';}};
    const checkpoint=async()=>{
      result.Email=primaryEmail(emails,result.ResolvedURL||record.url);
      result.Gmail=emails.find(e=>/@gmail\.com$/i.test(e))||'';
      result.Phone=phones[0]||'';
      result.AllEmails=emails.join('; ');result.AllPhones=phones.join('; ');
      result.EmailSource=emailSources.get(result.Email)||'';result.PhoneSource=phoneSources.get(result.Phone)||'';
      result.Notes=notes.join(' | ');result.Status='Đang xử lý';
      this.state.partial=result;await this.save();this.check();
    };
    const merge=async page=>{
      successfulPages++;
      for(const e of page.emails||[]) {if(!emailSources.has(e))emailSources.set(e,page.url);emails.push(e);}
      for(const p of page.phones||[]) {if(!phoneSources.has(p))phoneSources.set(p,page.url);phones.push(p);}
      emails=uniq(emails);phones=uniq(phones);
      for(const link of page.links||[]) {
        const fb=facebookURL(link.url);if(fb)fbLinks.push(fb);
        const instagram=instagramURL(link.url);if(instagram)instagramLinks.push(instagram);
        if(hostOf(link.url)===hostOf(page.url) && /contact|about|lien.he|liên hệ|gioi.thieu|giới thiệu|impressum|kontakt/i.test(link.text+' '+link.url)) {
          const url=normalizeURL(link.url);if(url)contacts.push(url);
        }
        if(hostOf(link.url)===hostOf(page.url) && /contact|about|team|company|our[-_ ]?story|social|connect|links|resources|gioi.thieu|giới thiệu|lien.he|liên hệ|impressum|kontakt/i.test(link.text+' '+link.url)) {
          const url=normalizeURL(link.url);if(url)facebookPages.push(url);
        }
      }
      for(const signal of page.facebookSignals||[]) {
        const fb=facebookURL(signal.url);if(!fb)continue;
        fbLinks.push(fb);
        if(!fbEvidence.has(fb))fbEvidence.set(fb,{source:page.url,method:signal.method||'link'});
      }
      for(const signal of page.instagramSignals||[]) {
        const instagram=instagramURL(signal.url);if(!instagram)continue;
        instagramLinks.push(instagram);
        if(!instagramEvidence.has(instagram))instagramEvidence.set(instagram,{source:page.url,method:signal.method||'link'});
      }
      fbLinks=uniq(fbLinks);instagramLinks=uniq(instagramLinks);contacts=uniq(contacts);facebookPages=uniq(facebookPages);
      await checkpoint();
    };
    const attempt=async url=>{
      this.log('Mở '+url);
      try {const page=await this.visit(url);return page;}
      catch(e) {
        if(e instanceof Paused)throw e;
        notes.push(url+' → '+e.message);
        await checkpoint();
        if(e instanceof Blocked && this.state.settings.pauseOnBlock)throw e;
        return null;
      }
    };
    try {
      const directFB=facebookURL(record.url);
      const directInstagram=instagramURL(record.url);
      const visited=new Set();
      if(directFB) {fbLinks=[directFB];result.FacebookSearchStatus='URL Facebook được nhập trực tiếp';}
      if(directInstagram) {instagramLinks=[directInstagram];result.InstagramSearchStatus='URL Instagram được nhập trực tiếp';}
      if(!directFB&&!directInstagram) {
        let page=null;
        for(const url of recoveryURLs(record.url).slice(0,fastMode?2:4)) {
          this.check();visited.add(url);page=await attempt(url);
          if(page){result.ResolvedURL=page.url;await merge(page);break;}
          await this.wait(pageDelay()*1000);
        }
        if(page&&!hasContactData()) {
          const root=new URL('/',page.url).href;
          // Trang gốc cũng được đọc khi URL đầu vào là /contact-us/ nhưng còn thiếu liên hệ.
          if(!emails.length||!phones.length) {
            if(!visited.has(root)&&root!==page.url) {
            await this.wait(pageDelay()*1000);visited.add(root);
            const home=await attempt(root);if(home)await merge(home);
            }
          }
          if(!fastMode&&!hasContactData()) {
            contacts=uniq(contacts).sort((a,b)=>(/contact|kontakt|lien.he/i.test(b)?1:0)-(/contact|kontakt|lien.he/i.test(a)?1:0));
            let count=0;
            for(const contact of contacts) {
              if(count>=Math.min(this.state.settings.maxContact,3)||hasContactData())break;
              if(visited.has(contact))continue;
              visited.add(contact);count++;
              await this.wait(pageDelay()*1000);
              const p=await attempt(contact);if(p)await merge(p);
            }
          }
        }
      }
      // Facebook discovery is deliberately independent of contact completeness.
      // Scan relevant internal pages even after email + phone are already found.
      if(wantsFacebook&&!fastMode&&!directFB&&!hasContactData()&&!fbLinks.length) {
        let checked=0;
        for(const candidate of facebookPages) {
          if(checked>=this.state.settings.maxFacebookPages||visited.has(candidate))continue;
          visited.add(candidate);checked++;
          await this.wait(pageDelay()*1000);
          const p=await attempt(candidate);if(p)await merge(p);
          if(fbLinks.length)break;
        }
        result.FacebookSearchStatus=fbLinks.length?'Tìm thấy sau khi quét '+checked+' trang nội bộ':'Không tìm thấy sau khi quét '+checked+' trang nội bộ công khai';
      } else if(wantsFacebook&&!fastMode&&!directFB&&fbLinks.length) {
        result.FacebookSearchStatus='Tìm thấy link Facebook trên trang đã truy cập';
      } else if(fastMode) {
        result.FacebookSearchStatus='Bỏ qua do Fast mode';
      }
      if(wantsFacebook&&!fastMode&&fbLinks.length&&(!hasContactData()||this.state.settings.forceFacebookID)) {
        result.FacebookURL=fbLinks[0];
        const evidence=fbEvidence.get(fbLinks[0]);
        result.FacebookSource=evidence?.source||result.ResolvedURL||record.url;
        result.FacebookMethod=evidence?.method||'URL đầu vào / link chuẩn';
      }
      // Tiếp tục Facebook nếu còn thiếu một trong hai trường email / điện thoại.
      if(wantsFacebook&&!fastMode&&fbLinks.length&&(!hasContactData()||this.state.settings.forceFacebookID)) {
        const visitedFB=[],ids=[],idMethods=[],candidateIDs=[];
        for(const fb of fbLinks.slice(0,2)) {
          visitedFB.push(fb);result.FacebookURL=visitedFB.join('; ');
          const direct=numericFacebookID(fb);
          let pageID='',method='',candidates=[],canonical=fb;
          const fbPages=[fb];
          for(const section of ['about','about_contact_and_basic_info']) {
            const u=new URL(fb);
            if(u.pathname==='/profile.php')u.searchParams.set('sk',section);
            else u.pathname=u.pathname.replace(/\/$/,'')+'/'+section+'/';
            fbPages.push(u.href);
          }
          for(const fbPage of fbPages) {
            await this.wait(pageDelay()*1000);
            const p=await attempt(fbPage);
            if(!p)continue;
            canonical=facebookURL(p.url)||canonical;
            if(!result.ResolvedURL)result.ResolvedURL=p.url;
            await merge(p);
            // Always inspect the page's own metadata/script payload first.
            // `scanFacebookID` only falls back to the loaded URL when the page
            // itself provides no verifiable ID signal.
            const found=await this.inject(scanFacebookID);
            if(!pageID&&found.id){pageID=found.id;method=found.method||'';}
            candidates=uniq([...candidates,...(found.candidates||[])]);
            if(emails.length&&phones.length)break;
          }
          // Chỉ xác nhận ứng viên nếu chuyển hướng khớp chính xác trang Facebook nguồn.
          if(!pageID && canonical && !numericFacebookID(canonical)) {
            for(const id of candidates.slice(0,2)) {
              await this.wait(pageDelay()*1000);
              let resolved;
              try {resolved=await this.navigate('https://www.facebook.com/profile.php?id='+id);}
              catch(e){if(e instanceof Paused)throw e;continue;}
              if(facebookURL(resolved)===canonical) {
                pageID=id;method='Chuyển hướng khớp chính xác URL trang';break;
                }
              }
            }
          // URL numeric ID remains a final fallback only after page inspection
          // and candidate verification failed.
          if(!pageID&&direct){pageID=direct;method='ID URL Facebook (dự phòng)';}
          if(pageID){ids.push(pageID);idMethods.push(method);}
          candidateIDs.push(...candidates);
          result.FacebookID=uniq(ids).join('; ');
          result.FacebookIDStatus=uniq(idMethods).join('; ')||'Chưa xác minh được ID';
          result.FacebookIDCandidates=uniq(candidateIDs).filter(id=>!ids.includes(id)).join('; ');
          await checkpoint();
          if(emails.length&&phones.length)break;
        }
      }
      // Instagram profile pages often put public email/phone in the bio. Unlike
      // Facebook they have no reliable public "About" URL, so scan each profile once.
      if(wantsInstagram&&!fastMode&&instagramLinks.length&&!hasContactData()) {
        const visitedInstagram=[];
        for(const instagram of instagramLinks.slice(0,2)) {
          visitedInstagram.push(instagram);result.InstagramURL=visitedInstagram.join('; ');
          const evidence=instagramEvidence.get(instagram);
          if(!result.InstagramSource)result.InstagramSource=evidence?.source||result.ResolvedURL||record.url;
          await this.wait(pageDelay()*1000);
          const p=await attempt(instagram);if(p)await merge(p);
          if(hasContactData())break;
        }
        result.InstagramSearchStatus='Đã quét '+visitedInstagram.length+' hồ sơ Instagram công khai';
      } else if(wantsInstagram&&!fastMode&&instagramLinks.length) {
        result.InstagramURL=instagramLinks[0];
        const evidence=instagramEvidence.get(instagramLinks[0]);
        result.InstagramSource=evidence?.source||result.ResolvedURL||record.url;
        result.InstagramSearchStatus='Tìm thấy link Instagram trên trang đã truy cập';
      } else if(wantsInstagram&&fastMode) {
        result.InstagramSearchStatus='Bỏ qua do Fast mode';
      }
      await checkpoint();
      result.Status=emails.length&&phones.length?'Có email và điện thoại':emails.length?'Chỉ tìm thấy email':phones.length?'Chỉ tìm thấy điện thoại':result.FacebookID?'Chỉ tìm thấy Facebook ID':successfulPages?'Chưa tìm thấy liên hệ':'Không truy cập được';
      return result;
    } catch(e) {
      result.Status=e instanceof Blocked?'Cần xử lý thủ công':e instanceof Paused?'Đã tạm dừng':'Lỗi';
      result.Notes=uniq([...notes,e.message]).join(' | ');this.state.partial=result;
      await this.save();throw e;
    }
  }
  async start() {
    if(this.running)return;
    if(!this.state.records.length)throw new Error('Chưa có danh sách website.');
    this.running=true;this.controller=new AbortController();this.state.status='Đang chạy';
    this.onNavigate=url=>{this.state.activeUrls=[url];this.onChange(this.state);};
    this.onVisit=url=>this.trackVisited(url);
    try {
      await this.save(true);
      const cache=new Map();
      for(let i=0;i<this.state.index;i++) {
        const r=this.state.results[i];if(r && this.state.records[i].url && !/lỗi|không truy cập|thủ công|bỏ qua|tạm dừng/i.test(r.Status))cache.set(this.state.records[i].url,r);
      }
      const limit=Math.max(1,Math.min(12,Number(this.state.settings.parallel)||1));
      const rowDelay=()=>limit>1?Math.min(Number(this.state.settings.delay)||0,0.25):Number(this.state.settings.delay)||0;
      const domainActive=new Map(),domainLimit=3;
      const domainOf=url=>{try{return new URL(url).hostname.replace(/^www\./,'').toLowerCase();}catch{return '';}};
      const acquireDomain=async domain=>{
        if(!domain)return;
        while((domainActive.get(domain)||0)>=domainLimit){this.check();await this.wait(100);}
        domainActive.set(domain,(domainActive.get(domain)||0)+1);
      };
      const releaseDomain=domain=>{if(!domain)return;const active=(domainActive.get(domain)||1)-1;if(active)domainActive.set(domain,active);else domainActive.delete(domain);};
      let cursor=this.state.index;
      const finish=async(i,result)=>{
        this.state.results[i]=result;this.state.partial=null;
        while(this.state.index<this.state.records.length&&this.state.results[this.state.index])this.state.index++;
        this.log('Xong '+this.state.index+'/'+this.state.records.length+' · '+result.Status);
        await this.save();
      };
      const take=()=>cursor<this.state.records.length?cursor++:-1;
      const runOne=async()=>{
        const worker=limit===1?this:this.makeWorker();
        if(worker!==this)this.workers.push(worker);
        try {
          for(;;) {
            this.check();const i=take();if(i<0)return;
            const record=this.state.records[i];let result;
            const cached=record.url&&cache.has(record.url),domain=cached?'':domainOf(record.url);
            await acquireDomain(domain);
            try {
              if(cached) {
                result={...cache.get(record.url),SourceRow:record.row,Name:record.name,Area:record.area,Website:record.original};
                result.Notes=(result.Notes?result.Notes+' | ':'')+'Dùng lại kết quả URL trùng trong danh sách';
              } else {
                try {result=await worker.process(record);}
                catch(e) {
                  if(e instanceof Paused||e instanceof Blocked)throw e;
                  result=worker.state.partial||emptyResult(record);result.Status='Lỗi';result.Notes=e.message;
                }
                result=this.applyManual(i,result);
                if(record.url&&!/lỗi|không truy cập|thủ công/i.test(result.Status))cache.set(record.url,result);
              }
            } finally {
              releaseDomain(domain);
            }
            await finish(i,result);
            if(cursor<this.state.records.length)await this.wait(rowDelay()*1000);
          }
        } finally {
          if(worker!==this) {
            this.workers=this.workers.filter(w=>w!==worker);
            this.state.activeUrls=this.workers.map(w=>w.currentURL).filter(Boolean);
            if(worker.tabId!==null)try{await chrome.tabs.remove(worker.tabId);}catch{}
          }
        }
      };
      await Promise.all(Array.from({length:Math.min(limit,this.state.records.length-this.state.index)},runOne));
      this.state.status='Hoàn tất';
    }catch(e){
      // A block/CAPTCHA in any parallel tab stops the whole pool immediately.
      if(e instanceof Blocked)this.controller?.abort();
      this.state.status=e instanceof Blocked?'Cần xử lý thủ công':e instanceof Paused?'Đã tạm dừng':'Lỗi lưu hoặc xử lý';
      this.log(e.message);
    }finally{
      this.running=false;this.state.activeUrls=[];this.onNavigate=null;this.onVisit=null;await this.save(true);
      // Giữ nguyên tab xác minh để người dùng có thể xử lý thủ công.
      if(this.state.status==='Hoàn tất'&&this.tabId!==null){try{await chrome.tabs.remove(this.tabId);}catch{}this.tabId=null;}
    }
  }
  async skip() {
    if(this.running)throw new Error('Hãy tạm dừng trước khi bỏ qua.');
    if(this.state.index>=this.state.records.length)return;
    const r=this.state.partial||emptyResult(this.state.records[this.state.index]);
    r.Status='Đã bỏ qua';this.state.results[this.state.index]=r;this.state.index++;this.state.partial=null;
    this.state.status=this.state.index===this.state.records.length?'Hoàn tất':'Đã tạm dừng';await this.save();
  }
  exportRows() {return this.state.records.map((r,i)=>this.state.results[i]||(i===this.state.index&&this.state.partial)||emptyResult(r));}
}
