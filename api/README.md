# BITC Mining — BTCPay integration

## What this branch changes

- Browser submits SKU IDs, integer quantities, shipping choice, protection and delivery information.
- Prices are calculated in integer USD cents ONLY on the backend with a server-owned catalog.
- Backend stores an order in the private database before creating BTCPay invoice and saves the invoice ID.
- Browser redirects to the actual BTCPay checkoutLink. Addresses supplied through URL query parameters are no longer displayed.
- Signed BTCPay webhook re-reads invoice from BTCPay, and marks paid only after Settled status.
- Unimplemented card and PayPal fields are removed.

## Required setup (before going live)

1. Set up a dedicated Supabase project and execute api/migrations/001_bitc_orders.sql.
2. Deploy the api/ directory as a separate HTTPS Node service on Render (npm start, Node 20+).
3. Configure these backend environment variables: BTCPAY_URL, BTCPAY_API_KEY, BTCPAY_STORE_ID, BTCPAY_WEBHOOK_SECRET, BITC_SUPABASE_URL, BITC_SUPABASE_SERVICE_KEY, BITC_CATALOG_JSON.
4. The BTCPay URL is set by default to https://pay.bitcmining.tech; verify that it is your BTCPay instance and has a functional Bitcoin wallet.
5. In BTCPay, register a webhook at https://YOUR_API_HOST/api/btcpay-webhook. Store its secret as BTCPAY_WEBHOOK_SECRET. Subscribe to processing, settled, invalid and expired invoice events.
6. In checkout/index.html set the meta tag named bitc-payment-api to your API base URL if the API is on a different origin. If hosting together, proxy /api/* to the API.
7. GET /health should show btcpayConfigured, orderStorageConfigured and webhookConfigured true (this verifies environment variables ONLY, not a real working wallet).

NEVER expose BTCPAY_API_KEY or BITC_SUPABASE_SERVICE_KEY in browser code or GitHub.

## Server-owned product catalog

The only initial approved products are checkout recommendations reco-cards at USD 18.00 and reco-gold-nugget at USD 36.00, reflecting this site's checkout UI. Main catalog SKUs are deliberately BLOCKED pending server-side price configuration.

Configure BITC_CATALOG_JSON in the API environment as a JSON object that maps exact cart SKU IDs to approved prices in cents. Example:

    {"YOUR_ACTUAL_SKU_ID":{"title":"Bitaxe miner","cents":11999}}

Retrieve each exact SKU ID from the cart's bm_cart_v1 localStorage record. Check your actual inventory and prices rather than inferring prices from the storefront or another merchant. Unknown SKUs produce catalog_item_unavailable and no invoice. Amount, currency, price or total fields sent by the browser are explicitly rejected.

Backend pricing applies a 20% BTC discount to product + optional USD 16.50 shipping protection, then adds server-side shipping: DHL USD 0.00, FedEx USD 24.99, UPS USD 29.99.

## Tests and live verification

From the api directory run npm test. Automated tests cover tampered prices, unknown SKUs, quantity limits, shipping/discount calculations, delivery validation and signed webhook HMAC.

Before accepting actual customers, check a real invoice is generated with the expected USD price, a real Bitcoin QR/address appears on the BTCPay page, delivery details are saved privately, the BTCPay signed webhook marks only Settled invoices as paid, unpaid/expired invoices are not fulfilled, and repeated webhooks cannot downgrade a Settled order.

NO live payment, wallet confirmation or end-to-end deployment was performed as part of this code patch. The checkout is NOT production-verified until these checks pass.
