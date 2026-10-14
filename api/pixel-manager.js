import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_FILE=process.env.BITC_PIXELS_CONFIG_PATH || '/data/pixels.json';
const SECRET=process.env.BITC_PIXELS_ADMIN_PASSWORD_HASH || '';
const COOKIE='bitc_pixels_admin';
const SESSION_MS=8*60*60*1000;
const MAX_ITEMS=50;
const logins=new Map();
const TYPES=new Set(['meta','ga4','google_ads']);
const ALLOWED_ORIGINS=new Set(['https://bitcmining.tech','https://www.bitcmining.tech']);
const SECURITY_HEADERS={
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer'
};
export function sanitizePixels(pixels){
  if(!Array.isArray(pixels)||pixels.length>MAX_ITEMS)throw new Error('invalid_pixels');
  const seen=new Set();
  return pixels.map(p=>{
    if(!p||typeof p!=='object'||Array.isArray(p))throw new Error('invalid_pixel');
    const type=String(p.type||'');
    const id=String(p.id||'').trim();
    const label=String(p.label||'').trim();
    if(!TYPES.has(type)||label.length>80||/[<>\r\n]/.test(label))throw new Error('invalid_pixel');
    if(type==='meta'&&!/^\d{9,20}$/.test(id))throw new Error('invalid_pixel');
    if(type==='ga4'&&!/^G-[A-Z0-9]{6,20}$/.test(id))throw new Error('invalid_pixel');
    if(type==='google_ads'&&!/^AW-\d{8,15}$/.test(id))throw new Error('invalid_pixel');
    if(seen.has(type+':'+id))throw new Error('duplicate_pixel');
    seen.add(type+':'+id);
    if(typeof p.active!=='boolean')throw new Error('invalid_pixel');
    return {type,id,label,active:p.active};
  });
}
function currentPixels(){
  try{
    const data=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
    return sanitizePixels(data.pixels);
  }catch(e){
    if(e.code==='ENOENT')return [];
    throw e;
  }
}
function persist(pixels){
  const dir=path.dirname(DATA_FILE);
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const temp=path.join(dir,'.pixels-'+process.pid+'-'+crypto.randomBytes(8).toString('hex'));
  try{
    fs.writeFileSync(temp,JSON.stringify({version:1,updatedAt:new Date().toISOString(),pixels},null,2)+'\n',{mode:0o600,flag:'wx'});
    fs.renameSync(temp,DATA_FILE);
  }finally{
    try{fs.unlinkSync(temp)}catch(e){if(e.code!=='ENOENT')throw e}
  }
}
function passwordConfigured(){return /^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(SECRET)}
function secretKey(){return crypto.createHash('sha256').update('BITC pixels admin session '+SECRET).digest()}
function validPassword(input){
  if(!passwordConfigured()||typeof input!=='string'||input.length>500)return false;
  const [salt,hex]=SECRET.split(':');
  const expected=Buffer.from(hex,'hex');
  const found=crypto.scryptSync(input,Buffer.from(salt,'hex'),64);
  return crypto.timingSafeEqual(expected,found);
}
function sessionToken(){
  const payload=String(Date.now()+SESSION_MS)+'.'+crypto.randomBytes(18).toString('hex');
  const signature=crypto.createHmac('sha256',secretKey()).update(payload).digest('hex');
  return payload+'.'+signature;
}
function validSession(req){
  if(!passwordConfigured())return false;
  const cookies=(req.headers.cookie||'').split(';').map(x=>x.trim());
  const entry=cookies.find(x=>x.startsWith(COOKIE+'='));
  if(!entry)return false;
  const value=entry.slice(COOKIE.length+1);
  const chunks=value.split('.');
  if(chunks.length!==3||!/^[a-f0-9]{36}$/.test(chunks[1])||!/^[a-f0-9]{64}$/.test(chunks[2]))return false;
  const expire=Number(chunks[0]);
  if(!Number.isSafeInteger(expire)||expire<Date.now()||expire>Date.now()+SESSION_MS)return false;
  const input=chunks[0]+'.'+chunks[1];
  const expected=crypto.createHmac('sha256',secretKey()).update(input).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(chunks[2],'hex'),Buffer.from(expected,'hex'));
}
function send(res,status,value,extra={}){
  res.writeHead(status,{...SECURITY_HEADERS,'Content-Type':'application/json; charset=utf-8',...extra});
  res.end(JSON.stringify(value));
}
function cookie(value,maxAge){
  return COOKIE+'='+value+'; Path=/api/admin/pixels; HttpOnly; Secure; SameSite=Strict; Max-Age='+maxAge;
}
function requestBody(req){
  return new Promise((resolve,reject)=>{
    let content='';let bytes=0;
    req.on('data',chunk=>{
      bytes+=chunk.length;
      if(bytes>16000){reject(new Error('invalid_request'));req.destroy();return}
      content+=chunk.toString('utf8');
    });
    req.on('end',()=>{try{resolve(JSON.parse(content))}catch{reject(new Error('invalid_request'))}});
    req.on('error',reject);
  });
}
function rateLimited(req){
  const addr=String(req.headers['x-real-ip']||req.socket.remoteAddress||'unknown').slice(0,80);
  const now=Date.now();
  if(logins.size>1000){for(const [k,v] of logins)if(v.until<now)logins.delete(k)}
  const state=logins.get(addr)||{count:0,until:now+600000};
  if(state.until<now){state.count=0;state.until=now+600000}
  state.count++;
  logins.set(addr,state);
  return state.count>12;
}
export async function handlePixelRequest(req,res,pathname){
  if(pathname==='/api/tracking-config'&&req.method==='GET'){
    try{
      return send(res,200,{pixels:currentPixels().filter(p=>p.active).map(({type,id})=>({type,id})),consentRequired:true,purchaseServerSideReady:false});
    }catch{ return send(res,503,{error:'tracking_config_unavailable'}) }
  }
  if(!pathname.startsWith('/api/admin/pixels'))return false;
  // Never trust a cross-site request to change tracking configuration.
  if(!['GET','POST','PUT'].includes(req.method))return send(res,405,{error:'method_not_allowed'});
  if(req.method!=='GET'&&!ALLOWED_ORIGINS.has(req.headers.origin))return send(res,403,{error:'origin_not_allowed'});
  if(!passwordConfigured())return send(res,503,{error:'admin_password_not_configured'});
  if(pathname==='/api/admin/pixels/login'&&req.method==='POST'){
    if(rateLimited(req))return send(res,429,{error:'too_many_attempts'});
    try{
      const body=await requestBody(req);
      if(!validPassword(body.password))return send(res,401,{error:'invalid_credentials'});
      return send(res,200,{ok:true},{'Set-Cookie':cookie(sessionToken(),SESSION_MS/1000)});
    }catch{return send(res,400,{error:'invalid_request'})}
  }
  if(!validSession(req))return send(res,401,{error:'unauthorized'});
  if(pathname==='/api/admin/pixels/logout'&&req.method==='POST'){
    return send(res,200,{ok:true},{'Set-Cookie':cookie('',0)});
  }
  if(pathname!=='/api/admin/pixels')return send(res,404,{error:'not_found'});
  if(req.method==='GET'){
    try{return send(res,200,{pixels:currentPixels()})}catch{return send(res,503,{error:'pixel_storage_unavailable'})}
  }
  if(req.method==='PUT'){
    try{
      const body=await requestBody(req);
      const pixels=sanitizePixels(body.pixels);
      persist(pixels);
      return send(res,200,{ok:true,pixels});
    }catch(e){
      const err=String(e.message||'');
      return send(res,['invalid_pixels','invalid_pixel','duplicate_pixel','invalid_request'].includes(err)?400:503,{error:['invalid_pixels','invalid_pixel','duplicate_pixel','invalid_request'].includes(err)?err:'pixel_storage_unavailable'});
    }
  }
  return send(res,405,{error:'method_not_allowed'});
}
