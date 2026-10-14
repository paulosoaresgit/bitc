import fs from 'node:fs';
const paths=['products/bitcoin-merch-bitaxe-601-gamma-power-supply-bitcoin-miner-1-5th-s/index.html','products/bitcoin-merch-x-node-mini-bitcoin-full-node/index.html'];
for(const file of paths){
 const s=fs.readFileSync(file,'utf8');
 const patterns=[['form_action',/<form[^>]+action=["'][^"']*\/cart\/add[^>]*>/gi],['submit',/<button[^>]*(?:name=["']add["']|type=["']submit["'])[^>]*>/gi],['payment_div',/<[^>]+class=["'][^"']*shopify-payment-button[^>]*>/gi],['paypal',/<[^>]+(?:paypal|PayPal)[^>]*>/gi],['variant_input',/<input[^>]*name=["']id["'][^>]*>/gi],['variant_select',/<select[^>]*(?:name=["']options|name=["']id|class=["'][^"']*variant)[^>]*>/gi],['cart_script',/<script[^>]*src=["'][^"']*bm-cart[^>]*>/gi],['product',/<[^>]+(?:product-form|product__info|product-form__buttons)[^>]*>/gi]];
 const rows=patterns.map(([name,re])=>{
  const m=[...s.matchAll(re)];
  return {name,count:m.length,examples:m.slice(0,3).map(x=>s.slice(Math.max(0,x.index-100),x.index+400).replace(/\s+/g,' ').slice(0,450))};
 });
 console.log('BITC_LEGACY_PRODUCT_FORMS='+JSON.stringify({file,bytes:s.length,rows}));
}

for(const file of paths){
 const html=fs.readFileSync(file,'utf8');
 const rex=/As\\s+Low\\s+As|101\\.99|Whale\\s+Battle\\s+Pass/gi;
 const m=[...html.matchAll(rex)];
 const excerpts=m.slice(0,10).map(x=>({match:x[0],near:html.slice(Math.max(0,x.index-800),Math.min(html.length,x.index+600)).replace(/\\s+/g,' ').slice(0,1400)}));
 console.log('BITC_LEGACY_PROMO_CONTEXT='+JSON.stringify({file,matches:m.length,excerpts}));
}
