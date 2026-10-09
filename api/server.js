import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 10000);
const BTCPAY_URL = (process.env.BTCPAY_URL || 'https://pay.bitcmining.tech').replace(/\/+$/, '');
const API_KEY = process.env.BTCPAY_API_KEY || '';
const STORE_ID = process.env.BTCPAY_STORE_ID || '';
const WEBHOOK_SECRET = process.env.BTCPAY_WEBHOOK_SECRET || '';
const SUPABASE_URL = (process.env.BITC_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.BITC_SUPABASE_SERVICE_KEY || '';
const ALLOWED = new Set([
  'https://bitc-mining-preview.onrender.com',
  'https://bitcmining.tech',
  'https://www.bitcmining.tech'
]);
const SHIPPING_CENTS = Object.freeze({ dhl: 0, fedex: 2499, ups: 2999 });
const PROTECTION_CENTS = 1650;
const DISCOUNT_PERCENT = 20;

// Store-owned catalog. Never use browser-supplied prices to create invoices.
// Additional approved SKUs/prices can be set in BITC_CATALOG_JSON on the backend.
const BASE_CATALOG = {
  'reco-cards': { title: 'Cardsmiths Crypto Currency Collectible Cards - 1 Pack', cents: 1800 },
  'reco-gold-nugget': { title: 'Gold Nugget Lottery Miner', cents: 3600 }
};
function getCatalog() {
  const extras = process.env.BITC_CATALOG_JSON ? JSON.parse(process.env.BITC_CATALOG_JSON) : {};
  const result = { ...BASE_CATALOG };
  for (const [id, item] of Object.entries(extras)) {
    if (!id || id.length > 350 || !item || !Number.isSafeInteger(item.cents) || item.cents <= 0 || !item.title) {
      throw new Error('invalid_server_catalog');
    }
    result[id] = { title: String(item.title).slice(0, 200), cents: item.cents };
  }
  return result;
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
async function db(path, method, body, prefer = '') {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('order_database_not_configured');
  const headers = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(12000)
  });
  const result = await response.text();
  if (!response.ok) {
    console.error('order_database_error', response.status, result.slice(0, 300));
    throw new Error('order_database_error');
  }
  return result ? JSON.parse(result) : null;
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
function signatureValid(raw, received) {
  if (!WEBHOOK_SECRET || !/^sha256=[a-f0-9]{64}$/.test(received)) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}
async function webhook(req, res) {
  const raw = await rawBody(req);
  if (!signatureValid(raw, req.headers['btcpay-sig'] || '')) return respond(res, 401, { error: 'invalid_signature' });
  const event = JSON.parse(raw.toString('utf8'));
  const invoiceId = typeof event.invoiceId === 'string' ? event.invoiceId : '';
  if (!invoiceId || !/^[a-zA-Z0-9_-]{1,150}$/.test(invoiceId)) return respond(res, 400, { error: 'invalid_invoice_id' });
  const invoice = await btcpay('/invoices/' + encodeURIComponent(invoiceId));
  const status = invoice.status;
  if (!['New','Processing','Settled','Expired','Invalid'].includes(status)) return respond(res, 200, { ok: true });
  const mapped = { New: 'invoice_created', Processing: 'processing', Settled: 'settled', Expired: 'expired', Invalid: 'invalid' }[status];
  // Never downgrade a settled order, even if a delayed webhook arrives.
  await db('bitc_orders?invoice_id=eq.' + encodeURIComponent(invoiceId) + '&status=neq.settled',
    'PATCH', { status: mapped, updated_at: new Date().toISOString() });
  return respond(res, 200, { ok: true });
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
  if (pathname === '/health' && req.method === 'GET') {
    return respond(res, 200, { ok: true, btcpayConfigured: Boolean(API_KEY && STORE_ID),
      orderStorageConfigured: Boolean(SUPABASE_URL && SUPABASE_KEY), webhookConfigured: Boolean(WEBHOOK_SECRET) }, origin);
  }
  if (pathname === '/api/btcpay-webhook' && req.method === 'POST') {
    try {
      if (!API_KEY || !STORE_ID || !SUPABASE_URL || !SUPABASE_KEY) return respond(res, 503, { error: 'webhook_not_configured' });
      return await webhook(req, res);
    } catch (error) {
      console.error('webhook_failed', error);
      return respond(res, 500, { error: 'webhook_failed' });
    }
  }
  if (pathname !== '/api/create-btcpay-invoice' || req.method !== 'POST') return respond(res, 404, { error: 'not_found' }, origin);
  if (!ALLOWED.has(origin)) return respond(res, 403, { error: 'origin_not_allowed' }, origin);
  if (!API_KEY || !STORE_ID || !WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_KEY) {
    return respond(res, 503, { error: 'checkout_not_configured' }, origin);
  }
  let id;
  try {
    const body = JSON.parse((await rawBody(req)).toString('utf8'));
    const order = validatedOrder(body);
    const customer = validatedCustomer(body);
    id = crypto.randomUUID();
    await db('bitc_orders', 'POST', {
      id, status: 'pending', currency: 'USD', amount_cents: order.amountCents,
      items: order.items, shipping_method: order.shipping, shipping_protection: order.shippingProtection,
      customer
    });
    const invoice = await btcpay('/invoices', 'POST', {
      amount: (order.amountCents / 100).toFixed(2),
      currency: 'USD',
      metadata: { orderId: id },
      checkout: { redirectURL: 'https://bitcmining.tech/checkout/success/', redirectAutomatically: false }
    });
    if (!invoice.id || !invoice.checkoutLink || new URL(invoice.checkoutLink).origin !== new URL(BTCPAY_URL).origin) {
      throw new Error('invalid_btcpay_invoice');
    }
    await db('bitc_orders?id=eq.' + encodeURIComponent(id), 'PATCH', {
      invoice_id: invoice.id, status: 'invoice_created', updated_at: new Date().toISOString()
    });
    return respond(res, 200, { orderId: id, id: invoice.id, checkoutLink: invoice.checkoutLink,
      amountUSD: (order.amountCents / 100).toFixed(2), status: invoice.status }, origin);
  } catch (error) {
    console.error('checkout_failed', id || '', error);
    const clientErrors = new Set(['invalid_order','client_prices_not_allowed','invalid_items','catalog_item_unavailable',
      'invalid_quantity','invalid_shipping','invalid_protection','invalid_total','missing_delivery_address','invalid_email']);
    const errorCode = String(error.message || '');
    return respond(res, clientErrors.has(errorCode) ? 400 : 503,
      { error: clientErrors.has(errorCode) ? errorCode : 'checkout_unavailable' }, origin);
  }
});
if (process.env.NODE_ENV !== 'test') server.listen(PORT, () => console.log('BITC payment API listening on ' + PORT));
export { validatedOrder, validatedCustomer, getCatalog, signatureValid };
