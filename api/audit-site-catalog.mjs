// Diagnostic-only: inspect public HTML of the merchant's existing product pages.
// Do not infer approval from this report; prices and exact variant IDs must match UI.
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const paths=[
 'index.html','collections/all/index.html',
 'products/bitcoin-merch-bitaxe-601-gamma-power-supply-bitcoin-miner-1-5th-s/index.html',
 'products/bitcoin-merch-x-node-mini-bitcoin-full-node/index.html'
];
const patterns=[
 ['product-id',/product_id|productId|product-id|data-product-id|productId"\s*:/gi],
 ['variant-id',/variant_id|variantId|variant-id|data-variant-id/gi],
 ['variants-array',/["']variants["']\s*:/gi],
 ['price-field',/["'](?:price|price_min|price_max|amount)["']\s*:/gi],
 ['price-html',/class=["'][^"']*(?:price-item|product-price|price--|product__price)[^"']*/gi],
 ['form-id',/name=["']id["']/gi],
 ['cart-add',/\/cart\/add/gi],
 ['json-ld',/application\/ld\+json/gi],
 ['shopify-section',/Shopify\.shop|Shopify\.routes|product-form/gi],
 ['product-metadata',/product:price:amount|itemprop=["']price|data-price/gi]
];
function short(value) {
 return value.replace(/\s+/g,' ').replace(/data:image\/[^"']+/g,'[image]').slice(0,210);
}
for(const file of paths) {
 const html=fs.readFileSync(path.join(root,file),'utf8');
 console.log('FILE '+file+' '+html.length);
 for(const [label,pattern] of patterns){
  pattern.lastIndex=0;const a=[...html.matchAll(pattern)];
  console.log(' '+label+' count='+a.length+' samples='+JSON.stringify(a.slice(0,2).map(m=>short(html.slice(Math.max(0,m.index-75),m.index+130)))));
 }
}
