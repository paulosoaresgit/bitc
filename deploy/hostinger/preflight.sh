#!/usr/bin/env bash
# Read-only diagnostics for the BITC/BTCPay Hostinger VPS. Does not alter services.
set -uo pipefail
echo "=== BITC Hostinger VPS diagnostic (read-only) ==="
echo "Host: $(hostname -f 2>/dev/null || hostname)"
printf "UTC: "; date -u '+%Y-%m-%dT%H:%M:%SZ'
echo
for cmd in docker git jq curl getent; do
  if command -v "$cmd" >/dev/null 2>&1; then
    printf "[OK] %s available\n" "$cmd"
  else
    printf "[WARN] %s not installed\n" "$cmd"
  fi
done
echo
for host in bitcmining.tech pay.bitcmining.tech; do
  echo "DNS $host:"
  getent ahostsv4 "$host" 2>/dev/null | awk 'NR==1 { print "  A " $1 }' || true
done
echo
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "Docker containers (names and published ports only):"
  docker ps --format '  {{.Names}}  {{.Image}}  {{.Ports}}'
  echo
  echo "Proxy containers and their Docker network names:"
  while IFS= read -r name; do
    [[ "$name" == "nginx" || "$name" == *"nginx-proxy"* ]] || continue
    printf '  %s: ' "$name"
    docker inspect --format '{{range $name, $net := .NetworkSettings.Networks}}{{printf "%s " $name}}{{end}}' "$name" || true
    echo
  done < <(docker ps --format '{{.Names}}')
  echo
  echo "BTCPay related containers:"
  docker ps --format '{{.Names}} {{.Status}}' | grep -Ei 'btcpay|nbxplorer|bitcoin|nginx|letsencrypt' || true
else
  echo "[WARN] Docker daemon unavailable or current account lacks Docker access."
fi
echo
echo "Known earlier BTCPay directory:"
if [[ -d /root/BTCPayServer/btcpayserver-docker ]]; then
  echo "  Present: /root/BTCPayServer/btcpayserver-docker"
else
  echo "  Not found (install may be incomplete or in a different directory)."
fi
echo
for u in https://bitcmining.tech/ https://pay.bitcmining.tech/; do
  code=$(curl -k -L -sS --max-time 8 -o /dev/null -w '%{http_code}' "$u" 2>/dev/null || true)
  echo "HTTPS $u => ${code:-unreachable}"
done
echo
echo "Preflight complete. No changes made."
