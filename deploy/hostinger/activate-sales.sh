#!/usr/bin/env bash
# BITC: --check is read only. --activate is an explicit opt-in, and refuses
# activation while linked policies, eligible shipping and settlement are unverified.
set -euo pipefail
mode="--check"; if [[ $# -gt 0 ]];then mode="$1";fi
[[ "$mode" == "--check" || "$mode" == "--activate" ]] || { echo "Usage: bash activate-sales.sh [--check|--activate]" >&2;exit 2; }
[[ "$(id -u)" -eq 0 ]] || { echo "Root required" >&2;exit 2; }
env_file=/etc/bitc/bitc.env
webroot=/opt/bitc/public
[[ -f "$env_file" && "$(stat -c '%a' "$env_file")" == 600 ]] || { echo "BLOCK: missing private env, or mode not 600";exit 2; }
[[ -f "$webroot/checkout/index.html" ]] || { echo "BLOCK: checkout not published";exit 2; }
status=0
echo "BITC launch check: $mode (never prints API credentials)"
# Check that all policy links are local and point to real published files.
if python3 - "$webroot" <<'PY'
import sys
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
root=Path(sys.argv[1]).resolve()
class Parser(HTMLParser):
 def __init__(self):super().__init__();self.footer=False;self.depth=0;self.links=[];self.href=None
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='div' and 'co-footer-links' in a.get('class','').split():self.footer=True;self.depth=1;return
  if self.footer and tag=='div':self.depth+=1
  if self.footer and tag=='a':self.href=a.get('href')
 def handle_endtag(self,tag):
  if self.footer and tag=='div':
   self.depth-=1
   if self.depth<=0:self.footer=False
 def handle_data(self,t):
  if self.footer and self.href is not None and t.strip():self.links.append((t.strip(),self.href));self.href=None
p=Parser();p.feed((root/'checkout/index.html').read_text(encoding='utf-8'))
links=dict(p.links)
bad=[]
for name in ('Refund policy','Privacy policy','Terms of service','Cancellations'):
 href=links.get(name,'')
 url=urlsplit(href)
 if not href.startswith('/') or href.startswith('//') or url.netloc or url.scheme or url.query or url.fragment:
  bad.append(name+': invalid or placeholder link');continue
 path=unquote(url.path)
 if '\\' in path or '..' in Path(path).parts:bad.append(name+': invalid path');continue
 target=(root/path.lstrip('/')).resolve()
 if root not in target.parents and target!=root:bad.append(name+': outside storefront');continue
 if target.is_dir():target=target/'index.html'
 if not target.is_file() or target.stat().st_size<350:bad.append(name+': policy HTML not published');continue
if bad:
 for item in bad:print('BLOCK: '+item)
 raise SystemExit(2)
print('OK: all four policy links point to local published pages')
print('CHECK: merchant must review policy content and publish accurate support details')
PY
then :;else status=1;fi
# Fail closed on unrestricted international shipping.
if grep -qE '^BITC_SHIP_TO_COUNTRIES=[A-Za-z, ]+$' "$env_file";then
 echo 'OK: shipping-country allowlist exists (merchant must validate actual carrier reach)'
else
 echo 'BLOCK: configure BITC_SHIP_TO_COUNTRIES for actual delivery destinations'
 status=1
fi
diagnostic="$(mktemp)"
trap 'rm -f "$diagnostic"' EXIT
docker exec bitc-store-api-1 node /app/launch-readiness.js >"$diagnostic" 2>&1 || true
if grep -Fq '[OK] Live BTC settlement test' "$diagnostic";then
 echo 'OK: real BTC private test settled without exceptions'
else
 echo 'BLOCK: no settled private BTC test invoice verified'
 status=1
fi
if grep -Fq '[OK] BTC on-chain payment method' "$diagnostic" &&
 grep -Fq '[OK] BTCPay invoice read permission' "$diagnostic";then
 echo 'OK: BTCPay credentials and onchain method available'
else
 echo 'BLOCK: BTCPay store credentials or BTC method unavailable'
 status=1
fi
if [[ "$status" -ne 0 ]];then echo 'NOT ACTIVATED: resolve checks first.';exit 2;fi
if [[ "$mode" == "--check" ]];then echo 'PREPARED: no flags changed. Run --activate only after merchant reviews policies and fulfillment.';exit 0;fi
[[ -v BTCPAY_PROXY_NETWORK && -v LETSENCRYPT_EMAIL ]] || { echo 'BLOCK: export proxy network and certificate email before activating';exit 2; }
backup="/etc/bitc/bitc.env.before-sales-$(date -u +%Y%m%dT%H%M%SZ)"
cp -p "$env_file" "$backup"
chmod 600 "$backup"
tmp="$(mktemp /etc/bitc/.bitc.env.XXXXXX)"
chmod 600 "$tmp"
trap 'rm -f "$tmp" "$diagnostic"' EXIT
python3 - "$env_file" "$tmp" <<'PY'
from pathlib import Path
import sys
keys=['BITC_SALES_ENABLED','BITC_SHIPPING_APPROVED','BITC_INVENTORY_APPROVED','BITC_TERMS_APPROVED']
lines=Path(sys.argv[1]).read_text().splitlines()
seen=set();output=[]
for line in lines:
 k=line.partition('=')[0].strip()
 if k in keys:
  if k in seen:raise SystemExit('BLOCK: duplicated flag '+k)
  seen.add(k);output.append(k+'=true')
 else:output.append(line)
output.extend(k+'=true' for k in keys if k not in seen)
Path(sys.argv[2]).write_text('\n'.join(output)+'\n')
PY
chown --reference="$env_file" "$tmp"
mv -f "$tmp" "$env_file"
compose="$(dirname "$0")/docker-compose.yml"
rollback(){
 cp -p "$backup" "$env_file"
 docker compose -f "$compose" up -d --no-deps --force-recreate api >/dev/null 2>&1 || true
 echo 'BLOCK: activation failed and prior private env was restored.' >&2
}
if ! docker compose -f "$compose" up -d --no-deps --force-recreate api;then rollback;exit 1;fi
if docker exec bitc-store-api-1 node -e "fetch('http://127.0.0.1:10000/health').then(r=>r.json()).then(j=>process.exit(j.salesEnabled&&j.btcpayConfigured&&j.orderEncryptionConfigured?0:1)).catch(()=>process.exit(1))";then
 echo 'ACTIVATED: private API reports salesEnabled=true. Confirm storefront and order fulfillment.'
 echo 'Emergency rollback: restore protected env backup and recreate only the API container.'
else
 rollback;exit 1
fi
