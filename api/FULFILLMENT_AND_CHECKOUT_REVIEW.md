# BITC checkout and fulfillment gate review — 2026-10-12

This review modifies GitHub draft code **only**, not the published website, VPS, BTCPay or DNS.

## Verified from source

- Payment API has an opt-in kill-switch. Invoice creation requires all of `BITC_SALES_ENABLED=true`, `BITC_SHIPPING_APPROVED=true`, `BITC_INVENTORY_APPROVED=true`, and `BITC_TERMS_APPROVED=true`.
- Even if the global switches are enabled later, each SKU must appear in private `BITC_FULFILLABLE_SKUS`; an order to a country outside `BITC_SHIP_TO_COUNTRIES` is rejected.
- Delivery protection cannot be purchased unless `BITC_PROTECTION_APPROVED=true`. The shipping matrix presently hardcodes DHL USD 0, FedEx USD 24.99 and UPS USD 29.99. These rates are **unverified** and MUST NOT be enabled until actual fulfillment arrangements and all destinations are agreed.
- Client-submitted cart prices cannot determine the invoice amount. The server uses `api/catalog.json` and checks the exact invoice amount after creation.
- The cart now stores the selected SKU variant's exact `data-cents` value rather than guessing from the product's first visible price; disabled options are refused.
- The checkout retains its sales-readiness kill-switch if an invoice request errors.
- Public product-feed stock flags are only reference data and **do not establish inventory possession or supplier authorization**.
- 152 product URLs exist, 553 server catalog entries and eight unavailable/unverified products remain blocked.

## Tasks requiring user/supplier confirmation

1. Confirm whether the business owns or can actually fulfill the listed products and has permission to use photographs, brands and marketing copy. Captured assets and pages reference `bitcoinmerch.com`; do not assert authorization without documentation.
2. Verify shipping methods/rates, package weights and supported countries; free or fixed shipping is not automatically valid worldwide.
3. Approve 20% Bitcoin discount, returns/cancellations policies, taxes/duties and any optional shipping-protection terms.
4. Inspect mobile and desktop visually and test browser cart behavior with multiple variants and quantity changes in a private preview.
5. Back up BTCPay wallet recovery material and `BITC_ORDER_ENCRYPTION_KEY` outside the VPS.
6. Deploy only after the owner authorizes publication, then perform a limited invoice/QR/payment confirmation test. **No real bitcoin was sent** in this audit; do not claim a live payment passed.

## Non-production tests

```bash
cd api && npm test
node --check ../assets/bm-cart.js
node --check ../assets/bm-checkout.js
```

The tests include a prelaunch mock HTTP request that verifies `/api/create-btcpay-invoice` returns HTTP 503 with `checkout_not_ready` before enabling the four approvals. It does not contact a live BTCPay instance.
