# BITC Mining — BTCPay-only checkout (no extra database)

This branch replaces the old Supabase order integration. **BTCPay is the sole invoice and order record**; the private order/shipping record is encrypted in each BTCPay invoice's metadata. The payment API runs on the existing Hostinger VPS, not Render. Do not deploy until prices, DNS, and merchant fulfillment workflow are verified.

## Flow

1. Browser submits SKU and integer quantity; the backend calculates the price from the server-owned catalog, shipping and a configured 20% Bitcoin discount. Any supplied price/amount field is rejected.
2. `POST /api/quote` returns the actual server quote. The buyer accepts it, then `POST /api/create-btcpay-invoice` sends the same items and accepted amount.
3. Backend validates delivery details and encrypts the **entire order** with AES-256-GCM using `BITC_ORDER_ENCRYPTION_KEY`. BTCPay stores the ciphertext in `metadata.bitcOrderEncrypted` and the indexed `metadata.orderId`.
4. Backend creates a BTCPay Greenfield invoice with the exact server amount, reads it back to verify the encrypted data was retained, then redirects to the real `checkoutLink`. An invoice/address is **never** read from untrusted query parameters.
5. BTCPay retains all payment statuses. No webhook or second database is necessary in this **manual fulfillment** model. Buyer return to the success page never marks an order paid.

**Important:** There is no automatic shipping, email confirmation or order management panel yet. The operator must verify `Settled` with no exceptional additionalStatus in the private CLI before fulfilling orders. Partial, late, invalid, expired and overpaid invoices must not auto-fulfill.

## Binance BTC withdrawal option

The checkout has **two presentations of the same BTCPay Bitcoin payment rail**:

- **Pay with Bitcoin** creates an approved, server-priced BTCPay invoice and opens its secure checkout page.
- **Pay BTC from Binance** creates the same kind of invoice, then retrieves its unique **BTC-OnChain** destination and precise BTC amount from BTCPay's Greenfield `GET /api/v1/stores/{storeId}/invoices/{invoiceId}/payment-methods`. The browser displays copy buttons and a secure invoice link. This is **not Binance Pay**, Binance Pay ID, Binance Smart Chain, BNB or BEP-20.

The BTC destination is derived from the wallet configured on the merchant's BTCPay store. **Never substitute a static merchant address.** If the endpoint cannot provide a validated on-chain BTC address and precise amount, the client links to the official BTCPay invoice instead of showing guessed values. The existing sales activation gates, encrypted order metadata, quoted prices, expiration and shipping checks remain in place.

The optional read-only `GET /api/invoice-status?invoiceId=…&token=…` returns only `awaiting`, `processing`, `settled`, `review` or `expired`. A per-invoice HMAC token binds this status read to the invoice and private order ID; no buyer PII or merchant secret is returned. The checkout polls every 15 seconds while the invoice is open. **Only `Settled` with no exceptional additional status confirms payment**, and actual order fulfillment remains manual.

Before enabling production sales, confirm a valid Bitcoin mainnet on-chain wallet is configured in BTCPay, that the scoped API key can *create* and *view* invoices and read the payment-methods endpoint, and complete one real end-to-end invoice/address/payment/settlement test. Do not enable Binance Pay or use a separate wallet address without integrating its payment confirmations into the order system.

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

`api/catalog.json` is the bundled, server-owned catalog. It contains **551 fixed SKU prices** from the audited captured variants; the two discontinued checkout accessories were removed. **152 local product pages** now exist. The public-feed snapshots verified 151 products; 144 have prices consistent with the captured cards and are candidates for merchant preview. Seven are marked unavailable; one product feed was not found. Those eight are blocked. The five formerly discrepant prices were explicitly approved and synchronized into collection cards, local product pages, and server catalog on 2026-10-11. See `api/PRELAUNCH_AUDIT.md` and `api/approved-price-fixes.json`. Never trust a browser-supplied price; unavailable or unknown SKUs are rejected. Inventory ownership, sourcing, delivery promises and licensing must still be checked before accepting payments.\n\n**Shipping prices confirmed by the owner on 2026-10-12:** DHL **free**, FedEx **USD 24.99**, and UPS **USD 29.99** per order, flat for all regions actually served by the store. The confirmation is recorded in `api/approved-shipping-policy.json` and tested against both API and browser. Carrier coverage, destination restrictions, delivery timing and customs obligations still require operational validation. Separately, the 20% BTC discount and USD 16.50 optional protection need launch review; optional protection is disabled by default.

The public invoice metadata includes only a generated order ID, product summary and encrypted order record. It intentionally does **not** include plaintext shipping addresses or customer contact information. The details needed for fulfillment must be decrypted on your own VPS.

## Private order lookup (after deployment)

In the VPS terminal, inside `/opt/bitc/repo/deploy/hostinger`:

```bash
docker compose exec -T api node order-read.js INVOICE_ID_FROM_BTCPAY
```

The command retrieves the invoice via the scoped BTCPay API, checks that the ID, currency and amount match the encrypted record, and prints the shipping address and order details locally. **Do not share that output in screenshots or logs**. It refuses to approve fulfillment unless BTCPay reports `Settled` with no exceptional payment status. No additional database is involved.

Dashboard for invoices: `https://pay.bitcmining.tech` → BITC Mining → Invoices.

## Controlled go-live audit (no changes, no invoices)

**BTCPay API 403 on store payment methods:** \`GET /api/v1/stores/{storeId}/payment-methods\` requires the store-scoped \`btcpay.store.canviewstoresettings\` permission. Use a new least-privilege BTCPay API key with \`btcpay.store.canviewinvoices\`, \`btcpay.store.cancreateinvoice\`, and \`btcpay.store.canviewstoresettings\`. Store only the private key in \`/etc/bitc/bitc.env\`; never commit, log or share it. BTCPay 2.x uses \`BTC-CHAIN\` instead of older \`BTC-OnChain\`, and both are supported by this integration. A successful read-only check does not prove the key can create invoices or that a BTC deposit will settle.\n\n

Once the current branch is published on the merchant Hostinger VPS, run:

```bash
cd /opt/bitc/repo/deploy/hostinger
docker compose exec -T api node launch-readiness.js
```

The command checks configured checkout approvals, API invoice-read access,
BTC-OnChain store payment method, encryption configuration and whether
published checkout policy links are still placeholders. It prints only
checks and HTTP codes, not API tokens, wallet addresses or customer records.
**It does not create an invoice or enable sales.**

A positive read-only result **does not** prove invoice-creation permission,
Bitcoin Core/NBXplorer sync, wallet backup, real BTC settlement or order
fulfillment. Validate these separately with a controlled merchant-owned
invoice and a settled small test transfer, then use `node order-read.js` privately
to reconcile amount, settled status and customer delivery data.
Ensure support contact, legal policy text, stock ownership, shipping coverage,
returns and accurate content before enabling the four approval flags:
`BITC_SALES_ENABLED`, `BITC_SHIPPING_APPROVED`,
`BITC_INVENTORY_APPROVED`, `BITC_TERMS_APPROVED`.
The flags stay OFF during prelaunch validation.

## Live BTC smoke test (private VPS only, USD 5.00)

This diagnostic deliberately **does not enable production sales** and does not
create a storefront customer order. It must be run only by the merchant with
control of the receiving BTC wallet and sufficient balance for a small test.

After pulling this branch on the VPS, rebuild only the API service to install
`btcpay-test-invoice.js`:

```bash
cd /opt/bitc/repo/deploy/hostinger
export BTCPAY_PROXY_NETWORK=generated_default
read -r -p "SSL certificate email: " LETSENCRYPT_EMAIL
export LETSENCRYPT_EMAIL
docker compose up -d --no-deps --build api
docker compose exec -T api node btcpay-test-invoice.js --create
```

If the invoice ID was copied incorrectly or a status lookup returns HTTP 403,
first find the actual store test invoice without generating another one:

```bash
docker compose exec -T api node btcpay-test-invoice.js --recent
docker compose exec -T api node btcpay-test-invoice.js --latest
```

`--recent` lists only merchant-created USD 5 diagnostic invoice IDs found in
recent BTCPay records, without displaying customer invoices. `--latest` finds
the newest such test and verifies its payment status. A 403 on a manually typed
ID can mean the ID is incorrect or access to that particular invoice is denied;
it does **not** by itself mean a BTC payment failed. If the exact invoice
from the store list still returns 403, inspect the store scope and the
merchant BTCPay invoice dashboard, and do not send funds until resolved.


**Only** the explicit `--create` command creates one real BTC-payable BTCPay
invoice of USD 5.00. It reads the invoice back, verifies test-only metadata,
inspects the on-chain destination and prints the genuine BTCPay invoice link.
The merchant should compare the invoice amount and BTC address/QR **on the
BTCPay invoice** and make one *intentional* mainnet BTC test transfer from a
separate wallet or via Binance **BTC withdrawal on the Bitcoin network**, not
Binance Pay or BNB/BEP20. Real BTC payments are irreversible and incur fees.
Do not send twice or to any pasted/static address. The test invoice is a
non-fulfillable diagnostic, not a customer order.

Later, using only the resulting diagnostic invoice ID:

```bash
docker compose exec -T api node btcpay-test-invoice.js --status YOUR_TEST_INVOICE_ID
```

The script considers payment verified only when BTCPay reports
`Settled` and no exceptional `additionalStatus`. Never fulfill anything
from this diagnostic invoice.

**Public activation is independent.** After a verified settlement, production
still requires valid store/customer terms, working policy links, ability to
fulfill listed inventory and shipping destinations, tested order read-back
and recovery backups, plus explicit merchant approval of the four flags:
`BITC_SALES_ENABLED`, `BITC_SHIPPING_APPROVED`,
`BITC_INVENTORY_APPROVED`, and `BITC_TERMS_APPROVED`.
Never use this diagnostic as a reason to bypass those gates.

## Tests and release

`cd api && npm test`

The GitHub Actions pipeline also checks JavaScript, private CLI, VPS scripts and Compose syntax. Tests **do not** make real payments or prove wallet sync. Read `deploy/hostinger/README.md` and perform a live invoice/QR/wallet/settlement test before running ads. Verify BTCPay backup strategy and retain a private encryption-key backup.

To reproduce the data-file audit: `node api/generate-catalog.mjs --check` (fails if the committed catalog drifts from the captured canonical product pages).\n\nThe previously drafted Supabase migration and `BTCPAY_WEBHOOK_SECRET` are no longer required for this manual, database-free flow.
