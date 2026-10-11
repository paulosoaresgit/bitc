import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.BTCPAY_WEBHOOK_SECRET = 'local-test-secret';
const { validatedOrder, validatedCustomer, signatureValid, ensureQuoteAccepted, verifiedInvoiceStatus } = await import('./server.js');

const base = { items: [{ id: 'reco-cards', qty: 1 }], shipping: 'dhl', shippingProtection: false };
test('invoice amount is calculated from server catalog, never from frontend price', () => {
  const order = validatedOrder(base);
  assert.equal(order.subtotalCents, 1800);
  assert.equal(order.discountCents, 360);
  assert.equal(order.amountCents, 1440);
});
test('shipping and protection are server-owned costs', () => {
  const order = validatedOrder({ ...base, shipping: 'fedex', shippingProtection: true });
  assert.equal(order.amountCents, 2760 + 2499);
});
test('tampered price and unknown items cannot reach BTCPay', () => {
  assert.throws(() => validatedOrder({ ...base, amount: 0.01 }), /client_prices_not_allowed/);
  assert.throws(() => validatedOrder({ ...base, items: [{ id: 'reco-cards', qty: 1, price: 0.01 }] }), /client_prices_not_allowed/);
  assert.throws(() => validatedOrder({ ...base, items: [{ id: 'unlisted-product', qty: 1 }] }), /catalog_item_unavailable/);
  assert.throws(() => validatedOrder({ ...base, shipping: 'unknown' }), /invalid_shipping/);
});
test('quantity limits cannot be bypassed with duplicate rows', () => {
  assert.throws(() => validatedOrder({ ...base, items: [{ id: 'reco-cards', qty: 10 }, { id: 'reco-cards', qty: 1 }] }), /invalid_quantity/);
  assert.throws(() => validatedOrder({ ...base, items: [{ id: 'reco-cards', qty: 0 }] }), /invalid_quantity/);
});
test('buyer address is validated before charging', () => {
  const buyer = { customer: { email: 'customer@example.com', firstName: 'Jo', lastName: 'Doe',
    country: 'United States', postalCode: '10001', street: 'Broadway', city: 'New York', state: 'NY' } };
  assert.equal(validatedCustomer(buyer).email, 'customer@example.com');
  assert.throws(() => validatedCustomer({ customer: { ...buyer.customer, email: 'bad' } }), /invalid_email/);
  assert.throws(() => validatedCustomer({ customer: { ...buyer.customer, street: '' } }), /missing_delivery_address/);
});
test('webhook HMAC checks the exact raw body', () => {
  const raw = Buffer.from('{"invoiceId":"invoice-123","type":"InvoiceSettled"}');
  const sig = 'sha256=' + crypto.createHmac('sha256', 'local-test-secret').update(raw).digest('hex');
  assert.equal(signatureValid(raw, sig), true);
  assert.equal(signatureValid(Buffer.from('different'), sig), false);
  assert.equal(signatureValid(raw, 'sha256='+'0'.repeat(64)), false);
});

test('payment invoice requires acceptance of the exact server quote', () => {
  const order = validatedOrder(base);
  assert.doesNotThrow(() => ensureQuoteAccepted({ expectedAmountCents: order.amountCents }, order));
  assert.throws(() => ensureQuoteAccepted({ expectedAmountCents: 1 }, order), /quote_expired/);
  assert.throws(() => ensureQuoteAccepted({ expectedAmountCents: '1440' }, order), /quote_expired/);
  assert.throws(() => ensureQuoteAccepted({}, order), /quote_expired/);
});

test('signed webhook reconciliation validates invoice ID, order, currency and amount', () => {
  const saved = { id: 'order-123', amount_cents: 1440, currency: 'USD', status: 'invoice_created' };
  const invoice = { id: 'inv-123', metadata: { orderId: 'order-123' }, amount: '14.40',
    currency: 'USD', status: 'Settled', additionalStatus: 'None' };
  assert.equal(verifiedInvoiceStatus(invoice, saved, 'inv-123'), 'settled');
  assert.throws(() => verifiedInvoiceStatus({...invoice, amount: '0.01'}, saved, 'inv-123'), /invoice_order_mismatch/);
  assert.throws(() => verifiedInvoiceStatus({...invoice, currency: 'EUR'}, saved, 'inv-123'), /invoice_order_mismatch/);
  assert.throws(() => verifiedInvoiceStatus({...invoice, metadata: {orderId: 'other'}}, saved, 'inv-123'), /invoice_order_mismatch/);
  assert.throws(() => verifiedInvoiceStatus({...invoice, id: 'other'}, saved, 'inv-123'), /invoice_order_mismatch/);
});
test('partial or late BTCPay payments never mark the order as settled automatically', () => {
  const saved = { id: 'order-123', amount_cents: 1440, currency: 'USD', status: 'invoice_created' };
  const invoice = { id: 'inv-123', metadata: { orderId: 'order-123' }, amount: '14.40',
    currency: 'USD', status: 'Settled', additionalStatus: 'PaidPartial' };
  assert.equal(verifiedInvoiceStatus(invoice, saved, 'inv-123'), 'review');
  assert.equal(verifiedInvoiceStatus({...invoice, additionalStatus: 'PaidLate'}, saved, 'inv-123'), 'review');
  assert.equal(verifiedInvoiceStatus({...invoice, additionalStatus: 'PaidOver'}, saved, 'inv-123'), 'settled');
  assert.equal(verifiedInvoiceStatus({...invoice, status: 'Expired', additionalStatus: 'None'}, saved, 'inv-123'), 'expired');
});
