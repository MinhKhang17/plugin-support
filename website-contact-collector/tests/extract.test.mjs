import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {scanPage,scanFacebookID} from '../extract.mjs';
function node(attrs={},text=''){return {textContent:text,innerText:text,content:attrs.content,href:attrs.href,offsetWidth:1,offsetHeight:1,getAttribute:k=>attrs[k]??null,getClientRects:()=>[{}]};}
function context(url,{body='',title='Kennel',selectors={},cookie=''}={}) {
  const u=new URL(url);let scrolls=0;
  return vm.createContext({URL,URLSearchParams,setTimeout:fn=>{fn();return 0;},location:u,
    document:{title,cookie,body:{innerText:body},documentElement:{scrollHeight:2000},querySelectorAll:s=>selectors[s]||[],querySelector:s=>(selectors[s]||[])[0]||null},
    window:{scrollTo:()=>{scrolls++;}},getScrolls:()=>scrolls});
}
test('Extractor đọc email hiển thị, mailto, tel và thực hiện cuộn',async()=>{
  const c=context('https://kennel.test/',{body:'Contact info@kennel.test\nPhone: (212) 555-7890',selectors:{'a[href]':[node({href:'mailto:kennel%40gmail.com?subject=Hello'}),node({href:'tel:+1-212-555-7890'})]}});
  const result=await vm.runInContext('('+scanPage.toString()+')()',c);
  assert.ok(result.emails.includes('info@kennel.test'));assert.ok(result.emails.includes('kennel@gmail.com'));
  assert.ok(result.phones.includes('+1-212-555-7890'));assert.equal(c.getScrolls(),2);
});
test('Extractor Fast mode chỉ cuộn giữa và cuối trang',async()=>{
  const c=context('https://kennel.test/',{body:'Contact info@kennel.test',selectors:{}});
  await vm.runInContext('('+scanPage.toString()+')(true)',c);
  assert.equal(c.getScrolls(),1);
});
test('Không lấy email từ script không phải JSON-LD hoặc file ảnh',async()=>{
  const c=context('https://kennel.test/',{body:'logo@2x.png\nhello [at] kennel [dot] test',selectors:{script:[node({},'const x="hidden@tracking.test";')]}});
  const r=await vm.runInContext('('+scanPage.toString()+')()',c);
  assert.deepEqual([...r.emails],['hello@kennel.test']);
});
test('Extractor phân biệt lỗi 404 và xác minh',async()=>{
  const error=await vm.runInContext('('+scanPage.toString()+')()',context('https://kennel.test/contact',{title:'404 Not Found',body:'404 Not Found'}));
  assert.equal(error.error,true);
  const block=await vm.runInContext('('+scanPage.toString()+')()',context('https://kennel.test/',{title:'Just a moment...',body:'Verify you are human'}));
  assert.equal(block.blocked,true);
});
test('Facebook ID: vanity đúng được ưu tiên hơn ID tài khoản đang đăng nhập',()=>{
  const c=context('https://www.facebook.com/HappyKennel/',{cookie:'c_user=999999999',selectors:{script:[node({},'{"userID":"999999999","pageID":"888888888"}'),node({},'{"id":"123456789","vanity":"HappyKennel"}')]}});
  const r=vm.runInContext('('+scanFacebookID.toString()+')()',c);assert.equal(r.id,'123456789');
});
test('Facebook ID: chỉ có ứng viên không đủ để xác định ID trang',()=>{
  const c=context('https://www.facebook.com/HappyKennel/',{cookie:'c_user=999999999',selectors:{script:[node({},'{"userID":"999999999","pageID":"888888888","entity_id":"777777777"}')]}});
  const r=vm.runInContext('('+scanFacebookID.toString()+')()',c);assert.equal(r.id,'');assert.deepEqual([...r.candidates],['888888888','777777777']);
});
test('Facebook metadata và URL numeric',()=>{
  const c=context('https://www.facebook.com/HappyKennel/',{selectors:{'meta[property="al:android:url"],meta[property="al:ios:url"]':[node({content:'fb://page/123456789'})]}});
  assert.equal(vm.runInContext('('+scanFacebookID.toString()+')()',c).id,'123456789');
  assert.equal(vm.runInContext('('+scanFacebookID.toString()+')()',context('https://www.facebook.com/profile.php?id=234567890')).id,'234567890');
});
