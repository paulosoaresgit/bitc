import http from 'node:http';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { keyBytes, encryptOrder, decryptOrder, paymentState } from './order-utils.js';

const PORT = Number(process.env.PORT || 10000);
const BTCPAY_URL = (process.env.BTCPAY_URL || 'https://pay.bitcmining.tech').replace(/\/+$/, '');
const API_KEY = process.env.BTCPAY_API_KEY || '';
const STORE_ID = process.env.BTCPAY_STORE_ID || '';
const ORDER_ENCRYPTION_KEY = process.env.BITC_ORDER_ENCRYPTION_KEY || '';

const ALLOWED = new Set([
  'https://bitc-mining-preview.onrender.com',
  'https://bitcmining.tech',
  'https://www.bitcmining.tech'
]);
const SHIPPING_CENTS = Object.freeze({ dhl: 0, fedex: 2499, ups: 2999 });
const PROTECTION_CENTS = 1650;
const DISCOUNT_PERCENT = 20;

// The captured storefront's canonical Shopify variant IDs/prices are checked in.
// Never accept browser-provided prices or dynamic app-wide prices (which may be stale).
const BASE_CATALOG = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url), 'utf8'));
function getCatalog() {
  for (const [id, item] of Object.entries(BASE_CATALOG)) {
    if (!/^(\\d{8,17}|reco-cards|reco-gold-nugget)$/.test(id) || !item ||
        !Number.isSafeInteger(item.cents) || item.cents < 50 || item.cents > 10000000 ||
        typeof item.title !== 'string' || !item.title.trim()) {
      throw new Error('invalid_server_catalog');
    }
  }
  return BASE_CATALOG;
}
function respond(res, status, body, origin = '') {
  if (ALLOWED.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.writeHead(status);
  res.end(JSON.stringify(body));
}
async function rawBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw new Error('payload_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function validatedOrder(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid_order');
  if (['amount', 'price', 'total', 'currency', 'orderId'].some(k => Object.hasOwn(data, k))) {
    throw new Error('client_prices_not_allowed');
  }
  if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 30) throw new Error('invalid_items');
  const catalog = getCatalog();
  let subtotal = 0;
  const items = [];
  const quantities = new Map();
  for (const row of data.items) {
    if (!row || typeof row !== 'object' || Object.keys(row).some(k => !['id', 'qty'].includes(k))) {
      throw new Error('client_prices_not_allowed');
    }
    const id = String(row.id || '');
    const qty = row.qty;
    if (!catalog[id]) throw new Error('catalog_item_unavailable');
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 10) throw new Error('invalid_quantity');
    quantities.set(id, (quantities.get(id) || 0) + qty);
    if (quantities.get(id) > 10) throw new Error('invalid_quantity');
    const cents = catalog[id].cents * qty;
    subtotal += cents;
    items.push({ id, qty, title: catalog[id].title, unitCents: catalog[id].cents });
  }
  const shipping = String(data.shipping || '');
  if (!Object.hasOwn(SHIPPING_CENTS, shipping)) throw new Error('invalid_shipping');
  if (typeof data.shippingProtection !== 'boolean') throw new Error('invalid_protection');
  const protectionCents = data.shippingProtection ? PROTECTION_CENTS : 0;
  const discountedBase = subtotal + protectionCents;
  const discountCents = Math.round(discountedBase * DISCOUNT_PERCENT / 100);
  const amountCents = discountedBase - discountCents + SHIPPING_CENTS[shipping];
  if (amountCents < 50 || amountCents > 10000000) throw new Error('invalid_total');
  return { items, shipping, shippingProtection: data.shippingProtection, subtotalCents: subtotal,
    protectionCents, discountCents, shippingCents: SHIPPING_CENTS[shipping], amountCents };
}
// The client may acknowledge a quote, but can never set the payable amount.
function ensureQuoteAccepted(data, order) {
  if (!Number.isSafeInteger(data.expectedAmountCents) || data.expectedAmountCents !== order.amountCents) {
    throw new Error('quote_expired');
  }
}
function validatedCustomer(data) {
  const c = data.customer;
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error('missing_delivery_address');
  const fields = ['email','firstName','lastName','country','postalCode','street','buildingNumber','city','state','phone','address2','company','neighborhood'];
  const customer = {};
  for (const key of fields) customer[key] = String(c[key] || '').trim().slice(0, 200);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email) || customer.email.length > 200) throw new Error('invalid_email');
  for (const key of ['firstName','lastName','country','postalCode','street','city','state']) {
    if (!customer[key]) throw new Error('missing_delivery_address');
  }
  return customer;
}
async function btcpay(path, method = 'GET', payload) {
  const response = await fetch(BTCPAY_URL + '/api/v1/stores/' + encodeURIComponent(STORE_ID) + path, {
    method,
    headers: { Authorization: 'token ' + API_KEY, 'Content-Type': 'application/json' },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(15000)
  });
  const result = await response.text();
  if (!response.ok) {
    console.error('btcpay_request_failed', response.status, result.slice(0, 350));
    throw new Error('btcpay_request_failed');
  }
  return JSON.parse(result);
}
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (req.method === 'OPTIONS') {
    if (ALLOWED.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.writeHead(204);
    return res.end();
  }
  if ((pathname === '/health' || pathname === '/api/health') && req.method === 'GET') {
    return respond(res, 200, { ok: true, btcpayConfigured: Boolean(API_KEY && STORE_ID),
      orderStorage: 'encrypted_btcpay_invoice_metadata', orderEncryptionConfigured: /^[a-fA-F0-9]{64}$/.test(ORDER_ENCRYPTION_KEY) }, origin);
  }
  if (pathname === '/api/quote' && req.method === 'POST') {
    if (!ALLOWED.has(origin)) return respond(res, 403, { error: 'origin_not_allowed' }, origin);
    try {
      const body = JSON.parse((await rawBody(req)).toString('utf8'));
      const order = validatedOrder(body);
      return respond(res, 200, {
        amountCents: order.amountCents, amountUSD: (order.amountCents / 100).toFixed(2),
        subtotalCents: order.subtotalCents, discountCents: order.discountCents,
        shippingCents: order.shippingCents, protectionCents: order.protectionCents
      }, origin);
    } catch (error) {
      const code = String(error.message || '');
      const allowed = new Set(['client_prices_not_allowed','invalid_order','invalid_items','catalog_item_unavailable','invalid_quantity',
        'invalid_shipping','invalid_protection','invalid_total']);
      return respond(res, allowed.has(code) ? 400 : 503, { error: allowed.has(code) ? code : 'quote_unavailable' }, origin);
    }
  }
  if (pathname !== '/api/create-btcpay-invoice' || req.method !== 'POST') return respond(res, 404, { error: 'not_found' }, origin);
  if (!ALLOWED.has(origin)) return respond(res, 403, { error: 'origin_not_allowed' }, origin);
  if (!API_KEY || !STORE_ID || !/^[a-fA-F0-9]{64}$/.test(ORDER_ENCRYPTION_KEY)) {
    return respond(res, 503, { error: 'checkout_not_configured' }, origin);
  }
  let id;
  try {
    const body = JSON.parse((await rawBody(req)).toString('utf8'));
    const order = validatedOrder(body);
    ensureQuoteAccepted(body, order);
    const customer = validatedCustomer(body);
    id = crypto.randomUUID();
    // BTCPay invoices are the sole payment/order record. No extra database required.
    // Keep shipping PII encrypted even if invoice metadata is returned in a public receipt.
    const privateOrder = {
      version: 1, orderId: id, createdAt: new Date().toISOString(),
      customer, items: order.items, shipping: order.shipping,
      shippingProtection: order.shippingProtection,
      amountCents: order.amountCents, currency: 'USD',
      subtotalCents: order.subtotalCents, discountCents: order.discountCents,
      protectionCents: order.protectionCents, shippingCents: order.shippingCents
    };
    const encryptedRecord = encryptOrder(id, privateOrder);
    const invoice = await btcpay('/invoices', 'POST', {
      amount: (order.amountCents / 100).toFixed(2),
      currency: 'USD',
      metadata: {
        orderId: id,
        itemDesc: order.items.map(x => x.title + ' x' + x.qty).join(' | ').slice(0, 250),
        physical: true,
        bitcOrderEncrypted: encryptedRecord
      },
      checkout: { redirectURL: 'https://bitcmining.tech/checkout/success/', redirectAutomatically: false }
    });
    if (!invoice.id || !invoice.checkoutLink || new URL(invoice.checkoutLink).origin !== new URL(BTCPAY_URL).origin) {
      throw new Error('invalid_btcpay_invoice');
    }
    // Confirm BTCPay actually persisted the order before sending the buyer to pay.
    const persisted = await btcpay('/invoices/' + encodeURIComponent(invoice.id));
    if (persisted.metadata?.orderId !== id ||
        persisted.metadata?.bitcOrderEncrypted !== encryptedRecord ||
        persisted.currency !== 'USD' ||
        Math.round(Number(persisted.amount) * 100) !== order.amountCents) {
      throw new Error('btcpay_order_record_not_persisted');
    }
    return respond(res, 200, { orderId: id, id: invoice.id, checkoutLink: invoice.checkoutLink,
      amountUSD: (order.amountCents / 100).toFixed(2), status: invoice.status }, origin);
  } catch (error) {
    console.error('checkout_failed', id || '', error);
    const clientErrors = new Set(['invalid_order','client_prices_not_allowed','invalid_items','catalog_item_unavailable',
      'invalid_quantity','invalid_shipping','invalid_protection','invalid_total','missing_delivery_address','invalid_email','quote_expired']);
    const errorCode = String(error.message || '');
    return respond(res, errorCode === 'quote_expired' ? 409 : clientErrors.has(errorCode) ? 400 : 503,
      { error: clientErrors.has(errorCode) ? errorCode : 'checkout_unavailable' }, origin);
  }
});
if (process.env.NODE_ENV !== 'test') server.listen(PORT, () => console.log('BITC payment API listening on ' + PORT));
export { validatedOrder, validatedCustomer, getCatalog, ensureQuoteAccepted, encryptOrder, decryptOrder, paymentState, keyBytes };
