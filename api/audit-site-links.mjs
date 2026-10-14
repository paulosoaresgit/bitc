// Read-only audit of local product links before publishing the captured storefront.
// Pages are local static HTML; external Shopify links must never be treated as store checkout.
import fs from 'node:fs';
import path from 'node:path';
const base=process.cwd();
const paths=['index.html'];
for(const category of ['all','beginner-miners','best-selling-merch','bitaxe-miners','industrial-asic-miners','premium-asic-miners']){
 const rel='collections/'+category+'/index.html';
 if(fs.existsSync(path.join(base,rel)))paths.push(rel);
}
const origins=new Set(['bitcmining.tech','www.bitcmining.tech']);
const products=new Map();
for(const rel of paths){
 const html=fs.readFileSync(path.join(base,rel),'utf8');
 const re=/\bhref\s*=\s*["']([^"']+)["']/gi;
 for(const hit of html.matchAll(re)){
  let u;
  try{u=new URL(hit[1].replace(/&amp;/g,'&'),'https://bitcmining.tech')}catch{continue}
  if(!origins.has(u.hostname))continue;
  let pathName;
  try{pathName=decodeURIComponent(u.pathname).replace(/\/+$/,'');}
  catch{continue;}
  if(!/^\/products\/[^/]+$/.test(pathName))continue;
  if(!products.has(pathName))products.set(pathName,new Set());
  products.get(pathName).add(rel);
 }
}
const all=[...products].map(([url,source])=>({
 url,
 localPagePresent:fs.existsSync(path.join(base,url.slice(1),'index.html')),
 referencedFrom:[...source]
})).sort((a,b)=>a.url.localeCompare(b.url));
const available=all.filter(x=>x.localPagePresent), missing=all.filter(x=>!x.localPagePresent);
console.log('SITE_LINK_AUDIT='+JSON.stringify({
 scannedPages:paths.length,productLinks:all.length,localProductPages:available.length,
 brokenProductLinks:missing.length,
 missing:missing.map(x=>({url:x.url,from:x.referencedFrom}))
}));
