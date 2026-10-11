# BITC Mining — Hostinger VPS deployment (not Render)

Status: **prepared only**. No SSH access or live deployment has been verified from the GitHub branch. Do not merge/release just because automated tests pass. The historical VPS was `srv2033748.hstgr.cloud` on Ubuntu 24.04; verify it still belongs to this project. The earlier BTCPay Docker setup might not have finished.

## 1. Verify server, domain, BTCPay and network first

In Hostinger hPanel > VPS > browser terminal (or your existing authorized SSH connection):

```bash
sudo -i
cd /opt/bitc/repo  # use the actual checkout path; do not guess if different
bash deploy/hostinger/preflight.sh
```

The preflight is **read-only**. It lists running containers, published ports, DNS, and the Docker networks attached to the existing BTCPay nginx proxy. If `jq` is missing from the old BTCPay installation, resolve that issue in the BTCPay installation *before* publishing. Check mainnet wallet/Bitcoin Core/NBXplorer sync. The IP used earlier was `2.25.192.109` but is **historical, not verified current**.

The BTCPay Docker proxy normally owns ports **80/443**. **Do not** install a second public nginx, bind those ports again, change BTCPay Docker generated compose files, or repoint the `pay.bitcmining.tech` domain blindly. This integration registers the storefront with the *existing* nginx-proxy through its verified shared Docker network (VIRTUAL_HOST and LETSENCRYPT_HOST). See https://docs.btcpayserver.org/Docker/networking/ for current details.

Both `bitcmining.tech` and `www.bitcmining.tech` need DNS configured for the VPS and an HTTPS certificate issued by the running ACME/Let's Encrypt proxy. DNS/certificates and existing BTCPay nginx network must be inspected before launch.

## 2. Private environment and order database

Set up a **dedicated** BITC Supabase project, execute `api/migrations/001_bitc_orders.sql`, and verify the `bitc_orders` table has RLS on with no anon/authenticated access.

Create `/etc/bitc/bitc.env` on the VPS (owned by root, `chmod 600`). Never commit or paste secrets into GitHub or client HTML:

```dotenv
BTCPAY_URL=https://pay.bitcmining.tech
BTCPAY_API_KEY=REPLACE_IN_PRIVATE_VPS_FILE
BTCPAY_STORE_ID=REPLACE_IN_PRIVATE_VPS_FILE
BTCPAY_WEBHOOK_SECRET=REPLACE_IN_PRIVATE_VPS_FILE
BITC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
BITC_SUPABASE_SERVICE_KEY=REPLACE_IN_PRIVATE_VPS_FILE
BITC_CATALOG_JSON={"CONFIRMED_VARIANT_ID":{"title":"Exact product and variant","cents":11999}}
```

`BITC_CATALOG_JSON` values are examples only. You must confirm all **actual authorized store prices**, variant IDs and inventory before setting a production catalog. Missing SKUs are deliberately blocked by the backend. Initial add-on SKUs are `reco-cards` USD 18 and `reco-gold-nugget` USD 36. Do not accept prices sent by the browser.

## 3. Deploy in the current VPS

Clone/fetch your repo into `/opt/bitc/repo` (or use its existing checked-out path), and select the reviewed code. Identify the *actual* existing nginx-proxy Docker network from the preflight output. Deploy only **after** you've confirmed all prerequisites above:

```bash
sudo -i
cd /opt/bitc/repo
export BTCPAY_PROXY_NETWORK="PASTE_VERIFIED_EXISTING_PROXY_NETWORK"
export LETSENCRYPT_EMAIL="you@example.com"
bash deploy/hostinger/publish.sh --publish
```

The script refuses to publish if the proxy network, required environment keys or private database setup file are missing. It copies only storefront assets to `/opt/bitc/public`, builds a private Node API container on port 10000 and connects the storefront container to the existing BTCPay nginx-proxy network. **Neither container publishes host ports 80/443**. No BTCPay container is restarted by this script. It does not install or alter Docker or BTCPay.

The on-site checkout calls same-origin `POST /api/quote` and `POST /api/create-btcpay-invoice`. BTCPay signed webhook endpoint: `https://bitcmining.tech/api/btcpay-webhook`. Configure those webhook events in BTCPay: processing, settled, invalid and expired. Its secret must match the private file. `GET https://bitcmining.tech/api/health` checks presence of settings, **not** wallet readiness or actual processing.

## 4. Mandatory acceptance tests before ads and real customers

- Confirm TLS and storefront on `bitcmining.tech`, BTCPay remains healthy at `pay.bitcmining.tech`, and no original store/third-party checkout captures orders.
- Verify checkout rejects changed client prices, unknown SKUs, invalid quantities, invalid shipping and stale quote.
- Verify genuine invoice amount/URL, BTC wallet QR/address and Bitcoin network confirmations with an authorized minimal test payment or BTCPay test network.
- Verify webhook signature, invoice reconciliation, settled order stored securely, expired/unpaid not marked paid, repeated events are idempotent.
- Verify successful order does not grant fulfillment before `Settled`; preserve invoice link and record.
- Test refund, error, recovery, email and fulfillment operations separately. No real payment was conducted when preparing these files.

If the previous Hostinger installation is incomplete or the domain is parked, complete it first. **Do not treat this README as a claim of production deployment.**
