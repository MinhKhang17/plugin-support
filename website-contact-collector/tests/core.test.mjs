import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCSV,normalizeURL,recoveryURLs,makeRecords,detectWebsiteColumn,csvString,facebookURL,numericFacebookID,primaryEmail} from '../core.mjs';
test('CSV BOM, dấu phẩy, dấu nháy và xuống dòng trong một ô',()=>{
  const table=parseCSV('\uFEFFName,Website,Note\r\n"Dog, breeder",https://kennel.test/,"A ""quote""\nnext line"\r\n');
  assert.equal(table.length,2);assert.equal(table[1][0],'Dog, breeder');assert.equal(table[1][2],'A "quote"\nnext line');
});
test('CSV dấu chấm phẩy, tab, ô rỗng và quote hỏng',()=>{
  assert.deepEqual(parseCSV('Website;Name\na.test;A'),[['Website','Name'],['a.test','A']]);
  assert.equal(parseCSV('Website\tName\na.test\tA')[1][1],'A');
  assert.deepEqual(parseCSV('Website,Phone\na.test,')[1],['a.test','']);
  assert.throws(()=>parseCSV('Website\n"unfinished'));
});
test('Giữ dòng không có website và vị trí dòng CSV nguồn',()=>{
  const t=parseCSV('Name,Website,Area\nA,,Texas\nB,https://kennel.test/,Ohio');
  assert.equal(detectWebsiteColumn(t[0]),1);
  const r=makeRecords(t,1);assert.equal(r.length,2);assert.equal(r[0].url,'');assert.equal(r[1].row,3);assert.equal(r[1].area,'Ohio');
});
test('URL sạch, chặn schema không phải web và giữ query cần thiết',()=>{
  assert.equal(normalizeURL('kennel.test/contact?utm_source=x&id=22#footer'),'https://kennel.test/contact?id=22');
  assert.equal(normalizeURL('javascript:alert(1)'),'');assert.equal(normalizeURL('https://user:pass@kennel.test'),'');
  assert.equal(normalizeURL('https://www.google.com/url?q=https%3A%2F%2Fkennel.test%2F'),'https://kennel.test/');
  assert.deepEqual(recoveryURLs('https://kennel.test/contact-us?x=1'),['https://kennel.test/contact-us?x=1','https://kennel.test/contact-us','https://kennel.test/','https://www.kennel.test/']);
});
test('Facebook: profile.php, people, numeric, loại share và hostname giả',()=>{
  assert.equal(numericFacebookID('https://www.facebook.com/profile.php?id=123456789&sk=about'),'123456789');
  assert.equal(numericFacebookID('https://facebook.com/people/Test/100123456789/'),'100123456789');
  assert.equal(numericFacebookID('https://facebook.com/123456789/'),'123456789');
  assert.equal(facebookURL('https://www.facebook.com/sharer/sharer.php?u=https://a.test'),'');
  assert.equal(facebookURL('https://facebook.com.evil.test/Kennel'),'');
  assert.equal(facebookURL('https://www.facebook.com/Kennel/about/?ref=page'),'https://www.facebook.com/Kennel/');
});
test('Chọn email tên miền và xuất CSV chống công thức',()=>{
  assert.equal(primaryEmail(['foo@gmail.com','info@kennel.test'],'https://kennel.test/contact'),'info@kennel.test');
  const csv=csvString([{Phone:'+1 555-123-4567',Name:'=HYPERLINK("bad")'}],['Phone','Name']);
  const rows=parseCSV(csv);assert.equal(rows[1][0],"'+1 555-123-4567");assert.ok(rows[1][1].startsWith("'="));
});
