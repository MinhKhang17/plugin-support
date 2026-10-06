const $=id=>document.getElementById(id);
let rows=[],busy=false,stop=false,scanTab=null;
const copy={vi:{language:'Ngôn ngữ',intro:'Lấy thông tin công khai từ hồ sơ và trang Facebook.',createList:'1. Tạo danh sách',listHelp:'Có thể lấy từ danh sách Following, hoặc dán trực tiếp các đường dẫn Facebook bên dưới. Danh sách thu được nên được kiểm tra trước khi chạy pha 2.',refresh:'Làm mới tab',capture:'Thu thập danh sách',scrolls:'Số lượt cuộn tối đa',scrollHelp:'Dừng sau 5 lượt không có mục mới. Chỉ lấy những mục Facebook hiển thị; không bảo đảm toàn bộ danh sách.',addUrls:'Thêm đường dẫn Facebook',urlPlaceholder:'Mỗi dòng một URL, ví dụ:\nhttps://www.facebook.com/example\nhttps://www.facebook.com/profile.php?id=123456789',import:'Nạp danh sách URL',chooseItems:'2. Chọn mục cần lấy thông tin',allProfiles:'Công cụ xử lý cả hồ sơ cá nhân lẫn trang Facebook; không kiểm tra hay yêu cầu xác nhận là doanh nghiệp.',filter:'Lọc tên hoặc liên kết',selectFiltered:'Chọn mục đang lọc',unselectAll:'Bỏ chọn tất cả',scanSelected:'Quét các mục đã chọn',stop:'Dừng',export:'Xuất CSV',clear:'Xóa dữ liệu',select:'Chọn',name:'Tên',website:'Website',address:'Địa chỉ',phone:'Điện thoại',progress:'Tiến độ',runHelp:'Giữ tab công cụ mở khi chạy. Kết quả được lưu trên máy sau mỗi trang; mở lại và bấm quét để tiếp tục các mục chưa hoàn tất. Mỗi lần mở trang cách nhau tối thiểu 15 giây.',footer:'CSV: Name,FacebookURL,FacebookID,Website,Address,Phone,Email. Không gửi dữ liệu đến máy chủ bên ngoài. Không tự nhấn Follow, gửi tin nhắn hoặc xử lý CAPTCHA.'},zh:{language:'语言',intro:'收集 Facebook 个人主页和公共主页的公开信息。',createList:'1. 创建列表',listHelp:'可从关注列表收集，或直接粘贴下方 Facebook 链接。建议在第二阶段前检查列表。',refresh:'刷新标签页',capture:'收集列表',scrolls:'最大滚动次数',scrollHelp:'连续 5 次没有新项目后停止。只读取可见的 Facebook 项目，不保证完整列表。',addUrls:'添加 Facebook 链接',urlPlaceholder:'每行一个 URL，例如：\nhttps://www.facebook.com/example\nhttps://www.facebook.com/profile.php?id=123456789',import:'导入 URL 列表',chooseItems:'2. 选择要获取信息的项目',allProfiles:'该工具可处理个人主页和 Facebook 公共主页；不会验证或要求确认是否为企业。',filter:'按名称或链接筛选',selectFiltered:'选择筛选结果',unselectAll:'取消全选',scanSelected:'扫描已选项目',stop:'停止',export:'导出 CSV',clear:'清除数据',select:'选择',name:'名称',website:'网站',address:'地址',phone:'电话',progress:'进度',runHelp:'运行时请保持工具标签页打开。每个页面处理后结果都会保存在本机；重新打开后可继续扫描未完成项目。每次打开页面至少间隔 15 秒。',footer:'CSV：Name、FacebookURL、FacebookID、Website、Address、Phone、Email。不会向外部服务器发送数据；不会自动关注、发送消息或处理验证码。'}};
function setLanguage(lang){const text=copy[lang]||copy.vi;document.documentElement.lang=lang==='zh'?'zh-CN':'vi';document.querySelectorAll('[data-i18n]').forEach(e=>e.textContent=text[e.dataset.i18n]||e.textContent);document.querySelectorAll('[data-i18n-placeholder]').forEach(e=>e.placeholder=text[e.dataset.i18nPlaceholder]||e.placeholder);chrome.storage.local.set({businessContactsLanguage:lang});}
const message=s=>$('status').textContent=s;
function updateUrlCount(){const count=$('urls').value.split(/[\r\n;]+/).map(x=>x.trim()).filter(Boolean).length;$('url-count').textContent=`${count} URL${count===1?'':'s'}`;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function pause(ms){const end=Date.now()+ms;while(!stop&&Date.now()<end)await sleep(Math.min(250,end-Date.now()));}
const save=()=>chrome.storage.local.set({businessContacts:rows});
const filtered=()=>rows.filter(r=>(r.Name+' '+r.FacebookURL+' '+r.FacebookID).toLowerCase().includes($('filter').value.toLowerCase()));
const labels={pending:'Chưa quét',scanning:'Đang quét',done:'Đã đọc thông tin',error:'Lỗi tải; có thể thử lại',blocked:'Bị chặn / cần đăng nhập'};
function render(){
  const frag=document.createDocumentFragment();
  for(const r of filtered()){
    const tr=document.createElement('tr'), td=document.createElement('td'), check=document.createElement('input');
    check.type='checkbox';check.checked=!!r.selected;check.disabled=busy;
    check.onchange=()=>{r.selected=check.checked;save();};td.append(check);tr.append(td);
    for(const key of ['Name','FacebookURL','FacebookID','Website','Address','Phone','Email']){
      const cell=document.createElement('td');
      if(key==='FacebookURL'){const a=document.createElement('a');a.href=r[key];a.textContent=r[key];a.target='_blank';a.rel='noopener noreferrer';cell.append(a);}
      else if(key==='Website'){for(const [index,url] of String(r[key]||'').split('; ').filter(Boolean).entries()){if(index)cell.append(document.createElement('br'));const a=document.createElement('a');a.href=url;a.textContent=url;a.target='_blank';a.rel='noopener noreferrer';cell.append(a);}}
      else cell.textContent=r[key]||'';
      tr.append(cell);
    }
    const state=document.createElement('td');state.textContent=labels[r.state]||r.state;state.title=r.error||'';tr.append(state);frag.append(tr);
  }
  $('rows').replaceChildren(frag);
}
function setBusy(value){busy=value;for(const id of ['capture','import','run','reset','select','unselect','refresh'])$(id).disabled=value;$('stop').disabled=!value;render();}
function addRows(found, selected=false){
  let added=0;
  for(const item of found){
    const FacebookURL=BC.canonical(item.FacebookURL||item);
    if(!FacebookURL||rows.some(x=>x.FacebookURL===FacebookURL))continue;
    rows.push({Name:item.Name||'',FacebookURL,FacebookID:'',Website:'',Address:'',Phone:'',Email:'',selected,state:'pending'});added++;
  }
  return added;
}
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
        added+=addRows([r]);
      }
      unchanged=added?0:unchanged+1;await save();render();message(`Đã lấy ${rows.length} liên kết. Lượt cuộn ${Math.min(i+1,limit)}/${limit}.`);
      if(unchanged>=5)break;await pause(1800);
    }
    message(`${stop?'Đã dừng':'Đã kết thúc thu thập'}: ${rows.length} liên kết. Hãy chọn các mục cần quét.`);
  }catch(e){message('Không đọc được tab nguồn: '+e.message);}finally{setBusy(false);}
}
async function waitLoaded(id){
  const deadline=Date.now()+45000;
  while(Date.now()<deadline&&!stop){const t=await chrome.tabs.get(id);if(t.status==='complete')return;await pause(500);}
  if(!stop)throw new Error('Trang chưa tải xong sau 45 giây.');
}
async function run(){
  const queue=rows.filter(r=>r.selected&&r.state!=='done');if(!queue.length)return message('Chọn mục chưa hoàn tất để bắt đầu.');
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
          if(result?.state!=='loading')break;
          if(attempt<2)await pause(2500);
        }
        if(stop){r.state='pending';break;}
        r.state=result?.state||'error';r.error='';
        if(r.state==='done')for(const k of ['Name','FacebookID','Website','Address','Phone','Email'])r[k]=result[k]|| (k==='Name'?r.Name:'');
        if(r.state==='blocked'){stop=true;message('Đã dừng vì Facebook yêu cầu đăng nhập hoặc giới hạn truy cập. Kiểm tra Facebook trước khi chạy tiếp.');}
      }catch(e){r.state='error';r.error=e.message;}
      finally{if(scanTab){await chrome.tabs.remove(scanTab.id).catch(()=>{});scanTab=null;}await save();render();}
      finished++;if(!stop&&finished<queue.length)await pause(Math.max(0,15000-(Date.now()-started)));
    }
    if(!rows.some(r=>r.state==='blocked')||!stop)message(`${stop?'Đã dừng':'Đã hoàn tất lượt quét'}. ${rows.filter(r=>r.state==='done').length} mục có kết quả.`);
  }finally{await save();setBusy(false);}
}
$('refresh').onclick=()=>refreshTabs().catch(e=>message(e.message));
$('capture').onclick=()=>capture().catch(e=>{message(e.message);setBusy(false);});
$('import').onclick=async()=>{
  const raw=$('urls').value.trim();
  if(!raw)return message('Dán ít nhất một đường dẫn Facebook.');
  const values=raw.split(/[\r\n;]+/).map(x=>x.trim()).filter(Boolean);
  const added=addRows(values,true), invalid=values.filter(x=>!BC.canonical(x)).length;
  await save();render();
  $('urls').value='';
  updateUrlCount();
  message(`Đã nạp ${added} liên kết mới${invalid?`; bỏ qua ${invalid} URL Facebook không hợp lệ`:''}.`);
};
$('urls').addEventListener('input',updateUrlCount);
$('run').onclick=()=>run().catch(e=>{message(e.message);setBusy(false);});
$('stop').onclick=()=>{stop=true;message('Đang dừng và lưu kết quả…');};
$('filter').oninput=render;
$('select').onclick=async()=>{filtered().forEach(r=>r.selected=true);await save();render();};
$('unselect').onclick=async()=>{rows.forEach(r=>r.selected=false);await save();render();};
$('reset').onclick=async()=>{if(confirm('Xóa danh sách và kết quả đã lưu trên máy?')){rows=[];await save();render();message('Đã xóa dữ liệu.');}};
$('export').onclick=()=>{
  const ready=rows.filter(r=>r.state==='done');if(!ready.length)return message('Chưa có mục hoàn tất để xuất.');
  const url=URL.createObjectURL(new Blob([BC.csv(ready)],{type:'text/csv;charset=utf-8;'}));
  const a=document.createElement('a');a.href=url;a.download=`facebook_contacts_${new Date().toISOString().replace(/[:.]/g,'-')}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
};
(async()=>{const saved=await chrome.storage.local.get(['businessContacts','businessContactsLanguage']);rows=saved.businessContacts||[];rows.forEach(r=>{if(r.state==='scanning'||r.state==='unverified')r.state='pending';if(!('FacebookID' in r))r.FacebookID='';if(!('Website' in r))r.Website='';});$('language').value=saved.businessContactsLanguage||'vi';$('language').onchange=e=>setLanguage(e.target.value);setLanguage($('language').value);updateUrlCount();await save();render();await refreshTabs();})().catch(e=>message(e.message));
