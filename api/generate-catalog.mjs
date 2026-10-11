// Pull exact variant IDs and USD prices from the canonical product JSON embedded
// in the two captured merchant product pages. Stale app-wide prices are NOT trusted.
// The output remains a draft until the merchant confirms the current storefront.
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const productPaths=[
 'products/bitcoin-merch-bitaxe-601-gamma-power-supply-bitcoin-miner-1-5th-s/index.html',
 'products/bitcoin-merch-x-node-mini-bitcoin-full-node/index.html'
];
const catalog={
 'reco-cards':{title:'Cardsmiths Crypto Currency Collectible Cards - 1 Pack',cents:1800},
 'reco-gold-nugget':{title:'Gold Nugget Lottery Miner',cents:3600}
};
function readArray(s,start){
 let depth=0,quoted=false,escaped=false;
 for(let i=start;i<s.length;i++){
  const ch=s[i];
  if(quoted){
   if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;
   continue;
  }
  if(ch==='"'){quoted=true;continue;}
  if(ch==='[')depth++;
  else if(ch===']'){
   depth--;if(depth===0)return JSON.parse(s.slice(start,i+1));
  }
 }
 throw new Error('Unclosed product variants array');
}
const report=[];
for(const file of productPaths){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 const reg=/"variants"\s*:\s*\[\s*\{\s*"id"\s*:\s*\d+\s*,\s*"title"\s*:/g;
 const arrays=[];
 for(const m of html.matchAll(reg)){
  const start=html.indexOf('[',m.index);
  try{
   const variants=readArray(html,start);
   if(variants.length&&variants.every(v=>Number.isSafeInteger(v.id)&&Number.isSafeInteger(v.price)&&typeof v.name==='string'))arrays.push(variants);
  }catch{continue;}
 }
 if(!arrays.length)throw new Error('Missing canonical Shopify variants: '+file);
 // Choose the largest valid array; each item must contain a price and selected variant name.
 arrays.sort((a,b)=>b.length-a.length);
 const variants=arrays[0];
 let included=0;
 for(const variant of variants){
  if(variant.available===false)continue;
  const cents=variant.price;
  const id=String(variant.id);
  if(cents<50||cents>10000000||!/^\d{8,17}$/.test(id)||!variant.name.trim())throw new Error('Invalid variant from '+file+': '+id);
  if(catalog[id]&&catalog[id].cents!==cents)throw new Error('Variant price conflict: '+id);
  catalog[id]={title:variant.name.trim().slice(0,200),cents};
  included++;
 }
 report.push({file,candidateArrays:arrays.length,allVariants:variants.length,enabledVariants:included,
 sample:variants.slice(0,2).map(v=>({id:v.id,priceUSD:v.price/100,title:v.name}))});
}
console.log('CANONICAL_CATALOG_AUDIT='+JSON.stringify({count:Object.keys(catalog).length,report}));
console.log('CATALOG_JSON='+JSON.stringify(catalog));

if(process.argv.includes('--check')){
 const committed=JSON.parse(fs.readFileSync(path.join(root,'api/catalog.json'),'utf8'));
 const ordered=obj=>JSON.stringify(Object.entries(obj).sort(([a],[b])=>a.localeCompare(b)));
 if(ordered(committed)!==ordered(catalog))throw new Error('Committed canonical product variant prices differ from captured pages');
 console.log('CATALOG_CHECK=OK');
}
