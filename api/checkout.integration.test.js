import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.NODE_ENV='test';
process.env.BTCPAY_URL='https://pay.bitcmining.tech';
process.env.BTCPAY_API_KEY='INTEGRATION_FAKE_KEY';
process.env.BTCPAY_STORE_ID='INTEGRATION_FAKE_STORE';
process.env.BITC_ORDER_ENCRYPTION_KEY=crypto.randomBytes(32).toString('hex');
for(const name of ['BITC_SALES_ENABLED','BITC_SHIPPING_APPROVED','BITC_INVENTORY_APPROVED','BITC_TERMS_APPROVED'])
  delete process.env[name];

const { server, decryptOrder, salesReady } = await import('./server.js');
const fetchHTTP=globalThis.fetch.bind(globalThis);
const CART={items:[{id:'45599680004326',qty:1}],shipping:'dhl',shippingProtection:false};
const BUYER={email:'example@example.test',firstName:'Demo',lastName:'Customer',country:'United States',
  postalCode:'10001',street:'Test Avenue',city:'New York',state:'NY'};
const response=(json,status=200)=>({ok:status>=200&&status<300,status,async text(){return JSON.stringify(json)}});

test('full API-to-mocked-BTCPay contract: payment lock, quotes, price, invoice, encryption, receipt',async()=>{
  globalThis.fetch=async()=>{throw new Error('Unexpected upstream request before test initialization')};
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const API=async(path,payload)=>{
    const r=await fetchHTTP(base+path,{method:'POST',headers:{Origin:'https://bitcmining.tech','Content-Type':'application/json'},
      body:JSON.stringify(payload)});
    return {status:r.status,body:await r.json()};
  };
  try{
    const health=await fetchHTTP(base+'/api/health');
    assert.equal((await health.json()).salesEnabled,false);
    assert.equal(salesReady(),false);

    const quoted=await API('/api/quote',CART);
    assert.equal(quoted.status,200);
    assert.equal(quoted.body.amountCents,9599);
    const request={...CART,expectedAmountCents:9599,customer:BUYER};
    const blocked=await API('/api/create-btcpay-invoice',request);
    assert.equal(blocked.status,503);
    assert.equal(blocked.body.error,'checkout_not_ready');

    const activations=['BITC_SALES_ENABLED','BITC_SHIPPING_APPROVED','BITC_INVENTORY_APPROVED','BITC_TERMS_APPROVED'];
    for(const name of activations){
      process.env[name]='true';
      if(name!=='BITC_TERMS_APPROVED')assert.equal(salesReady(),false);
    }
    assert.equal(salesReady(),true);
    const network=[];
    let saved;
    globalThis.fetch=async(url,options)=>{
      network.push({url,method:options.method,auth:options.headers.Authorization});
      assert.match(url.toString(),/\/api\/v1\/stores\/INTEGRATION_FAKE_STORE\/invoices/);
      assert.equal(options.headers.Authorization,'token INTEGRATION_FAKE_KEY');
      if(options.method==='POST'){
        saved=JSON.parse(options.body);
        assert.equal(saved.amount,'95.99');
        assert.equal(saved.currency,'USD');
        assert.equal(saved.metadata.physical,true);
        assert.ok(saved.metadata.bitcOrderEncrypted);
        return response({id:'INVOICE_TEST_123',checkoutLink:'https://pay.bitcmining.tech/i/INVOICE_TEST_123',status:'New'});
      }
      return response({id:'INVOICE_TEST_123',amount:'95.99',currency:'USD',metadata:saved.metadata,status:'New'});
    };
    const wrong=await API('/api/create-btcpay-invoice',{...request,expectedAmountCents:1});
    assert.equal(wrong.status,409);
    assert.equal(wrong.body.error,'quote_expired');
    const illegal=await API('/api/create-btcpay-invoice',{...request,amount:0.01});
    assert.equal(illegal.status,400);
    assert.equal(illegal.body.error,'client_prices_not_allowed');
    assert.equal(network.length,0,'rejected requests must not contact BTCPay');
    // Merchant-approved ample stock + flat-rate delivery do not require
    // an exhaustive SKU/country allowlist, but exceptions must stay blockable.
    process.env.BITC_BLOCKED_SKUS='45599680004326';
    const noStock=await API('/api/create-btcpay-invoice',request);
    assert.equal(noStock.status,400);
    assert.equal(noStock.body.error,'inventory_not_verified');
    delete process.env.BITC_BLOCKED_SKUS;
    process.env.BITC_BLOCKED_SHIP_TO_COUNTRIES='United States';
    const noCountry=await API('/api/create-btcpay-invoice',request);
    assert.equal(noCountry.status,400);
    assert.equal(noCountry.body.error,'delivery_country_unavailable');
    delete process.env.BITC_BLOCKED_SHIP_TO_COUNTRIES;
    const invoice=await API('/api/create-btcpay-invoice',request);
    assert.equal(invoice.status,200);
    assert.equal(invoice.body.id,'INVOICE_TEST_123');
    assert.equal(invoice.body.amountUSD,'95.99');
    assert.equal(invoice.body.checkoutLink,'https://pay.bitcmining.tech/i/INVOICE_TEST_123');
    assert.equal(network.length,2,'one invoice POST and one read-back GET');
    const privateOrder=decryptOrder(saved.metadata.orderId,saved.metadata.bitcOrderEncrypted);
    assert.equal(privateOrder.customer.street,BUYER.street);
    assert.equal(privateOrder.amountCents,9599);
    assert.equal(privateOrder.items[0].id,'45599680004326');
    assert.equal(JSON.stringify(saved).includes(BUYER.street),false);
    assert.equal(JSON.stringify(invoice).includes(BUYER.street),false);
    const inactive=['BITC_INVENTORY_APPROVED'];
    for(const name of inactive)delete process.env[name];
    const reblocked=await API('/api/create-btcpay-invoice',request);
    assert.equal(reblocked.status,503);
    assert.equal(reblocked.body.error,'checkout_not_ready');
  }finally{
    globalThis.fetch=fetchHTTP;
    for(const name of ['BITC_SALES_ENABLED','BITC_SHIPPING_APPROVED','BITC_INVENTORY_APPROVED','BITC_TERMS_APPROVED'])
      delete process.env[name];
    delete process.env.BITC_FULFILLABLE_SKUS;
    delete process.env.BITC_SHIP_TO_COUNTRIES;
    delete process.env.BITC_BLOCKED_SKUS;
    delete process.env.BITC_BLOCKED_SHIP_TO_COUNTRIES;
    await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  }
});
