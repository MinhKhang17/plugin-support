const DEFAULT = { running:false, paused:false, urls:[], index:0, results:[], tabId:null, status:'Idle', current:null, autoAdvance:false, waitAfterLoad:2500, waitAfterResult:5000 };
let state = {...DEFAULT};

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});
  const saved = await chrome.storage.local.get('auditState');
  if (saved.auditState) state = {...DEFAULT, ...saved.auditState, running:false, paused:false};
});
async function save(){ await chrome.storage.local.set({auditState:state}); broadcast(); }
function broadcast(){ chrome.runtime.sendMessage({type:'STATE', state}).catch(()=>{}); }
async function ensureTab(url){
  if(state.tabId){ try { await chrome.tabs.update(state.tabId,{url,active:true}); return; } catch(_){} }
  const t=await chrome.tabs.create({url,active:true}); state.tabId=t.id;
}
async function next(){
  if(!state.running || state.paused) return;
  if(state.index>=state.urls.length){ state.running=false; state.status='Finished'; await save(); return; }
  state.current=state.urls[state.index]; state.status='Opening website'; await save(); await ensureTab(state.current);
}
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if(tabId!==state.tabId || info.status!=='complete' || !state.running || state.paused) return;
  state.status='Reading page and checking dog evidence'; await save();
  const url=state.current;
  setTimeout(()=>{
    if(!state.running || state.paused || state.current!==url) return;
    chrome.tabs.sendMessage(tabId,{type:'ANALYZE',url}).catch(async e=>{ await record(false,0,'analysis_error:'+e.message); });
  },state.waitAfterLoad);
});
async function record(check, confidence, reason){
  const url=state.current;
  if(!url) return;
  const existing=state.results.findIndex(r=>r.website_url===url);
  const row={website_url:url,check:Boolean(check),confidence:Number(confidence||0),reason:reason||''};
  if(existing>=0) state.results[existing]=row; else state.results.push(row);
  state.status=check?'DOG RELATED ✓':'NOT DOG RELATED'; state.index++;
  if(state.autoAdvance){ await save(); setTimeout(next,state.waitAfterResult); }
  else { state.paused=true; state.status='Review result, then press Next'; await save(); }
}
chrome.runtime.onMessage.addListener((m,s,reply)=>{
  (async()=>{
    if(m.type==='GET_STATE') reply(state);
    if(m.type==='START') { state={...DEFAULT, running:true, urls:m.urls, autoAdvance:Boolean(m.autoAdvance), waitAfterLoad:Math.max(0,Number(m.waitAfterLoad)||2500), waitAfterResult:Math.max(0,Number(m.waitAfterResult)||5000), status:'Starting'}; await save(); await next(); reply({ok:true}); }
    if(m.type==='PAUSE') { state.paused=true; state.status='Paused'; await save(); reply({ok:true}); }
    if(m.type==='RESUME') { state.paused=false; state.status='Resuming'; await save(); await next(); reply({ok:true}); }
    if(m.type==='NEXT') { state.paused=false; state.status='Opening next website'; await save(); await next(); reply({ok:true}); }
    if(m.type==='STOP') { state.running=false; state.paused=false; state.status='Stopped'; await save(); reply({ok:true}); }
    if(m.type==='ANALYSIS_RESULT' && s.tab?.id===state.tabId) { await record(m.check,m.confidence,m.reason); reply({ok:true}); }
    if(m.type==='OVERRIDE') {
      const url=m.url||state.current; const i=state.results.findIndex(r=>r.website_url===url);
      if(i>=0) state.results[i]={...state.results[i],check:Boolean(m.check),reason:'manual_override'};
      else if(url) state.results.push({website_url:url,check:Boolean(m.check),confidence:1,reason:'manual_override'});
      await save(); reply({ok:true});
    }
  })(); return true;
});
