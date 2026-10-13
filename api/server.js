import http from 'node:http';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { keyBytes, encryptOrder, decryptOrder, paymentState } from './order-utils.js';
import { handlePixelRequest } from './pixel-manager.js';

const PORT = Number(process.env.PORT || 10000);
const BTCPAY_URL = (process.env.BTCPAY_URL || 'https://pay.bitcmining.tech').replace(/\/+$/, '');
const API_KEY = process.env.BTCPAY_API_KEY || '';
const STORE_ID = process.env.BTCPAY_STORE_ID || '';
const ORDER_ENCRYPTION_KEY = process.env.BITC_ORDER_ENCRYPTION_KEY || '';
// Payments are opt-in only after the merchant verifies shipping, physical stock,
// fulfillment/returns and accepts a test invoice. Never auto-enable on deploy.
function salesReady() {
  return ['BITC_SALES_ENABLED', 'BITC_SHIPPING_APPROVED', 'BITC_INVENTORY_APPROVED', 'BITC_TERMS_APPROVED']
    .every(name => process.env[name] === 'true');
}


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
    if (!/^(\d{8,17}|reco-cards|reco-gold-nugget)$/.test(id) || !item ||
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
  if (data.shippingProtection && process.env.BITC_PROTECTION_APPROVED !== 'true') throw new Error('protection_not_available');
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
// The merchant reports ample stock and flat-rate shipping regardless of destination.
// No per-SKU stock counter or per-country shipping calculation is needed. The
// catalog still excludes unverified/unavailable products. Optional restrictive
// lists can be supplied later (e.g. for shipping compliance or a recalled item).
function verifiedFulfillment(order, customer) {
  const allowed = new Set(String(process.env.BITC_FULFILLABLE_SKUS || '').split(',').map(s => s.trim()).filter(Boolean));
  if (allowed.size && order.items.some(item => !allowed.has(item.id))) throw new Error('inventory_not_verified');
  const blocked = new Set(String(process.env.BITC_BLOCKED_SKUS || '').split(',').map(s => s.trim()).filter(Boolean));
  if (order.items.some(item => blocked.has(item.id))) throw new Error('inventory_not_verified');
  const destinations = new Set(String(process.env.BITC_SHIP_TO_COUNTRIES || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  if (destinations.size && !destinations.has(customer.country.toLowerCase())) throw new Error('delivery_country_unavailable');
  const exclusions = new Set(String(process.env.BITC_BLOCKED_SHIP_TO_COUNTRIES || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  if (exclusions.has(customer.country.toLowerCase())) throw new Error('delivery_country_unavailable');
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
    console.error('btcpay_request_failed', response.status);
    throw new Error('btcpay_request_failed');
  }
  return JSON.parse(result);
}
// An invoice-specific BTC receiving address is assigned by BTCPay; never hardcode
// a wallet address or assume that Binance Pay uses ordinary BTC withdrawals.
function onchainDestination(methods) {
  if (!Array.isArray(methods)) throw new Error('btcpay_payment_method_unavailable');
  const method = methods.find(m => {
    const id = String(m?.paymentMethodId || m?.paymentMethod || '');
    return /^BTC[-_]OnChain$/i.test(id) || (/^BTC$/i.test(id) && String(m.cryptoCode || '').toUpperCase() === 'BTC');
  });
  if (!method || method.activated === false) throw new Error('btcpay_onchain_not_available');
  const address = String(method.destination || '').trim();
  // Bitcoin mainnet only; network and validation must match the BTCPay store.
  const validBase58 = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address);
  const validBech32 = /^bc1[ac-hj-np-z02-9]{11,87}$/.test(address) && (address === address.toLowerCase() || address === address.toUpperCase());
  if (!validBase58 && !validBech32) throw new Error('btcpay_invalid_payment_destination');
  const amountBTC = String(method.due ?? method.amount ?? '').trim();
  if (!/^(?:0|[1-9]\d{0,7})\.\d{1,8}$/.test(amountBTC) || !(Number(amountBTC)>0)) throw new Error('btcpay_invalid_payment_amount');
  return { network:'Bitcoin (BTC)', address, amountBTC };
}
function invoiceAccessToken(invoiceId, orderId, secret=ORDER_ENCRYPTION_KEY) {
  return crypto.createHmac('sha256',keyBytes(secret)).update('BITC-INVOICE-V1:').update(String(invoiceId))
    .update(':').update(String(orderId)).digest('hex');
}
function authorizeInvoiceAccess(invoiceId, orderId, token) {
  if (!/^[a-f0-9]{64}$/.test(String(token||''))) return false;
  const expected = invoiceAccessToken(invoiceId,orderId);
  return crypto.timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(token,'hex'));
}
function publicInvoiceState(invoice) {
  const state=paymentState(invoice);
  if (state==='PAID') return 'settled';
  if (state==='REVIEW') return 'review';
  if (state==='NOT_PAID') return 'expired';
  return String(invoice?.status||'')==='Processing'?'processing':'awaiting';
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
      orderStorage: 'encrypted_btcpay_invoice_metadata', orderEncryptionConfigured: /^[a-fA-F0-9]{64}$/.test(ORDER_ENCRYPTION_KEY), salesEnabled: salesReady() }, origin);
  }
  if (pathname === '/api/invoice-status' && req.method === 'GET') {
    if (!ALLOWED.has(origin)) return respond(res,403,{error:'origin_not_allowed'},origin);
    if (!API_KEY || !STORE_ID || !/^[a-fA-F0-9]{64}$/.test(ORDER_ENCRYPTION_KEY))
      return respond(res,503,{error:'checkout_not_configured'},origin);
    const url=new URL(req.url,'http://localhost');
    const invoiceId=String(url.searchParams.get('invoiceId')||'');
    const token=String(url.searchParams.get('token')||'');
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(invoiceId) || !/^[0-9a-f]{64}$/.test(token))
      return respond(res,400,{error:'invalid_invoice_reference'},origin);
    try {
      const invoice=await btcpay('/invoices/'+encodeURIComponent(invoiceId));
      if (invoice.id !== invoiceId || !invoice.metadata?.orderId ||
          !authorizeInvoiceAccess(invoiceId,invoice.metadata.orderId,token))
        return respond(res,403,{error:'invalid_invoice_reference'},origin);
      return respond(res,200,{state:publicInvoiceState(invoice),
        expiresAt:Number.isFinite(Number(invoice.expirationTime))?Number(invoice.expirationTime):null},origin);
    } catch(e) {
      return respond(res,503,{error:'invoice_status_unavailable'},origin);
    }
  }
  if (pathname === '/api/tracking-config' || pathname.startsWith('/api/admin/pixels')) {
    await handlePixelRequest(req, res, pathname);
    return;
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
        'invalid_shipping','invalid_protection','protection_not_available','invalid_total']);
      return respond(res, allowed.has(code) ? 400 : 503, { error: allowed.has(code) ? code : 'quote_unavailable' }, origin);
    }
  }
  if (pathname !== '/api/create-btcpay-invoice' || req.method !== 'POST') return respond(res, 404, { error: 'not_found' }, origin);
  if (!ALLOWED.has(origin)) return respond(res, 403, { error: 'origin_not_allowed' }, origin);
  if (!salesReady()) return respond(res, 503, { error: 'checkout_not_ready' }, origin);
  if (!API_KEY || !STORE_ID || !/^[a-fA-F0-9]{64}$/.test(ORDER_ENCRYPTION_KEY)) {
    return respond(res, 503, { error: 'checkout_not_configured' }, origin);
  }
  let id;
  try {
    const body = JSON.parse((await rawBody(req)).toString('utf8'));
    const order = validatedOrder(body);
    ensureQuoteAccepted(body, order);
    const customer = validatedCustomer(body);
    verifiedFulfillment(order, customer);
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
    // Binance uses ordinary BTC withdrawal to a unique on-chain BTCPay address,
    // NOT Binance Pay and never a global/static merchant deposit address.
    let binancePayment = null;
    if (body.paymentFlow === 'binance_btc') {
      try {
        const methods = await btcpay('/invoices/' + encodeURIComponent(invoice.id) + '/payment-methods');
        const payment = onchainDestination(methods);
        binancePayment = {
          ...payment,
          expiresAt: Number.isFinite(Number(persisted.expirationTime)) ? Number(persisted.expirationTime) : null,
          accessToken: invoiceAccessToken(invoice.id,id)
        };
      } catch(e) {
        // Invoice exists; buyer can still pay through its trusted BTCPay checkout.
        console.error('binance_wallet_display_unavailable', invoice.id, String(e?.message||'unknown'));
      }
    }
    return respond(res, 200, { orderId: id, id: invoice.id, checkoutLink: invoice.checkoutLink,
      amountUSD: (order.amountCents / 100).toFixed(2), status: invoice.status,
      ...(body.paymentFlow === 'binance_btc' ? {binancePayment} : {}) }, origin);
  } catch (error) {
    console.error('checkout_failed', id || '', String(error?.message || 'unknown'));
    const clientErrors = new Set(['invalid_order','client_prices_not_allowed','invalid_items','catalog_item_unavailable',
      'invalid_quantity','invalid_shipping','invalid_protection','invalid_total','inventory_not_verified','delivery_country_unavailable','missing_delivery_address','invalid_email','quote_expired']);
    const errorCode = String(error.message || '');
    return respond(res, errorCode === 'quote_expired' ? 409 : clientErrors.has(errorCode) ? 400 : 503,
      { error: clientErrors.has(errorCode) ? errorCode : 'checkout_unavailable' }, origin);
  }
});
if (process.env.NODE_ENV !== 'test') server.listen(PORT, () => console.log('BITC payment API listening on ' + PORT));
export { server, onchainDestination, invoiceAccessToken, authorizeInvoiceAccess, publicInvoiceState, salesReady, validatedOrder, validatedCustomer, verifiedFulfillment, SHIPPING_CENTS, getCatalog, ensureQuoteAccepted, encryptOrder, decryptOrder, paymentState, keyBytes };
