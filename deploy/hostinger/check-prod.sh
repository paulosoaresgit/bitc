#!/usr/bin/env bash
# Safe production verification: no API tokens or private customer data printed.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
echo "Checking BITC storefront containers..."
docker compose ps --status running --format 'table {{.Service}}\t{{.State}}'
echo "Checking API health from inside the API container..."
raw="$(docker compose exec -T api node -e "fetch('http://127.0.0.1:10000/health',{signal:AbortSignal.timeout(5000)}).then(async r => {const j=await r.json();console.log(JSON.stringify({ok:j.ok,btcpayConfigured:j.btcpayConfigured,orderEncryptionConfigured:j.orderEncryptionConfigured,salesEnabled:j.salesEnabled}));}).catch(()=>process.exit(1))")"
printf '%s\n' "$raw"
echo "$raw" | grep -q '"ok":true' || { echo "API did not pass readiness"; exit 1; }
echo "$raw" | grep -q '"btcpayConfigured":true' || { echo "BTCPay configuration missing"; exit 1; }
echo "$raw" | grep -q '"orderEncryptionConfigured":true' || { echo "Order encryption missing"; exit 1; }
echo "Checking storefront serves checkout locally..."
docker compose exec -T storefront wget -q -O /dev/null http://127.0.0.1/checkout/
echo "Checking all published checkout pages for retired optional accessories..."
docker compose exec -T storefront sh -c '
  if grep -R -E -q "recosToggle|recosPanel|Optional accessories" /usr/share/nginx/html/checkout; then
    echo "ERROR: obsolete optional accessories still in checkout" >&2
    exit 1
  fi
  echo "Published checkout is clean: 0 obsolete accessory offers"
'

echo "Checking public DNS..."
for host in bitcmining.tech www.bitcmining.tech pay.bitcmining.tech; do
  ip="$(getent ahostsv4 "$host" | awk 'NR==1{print $1}')" || true
  echo "$host -> ${ip:-unresolved}"
done
echo "Checking BTCPay public login without credentials..."
btcpay_code="$(curl -L -sS -o /dev/null -w '%{http_code}' --max-time 12 https://pay.bitcmining.tech/login)" || {
  echo "BTCPay login unreachable"; exit 1;
}
echo "BTCPay HTTP ${btcpay_code}"
[[ "$btcpay_code" == 200 ]] || { echo "BTCPay HTTP status unexpected"; exit 1; }
echo "Container health checks passed. This does NOT prove real BTC settlement."
