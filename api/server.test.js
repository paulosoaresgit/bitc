import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.BITC_PROTECTION_APPROVED = 'true';
const { validatedOrder, validatedCustomer, ensureQuoteAccepted, paymentState,
  encryptOrder, decryptOrder, keyBytes, getCatalog, verifiedFulfillment, SHIPPING_CENTS,
  onchainDestination, invoiceAccessToken, authorizeInvoiceAccess, publicInvoiceState } = await import('./server.js');

const base = { items: [{ id: 'reco-cards', qty: 1 }], shipping: 'dhl', shippingProtection: false };
const TEST_KEY = crypto.randomBytes(32).toString('hex');

test('invoice amounts are calculated from server catalog, not browser prices', () => {
  const order = validatedOrder(base);
  assert.equal(order.subtotalCents, 1800);
  assert.equal(order.discountCents, 360);
  assert.equal(order.amountCents, 1440);
});
test('shipping costs and optional protection remain server-owned', () => {
  const order = validatedOrder({ ...base, shipping: 'fedex', shippingProtection: true });
  assert.equal(order.amountCents, 2760 + 2499);
});
test('tampered browser prices, shipping and unknown SKUs are blocked', () => {
  assert.throws(() => validatedOrder({ ...base, amount: 0.01 }), /client_prices_not_allowed/);
  assert.throws(() => validatedOrder({ ...base, items: [{id:'reco-cards',qty:1,price:0.01}] }), /client_prices_not_allowed/);
  assert.throws(() => validatedOrder({ ...base, items: [{id:'fake-product',qty:1}] }), /catalog_item_unavailable/);
  assert.throws(() => validatedOrder({ ...base, shipping:'unknown' }), /invalid_shipping/);
});
test('duplicate items cannot bypass quantity limits', () => {
  assert.throws(() => validatedOrder({ ...base, items:[{id:'reco-cards',qty:10},{id:'reco-cards',qty:1}] }), /invalid_quantity/);
  assert.throws(() => validatedOrder({ ...base, items:[{id:'reco-cards',qty:0}] }), /invalid_quantity/);
});
test('customer shipping details are validated', () => {
  const customer = { email:'buyer@example.com', firstName:'Jo', lastName:'Doe',
    country:'United States', postalCode:'10001', street:'Broadway', city:'New York', state:'NY' };
  assert.equal(validatedCustomer({customer}).email, customer.email);
  assert.throws(() => validatedCustomer({customer:{...customer, email:'bad'}}), /invalid_email/);
  assert.throws(() => validatedCustomer({customer:{...customer, street:''}}), /missing_delivery_address/);
});
test('checkout requires exact server quote before creating invoice', () => {
  const order=validatedOrder(base);
  assert.doesNotThrow(() => ensureQuoteAccepted({expectedAmountCents:order.amountCents},order));
  assert.throws(() => ensureQuoteAccepted({expectedAmountCents:1},order), /quote_expired/);
  assert.throws(() => ensureQuoteAccepted({expectedAmountCents:'1440'},order), /quote_expired/);
  assert.throws(() => ensureQuoteAccepted({},order), /quote_expired/);
});
test('private order metadata round trips through authenticated encryption', () => {
  const orderId=crypto.randomUUID();
  const record={orderId, customer:{name:'Jo', email:'buyer@example.com', street:'Secret address'},
    amountCents:1440, items:[{id:'reco-cards',qty:1}]};
  const token=encryptOrder(orderId,record,TEST_KEY);
  assert.equal(token.split('.').length,4);
  assert.ok(!token.includes('buyer@example.com'));
  assert.deepEqual(decryptOrder(orderId,token,TEST_KEY),record);
  assert.notEqual(encryptOrder(orderId,record,TEST_KEY),token);
  assert.throws(() => decryptOrder('other-id',token,TEST_KEY));
  assert.throws(() => decryptOrder(orderId,token,crypto.randomBytes(32).toString('hex')));
  const p=token.split('.');
  p[3]=p[3].slice(0,-2)+(p[3].endsWith('A')?'BC':'AB');
  assert.throws(() => decryptOrder(orderId,p.join('.'),TEST_KEY));
});
test('order encryption rejects missing or malformed keys', () => {
  assert.throws(() => keyBytes(''), /order_encryption_not_configured/);
  assert.throws(() => keyBytes('not-hex'), /order_encryption_not_configured/);
});
test('paid order classification never ships before BTCPay settlement', () => {
  assert.equal(paymentState({status:'New'}),'AWAITING_PAYMENT');
  assert.equal(paymentState({status:'Processing'}),'AWAITING_PAYMENT');
  assert.equal(paymentState({status:'Expired'}),'NOT_PAID');
  assert.equal(paymentState({status:'Invalid'}),'NOT_PAID');
  assert.equal(paymentState({status:'Settled',additionalStatus:'None'}),'PAID');
  assert.equal(paymentState({status:'Settled',additionalStatus:'PaidPartial'}),'REVIEW');
  assert.equal(paymentState({status:'Settled',additionalStatus:'PaidLate'}),'REVIEW');
  assert.equal(paymentState({status:'Settled',additionalStatus:'PaidOver'}),'REVIEW');
});

test('captured product pages map every option to a fixed server price', () => {
  const cat = getCatalog();
  assert.ok(Object.keys(cat).length >= 33);
  assert.equal(cat['45599680004326'].cents, 11999);
  assert.equal(cat['47340173164774'].cents, 79999);
  assert.equal(cat['47012515250406'].cents, 89999);
  const order=validatedOrder({...base,items:[{id:'45599680004326',qty:1}]});
  assert.equal(order.amountCents,9599);
});

test('every referenced product has a local detail page', () => {
  const report = JSON.parse(readFileSync(new URL('./product-page-report.json', import.meta.url), 'utf8'));
  const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  assert.equal(report.totalRoutes, 152);
  for (const route of Object.keys(report.products)) {
    assert.ok(route.startsWith('/products/') && !route.includes('..'));
    assert.ok(existsSync(path.join(base, route.slice(1), 'index.html')), route);
  }
});

test('each purchase-enabled product variant is price-pinned to the actual server catalog', () => {
  const live = JSON.parse(readFileSync(new URL('./live-products.json', import.meta.url), 'utf8'));
  const catalog = getCatalog();
  for (const [route,product] of Object.entries(live)) {
    const available = product.variants.filter(v=>v.available);
    if (product.checkoutEnabledForReview) {
      assert.ok(available.length>0, route);
      for (const v of available)
        assert.equal(catalog[v.id]?.cents, v.cents, 'price mismatch for '+route+' variant '+v.id);
    }
    if (product.priceMismatchWithListing) {
      for (const v of product.variants)
        assert.equal(catalog[v.id], undefined, 'disputed price must stay blocked for '+route);
    }
  }
});

test('protection cannot be charged without merchant approval',()=>{
  delete process.env.BITC_PROTECTION_APPROVED;
  try{assert.throws(()=>validatedOrder({...base,shippingProtection:true}), /protection_not_available/);}
  finally{process.env.BITC_PROTECTION_APPROVED='true';}
});

test('prelaunch checkout is disabled even if BTCPay credentials are present',async()=>{
  const {server}=await import('./server.js');
  delete process.env.BITC_SALES_ENABLED;
  const origin='https://bitcmining.tech';
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const baseUrl='http://127.0.0.1:'+server.address().port;
    const health=await fetch(baseUrl+'/api/health',{headers:{Origin:origin}});
    assert.equal(health.status,200);
    assert.equal((await health.json()).salesEnabled,false);
    const response=await fetch(baseUrl+'/api/create-btcpay-invoice',{
      method:'POST',headers:{'Content-Type':'application/json',Origin:origin},
      body:JSON.stringify({items:[{id:'45599680004326',qty:1}],shipping:'dhl',shippingProtection:false,expectedAmountCents:9599})
    });
    assert.equal(response.status,503);
    assert.equal((await response.json()).error,'checkout_not_ready');
  }finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
});

test('unavailable source product variants are never accepted by quote',()=>{
  const live=JSON.parse(readFileSync(new URL('./live-products.json',import.meta.url),'utf8'));
  const cat=getCatalog();
  for(const [route,p] of Object.entries(live)){
    if(p.checkoutEnabledForReview)continue;
    for(const v of p.variants){
      if(!v.available) assert.equal(cat[v.id],undefined,'unavailable '+route+' '+v.id);
    }
  }
});

test('flat shipping prices do not depend on delivery country', () => {
  assert.deepEqual(SHIPPING_CENTS, { dhl: 0, fedex: 2499, ups: 2999 });
  const order=validatedOrder({ ...base, items: [{ id:'45599680004326', qty: 1 }] });
  const customers=['Brazil','United States','Canada','Japan','Australia','South Africa','France','New Zealand'];
  for(const country of customers)assert.doesNotThrow(()=>verifiedFulfillment(order,{country}),country);
  for(const [service,fee] of Object.entries(SHIPPING_CENTS)){
    const quote=validatedOrder({...base,shipping:service});
    assert.equal(quote.shippingCents,fee,service);
    assert.equal(quote.amountCents,1440+fee,service);
  }
});
test('optional inventory and country exclusions still block selected SKUs or destinations', () => {
  const o=validatedOrder(base);
  const oldBlocked=process.env.BITC_BLOCKED_SKUS;
  const oldCountries=process.env.BITC_BLOCKED_SHIP_TO_COUNTRIES;
  const oldAllowed=process.env.BITC_FULFILLABLE_SKUS;
  const oldDest=process.env.BITC_SHIP_TO_COUNTRIES;
  try {
    delete process.env.BITC_FULFILLABLE_SKUS;
    delete process.env.BITC_SHIP_TO_COUNTRIES;
    process.env.BITC_BLOCKED_SKUS='reco-cards';
    assert.throws(()=>verifiedFulfillment(o,{country:'Brazil'}),/inventory_not_verified/);
    delete process.env.BITC_BLOCKED_SKUS;
    process.env.BITC_BLOCKED_SHIP_TO_COUNTRIES='Brazil';
    assert.throws(()=>verifiedFulfillment(o,{country:'brazil'}),/delivery_country_unavailable/);
    delete process.env.BITC_BLOCKED_SHIP_TO_COUNTRIES;
    process.env.BITC_FULFILLABLE_SKUS='45599680004326';
    assert.throws(()=>verifiedFulfillment(o,{country:'France'}),/inventory_not_verified/);
    delete process.env.BITC_FULFILLABLE_SKUS;
    process.env.BITC_SHIP_TO_COUNTRIES='Canada';
    assert.throws(()=>verifiedFulfillment(o,{country:'France'}),/delivery_country_unavailable/);
  } finally {
    for(const [name,v] of [['BITC_BLOCKED_SKUS',oldBlocked],['BITC_BLOCKED_SHIP_TO_COUNTRIES',oldCountries],['BITC_FULFILLABLE_SKUS',oldAllowed],['BITC_SHIP_TO_COUNTRIES',oldDest]]){
      if(v===undefined) delete process.env[name];
      else process.env[name]=v;
    }
  }
});

test('merchant-confirmed shipping policy matches API and client fixed rates', () => {
  const policy = JSON.parse(readFileSync(new URL('./approved-shipping-policy.json', import.meta.url), 'utf8'));
  assert.equal(policy.currency, 'USD');
  assert.equal(policy.basis, 'per_order');
  assert.equal(policy.destinationPricing, 'same_price_for_all_served_regions');
  assert.equal(policy.merchantConfirmedOn, '2026-10-12');
  assert.equal(policy.paymentLaunchAuthorized, false);
  assert.deepEqual(SHIPPING_CENTS, policy.ratesCents);
  const cartJS=readFileSync(new URL('../assets/bm-checkout.js', import.meta.url), 'utf8');
  const found=/\bSHIPPING_PRICES\s*=\s*\{([^}]+)\}/.exec(cartJS);
  assert.ok(found, 'client shipping rate map must exist');
  const entries=found[1].split(',').map(x=>x.trim().split(':'));
  const clientRates=Object.fromEntries(entries.map(([carrier, USD])=>[carrier,Math.round(Number(USD)*100)]));
  assert.deepEqual(clientRates,policy.ratesCents,'API and browser shipping rates must stay aligned');
  const checkoutHTML=readFileSync(new URL('../checkout/index.html', import.meta.url), 'utf8');
  for(const carrier of Object.keys(policy.ratesCents)){
    assert.match(checkoutHTML,new RegExp('data-shipping="'+carrier+'"'));
  }
  assert.match(checkoutHTML,/Checkout not published yet/);
});


test('only a BTCPay-issued onchain BTC destination may be displayed for Binance',()=>{
  const valid={paymentMethodId:'BTC-OnChain',destination:'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',due:'0.00075342',activated:true};
  assert.deepEqual(onchainDestination([valid]),{network:'Bitcoin (BTC)',address:valid.destination,amountBTC:valid.due});
  assert.throws(()=>onchainDestination([{...valid,paymentMethodId:'BTC-LightningNetwork'}]),/onchain_not_available/);
  assert.throws(()=>onchainDestination([{...valid,destination:'0xbadethereumwallet'}]),/invalid_payment_destination/);
  assert.throws(()=>onchainDestination([{...valid,destination:'tb1qfakeaddress'}]),/invalid_payment_destination/);
  assert.throws(()=>onchainDestination([{...valid,due:'0'}]),/invalid_payment_amount/);
  assert.throws(()=>onchainDestination([{...valid,due:'0.000000001'}]),/invalid_payment_amount/);
  assert.throws(()=>onchainDestination([{...valid,activated:false}]),/onchain_not_available/);
});
test('signed invoice-status token is bound to both the invoice and private order',()=>{
  const token=invoiceAccessToken('invoice-12345','order-12345',TEST_KEY);
  assert.equal(token.length,64);
  assert.equal(invoiceAccessToken('invoice-12345','order-12345',TEST_KEY),token);
  assert.ok(!token.includes(TEST_KEY));
  assert.equal(authorizeInvoiceAccess('invoice-12345','order-12345',token,TEST_KEY),true);
  assert.equal(authorizeInvoiceAccess('invoice-tampered','order-12345',token,TEST_KEY),false);
  assert.equal(authorizeInvoiceAccess('invoice-12345','order-tampered',token,TEST_KEY),false);
  assert.equal(publicInvoiceState({status:'New'}),'awaiting');
  assert.equal(publicInvoiceState({status:'Processing'}),'processing');
  assert.equal(publicInvoiceState({status:'Settled',additionalStatus:'None'}),'settled');
  assert.equal(publicInvoiceState({status:'Settled',additionalStatus:'PaidPartial'}),'review');
  assert.equal(publicInvoiceState({status:'Expired'}),'expired');
});
