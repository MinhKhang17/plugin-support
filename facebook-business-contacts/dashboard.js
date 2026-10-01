const $=id=>document.getElementById(id);
let rows=[],busy=false,stop=false,scanTab=null;
const message=s=>$('status').textContent=s;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function pause(ms){const end=Date.now()+ms;while(!stop&&Date.now()<end)await sleep(Math.min(250,end-Date.now()));}
const save=()=>chrome.storage.local.set({businessContacts:rows});
const filtered=()=>rows.filter(r=>(r.Name+' '+r.FacebookURL).toLowerCase().includes($('filter').value.toLowerCase()));
const labels={pending:'Chưa quét',scanning:'Đang quét',done:'Đã đọc thông tin',unverified:'Chưa xác minh là doanh nghiệp',error:'Lỗi tải; có thể thử lại',blocked:'Bị chặn / cần đăng nhập'};
function render(){
  const frag=document.createDocumentFragment();
  for(const r of filtered()){
    const tr=document.createElement('tr'), td=document.createElement('td'), check=document.createElement('input');
    check.type='checkbox';check.checked=!!r.selected;check.disabled=busy;
    check.onchange=()=>{r.selected=check.checked;save();};td.append(check);tr.append(td);
    for(const key of ['Name','FacebookURL','Address','Phone','Email']){
      const cell=document.createElement('td');
      if(key==='FacebookURL'){const a=document.createElement('a');a.href=r[key];a.textContent=r[key];a.target='_blank';a.rel='noopener noreferrer';cell.append(a);}
      else cell.textContent=r[key]||'';
      tr.append(cell);
    }
    const state=document.createElement('td');state.textContent=labels[r.state]||r.state;state.title=r.error||'';tr.append(state);frag.append(tr);
  }
  $('rows').replaceChildren(frag);
}
function setBusy(value){busy=value;for(const id of ['capture','run','reset','select','unselect','refresh'])$(id).disabled=value;$('stop').disabled=!value;render();}
async function refreshTabs(){
  const tabs=await chrome.tabs.query({url:'https://www.facebook.com/*'}),selected=$('source').value||new URL(location.href).searchParams.get('source');
  $('source').replaceChildren();
  for(const t of tabs){const o=document.createElement('option');o.value=t.id;o.textContent=t.title||t.url;$('source').append(o);}
  if(tabs.some(t=>String(t.id)===selected))$('source').value=selected;
}
async function inject(tabId){await chrome.scripting.executeScript({target:{tabId},files:['shared.js','content.js']});}
async function call(tabId,method,arg){
  const result=await chrome.scripting.executeScript({target:{tabId},func:(m,a)=>globalThis.BusinessCollector[m](a),args:[method,arg??null]});
  return result[0]?.result;
}
async function capture(){
  const tabId=Number($('source').value);if(!tabId)return message('Hãy mở tab Facebook Following rồi bấm Làm mới tab.');
  const tab=await chrome.tabs.get(tabId);
  if(!/[?&]sk=following\b|\/following\b/.test(tab.url||''))return message('Hãy chuyển tab nguồn sang danh sách Following / Đang theo dõi trước khi thu thập.');
  stop=false;setBusy(true);
  try{
    await inject(tabId);let unchanged=0;
    const limit=Math.max(1,Math.min(300,Number($('scrolls').value)||40));
    for(let i=0;i<=limit&&!stop;i++){
      const found=await call(tabId,'collect',i<limit);let added=0;
      for(const r of found||[]){
        if(r.FacebookURL===BC.canonical(tab.url))continue;
        const old=rows.find(x=>x.FacebookURL===r.FacebookURL);
        if(!old){rows.push({...r,Address:'',Phone:'',Email:'',selected:false,state:'pending'});added++;}
      }
      unchanged=added?0:unchanged+1;await save();render();message(`Đã lấy ${rows.length} liên kết. Lượt cuộn ${Math.min(i+1,limit)}/${limit}.`);
      if(unchanged>=5)break;await pause(1800);
    }
    message(`${stop?'Đã dừng':'Đã kết thúc thu thập'}: ${rows.length} liên kết. Hãy chọn các fanpage doanh nghiệp cần quét.`);
  }catch(e){message('Không đọc được tab nguồn: '+e.message);}finally{setBusy(false);}
}
async function waitLoaded(id){
  const deadline=Date.now()+45000;
  while(Date.now()<deadline&&!stop){const t=await chrome.tabs.get(id);if(t.status==='complete')return;await pause(500);}
  if(!stop)throw new Error('Trang chưa tải xong sau 45 giây.');
}
async function run(){
  const queue=rows.filter(r=>r.selected&&r.state!=='done');if(!queue.length)return message('Chọn fanpage chưa hoàn tất để bắt đầu.');
  stop=false;setBusy(true);let finished=0;
  try{
    for(const r of queue){
      if(stop)break;const started=Date.now();r.state='scanning';render();await save();
      message(`Đang đọc ${finished+1}/${queue.length}: ${r.Name}`);
      try{
        const url=new URL(r.FacebookURL);url.searchParams.set('sk','about_contact_and_basic_info');
        scanTab=await chrome.tabs.create({url:url.href,active:false});await waitLoaded(scanTab.id);await pause(6000);
        if(stop){r.state='pending';break;}
        await inject(scanTab.id);let result;
        for(let attempt=0;attempt<3&&!stop;attempt++){
          result=await call(scanTab.id,'extract');
          if(result?.state!=='unverified')break;
          if(attempt<2)await pause(2500);
        }
        if(stop){r.state='pending';break;}
        r.state=result?.state||'error';r.error='';
        if(r.state==='done')for(const k of ['Name','Address','Phone','Email'])r[k]=result[k]|| (k==='Name'?r.Name:'');
        if(r.state==='blocked'){stop=true;message('Đã dừng vì Facebook yêu cầu đăng nhập hoặc giới hạn truy cập. Kiểm tra Facebook trước khi chạy tiếp.');}
      }catch(e){r.state='error';r.error=e.message;}
      finally{if(scanTab){await chrome.tabs.remove(scanTab.id).catch(()=>{});scanTab=null;}await save();render();}
      finished++;if(!stop&&finished<queue.length)await pause(Math.max(0,15000-(Date.now()-started)));
    }
    if(!rows.some(r=>r.state==='blocked')||!stop)message(`${stop?'Đã dừng':'Đã hoàn tất lượt quét'}. ${rows.filter(r=>r.state==='done').length} fanpage có kết quả. Các mục chưa xác minh không được xuất CSV.`);
  }finally{await save();setBusy(false);}
}
$('refresh').onclick=()=>refreshTabs().catch(e=>message(e.message));
$('capture').onclick=()=>capture().catch(e=>{message(e.message);setBusy(false);});
$('run').onclick=()=>run().catch(e=>{message(e.message);setBusy(false);});
$('stop').onclick=()=>{stop=true;message('Đang dừng và lưu kết quả…');};
$('filter').oninput=render;
$('select').onclick=async()=>{filtered().forEach(r=>r.selected=true);await save();render();};
$('unselect').onclick=async()=>{rows.forEach(r=>r.selected=false);await save();render();};
$('reset').onclick=async()=>{if(confirm('Xóa danh sách và kết quả đã lưu trên máy?')){rows=[];await save();render();message('Đã xóa dữ liệu.');}};
$('export').onclick=()=>{
  const ready=rows.filter(r=>r.state==='done');if(!ready.length)return message('Chưa có fanpage doanh nghiệp được xác minh để xuất.');
  const url=URL.createObjectURL(new Blob([BC.csv(ready)],{type:'text/csv;charset=utf-8;'}));
  const a=document.createElement('a');a.href=url;a.download=`facebook_business_contacts_${new Date().toISOString().replace(/[:.]/g,'-')}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
};
(async()=>{rows=(await chrome.storage.local.get('businessContacts')).businessContacts||[];rows.forEach(r=>{if(r.state==='scanning')r.state='pending';});await save();render();await refreshTabs();})().catch(e=>message(e.message));
