// Local browser smoke test. No real BTCPay credentials, payment or production traffic.
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types={'.js':'application/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
let apiHits=0;
const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname.startsWith('/api/')){
    if(u.pathname==='/api/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,btcpayConfigured:true,orderEncryptionConfigured:true,salesEnabled:false}));return}
    apiHits++;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'checkout_not_ready'}));return
  }
  const rel=decodeURIComponent(u.pathname);
  if(rel.includes('..')||rel.includes('\\')){res.writeHead(400);res.end();return}
  const file=path.join(root,rel,rel.endsWith('/')?'index.html':'');
  let body;
  try{body=await fs.readFile(file)}catch{res.writeHead(404);res.end();return}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(body)
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  const error=[];
  page.on('pageerror',e=>error.push(e.message));
  const product='/products/bitcoin-merch-goldshell-xt-box-580gh-s-xtm-miner/';
  await page.goto(origin+product,{waitUntil:'domcontentloaded'});
  await page.locator('.product-form button[type=submit]').click();
  await page.waitForSelector('#bmCartDrawer.is-open');
  const cart=await page.evaluate(()=>JSON.parse(localStorage.getItem('bm_cart_v1')||'[]'));
  assert.equal(cart.length,1,'cart should contain one item');
  assert.equal(cart[0].id,'46689766244582','selected variant ID must match pinned source');
  assert.equal(cart[0].price,2499.99,'cart amount must match displayed variant price');
  assert.equal(cart[0].qty,1);
  assert.ok(!(await page.locator('#bmCartDrawer').innerText()).includes('666 miner reviews'));
  assert.ok(!(await page.locator('#bmCartDrawer').innerText()).includes('You unlocked Free Shipping'));
  await page.goto(origin+'/checkout/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#payNowLabel')?.textContent?.includes('verification'));
  assert.equal(await page.locator('#payNow').isDisabled(),true,'payment must be disabled until approved');
  assert.ok((await page.locator('.co-shipping-note').first().innerText()).toLowerCase().includes('flat-rate'));
  assert.equal(await page.locator('.co-shipping-option[data-shipping="dhl"] .co-ship-price').innerText(),'FREE');
  assert.equal(await page.locator('.co-shipping-option[data-shipping="fedex"] .co-ship-price').innerText(),'$24.99');
  assert.equal(await page.locator('.co-shipping-option[data-shipping="ups"] .co-ship-price').innerText(),'$29.99');
  assert.equal(await page.locator('input[name="country"]').count(),1,'country entry must be open for regional delivery');
  await page.locator('input[name="country"]').fill('Japan');
  assert.equal(await page.locator('input[name="country"]').inputValue(),'Japan');
  assert.equal(await page.locator('#coTotal').innerText(),'$1,999.99','DHL flat shipping must preserve the base discounted total');
  await page.locator('.co-shipping-option[data-shipping="ups"]').click();
  assert.equal(await page.locator('#coShipping').innerText(),'$29.99');
  assert.equal(await page.locator('#payNow').isDisabled(),true,'reviewing other shipping methods cannot enable payment');
  assert.equal(await page.locator('#coSubtotal').innerText(),'$2,499.99');
  assert.equal(await page.locator('#coTotal').innerText(),'$2,029.98','UPS flat-rate shipping must add $29.99 after the 20% item discount');
  assert.equal(apiHits,0,'no API invoice call is permitted during draft checkout');
  assert.deepEqual(error,[],'page should have zero uncaught JS errors');
  console.log('BROWSER_CHECKOUT_SMOKE=OK '+JSON.stringify({cartVariantId:cart[0].id,cartUSD:cart[0].price,previewUSD:'1999.99',apiInvoiceCalls:apiHits}));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
