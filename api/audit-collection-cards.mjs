import fs from 'node:fs';
const files=['index.html','collections/bitaxe-miners/index.html','collections/all/index.html'];
const patterns=[
 /BITAXE MINERS/gi,/ADDING\.\.\./gi,/ADD TO CART/gi,/data-product-id/gi,
 /\/cart\/add(?:\.js)?/gi,/bm-cart\.js/gi,/product-form/gi,/quick-add/gi,
 /card__media/gi,/data-add-to-cart/gi,
];
for(const file of files){
 const s=fs.readFileSync(file,'utf8');console.log('COLLECTION_DIAGNOSTIC_FILE='+file+' LENGTH='+s.length);
 for(const pat of patterns){
  const list=[...s.matchAll(pat)];
  console.log('COLLECTION_DIAGNOSTIC='+JSON.stringify({
   file,pattern:String(pat),count:list.length,
   examples:list.slice(0,3).map(m=>s.slice(Math.max(0,m.index-550),Math.min(s.length,m.index+700)).replace(/\s+/g,' ').slice(0,1150))
  }));
 }
}
