# BITC Mining — BTCPay-only checkout (no extra database)

This branch replaces the old Supabase order integration. **BTCPay is the sole invoice and order record**; the private order/shipping record is encrypted in each BTCPay invoice's metadata. The payment API runs on the existing Hostinger VPS, not Render. Do not deploy until prices, DNS, and merchant fulfillment workflow are verified.

## Flow

1. Browser submits SKU and integer quantity; the backend calculates the price from the server-owned catalog, shipping and a configured 20% Bitcoin discount. Any supplied price/amount field is rejected.
2. `POST /api/quote` returns the actual server quote. The buyer accepts it, then `POST /api/create-btcpay-invoice` sends the same items and accepted amount.
3. Backend validates delivery details and encrypts the **entire order** with AES-256-GCM using `BITC_ORDER_ENCRYPTION_KEY`. BTCPay stores the ciphertext in `metadata.bitcOrderEncrypted` and the indexed `metadata.orderId`.
4. Backend creates a BTCPay Greenfield invoice with the exact server amount, reads it back to verify the encrypted data was retained, then redirects to the real `checkoutLink`. An invoice/address is **never** read from untrusted query parameters.
5. BTCPay retains all payment statuses. No webhook or second database is necessary in this **manual fulfillment** model. Buyer return to the success page never marks an order paid.

**Important:** There is no automatic shipping, email confirmation or order management panel yet. The operator must verify `Settled` with no exceptional additionalStatus in the private CLI before fulfilling orders. Partial, late, invalid, expired and overpaid invoices must not auto-fulfill.

## Configuration

Hostinger private file: `/etc/bitc/bitc.env` (root-owned, mode `600`):

```dotenv
BTCPAY_URL=https://pay.bitcmining.tech
BTCPAY_API_KEY=PRIVATE_API_KEY_WITH_CREATE_AND_VIEW_INVOICES
BTCPAY_STORE_ID=YOUR_STORE_ID
BITC_ORDER_ENCRYPTION_KEY=64_HEX_CHARACTERS_FROM_OPENSSL_RAND_HEX_32
# Catalog is bundled into the API image in api/catalog.json, not an environment variable
```

Generate a private **new 32-byte encryption key** securely on the VPS using `openssl rand -hex 32` and paste it only into the root-owned environment file. Do not publish, print, commit, transmit or photograph it. **Make a secure offline backup** of this key: losing it makes shipping data for existing invoices unrecoverable. Do not replace/rotate the key while you still need to read old orders without implementing key versioning first.

`BITC_CATALOG_JSON` above is an example, **not approved pricing**. Only two direct product pages contain enough canonical SKU/price data. Audit the remaining product listing SKUs before enabling them. Unknown SKUs are blocked. `api/catalog.json` now contains 33 fixed variant-price entries from the captured product-detail pages: 28 available Bitaxe Gamma variants (USD 119.99–194.99), 3 X Node Mini variants (USD 799.99 and above), and two checkout add-ons (USD 18 and USD 36). The source's global cached JSON sometimes disagrees with the real detail page (e.g. USD 124.99 vs USD 119.99); canonical product-detail prices take priority. Products that only appear as collection cards are NOT yet configured, and remain blocked. Launch still requires verifying other SKUs and the actual customer checkout.

Existing pricing assumptions requiring merchant approval: discount 20% on products and USD 16.50 optional protection, DHL USD 0, FedEx USD 24.99, UPS USD 29.99. These are **not validated shipping costs or promises**.

The public invoice metadata includes only a generated order ID, product summary and encrypted order record. It intentionally does **not** include plaintext shipping addresses or customer contact information. The details needed for fulfillment must be decrypted on your own VPS.

## Private order lookup (after deployment)

In the VPS terminal, inside `/opt/bitc/repo/deploy/hostinger`:

```bash
docker compose exec -T api node order-read.js INVOICE_ID_FROM_BTCPAY
```

The command retrieves the invoice via the scoped BTCPay API, checks that the ID, currency and amount match the encrypted record, and prints the shipping address and order details locally. **Do not share that output in screenshots or logs**. It refuses to approve fulfillment unless BTCPay reports `Settled` with no exceptional payment status. No additional database is involved.

Dashboard for invoices: `https://pay.bitcmining.tech` → BITC Mining → Invoices.

## Tests and release

`cd api && npm test`

The GitHub Actions pipeline also checks JavaScript, private CLI, VPS scripts and Compose syntax. Tests **do not** make real payments or prove wallet sync. Read `deploy/hostinger/README.md` and perform a live invoice/QR/wallet/settlement test before running ads. Verify BTCPay backup strategy and retain a private encryption-key backup.

To reproduce the data-file audit: `node api/generate-catalog.mjs --check` (fails if the committed catalog drifts from the captured canonical product pages).\n\nThe previously drafted Supabase migration and `BTCPAY_WEBHOOK_SECRET` are no longer required for this manual, database-free flow.
