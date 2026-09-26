import test from 'node:test';
import assert from 'node:assert/strict';
import {Runner,Blocked,Paused} from '../runner.mjs';

let store;
globalThis.chrome={storage:{local:{get:async()=>({contactJob:store}),set:async v=>{store=structuredClone(v.contactJob);}}},tabs:{remove:async()=>{}}};
const row=(url,n=2)=>({row:n,name:'Breeder',area:'Texas',original:url,url});
const page=(url,emails=[],phones=[],links=[])=>({url,emails,phones,links:links.map(url=>({url,text:url}))});
class FixtureRunner extends Runner {
  constructor(fixtures){super(()=>{});this.fixtures=fixtures;this.visits=[];this.idReads=0;}
  async wait(){this.check();}
  async visit(url){this.check();this.visits.push(url);const p=this.fixtures[url];if(p instanceof Error)throw p;if(!p)throw new Error('404 fixture');return structuredClone(p);}
  async inject(){this.idReads++;return {id:'100123456789',method:'Đối tượng khớp tên trang',candidates:[]};}
  async navigate(url){return url;}
}
async function setup(fixtures,records,options={}) {
  store=undefined;const r=new FixtureRunner(fixtures);await r.load();await r.setJob(records,{delay:2,timeout:10,maxContact:3,active:false,pauseOnBlock:true,...options});return r;
}
test('URL /contact-us lỗi → trang gốc → đủ email và phone, không mở FB',async()=>{
  const r=await setup({'https://kennel.test/':page('https://kennel.test/',['contact@kennel.test'],['+1 212-555-7890'],['https://facebook.com/Kennel'])},[row('https://kennel.test/contact-us')]);
  await r.start();assert.equal(r.state.index,1);assert.equal(r.state.results[0].Email,'contact@kennel.test');assert.equal(r.state.results[0].Status,'Có email và điện thoại');
  assert.deepEqual(r.visits,['https://kennel.test/contact-us','https://kennel.test/']);
});
test('Website có phone, tìm email trong Facebook About',async()=>{
  const r=await setup({'https://kennel.test/':page('https://kennel.test/',[],['+1 212-555-7890'],['https://facebook.com/Kennel']),
    'https://www.facebook.com/Kennel/':page('https://www.facebook.com/Kennel/'),
    'https://www.facebook.com/Kennel/about/':page('https://www.facebook.com/Kennel/about/',['hello@gmail.com'])},[row('https://kennel.test/')]);
  await r.start();const out=r.state.results[0];assert.equal(out.Email,'hello@gmail.com');assert.equal(out.Gmail,'hello@gmail.com');assert.equal(out.Phone,'+1 212-555-7890');assert.equal(out.EmailSource,'https://www.facebook.com/Kennel/about/');assert.equal(out.FacebookID,'100123456789');
});
test('Website có email nhưng thiếu phone vẫn tiếp tục FB basic info',async()=>{
  const r=await setup({'https://kennel.test/':page('https://kennel.test/',['info@kennel.test'],[],['https://facebook.com/Kennel']),
    'https://www.facebook.com/Kennel/':page('https://www.facebook.com/Kennel/'),
    'https://www.facebook.com/Kennel/about/':page('https://www.facebook.com/Kennel/about/'),
    'https://www.facebook.com/Kennel/about_contact_and_basic_info/':page('https://www.facebook.com/Kennel/about_contact_and_basic_info/',[],['+1 212-555-7890'])},[row('https://kennel.test/')]);
  await r.start();const out=r.state.results[0];assert.equal(out.Email,'info@kennel.test');assert.equal(out.Phone,'+1 212-555-7890');assert.match(out.PhoneSource,/basic_info/);assert.equal(r.visits.length,4);
});
test('Link contact nội bộ được đọc khi thiếu thông tin',async()=>{
  const r=await setup({'https://kennel.test/':page('https://kennel.test/',[],[],['https://kennel.test/contact-us']),
    'https://kennel.test/contact-us':page('https://kennel.test/contact-us',['office@kennel.test'],['+1 212-555-7890'])},[row('https://kennel.test/')]);
  await r.start();assert.equal(r.state.results[0].EmailSource,'https://kennel.test/contact-us');
});
test('Dòng URL trùng giữ số dòng, không truy cập hai lần; dòng rỗng không mất',async()=>{
  const r=await setup({'https://kennel.test/':page('https://kennel.test/',['x@kennel.test'],['+1 212-555-7890'])},[row('https://kennel.test/',2),row('https://kennel.test/',3),row('',4)]);
  await r.start();assert.equal(r.state.index,3);assert.equal(r.visits.length,1);assert.equal(r.exportRows().length,3);assert.equal(r.state.results[1].SourceRow,3);assert.equal(r.state.results[2].Status,'Không có website');
});
test('CAPTCHA giữ dòng hiện tại, partial và có thể tiếp tục',async()=>{
  const r=await setup({'https://kennel.test/':new Blocked('Cần xác minh')},[row('https://kennel.test/')]);
  await r.start();assert.equal(r.state.index,0);assert.equal(r.state.status,'Cần xử lý thủ công');assert.equal(store.partial.Website,'https://kennel.test/');
  r.fixtures['https://kennel.test/']=page('https://kennel.test/',['info@kennel.test'],['+1 212-555-7890']);
  await r.start();assert.equal(r.state.index,1);assert.equal(r.state.status,'Hoàn tất');
});
test('Tạm dừng, khôi phục storage và không nhân đôi dòng',async()=>{
  const r=await setup({'https://kennel.test/':new Paused('Dừng')},[row('https://kennel.test/')]);
  await r.start();const resumed=new FixtureRunner({'https://kennel.test/':page('https://kennel.test/',['info@kennel.test'],['+1 212-555-7890'])});
  await resumed.load();await resumed.start();assert.equal(resumed.state.results.length,1);assert.equal(resumed.state.index,1);
});
test('Ứng viên ID mơ hồ không ghi vào FacebookID',async()=>{
  const fb='https://www.facebook.com/Kennel/';const r=await setup({[fb]:page(fb)},[row(fb)]);
  r.inject=async()=>({id:'',method:'',candidates:['111111111','222222222']});
  await r.start();assert.equal(r.state.results[0].FacebookID,'');assert.equal(r.state.results[0].FacebookIDCandidates,'111111111; 222222222');
});
