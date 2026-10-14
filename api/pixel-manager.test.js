import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bitc-pixel-tests-'));
process.env.NODE_ENV='test';
process.env.BITC_PIXELS_CONFIG_PATH=path.join(temp,'pixels.json');
const password='A_strong_demo_password_4278';
const salt=crypto.randomBytes(16);
process.env.BITC_PIXELS_ADMIN_PASSWORD_HASH=salt.toString('hex')+':'+crypto.scryptSync(password,salt,64).toString('hex');
const {server}=await import('./server.js');
const {sanitizePixels}=await import('./pixel-manager.js');

test('pixel IDs are strictly validated and names cannot contain HTML',()=>{
 const many=[{type:'meta',id:'123456789012345',label:'Facebook Main',active:true},
 {type:'ga4',id:'G-TEST123456',label:'Analytics 4',active:false},
 {type:'google_ads',id:'AW-123456789',label:'Google Ads',active:true}];
 assert.deepEqual(sanitizePixels(many),many);
 assert.throws(()=>sanitizePixels([...many,many[0]]),/duplicate_pixel/);
 assert.throws(()=>sanitizePixels([{type:'meta',id:'<img src=x>',label:'',active:true}]),/invalid_pixel/);
 assert.throws(()=>sanitizePixels([{type:'ga4',id:'G-TEST123456',label:'<script>',active:true}]),/invalid_pixel/);
 assert.throws(()=>sanitizePixels([{type:'meta',id:'123456789012345',label:'',active:'yes'}]),/invalid_pixel/);
 assert.throws(()=>sanitizePixels(Array(51).fill(many[0])),/invalid_pixels/);
});

test('admin dashboard requires secret password and persists multiple enabled and disabled IDs',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const origin='https://bitcmining.tech';
 const request=(endpoint,method='GET',body,headers={})=>fetch(base+endpoint,{
   method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},
   ...(body?{body:JSON.stringify(body)}:{})
 });
 try{
  let r=await request('/api/tracking-config');
  assert.equal(r.status,200);assert.deepEqual((await r.json()).pixels,[]);
  r=await request('/api/admin/pixels');
  assert.equal(r.status,401);
  r=await request('/api/admin/pixels/login','POST',{password});
  assert.equal(r.status,403,'cross-origin admin POST not allowed');
  r=await request('/api/admin/pixels/login','POST',{password:'wrong'},{Origin:origin});
  assert.equal(r.status,401);
  r=await request('/api/admin/pixels/login','POST',{password},{Origin:origin});
  assert.equal(r.status,200);
  const cookie=r.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie?.startsWith('bitc_pixels_admin='),'signed admin cookie');
  const pixels=[
    {type:'meta',id:'123456789012345',label:'Meta 1',active:true},
    {type:'meta',id:'333222111000999',label:'Meta 2',active:false},
    {type:'ga4',id:'G-ABC1234567',label:'Google Analytics',active:true},
    {type:'google_ads',id:'AW-1234567890',label:'Search Ads',active:true}
  ];
  r=await request('/api/admin/pixels','PUT',{pixels},{Origin:'https://example.net',Cookie:cookie});
  assert.equal(r.status,403,'cross-site writes forbidden');
  r=await request('/api/admin/pixels','PUT',{pixels},{Origin:origin,Cookie:cookie});
  assert.equal(r.status,200);assert.equal((await r.json()).pixels.length,4);
  assert.equal(fs.statSync(process.env.BITC_PIXELS_CONFIG_PATH).mode&0o777,0o600);
  r=await request('/api/tracking-config');const publicConfig=await r.json();
  assert.deepEqual(publicConfig.pixels,[{type:'meta',id:'123456789012345'},{type:'ga4',id:'G-ABC1234567'},{type:'google_ads',id:'AW-1234567890'}]);
  assert.equal(publicConfig.consentRequired,true);
  assert.equal(publicConfig.purchaseServerSideReady,false);
  r=await request('/api/admin/pixels','GET',undefined,{Cookie:cookie});assert.equal(r.status,200);
  assert.deepEqual((await r.json()).pixels,pixels);
  r=await request('/api/admin/pixels','PUT',{pixels:[...pixels,pixels[0]]},{Origin:origin,Cookie:cookie});
  assert.equal(r.status,400,'duplicated IDs blocked');
  r=await request('/api/admin/pixels/logout','POST',{}, {Origin:origin,Cookie:cookie});
  assert.equal(r.status,200);
 }finally{
  await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  fs.rmSync(temp,{recursive:true,force:true});
 }
});
