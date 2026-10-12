# BITC Mining — existing Hostinger VPS + BTCPay (no extra database)

**Status:** code prepared in PR #2 / `fix/btcpay-server-pricing-checkout`. Public site and payments have **not** been deployed from this branch. These instructions do not claim actual operation.

## Verified infrastructure and DNS

The owner's Hostinger VPS is `srv2033748.hstgr.cloud`, IP `2.25.192.109` observed on October 11, 2026. Docker Compose 2.40.3, `generated_default` shared BTCPay nginx-proxy network, and running BTCPay/Bitcoin Core/NBXplorer containers were confirmed with VPS terminal screenshots. Repo was cloned at `/opt/bitc/repo`; approximately 14 MB of site files are staged in `/opt/bitc/public`.

A read-only GitHub Actions public check on 2026-10-11 showed:
- `https://bitcmining.tech` and `/checkout/` return Hostinger **parked domain** HTML at `2.57.91.91`.
- `https://pay.bitcmining.tech` reaches the BTCPay login at `2.25.192.109` via HTTPS.
- `https://bitcmining.tech/api/health` is **not** a working API; it currently returns parking HTML.

**Never** change the `pay` DNS A record, remove BTCPay containers or configure another nginx to bind host ports 80/443. The existing BTCPay `nginx` owns those ports. Our storefront must join its verified network `generated_default` using the existing nginx-proxy and Let's Encrypt companion.

## Prerequisites

1. Back up existing BTCPay configuration and wallet recovery material securely. Do not share or paste seeds or API keys in chat.
2. The merchant approved the five corrected current prices. `api/catalog.json` now pins 553 SKU/add-on prices, and 152 product pages exist. 144 are internally price-consistent for preview; 8 remain blocked (7 unavailable, 1 missing source feed). This is not proof of physical inventory, fulfillment capacity, shipping cost or asset rights. See `api/PRELAUNCH_AUDIT.md`. Shipping amounts were confirmed by the owner on 2026-10-12: DHL free, FedEx USD 24.99 and UPS USD 29.99 per order in all serviced regions. This is encoded in `api/approved-shipping-policy.json`; delivery coverage and storefront/quote integration still need operational acceptance.
3. BTCPay private scoped API key must have **Create an invoice** and **View invoices** on BITC Mining only (already tested for viewing in the current user's VPS terminal).
4. Configure `/etc/bitc/bitc.env` as root (permissions 600) with: `BTCPAY_URL`, `BTCPAY_API_KEY`, `BTCPAY_STORE_ID`, `BITC_ORDER_ENCRYPTION_KEY`. `api/catalog.json` ships with the API; do not set `BITC_CATALOG_JSON`. No Supabase and **no webhook** needed. See `api/README.md`.
5. Generate encryption key privately using `openssl rand -hex 32` and make a **secure, separate offline backup**. Never post the key or include it in screenshots.
6. Check DNS A records for `@` and `www` and any AAAA conflicts. Change `@` from parking IP to the current verified VPS IP **after** the storefront container is running and the proxy configured. `www` can CNAME to `@`, if appropriate for your Hostinger zone; don't modify `pay`.

## Read-only preflight

On the VPS as root:

```bash
cd /opt/bitc/repo
bash deploy/hostinger/preflight.sh
```

Confirm nginx-proxy and the correct network before proceeding.

## Publish (after prerequisites only)

```bash
cd /opt/bitc/repo
git pull --ff-only origin fix/btcpay-server-pricing-checkout
export BTCPAY_PROXY_NETWORK=generated_default
export LETSENCRYPT_EMAIL=YOUR_REAL_OPERATIONAL_EMAIL
bash deploy/hostinger/publish.sh --publish
```

**Important:** This is a privileged production deployment. Do not run it until the DNS, approved catalog and BTCPay invoice information have been checked. The script refuses missing values/placeholder secrets and ensures the existing nginx-proxy is attached to the shared network. It creates *only* the new BITC Compose project (private Node API, static Nginx), without binding 80/443 on the host and without restarting existing BTCPay services.

After deployment, `GET /api/health` should report `btcpayConfigured: true` and `orderEncryptionConfigured: true`. This is **configuration presence only**, not proof of successful wallet payments. The payment endpoint is `POST /api/create-btcpay-invoice` after a server quote at `POST /api/quote`.

## Merchant fulfillment without a database

Invoice records, payment state and encrypted address/cart metadata remain in BTCPay. From `/opt/bitc/repo/deploy/hostinger`:

```bash
docker compose exec -T api node order-read.js ACTUAL_INVOICE_ID
```

This uses the private environment inside the API container to inspect and decrypt the order and marks `PAID` **only** for settled invoices without exceptional flags. No webhook required, but **shipments are manual**. Do not screenshot the result: it contains buyer information. For daily operations, inspect BTCPay invoice statuses and run the lookup for each paid invoice; automate later only if a secure order management system is added.

## Launch acceptance criteria

- Public website, catalogue, cart, checkout HTTPS working (not parked domain).
- BTCPay login remains accessible on its separate `pay` hostname.
- Check pinned prices against the current buyer-facing product pages, shipping terms and checkout (not just the cached global app data). Unknown/mismatched SKUs cannot charge. Before accepting traffic, check eight blocked product states and confirm stock, licensing, delivery and current public prices.
- Each order creates a unique invoice with correct USD and BTC values; QR and destination are generated by BTCPay.
- Invoice metadata really stores encrypted buyer/address/item data, and merchant CLI can decrypt it after payment.
- Test settled, expired, partial, overpaid and late invoice cases. Never ship unpaid or exceptional invoices.
- Order handling, shipping notifications, refund policies and backup/restore procedures are merchant-approved before accepting real customers.
- No live payment has been performed by this code change.

No additional Supabase project, PostgreSQL order DB or webhook required for this manual checkout model.
