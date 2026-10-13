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
