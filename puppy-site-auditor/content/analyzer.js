let session=null;
const POS=[/\bpupp(y|ies)\b/gi,/\bdogs?\b/gi,/\bcanine\b/gi,/\bchó\b/gi,/\bcún\b/gi];
const NEG=[/\bdogecoin\b/gi,/\bwatchdog\b/gi,/\bhot\s?dog\b/gi,/\bunderdog\b/gi];
function count(re,text){ const m=text.match(re); return m?m.length:0; }
function textEvidence(){
  const title=document.title||'', meta=document.querySelector('meta[name="description"]')?.content||'';
  const heads=[...document.querySelectorAll('h1,h2')].map(x=>x.innerText).join(' ');
  const body=(document.body?.innerText||'').slice(0,100000);
  const alt=[...document.images].slice(0,100).map(i=>i.alt||'').join(' ');
  let score=0; const parts=[[title,5],[heads,4],[meta,3],[location.href,2],[alt,2],[body,1]];
  for(const [txt,w] of parts){ for(const r of POS) score+=Math.min(count(r,txt),3)*w; for(const r of NEG) score-=count(r,txt)*4; }
  return score;
}
async function scrollToEnd(){
  const root=document.scrollingElement||document.documentElement;
  let previousHeight=0;
  let stableAtBottom=0;
  for(let attempt=0;attempt<60;attempt++){
    const height=Math.max(root.scrollHeight,document.body?.scrollHeight||0);
    window.scrollTo({top:height,behavior:'smooth'});
    await new Promise(resolve=>setTimeout(resolve,450));
    const currentHeight=Math.max(root.scrollHeight,document.body?.scrollHeight||0);
    const atBottom=root.scrollTop+window.innerHeight>=currentHeight-8;
    if(atBottom && currentHeight===previousHeight) stableAtBottom++;
    else stableAtBottom=0;
    if(stableAtBottom>=2) break;
    previousHeight=currentHeight;
  }
}
async function getSession(){
  if(session) return session;
  if(typeof ort==='undefined') return null;
  ort.env.wasm.wasmPaths=chrome.runtime.getURL('assets/');
  session=await ort.InferenceSession.create(chrome.runtime.getURL('assets/dog-model.onnx'),{executionProviders:['wasm']});
  return session;
}
async function classifyElement(el){
  const model=await getSession(); if(!model) return null;
  const c=document.createElement('canvas'); c.width=224;c.height=224; const x=c.getContext('2d',{willReadFrequently:true});
  try{x.drawImage(el,0,0,224,224);}catch(_){return null;} const p=x.getImageData(0,0,224,224).data;
  const f=new Float32Array(3*224*224); for(let i=0;i<224*224;i++){f[i]=p[i*4]/255;f[224*224+i]=p[i*4+1]/255;f[2*224*224+i]=p[i*4+2]/255;}
  const out=await model.run({images:new ort.Tensor('float32',f,[1,3,224,224])}); const a=Array.from(out[Object.keys(out)[0]].data);
  return {adult:a[0]||0, non:a[1]||0, puppy:a[2]||0, dog:Math.max(a[0]||0,a[2]||0)};
}
async function visualEvidence(){
  const imgs=[...document.images].filter(i=>i.complete&&i.naturalWidth>=180&&i.naturalHeight>=120).sort((a,b)=>(b.naturalWidth*b.naturalHeight)-(a.naturalWidth*a.naturalHeight)).slice(0,6);
  let best={dog:0,adult:0,puppy:0,non:1};
  for(const img of imgs){ const r=await classifyElement(img); if(r&&r.dog>best.dog) best=r; }
  const vid=[...document.querySelectorAll('video')].find(v=>v.readyState>=2&&v.videoWidth>0); if(vid){const r=await classifyElement(vid);if(r&&r.dog>best.dog)best=r;}
  return best;
}
chrome.runtime.onMessage.addListener((m,s,reply)=>{ if(m.type!=='ANALYZE') return;
  (async()=>{ await scrollToEnd(); const score=textEvidence(); if(score>=8){ chrome.runtime.sendMessage({type:'ANALYSIS_RESULT',check:true,confidence:Math.min(.99,.65+score/100),reason:'keyword'}); return; }
    let v={dog:0}; try{v=await visualEvidence();}catch(e){}
    const check=v.dog>=.60 || score>=5; chrome.runtime.sendMessage({type:'ANALYSIS_RESULT',check,confidence:Math.max(v.dog,Math.min(.9,score/10)),reason:v.dog>=.60?'visual':'combined'});
  })(); reply({ok:true}); return true; });
