#!/usr/bin/env bash
# Deliberately manual: run only after the read-only preflight and confirmed BTCPay wallet.
set -euo pipefail
if [[ "${1:-}" != "--publish" ]]; then
  echo "Usage: sudo BTCPAY_PROXY_NETWORK=<confirmed-network> LETSENCRYPT_EMAIL=<email> bash deploy/hostinger/publish.sh --publish" >&2
  exit 2
fi
[[ $(id -u) -eq 0 ]] || { echo "Run as root on the Hostinger VPS." >&2; exit 2; }
: "${BTCPAY_PROXY_NETWORK:?Set the exact verified nginx-proxy Docker network name}"
: "${LETSENCRYPT_EMAIL:?Set an operational email for TLS certificate renewal}"
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file=/etc/bitc/bitc.env
[[ -f "$env_file" ]] || { echo "Missing private credentials at $env_file (see README)." >&2; exit 2; }
[[ $(stat -c '%a' "$env_file") == "600" ]] || { echo "$env_file must have chmod 600." >&2; exit 2; }
for key in BTCPAY_URL BTCPAY_API_KEY BTCPAY_STORE_ID BTCPAY_WEBHOOK_SECRET BITC_SUPABASE_URL BITC_SUPABASE_SERVICE_KEY BITC_CATALOG_JSON; do
  grep -qE "^${key}=.+" "$env_file" || { echo "Missing value: $key" >&2; exit 2; }
done
if grep -Eq 'REPLACE_IN_PRIVATE_VPS_FILE|YOUR_PROJECT|CONFIRMED_VARIANT_ID|PASTE_VERIFIED' "$env_file"; then
  echo "Refusing to publish: private environment still contains example placeholders." >&2
  exit 2
fi
docker info >/dev/null
docker network inspect "$BTCPAY_PROXY_NETWORK" >/dev/null
proxy_found=false
while IFS= read -r name; do
  if [[ "$name" == nginx || "$name" == *nginx-proxy* ]]; then
    if docker inspect --format '{{range $n, $v := .NetworkSettings.Networks}}{{println $n}}{{end}}' "$name" | grep -Fxq "$BTCPAY_PROXY_NETWORK"; then
      proxy_found=true
      break
    fi
  fi
done < <(docker ps --format '{{.Names}}')
[[ "$proxy_found" == true ]] || { echo "Refusing to deploy: no running BTCPay nginx proxy on $BTCPAY_PROXY_NETWORK." >&2; exit 2; }
# Static published files are explicitly allowlisted: never expose source code or secrets.
install -d -m 755 /opt/bitc/public
stage="$(mktemp -d /opt/bitc/site.stage.XXXXXXXX)"
trap 'rm -rf "$stage"' EXIT
for item in index.html assets checkout collections products pages blogs; do
  [[ -e "$source_dir/$item" ]] && cp -a "$source_dir/$item" "$stage/"
done
[[ -f "$stage/index.html" && -f "$stage/checkout/index.html" ]] || { echo "Storefront capture is incomplete." >&2; exit 2; }
# Only update the dedicated BITC website folder, never the BTCPay directory.
cp -a "$stage/." /opt/bitc/public/
cd "$source_dir/deploy/hostinger"
docker compose config --quiet
docker compose up -d --build --wait
echo "Deployment started. Before accepting orders, verify /api/health, BTCPay wallet, approved catalog and a complete checkout."
