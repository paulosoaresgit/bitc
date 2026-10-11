import crypto from 'node:crypto';

// No external order database: the invoice stores private order details in encrypted metadata.
// Keep the 32-byte AES key ONLY in /etc/bitc/bitc.env, never in the browser or GitHub.
export function keyBytes(hexKey = process.env.BITC_ORDER_ENCRYPTION_KEY || '') {
  if (!/^[a-fA-F0-9]{64}$/.test(hexKey)) throw new Error('order_encryption_not_configured');
  return Buffer.from(hexKey, 'hex');
}
export function encryptOrder(orderId, orderData, hexKey = process.env.BITC_ORDER_ENCRYPTION_KEY || '') {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(hexKey), iv);
  cipher.setAAD(Buffer.from(orderId, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(orderData), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url')].join('.');
}
export function decryptOrder(orderId, data, hexKey = process.env.BITC_ORDER_ENCRYPTION_KEY || '') {
  const p = String(data || '').split('.');
  if (p.length !== 4 || p[0] !== 'v1') throw new Error('invalid_order_record');
  const iv = Buffer.from(p[1], 'base64url'), tag = Buffer.from(p[2], 'base64url');
  if (iv.length !== 12 || tag.length !== 16) throw new Error('invalid_order_record');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(hexKey), iv);
  decipher.setAAD(Buffer.from(orderId, 'utf8'));
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(p[3], 'base64url')),
    decipher.final()]).toString('utf8'));
}
export function paymentState(invoice) {
  // Do not ship until BTCPay itself reports a fully settled invoice.
  if (invoice.status === 'Expired' || invoice.status === 'Invalid') return 'NOT_PAID';
  if (invoice.status !== 'Settled') return 'AWAITING_PAYMENT';
  return (!invoice.additionalStatus || invoice.additionalStatus === 'None') ? 'PAID' : 'REVIEW';
}
