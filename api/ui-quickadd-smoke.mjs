// Actual Chrome regression for inherited PageFly quick-add buttons on BITC homepage.
// Blocks all remote merchant Shopify scripts; no live payments or outbound orders.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const feed=JSON.parse(await fs.readFile(path.join(root,'api/live-products.json'),'utf8'));
const catalog=JSON.parse(await fs.readFile(path.join(root,'api/catalog.json'),'utf8'));
const map={};
for(const [route,p] of Object.entries(feed)){
 map[route]={title:p.title,image:p.image||'',productId:String(p.productId||''),checkoutEnabledForReview:!!p.checkoutEnabledForReview,
 variants:p.variants.map(v=>({id:String(v.id),title:v.title,cents:v.cents,available:!!v.available&&catalog[String(v.id)]?.cents===v.cents}))};
}
const seen=[];
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 seen.push(pathname);
 if(pathname==='/assets/bitc-variant-map.json'){
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(map));return;
 }
 let filename=path.join(root,pathname,pathname.endsWith('/')?'index.html':'');
 if(!filename.startsWith(root)){res.writeHead(403);res.end();return}
 try{
  let data=await fs.readFile(filename);
  if(filename.endsWith('.html')&&(pathname==='/'||pathname.startsWith('/collections/'))){
   let html=data.toString('utf8');
   // Recreate the publisher's verified, page-specific inline variant data.
   // This must make add-to-cart work on the very first click without a fetch.
   const subset={};
   for(const [route,product] of Object.entries(map)){
    if(html.includes('data-productid="'+product.productId+'"'))subset[product.productId]={...product,route};
   }
   assert.ok(Object.keys(subset).length>=3,'verified PageFly cards are embedded');
   const json=JSON.stringify(subset).replace(/</g,'\\u003c');
   const guard=await fs.readFile(path.join(root,'assets/bitc-early-cart.js'),'utf8');
   const preloaded='<script>'+guard+'</script>'+
    '<script type="application/json" id="bitc-quickadd-data">'+json+'</script>'+
    '<link id="bm-cart-styles" rel="stylesheet" href="/assets/bm-cart.css?v=20261014-fast-cart1">'+
    '<script async src="/assets/bm-cart.js?v=20261014-fast-cart1"></script>'+
    '<script async src="/assets/bitc-collection-quickadd.js?v=20261014-fast-cart1"></script>';
   html=html.replace(/<head\b[^>]*>/i,tag=>tag+preloaded);
   data=Buffer.from(html);
  }
  res.writeHead(200,{'Content-Type':filename.endsWith('.js')?'application/javascript':filename.endsWith('.html')?'text/html':filename.endsWith('.css')?'text/css':'application/octet-stream'});
  res.end(data);
 }catch{res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await ctx.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let external=0;
 await page.route('**/*',route=>{
  if(route.request().url().startsWith('http://127.0.0.1:'+server.address().port))return route.continue();
  external++;return route.abort();
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>!!window.BMCart?.get&&!!window.BITCQuickAddReady,{timeout:15000});
 const buttons=[
  {product:'8840397619430',sku:'45599680004326',price:119.99},
  {product:'9403792752870',sku:'47333103665382',price:399.99},
  {product:'9007580446950',sku:'46034473844966',price:249.99}
 ];
 for(const entry of buttons){
  const locator=page.locator('form.pf-product-form[data-productid="'+entry.product+'"] button[name="add"][data-product-id="'+entry.product+'"]').first();
  assert.ok(await locator.count(),'PageFly product card available '+entry.product);
  const afterClick=await locator.evaluate(el=>{
   el.click();
   return JSON.parse(localStorage.getItem('bm_cart_v1')||'[]');
  });
  assert.ok(afterClick.some(p=>p.id===entry.sku),'first click adds synchronously');
  const actual=afterClick.find(p=>p.id===entry.sku);
  assert.equal(actual.price,entry.price,'price must match server catalog');
  assert.equal(actual.qty,1,'must add only one item');
  assert.ok(!(await locator.textContent()).toLowerCase().startsWith('adding'),'not stuck in Adding...');
 }
 assert.equal(seen.filter(x=>/\/cart\/add(?:\.js)?/.test(x)).length,0,'never POST old Shopify add endpoint');
 assert.equal(seen.filter(x=>x==='/assets/bitc-variant-map.json').length,0,'inline preloaded cards never fetch catalog');
 assert.equal(await page.locator('#bmCartBadge').textContent(),'3','first-party cart updated immediately');
 assert.equal(await page.locator('.bm-cart-drawer.is-open').count(),1,'open BITC drawer immediately');
 console.log('BITC_HOME_QUICK_ADD_OK='+JSON.stringify({added:buttons.length,prices:buttons.map(b=>b.price),oldShopifyCartCalls:0,externalDependenciesBlocked:external}));
 // Regression: a customer clicks before either asynchronous script arrives.
 // The small inline head guard must hold the click and fulfill it exactly once.
 const pendingContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const pendingPage=await pendingContext.newPage();
 const base='http://127.0.0.1:'+server.address().port;
 await pendingPage.route('**/*',route=>
  route.request().url().startsWith(base)?route.continue():route.abort());
 let unblock;
 const gate=new Promise(resolve=>{unblock=resolve});
 await pendingPage.route('**/assets/bm-cart.js*',async route=>{await gate;await route.continue()});
 await pendingPage.route('**/assets/bitc-collection-quickadd.js*',async route=>{await gate;await route.continue()});
 try{
  await pendingPage.goto(base+'/',{waitUntil:'domcontentloaded',timeout:45000});
  const earlyButton=pendingPage.locator('form.pf-product-form[data-productid="8840397619430"] button[name="add"][data-product-id="8840397619430"]').first();
  assert.ok(await earlyButton.count(),'first-click test card exists');
  await earlyButton.evaluate(button=>button.click());
  assert.match((await earlyButton.textContent())||'',/Preparing cart/i,'first click is handled immediately');
  assert.equal(await pendingPage.evaluate(()=>JSON.parse(localStorage.getItem('bm_cart_v1')||'[]').length),0,'pending script has not inserted unverified items');
  unblock();
  await pendingPage.waitForFunction(()=>window.BITCQuickAddReady&&
   window.BMCart?.get().some(item=>item.id==='45599680004326'),{timeout:20000});
  const quantity=await pendingPage.evaluate(()=>
   window.BMCart.get().find(item=>item.id==='45599680004326')?.qty);
  assert.equal(quantity,1,'queued click is fulfilled exactly once');
  assert.equal(await pendingPage.locator('.bm-cart-drawer.is-open').count(),1,'queued click opens cart');
 }finally{
  unblock();
  await pendingContext.close();
 }
 console.log('BITC_EARLY_CLICK_QUEUE_OK');
 await ctx.close();
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
