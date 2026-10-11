// Extract the SKU-to-price mapping from product variants embedded in the site's
// existing captured HTML. This is an audit tool, not a source of live inventory.
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const roots=['index.html','collections','products'];
const files=[];
function walk(p){
 if(!fs.existsSync(p))return;
 if(fs.statSync(p).isDirectory()){for(const entry of fs.readdirSync(p))walk(path.join(p,entry));}
 else if(p.endsWith('.html'))files.push(p);
}
for(const p of roots)walk(path.join(root,p));
const candidates=new Map(),conflicts=[],patterns=new Map();
for(const file of files){
 const html=fs.readFileSync(file,'utf8');
 const re=/"product_url":"((?:\\.|[^"\\])*)","product_variants":(\[[^\]]*\])/g;
 let match,found=0;
 while((match=re.exec(html))){
  let url,variants;
  try{url=JSON.parse('"'+match[1]+'"');variants=JSON.parse(match[2]);}catch{continue;}
  let location;
  try{location=new URL(url);}catch{continue;}
  if(location.hostname!=='bitcoinmerch.com'||!location.pathname.startsWith('/products/'))continue;
  if(/shipping.protection|gift.card/i.test(location.pathname))continue;
  const slug=location.pathname.split('/').filter(Boolean).pop()||'';
  const title=slug.replace(/^bitcoin-merch[-®]*/i,'').replace(/-/g,' ').replace(/\s+/g,' ').trim();
  found++;
  for(const variant of variants){
   if(variant.variant_available===false)continue;
   if(!/^\d{8,17}$/.test(String(variant.variant_id||'')))continue;
   const price=String(variant.variant_price||'');
   if(!/^\d{1,6}\.\d{2}$/.test(price)||Number(price)<=0)continue;
   const cents=Number(price.replace('.',''));
   if(!Number.isSafeInteger(cents)||cents<=0||cents>10000000)continue;
   const id=String(variant.variant_id);
   const display=[title,variant.variant_title].filter(x=>x&&x!=='Default Title').join(' — ').slice(0,200);
   const value={title:display||slug,cents};
   const existing=candidates.get(id);
   if(existing&&(existing.cents!==value.cents||existing.title!==value.title)){
    conflicts.push({id,prev:existing,next:value,source:path.relative(root,file)});
   }else if(!existing)candidates.set(id,value);
  }
 }
 patterns.set(path.relative(root,file),found);
}
const catalog=Object.fromEntries([...candidates.entries()].sort((a,b)=>a[0].localeCompare(b[0])));
console.log('CATALOG_AUDIT='+JSON.stringify({htmlFiles:files.length,variantIds:candidates.size,
 conflicts:conflicts.slice(0,10),conflictsCount:conflicts.length,productsByFile:Object.fromEntries(patterns),
 examples:Object.entries(catalog).slice(0,5)}));
console.log('CATALOG_JSON='+JSON.stringify(catalog));
if(!candidates.size||conflicts.length)process.exitCode=1;
