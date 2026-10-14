import fs from 'node:fs';
import path from 'node:path';
const roots=['index.html','collections','products','pages','checkout','blogs'];
const matches=[];
const patterns={
  meta_init:/\bfbq\s*\(\s*['"]init['"]/i,
  meta_script:/connect\.facebook\.net\/[^"'\s<>]*fbevents\.js/i,
  google_tag:/googletagmanager\.com\/(?:gtag\/js|gtm\.js)/i,
  google_config:/\bgtag\s*\(\s*['"]config['"]/i,
  google_legacy:/google-analytics\.com\/analytics\.js/i,
  tiktok_init:/\bttq\.load\s*\(/i,
};
function walk(f){
 if(!fs.existsSync(f))return;
 if(fs.statSync(f).isDirectory()){
  for(const name of fs.readdirSync(f))walk(path.join(f,name));
  return;
 }
 if(!f.endsWith('.html'))return;
 const text=fs.readFileSync(f,'utf8');
 const kinds=Object.entries(patterns).filter(([,regex])=>regex.test(text)).map(([k])=>k);
 if(kinds.length)matches.push({file:f,kinds});
}
for(const root of roots)walk(root);
console.log('LEGACY_TRACKING_AUDIT='+JSON.stringify({files:matches.length,samples:matches.slice(0,15),notice:'Any prior vendor tags or embedded tracking scripts require a manual consent and attribution audit; never reuse third-party IDs.'}));

for (const filename of ['index.html','products/bitcoin-merch-bitaxe-601-gamma-power-supply-bitcoin-miner-1-5th-s/index.html']){
 const source=fs.readFileSync(filename,'utf8');
 for(const [kind,pattern] of Object.entries(patterns)){
  const found=pattern.exec(source);
  if(found){
   const fragment=source.slice(Math.max(0,found.index-140),Math.min(source.length,found.index+180)).replace(/\s+/g,' ');
   console.log('LEGACY_TAG_CONTEXT='+JSON.stringify({file:filename,type:kind,fragment}));
  }
 }
}
