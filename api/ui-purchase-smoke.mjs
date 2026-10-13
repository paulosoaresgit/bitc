// Isolated actual-browser regression for captured Shopify product pages.
// Uses the real original 2.1MB HTML but a local static server; never touches BTCPay.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const live=JSON.parse(await fs.readFile(path.join(root,'api/live-products.json'),'utf8'));
const catalog=JSON.parse(await fs.readFile(path.join(root,'api/catalog.json'),'utf8'));
const map={};
for(const [route,p] of Object.entries(live)){
 map[route]={title:p.title,image:p.image||'',productId:String(p.productId||''),checkoutEnabledForReview:!!p.checkoutEnabledForReview,
 variants:p.variants.map(v=>({id:v.id,title:v.title,cents:v.cents,available:!!v.available&&catalog[v.id]?.cents===v.cents}))};
}
let externalRequests=0,remoteShopifyCartRequests=0,btcCalls=0;
const server=http.createServer(async(req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 if(pathname==='/assets/bitc-variant-map.json'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(map));return}
 if(pathname.startsWith('/api/')){
  btcCalls++;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,btcpayConfigured:true,orderEncryptionConfigured:true,salesEnabled:false}));return
 }
 const local=path.join(root,pathname,pathname.endsWith('/')?'index.html':'');
 if(!local.startsWith(root)){res.writeHead(403);res.end();return}
 try{
  const buf=await fs.readFile(local);
  let body=buf;
  if(local.endsWith('.html')&&pathname.startsWith('/products/')){
   let src=buf.toString('utf8');
   const inject='<script defer src="/assets/bitc-product-purchase.js"></script>';
   if(!src.includes('bitc-product-purchase.js'))src=src.replace(/<\/head\s*>/i,inject+'</head>');
   if(!src.includes('src="/assets/bm-cart.js"'))src=src.replace(/<\/head\s*>/i,'<script defer src="/assets/bm-cart.js"></script></head>');
   body=Buffer.from(src);
  }
  const type=local.endsWith('.js')?'application/javascript':local.endsWith('.html')?'text/html':'application/octet-stream';
  res.writeHead(200,{'Content-Type':type});res.end(body);
 }catch{res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const page=await context.newPage();
 page.on('request',req=>{
   if(req.url().includes('/cart/add'))remoteShopifyCartRequests++;
 });
 await page.route('**/*',route=>{
  if(route.request().url().startsWith(base))return route.continue();
  externalRequests++;return route.abort();
 });
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const product='/products/bitcoin-merch-bitaxe-601-gamma-power-supply-bitcoin-miner-1-5th-s/';
 await page.goto(base+product,{waitUntil:'domcontentloaded',timeout:30000});
 await page.locator('.bitc-buy-now:visible').first().waitFor({timeout:16000});
 const pform=page.locator('form.pf-product-form[data-productid="8840397619430"]:visible').first();
 assert.ok(await pform.count(),'canonical product form present on mobile');
 assert.equal(await page.locator('.shopify-payment-button:visible').count(),0,'Shopify / PayPal payment widgets must be hidden');
 const selects=pform.locator('select.pf-variant-select');
 assert.equal(await selects.count(),2,'expected Fan and Stand Color selectors on Bitaxe Gamma product');
 await selects.nth(0).selectOption('Standard');
 await selects.nth(1).selectOption('Orange');
 // The static test blocks external Shopify CSS, causing its sticky header to overlay
 // unrelated content. Trigger DOM click to test capture listeners independently of CSS.
 await pform.locator('button[name="add"], button[data-action="add-to-cart"],.product-form__add-button').first().evaluate(el=>el.click());
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('bm_cart_v1')||'[]').length===1);
 let cart=await page.evaluate(()=>JSON.parse(localStorage.getItem('bm_cart_v1')));
 assert.equal(cart[0].id,'45599680004326');
 assert.equal(cart[0].price,119.99);
 assert.equal(cart[0].qty,1);
 await page.evaluate(()=>localStorage.removeItem('bm_cart_v1'));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('.bitc-buy-now:visible').first().waitFor({timeout:16000});
 const form2=page.locator('form.pf-product-form[data-productid="8840397619430"]:visible').first();
 const opt=form2.locator('select.pf-variant-select');
 await opt.nth(0).selectOption('Premium Quiet Fan Upgrade');
 await opt.nth(1).selectOption('Blue');
 await page.waitForFunction(()=>document.querySelector('form.pf-product-form[data-productid="8840397619430"]:not([style*="display: none"]) .bitc-option-price')?.textContent?.includes('Premium')||[...document.querySelectorAll('.bitc-option-price')].some(x=>x.textContent?.includes('Premium')));
 const buy=form2.locator('.bitc-buy-now');
 assert.equal(await buy.isEnabled(),true);
 const box=await buy.boundingBox();assert.ok(box&&box.width>=250&&box.x>=0&&box.x+box.width<=405,'buy-now fits mobile');
 await buy.evaluate(el=>el.click());
 await page.waitForURL(/\/checkout\//,{timeout:8000});
 cart=await page.evaluate(()=>JSON.parse(localStorage.getItem('bm_cart_v1')||'[]'));
 assert.equal(cart.length,1);
 assert.equal(cart[0].id,'46034447499494','premium fan + blue ID');
 assert.equal(cart[0].price,154.99);
 assert.equal(remoteShopifyCartRequests,0,'native Shopify cart never contacted');
 assert.equal(btcCalls,0,'no invoice issued during test');
 assert.deepEqual(errors,[],'no uncaught product JavaScript errors');
 console.log('CANONICAL_MOBILE_CART_BUY_NOW_OK='+JSON.stringify({standardUSD:119.99,upgradedUSD:154.99,variant:cart[0].id,remoteShopifyCartRequests,btcCalls,externalRequests}));
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
