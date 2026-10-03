import {parseCSV,detectWebsiteColumn,makeRecords,csvString,normalizeURL} from './core.mjs';
import {Runner,headers,emptyResult} from './runner.mjs';
const $=id=>document.getElementById(id);
let loadedTable=null,hasHeader=true,ownsLock=false,renderedVisited=[],editingRow=null,renderTimer=0,pendingState=null;
const runner=new Runner(render);
function message(text) {$('message').textContent=text;$('message').hidden=!text;}
function render(s) {
  pendingState=s;
  if(renderTimer)return;
  renderTimer=setTimeout(()=>{renderTimer=0;const state=pendingState;pendingState=null;renderNow(state);},100);
}
function renderNow(s) {
  $('status').textContent=s.status;$('counter').textContent=s.index+' / '+s.records.length;
  $('progress').max=Math.max(1,s.records.length);$('progress').value=s.index;
  $('emailCount').textContent=s.results.filter(r=>r?.Email).length;
  $('phoneCount').textContent=s.results.filter(r=>r?.Phone).length;
  $('fbCount').textContent=s.results.filter(r=>r?.FacebookID).length;
  $('instagramCount').textContent=s.results.filter(r=>r?.InstagramURL).length;
  const completed=s.results.filter(Boolean),processed=completed.length,total=s.records.length;
  const emailFound=completed.filter(r=>r.Email).length,phoneFound=completed.filter(r=>r.Phone).length,fbFound=completed.filter(r=>r.FacebookID).length,instagramFound=completed.filter(r=>r.InstagramURL).length;
  const anyData=completed.filter(r=>r.Email||r.Phone||r.FacebookID||r.InstagramURL).length;
  const rate=value=>processed?Math.round(value*100/processed)+'%':'0%';
  $('summaryTotal').textContent=String(total);
  $('summaryProcessed').textContent=processed+' / '+total;
  $('summaryEmailRate').textContent=rate(emailFound);
  $('summaryPhoneRate').textContent=rate(phoneFound);
  $('summaryFacebookRate').textContent=rate(fbFound);
  $('summaryInstagramRate').textContent=rate(instagramFound);
  $('summaryDataRate').textContent=rate(anyData);
  $('summaryAverage').textContent=processed?((emailFound+phoneFound+fbFound+instagramFound)/processed).toFixed(2):'0';
  const active=s.activeUrls||[];
  $('current').textContent=active.length?'Đang xử lý đồng thời '+active.length+' web':s.records[s.index]?'Sẵn sàng xử lý dòng tiếp theo':'';
  const visited=s.visitedUrls||[];
  $('visitedCount').textContent=visited.length+' link';
  // URLs only append during a run, so avoid rebuilding thousands of DOM nodes
  // every time the progress counter changes.
  if(visited.length<renderedVisited.length||visited.some((url,i)=>url!==renderedVisited[i])) {renderedVisited=[];$('visitedLinks').replaceChildren();}
  for(let i=renderedVisited.length;i<visited.length;i++){const url=visited[i],a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.textContent=url;$('visitedLinks').append(a);}
  renderedVisited=[...visited];
  $('start').disabled=runner.running||!s.records.length||s.index>=s.records.length||!ownsLock;
  $('pause').disabled=!runner.running;
  $('skip').disabled=runner.running||s.index>=s.records.length||!ownsLock;
  $('reset').disabled=runner.running||!s.records.length||!ownsLock;
  $('export').disabled=!s.records.length;
  for(const id of ['file','importFile','importText','delay','timeout','maxContact','maxFacebookPages','parallel','socialSearch','fastMode','forceFacebookID','active','pauseOnBlock'])$(id).disabled=runner.running||!ownsLock;
  $('results').replaceChildren();
  const rows=s.records.map((record,index)=>{
    if(s.results[index])return {row:s.results[index],state:'done',index};
    if(index===s.index&&s.partial)return {row:s.partial,state:'working',index};
    return {row:emptyResult(record),state:index===s.index&&runner.running?'working':'pending',index};
  });
  const filtered=rows.filter(item=>(!$('filterGmail').checked||/@gmail\.com$/i.test(item.row.Email||''))&&(!$('filterPhone').checked||Boolean(item.row.Phone)));
  $('resultCount').textContent=filtered.length+' / '+s.records.length+' dòng';
  const fragment=document.createDocumentFragment();
  for(const item of filtered){const row=item.row,tr=document.createElement('tr');for(const k of ['SourceRow','Website','Email','Phone','FacebookURL','FacebookID','InstagramURL']){const td=document.createElement('td');td.textContent=row[k]||'';tr.append(td);}const processing=document.createElement('td'),badge=document.createElement('span');badge.className='run-badge '+item.state;badge.textContent=item.state==='done'?'✓ Hoàn thành':item.state==='working'?'⏳ Đang xử lý':'○ Chờ xử lý';processing.append(badge);tr.append(processing);const detail=document.createElement('td');detail.textContent=item.state==='pending'?'Chưa chạy':row.Status||'';tr.append(detail);const action=document.createElement('td');if(item.state==='done'){const button=document.createElement('button');button.className='secondary edit-row';button.dataset.row=String(item.index);button.textContent=editingRow===item.index?'Đóng':'Sửa';action.append(button);}tr.append(action);fragment.append(tr);if(editingRow===item.index){const formRow=document.createElement('tr'),formCell=document.createElement('td');formCell.colSpan=10;formCell.className='inline-edit';formCell.innerHTML=`<label>Email<input data-field="Email" value="${escapeAttr(row.Email||'')}"></label><label>Điện thoại<input data-field="Phone" value="${escapeAttr(row.Phone||'')}"></label><label>Facebook URL<input data-field="FacebookURL" value="${escapeAttr(row.FacebookURL||'')}"></label><label>Facebook ID<input data-field="FacebookID" value="${escapeAttr(row.FacebookID||'')}"></label><label>Instagram URL<input data-field="InstagramURL" value="${escapeAttr(row.InstagramURL||'')}"></label><button class="primary save-inline" data-row="${item.index}">Lưu</button><button class="secondary cancel-inline">Hủy</button>`;formRow.append(formCell);fragment.append(formRow);}}$('results').append(fragment);
}
function escapeAttr(value){return String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');}
function settings(){const delay=Number($('delay').value);return {delay:Math.min(120,Math.max(0,Number.isFinite(delay)?delay:1)),timeout:Math.min(90,Math.max(3,Number($('timeout').value)||30)),maxContact:Math.min(6,Math.max(0,Number($('maxContact').value)||0)),maxFacebookPages:Math.min(20,Math.max(1,Number($('maxFacebookPages').value)||12)),parallel:Math.min(12,Math.max(1,Number($('parallel').value)||3)),socialSearch:$('socialSearch').value,fastMode:$('fastMode').checked,forceFacebookID:$('forceFacebookID').checked,active:$('active').checked,pauseOnBlock:$('pauseOnBlock').checked};}
async function replaceJob(records) {
  if(!records.length)throw new Error('Danh sách trống.');
  if(runner.state.records.length&&!confirm('Thay danh sách hiện tại và xóa kết quả đang lưu? Hãy xuất CSV trước nếu cần giữ kết quả cũ.'))return;
  await runner.setJob(records,settings());
  const valid=records.filter(r=>r.url).length,unique=new Set(records.filter(r=>r.url).map(r=>r.url)).size;
  message('Đã nạp '+records.length+' dòng; '+valid+' dòng có URL hợp lệ; '+unique+' URL khác nhau.');
}
function handle(id,fn){$(id).addEventListener('click',async()=>{message('');try{await fn();}catch(e){message(e.message);}});}
$('file').addEventListener('change',async()=>{
  try{
    const f=$('file').files[0];if(!f)return;
    const text=await f.text();
    if(/\.txt$/i.test(f.name)) {loadedTable=text.split(/\r?\n/).filter(v=>v.trim()).map(v=>[v.trim()]);hasHeader=false;}
    else {loadedTable=parseCSV(text);hasHeader=loadedTable.length>0&&!normalizeURL(loadedTable[0][0]);
      if(loadedTable[0]&&detectWebsiteColumn(loadedTable[0])>=0)hasHeader=true;}
    if(!loadedTable.length)throw new Error('File không có dữ liệu.');
    $('column').replaceChildren();
    const cols=hasHeader?loadedTable[0]:loadedTable[0].map((_,i)=>'Cột '+(i+1));
    cols.forEach((name,i)=>{const option=document.createElement('option');option.value=i;option.textContent=name||'Cột '+(i+1);$('column').append(option);});
    const guess=hasHeader?detectWebsiteColumn(loadedTable[0]):0;
    $('column').value=String(Math.max(0,guess));
    $('csvOptions').hidden=false;$('fileInfo').textContent=f.name+' · '+(loadedTable.length-(hasHeader?1:0))+' dòng. Kiểm tra cột website trước khi nạp.';
  }catch(e){message(e.message);}
});
handle('importFile',()=>{if(!loadedTable)throw new Error('Chọn file trước.');return replaceJob(makeRecords(loadedTable,Number($('column').value),hasHeader));});
handle('importText',()=>replaceJob(makeRecords($('urls').value.split(/\r?\n/).filter(x=>x.trim()).map(x=>[x.trim()]),0,false)));
handle('start',async()=>{runner.state.settings=settings();await runner.start();});
handle('pause',()=>runner.pause());
handle('skip',()=>runner.skip());
handle('reset',async()=>{if(confirm('Xóa toàn bộ tiến độ và kết quả để chạy lại từ đầu?')){await runner.reset();message('Đã đặt lại tiến độ và kết quả. Danh sách website vẫn được giữ.');}});
handle('export',()=>{
  const blob=new Blob([csvString(runner.exportRows(),headers)],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
  a.download='website_contacts_'+new Date().toISOString().replace(/[:.]/g,'-')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
});
for(const id of ['filterGmail','filterPhone'])$(id).addEventListener('change',()=>render(runner.state));
$('results').addEventListener('click',async event=>{const edit=event.target.closest('.edit-row'),cancel=event.target.closest('.cancel-inline'),save=event.target.closest('.save-inline');if(edit){editingRow=editingRow===Number(edit.dataset.row)?null:Number(edit.dataset.row);render(runner.state);return;}if(cancel){editingRow=null;render(runner.state);return;}if(save){const cell=save.closest('.inline-edit'),index=Number(save.dataset.row),values={};for(const input of cell.querySelectorAll('[data-field]'))values[input.dataset.field]=input.value.trim();try{await runner.saveManualEdit(index,values);editingRow=null;message('Đã lưu chỉnh sửa thủ công.');}catch(e){message(e.message);}}});
await runner.load();
for(const key of ['delay','timeout','maxContact','maxFacebookPages','parallel'])$(key).value=runner.state.settings[key]??(key==='parallel'?3:key==='maxFacebookPages'?12:'');
for(const key of ['fastMode','forceFacebookID','active','pauseOnBlock'])$(key).checked=Boolean(runner.state.settings[key]);
$('socialSearch').value=runner.state.settings.socialSearch||'facebook';
// Một bảng điều khiển duy nhất được quyền ghi/điều phối hàng đợi.
navigator.locks.request('website-contact-collector-runner',{ifAvailable:true},async lock=>{
  if(!lock){message('Công cụ đang mở trong tab khác. Hãy dùng tab đó hoặc đóng tab đó rồi tải lại tab này.');return;}
  ownsLock=true;render(runner.state);await new Promise(()=>{});
});
