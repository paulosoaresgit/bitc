// Real Chromium smoke test for the responsive BITC slide-out cart.
// No production orders, Shopify calls, private keys or BTCPay invoices.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const products=[
 {id:'46689766244582',title:'Bitcoin Merch® - NerdOCTaxe 9-12TH/s BTC Miner w/ Power Supply',price:399.99,image:'',url:'/products/miner/',variant:'Standard 9.6TH/s',qty:2},
 {id:'45599680004326',title:'Bitcoin Merch® - MARS LANDER V2 Lottery Miner',price:399.99,image:'',url:'/products/lander/',variant:'Compac A1 Double Speed 300 - 400 GH/s',qty:5}
];
let server;
let browser;
try{
 server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(pathname==='/'){
   res.writeHead(200,{'Content-Type':'text/html'});
   res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/bm-cart.css"><style>svg{width:260px!important;height:260px!important}.bm-shipping-options{display:block!important}button{font-size:26px!important;height:74px!important}</style></head><body><p>BITC checkout UI test</p><button id="openCart" onclick="BMCart.open()">Open cart</button><div id="tidio-chat" style="position:fixed;bottom:0;left:0;z-index:2147483647">Chat overlay</div><script src="/assets/bm-cart.js"></script></body></html>');
   return;
  }
  if(pathname==='/checkout/'){
   res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Secure checkout</title><p id="checkout">Checkout</p>');return;
  }
  if(pathname==='/assets/bm-cart.css'||pathname==='/assets/bm-cart.js'){
   const raw=await fs.readFile(path.join(root,pathname));
   res.writeHead(200,{'Content-Type':pathname.endsWith('.css')?'text/css':'application/javascript'});res.end(raw);return;
  }
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const base='http://127.0.0.1:'+server.address().port;
 for(const width of [320,375,390,445,1280]){
  const context=await browser.newContext({viewport:{width,height:780},isMobile:width<520,hasTouch:width<520});
  await context.addInitScript(data=>localStorage.setItem('bm_cart_v1',JSON.stringify(data)),products);
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/',{waitUntil:'load'});
  await page.locator('#openCart').click();
  await page.locator('.bm-cart-drawer.is-open').waitFor();
  const result=await page.evaluate(()=>{
   const pick=sel=>{const el=document.querySelector(sel);if(!el)return null;const rect=el.getBoundingClientRect();const style=getComputedStyle(el);return {x:rect.x,y:rect.y,w:rect.width,h:rect.height,right:rect.right,css:style.display,visibility:style.visibility}};
   const items=[...document.querySelectorAll('.bm-cart-item')].map(el=>{const row=el.getBoundingClientRect();const qty=el.querySelector('.bm-cart-qty').getBoundingClientRect();const price=el.querySelector('.bm-cart-price').getBoundingClientRect();return {rowW:row.width,qtyX:qty.x,qtyRight:qty.right,priceRight:price.right,infoRight:el.querySelector('.bm-cart-info').getBoundingClientRect().right}});
   return {viewport:innerWidth,drawer:pick('.bm-cart-drawer'),body:pick('.bm-cart-body'),footer:pick('.bm-cart-footer'),shipping:pick('.bm-shipping-compact'),button:pick('.bm-cart-checkout'),chat:pick('#tidio-chat'),items,subtotal:document.querySelector('.bm-subtotal')?.textContent?.trim(),count:document.querySelector('#bmCartBadge')?.textContent,
    rates:[...document.querySelectorAll('.bm-shipping-method')].map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,display:getComputedStyle(el).display})),
    shippingIcons:document.querySelectorAll('.bm-ship-progress svg,.bm-shipping-compact svg').length,
    removeIcon:pick('.bm-cart-remove svg'),cartStyle:!!document.getElementById('bm-cart-styles'),
    qtyHeight:pick('.bm-cart-qty')?.h,closeHeight:pick('.bm-cart-close')?.h};
  });
  assert.equal(result.count,'7');
  assert.ok(result.drawer.w<=width+1,'drawer does not overflow viewport');
  assert.ok(result.drawer.x>=-1,'drawer left boundary within viewport');
  assert.ok(result.button.w>=Math.min(width,445)-50,'checkout CTA fills footer');
  assert.ok(result.footer.h<=285,'compact shipping/footer must not overwhelm mobile viewport');
  assert.ok(result.body.y+result.body.h<=result.footer.y+2,'scrolling item list remains above footer');
  assert.ok(result.chat.visibility==='hidden','chat overlay hidden while cart is open');
  assert.ok(result.items.every(x=>x.qtyRight<=result.drawer.right+1&&x.priceRight<=result.drawer.right+1),'item controls fit inside drawer');
  assert.ok(result.shipping.w>=result.drawer.w-60,'shipping information remains wide enough');
  assert.ok(result.cartStyle,'standalone cart stylesheet is loaded');
  assert.equal(result.shippingIcons,0,'no giant inherited shipping svg');
  assert.equal(result.rates.length,3,'three compact shipping methods');
  assert.ok(result.rates.every(x=>x.width>55&&x.height<=65&&x.display==='flex'),'rates stay compact despite hostile legacy CSS');
  assert.ok(result.removeIcon.w<=18&&result.removeIcon.h<=18,'trash icon never inherits giant SVG sizing');
  assert.ok(result.qtyHeight<=38&&result.closeHeight<=42,'buttons are not stretched by merchant CSS');
  assert.ok(result.subtotal.includes('$2,799.93'),'line item subtotal remains unchanged');
  assert.deepEqual(errors,[],'no JavaScript exceptions');
  await page.locator('.bm-cart-item').first().locator('[data-act="plus"]').click();
  let cart=await page.evaluate(()=>JSON.parse(localStorage.getItem('bm_cart_v1')));
  assert.equal(cart[0].qty,3);
  assert.equal(await page.locator('#bmCartBadge').textContent(),'8');
  await page.locator('.bm-cart-item').nth(1).locator('[data-act="remove"]').click();
  cart=await page.evaluate(()=>JSON.parse(localStorage.getItem('bm_cart_v1')));
  assert.equal(cart.length,1);
  assert.equal(await page.locator('#bmCartBadge').textContent(),'3');
  await page.locator('.bm-cart-checkout').click();
  await page.waitForURL(/\/checkout\/$/);
  console.log('BITC_CART_DRAWER_MOBILE_OK='+JSON.stringify({width,drawer:result.drawer.w,footerHeight:Math.round(result.footer.h),buttonWidth:Math.round(result.button.w),shippingWidth:Math.round(result.shipping.w),items:result.items.length,updatedItems:cart.length}));
  await context.close();
 }
}finally{
 if(browser)await browser.close();
 if(server)await new Promise(resolve=>server.close(resolve));
}
