import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.NODE_ENV = 'test';
const { validatedOrder, validatedCustomer, ensureQuoteAccepted, paymentState,
  encryptOrder, decryptOrder, keyBytes, getCatalog } = await import('./server.js');

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
