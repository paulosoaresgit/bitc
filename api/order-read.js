// Run inside the private API container: docker compose exec -T api node order-read.js <invoice_id>
// BTCPay is our only orders/payment database. Do not put invoice IDs or delivery data in logs.
import { decryptOrder, paymentState } from './order-utils.js';

async function main() {
  const id = process.argv[2] || '';
  if (!/^[a-zA-Z0-9_-]{1,150}$/.test(id)) throw new Error('Provide a valid BTCPay invoice ID.');
  const host = (process.env.BTCPAY_URL || '').replace(/\/+$/, '');
  const key = process.env.BTCPAY_API_KEY || '';
  const store = process.env.BTCPAY_STORE_ID || '';
  if (!host.startsWith('https://') || !key || !store) throw new Error('BTCPay private credentials are missing.');
  if (!/^[a-fA-F0-9]{64}$/.test(process.env.BITC_ORDER_ENCRYPTION_KEY || '')) {
    throw new Error('Order encryption key is not configured.');
  }
  const url = host + '/api/v1/stores/' + encodeURIComponent(store) + '/invoices/' + encodeURIComponent(id);
  const response = await fetch(url, {
    headers: { Authorization: 'token ' + key },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('Could not read invoice from BTCPay (HTTP ' + response.status + ').');
  const invoice = await response.json();
  const orderId = invoice.metadata?.orderId;
  const sealed = invoice.metadata?.bitcOrderEncrypted;
  if (!orderId || !sealed) throw new Error('Invoice has no encrypted BITC order metadata.');
  const order = decryptOrder(orderId, sealed);
  if (order.orderId !== orderId || order.currency !== invoice.currency ||
      Math.round(Number(invoice.amount) * 100) !== order.amountCents) {
    throw new Error('Invoice/record amount mismatch: DO NOT SHIP.');
  }
  const status = paymentState(invoice);
  console.log(JSON.stringify({
    invoiceId: id,
    orderId,
    invoiceStatus: invoice.status,
    additionalStatus: invoice.additionalStatus || 'None',
    fulfillmentDecision: status === 'PAID' ? 'PAYMENT VERIFIED - review address/inventory before shipping' : 'DO NOT SHIP',
    amountUSD: invoice.amount,
    ...order
  }, null, 2));
}
main().catch((err) => {
  console.error('Order read failed:', err.message);
  process.exitCode = 1;
});
