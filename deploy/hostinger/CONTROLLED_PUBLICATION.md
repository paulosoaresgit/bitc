# BITC Mining — controlled Hostinger publication checklist

This runbook requires the merchant's Hostinger root web terminal. **Do not put API keys, wallet recovery phrases, or order-encryption keys in GitHub or this chat.** The ChatGPT GitHub integration cannot execute on the existing Hostinger VPS or change its DNS.

## Confirmed state (independently checked 2026-10-12)

- Root `bitcmining.tech` and `www.bitcmining.tech` still resolve to Hostinger parking **2.57.91.91**; store VPS is **2.25.192.109**.
- `pay.bitcmining.tech` resolves to **2.25.192.109**; HTTPS login responds HTTP 200.
- Source contains 152 product pages / 553 priced SKUs, with eight products not permitted to checkout.
- Shipping per order: DHL free, FedEx USD 24.99, UPS USD 29.99 (merchant confirmed).
- GitHub Actions checks API tests, browser cart/checkout and fixed prices. No live paid invoice verified.
- Critical customer-policy pages are **missing**: refund, privacy, and terms pages. Checkout footer still has four `href="#"` policy links. Obtain merchant company identity, support contact and approved policies before accepting real orders.
- Captured product media and marketing copy refer to third-party Bitcoin Merch. The merchant must verify licensed rights and accurate representations before sending public sales traffic.

## Deployment phase 1: publish containers on VPS but keep checkout locked

In Hostinger's browser terminal, run as root:

```bash
cd /opt/bitc/repo || exit 1
git pull --ff-only origin fix/btcpay-server-pricing-checkout || exit 1
export BTCPAY_PROXY_NETWORK=generated_default
read -r -p "E-mail for SSL certificate: " LETSENCRYPT_EMAIL
export LETSENCRYPT_EMAIL
if grep -Eq '^BITC_SALES_ENABLED=true$' /etc/bitc/bitc.env; then
  echo "ABORT: sales are already enabled in the VPS. Disable sales before staging." >&2
else
  bash deploy/hostinger/preflight.sh &&
  bash deploy/hostinger/publish.sh --publish &&
  bash deploy/hostinger/check-prod.sh
fi
```

Never send a screenshot of `/etc/bitc/bitc.env`. The storefront Compose project attaches to the existing BTCPay nginx-proxy network; it does not bind the host's 80/443 or restart BTCPay containers.

The project's payment kill-switch must remain OFF until live wallet/invoice and merchant policies have been validated.

## Phase 2: point DNS only after containers and local health pass

In the authoritative Hostinger DNS zone, change **`@` and `www`** A records from parking **2.57.91.91** to verified VPS **2.25.192.109**, accounting for any `www` CNAME and AAAA conflicts. **Do not touch `pay`**, its A record, or its existing BTCPay services. Allow propagation and Let's Encrypt certificate issuance.

Check:

```bash
dig +short bitcmining.tech A
dig +short www.bitcmining.tech A
dig +short pay.bitcmining.tech A
curl -fsS https://bitcmining.tech/api/health | jq '{ok,btcpayConfigured,orderEncryptionConfigured,salesEnabled}'
curl -sS -o /dev/null -w '%{http_code}\n' https://pay.bitcmining.tech/login
```

The root API health must be real JSON from BITC, not a parked domain HTTP 200.

## Phase 3: launch sales separately only after acceptance

- Fill company and support identity, finish policies and verify no broken checkout links.
- Confirm stock sourcing, media rights, supported countries/carriers, returns and customs information.
- Securely back up VPS-only `BITC_ORDER_ENCRYPTION_KEY` and BTCPay recovery material elsewhere.
- Verify expected USD quote with each shipping method and the exact BTC QR link; test read-back of encrypted invoice metadata.
- Test one controlled payment settlement and merchant private order lookup; check no unpaid/partial/late/overpaid orders are fulfilled.
- Then explicitly authorize production payment activation and set the FOUR independent env flags only after all checks pass. Do not set them as part of phase 1 or the DNS change.

## Rollback

If the storefront misbehaves, leave the existing `pay` hostname alone. Repoint `@` and `www` away from the new storefront only if needed, or disable the isolated `bitc-store` Compose project from `/opt/bitc/repo/deploy/hostinger`. Never run a global `docker compose down`, stop an unrelated container, or modify the BTCPay nginx configuration without a proper backup.
