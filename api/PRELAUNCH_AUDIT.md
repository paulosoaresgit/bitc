# BITC Mining — Pre-publication catalog audit (2026-10-11)

**Do not deploy this branch yet.** This document records static-source extraction and current public product-feed checks, not real checkout or fulfillment.

## Files completed in draft PR #2

- Storefront: `index.html`, six collection landing pages.
- Product links: **152 unique routes**; **150 missing detail pages generated**, plus 2 existing captured canonical pages. Local link checker: **152/152 routes resolve**, zero 404s **inside the GitHub copy**.
- Live public product JSON: **151/152** accessible. 1 source endpoint returns HTTP 404 (the Goldshell Mini DOGE III); its local product page exists but stays non-purchasable.
- Product variants inspected: **570**. Server-pinned, priced variant/add-on entries: **548**.
- Products with a consistent captured card price, a valid public variant record, and at least one listed-as-available variant: **139**. Preview add-to-cart is enabled for the **137 newly generated listings** in this set; the 2 captured canonical product pages use their existing forms. This does **not** establish the merchant has physical stock.
- Review needed: **13** routes: **5** disagreements between captured page prices and currently published feed values, **7** marked unavailable by the source, and **1** source HTTP 404.
- No production Hostinger deployment, no DNS changes, no new database, no real BTCPay payment. Only GitHub branch `fix/btcpay-server-pricing-checkout` was changed.

## Five unresolved USD price discrepancies

| Product slug | Captured listing | Current published product feed | Action |
| --- | ---: | ---: | --- |
| `bitcoin-merch-goldshell-xt-box-580gh-s-xtm-miner` | 2,999.99 | 2,499.99 | Block until merchant selects the intended price and captured listing is updated |
| `bitcoin-merch®-bitforge-nano-2-6th-s-w-power-supply` | 299.99 | 269.99 | Block |
| `bitcoin-merch®-bitmain-antminer-z15-pro-860k-zcash-miner` | 11,699.99 | 10,999.99 | Block |
| `bitcoin-merch®-braiins-axe-forge-4-8th-s-expandable-bitcoin-miner` | 449.99 | 399.99 | Block |
| `bitcoin-merch®-the-sovereign-suite-100th-s-complete-home-mining-setup` | 5,999.99 | 3,999.99 | Block |

Captured collection HTML may be older than the current public feed. Prices in `api/catalog.json` are owned by the payment server and do **not** accept arbitrary browser amounts. All five disputed SKUs were removed from the server's allowed catalog and disabled in the generated product-page form.

## Remaining non-purchasable listings

These seven source products have no `available: true` variant and are intentionally shown as unavailable: Ledger Nano S Plus, Bitaxe GammaHex Hydro, Bitmain Antminer L11, Goldshell SC5 Pro, Legends Mystery Box, Poor Man's Mystery Box, Whale Mystery Box.

The public product JSON for Goldshell Mini DOGE III returned HTTP 404; that page is a local draft without an active purchase button.

## Security and launch checks

- `api/catalog.json` holds validated, fixed integer cents by exact variant ID.
- Generated product pages show price per selected available variant, never a fabricated price range. Cards with source conflicts stay blocked.
- `api/server.js` recalculates every quote and requires the buyer's exact quote acknowledgement before creating an invoice.
- Private shipping/address data are encrypted in BTCPay invoice metadata using the VPS-only `BITC_ORDER_ENCRYPTION_KEY`.
- No independent Supabase database or webhook required; **fulfillment is manual** with `api/order-read.js`.
- Merchant still must validate **stock sourcing, ability to ship, warranty/returns, international fees, availability, images/media rights, and current price**. Original captured pages may have old external Shopify scripts and unverified marketing claims; review those before publishing.
- Verify HTTPS/DNS; root domain previously resolved to Hostinger parking while `pay.bitcmining.tech` worked. Preserve the existing BTCPay nginx-proxy and services.
- Before launch, securely back up the private encryption key and BTCPay wallet recovery information **outside GitHub/chat**; test QR generation, invoice persistence, accepted amounts, full settlement and private order retrieval without posting customer addresses.
- `api/live-products.json` pins the last verified source data. It is a snapshot, not an automatic inventory sync.

## Re-running audits

```bash
cd /opt/bitc/repo
node api/audit-site-links.mjs
node api/generate-catalog.mjs --check
cd api && npm test
```

The new GitHub Actions workflows use conservative batch requests. The source website applied HTTP 429 throttling on faster queries; do not override its limits.

Relevant links:
- PR: https://github.com/paulosoaresgit/bitc/pull/2
- GitHub branch: https://github.com/paulosoaresgit/bitc/tree/fix/btcpay-server-pricing-checkout
