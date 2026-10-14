#!/usr/bin/env bash
# Manual, guarded deployment for the already-verified Hostinger BTCPay VPS.
set -euo pipefail
if [[ "${1:-}" != "--publish" ]]; then
  echo "Usage: as root, set BTCPAY_PROXY_NETWORK and LETSENCRYPT_EMAIL, then run publish.sh --publish" >&2
  exit 2
fi
[[ "$(id -u)" -eq 0 ]] || { echo "Run as root on the Hostinger VPS." >&2; exit 2; }
: "${BTCPAY_PROXY_NETWORK:?Set the actual existing BTCPay nginx network}"
: "${LETSENCRYPT_EMAIL:?Set the real email for certificate renewal}"
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file=/etc/bitc/bitc.env
[[ -f "$env_file" ]] || { echo "Missing $env_file." >&2; exit 2; }
[[ "$(stat -c '%a' "$env_file")" == "600" ]] || { echo "$env_file must have chmod 600." >&2; exit 2; }
for key in BTCPAY_URL BTCPAY_API_KEY BTCPAY_STORE_ID BITC_ORDER_ENCRYPTION_KEY; do
  grep -qE "^${key}=.+" "$env_file" || { echo "Missing value: $key" >&2; exit 2; }
done
grep -qE '^BITC_ORDER_ENCRYPTION_KEY=[a-fA-F0-9]{64}$' "$env_file" || {
  echo "BITC_ORDER_ENCRYPTION_KEY must be a 64-character hexadecimal key." >&2
  exit 2
}
if grep -Eq 'REPLACE_IN_PRIVATE_VPS_FILE|YOUR_PROJECT|CONFIRMED_VARIANT_ID|PASTE_VERIFIED|YOUR_STORE_ID' "$env_file"; then
  echo "Refusing to publish: example placeholders found in private credentials." >&2
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
[[ "$proxy_found" == true ]] || {
  echo "Existing BTCPay nginx proxy not found on $BTCPAY_PROXY_NETWORK; refusing to deploy." >&2
  exit 2
}
[[ -f "$source_dir/index.html" && -f "$source_dir/checkout/index.html" ]] || {
  echo "Required storefront pages missing." >&2
  exit 2
}
# Only the static allowlisted site is copied; no credentials or source files become public.
install -d -m 755 /opt/bitc/public
stage="$(mktemp -d /opt/bitc/site.stage.XXXXXXXX)"
trap 'rm -rf "$stage"' EXIT
for item in index.html assets checkout collections products pages blogs admin; do
  if [[ -e "$source_dir/$item" ]]; then
    cp -a "$source_dir/$item" "$stage/"
  fi
done

# Strip obsolete checkout upsells from any copied checkout template, not only
# from the checked-in source. Preserve the payment block immediately after it.
python3 - "$stage" <<'PY'
from pathlib import Path
import re, sys
root = Path(sys.argv[1])
pattern = re.compile(
    r'<button\b(?=[^>]*\bid=["\x27]recosToggle["\x27])[^>]*>[\s\S]*?'
    r'<div\b(?=[^>]*\bclass=["\x27][^"\x27]*\bco-payment-section\b)[^>]*>',
    re.I
)
changed = 0
for path in root.rglob('*.html'):
    raw = path.read_text(encoding='utf-8')
    if 'recosToggle' not in raw and 'recosPanel' not in raw:
        continue
    if not path.relative_to(root).parts[0] == 'checkout':
        # Never remove legitimate product listings on unrelated pages.
        raise RuntimeError(f"Obsolete checkout extras unexpectedly found outside checkout: {path}")
    newer, count = pattern.subn(lambda m: re.search(
        r'<div\b(?=[^>]*\bclass=["\x27][^"\x27]*\bco-payment-section\b)[^>]*>',
        m.group(0), re.I).group(0), raw)
    if count != 1 or 'recosToggle' in newer or 'recosPanel' in newer:
        raise RuntimeError(f"Refusing partial extra removal in {path}")
    path.write_text(newer, encoding='utf-8')
    changed += 1
for path in (root/'checkout').rglob('*.html'):
    raw = path.read_text(encoding='utf-8')
    if any(token in raw for token in (
        'recosToggle', 'recosPanel', 'Optional accessories (availability must be verified)',
        'Bitcoin Merch® - Gold Nugget Lottery Miner',
        'Cardsmiths Crypto Currency Collectible Trading Cards'
    )):
        raise RuntimeError(f"Retired checkout accessory still present in {path}")
print(f"BITC retired checkout accessories: {changed} stale templates cleaned; no upsells remain")
PY

# Remove old hardcoded ad accounts inherited from captured third-party HTML.
# Existing originals remain unchanged; sanitized copies are published.
python3 "$source_dir/deploy/hostinger/remove-legacy-tracking.py" "$stage"

# Publish only verified product names, SKU IDs, prices and availability; no secrets.
python3 - "$source_dir/api/live-products.json" "$source_dir/api/catalog.json" "$stage/assets/bitc-variant-map.json" <<'PY'
import json,sys,pathlib
live=json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
catalog=json.loads(pathlib.Path(sys.argv[2]).read_text(encoding='utf-8'))
out={}
for route,product in live.items():
    safe=[]
    for row in product.get('variants',[]):
        id=str(row['id']);cents=int(row['cents'])
        eligible=bool(row.get('available')) and id in catalog and catalog[id]['cents']==cents
        safe.append({'id':id,'title':row['title'],'cents':cents,'available':eligible})
    out[route]={'title':product['title'],'image':product.get('image',''),
                'productId':str(product.get('productId','')),
                'checkoutEnabledForReview':bool(product.get('checkoutEnabledForReview')),
                'variants':safe}
pathlib.Path(sys.argv[3]).write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print('BITC purchase variant map:',len(out),'products; generated from server-approved catalog')
PY

# Install only a first-party bootstrap on every existing static HTML page so new
# pixels appear on all product and collection pages without editing 152 files.
# Trackers themselves load only after an explicit opt-in from the visitor.
python3 - "$stage" <<'PY'
import pathlib,re,sys,json
root=pathlib.Path(sys.argv[1])
tag='<script defer src="/assets/bitc-tracking.js"></script>'
# Each published page carries its own exact approved product records. The buyer
# can add to the local cart without waiting for a catalog fetch.
variant_map=json.loads((root/'assets/bitc-variant-map.json').read_text(encoding='utf-8'))
by_product={}
for route,p in variant_map.items():
    pid=str(p.get('productId') or '')
    if pid and route.startswith('/products/'):
        by_product[pid]={**p,'route':route}
def safe_json(data):
    return json.dumps(data,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
early_guard=(root/'assets/bitc-early-cart.js').read_text(encoding='utf-8').replace('</script','<\\/script')
count=0
for file in root.rglob('*.html'):
    relative=file.relative_to(root)
    if 'admin' in relative.parts:continue
    html=file.read_text(encoding='utf-8')
    if not re.search(r'</head\s*>',html,flags=re.IGNORECASE):continue
    product=relative.parts[0]=='products'
    collection=file==root/'index.html' or relative.parts[0]=='collections'
    inject='' if 'src="/assets/bitc-tracking.js"' in html else tag
    if product:
        if 'id="bm-cart-styles"' not in html:
            inject='<link id="bm-cart-styles" rel="stylesheet" href="/assets/bm-cart.css?v=20261014-fast-cart1">'+inject
        if 'bm-cart.js' not in html:
            inject+='<script defer src="/assets/bm-cart.js?v=20261014-fast-cart1"></script>'
        if 'bitc-product-purchase.js' not in html:
            inject+='<script defer src="/assets/bitc-product-purchase.js"></script>'
        route='/'+'/'.join(relative.parts[:-1])
        entry=variant_map.get(route)
        if entry and 'id="bitc-product-data"' not in html:
            record={'route':route,'entry':entry}
            inject+='<script type="application/json" id="bitc-product-data">'+safe_json(record)+'</script>'
    if collection:
        # The captured merchant/page-builder head can contain long, blocking scripts.
        # Bind the first-click guard at the very beginning of HEAD, before those
        # scripts and before the body has finished streaming to the browser.
        ids=set(re.findall(r'data-product(?:-)?id\s*=\s*["\'](\d{8,17})["\']',html,flags=re.IGNORECASE))
        subset={pid:by_product[pid] for pid in sorted(ids) if pid in by_product}
        # Avoid duplicate legacy first-party bootstraps on re-publication.
        html=re.sub(r'<script\b[^>]*\bsrc=["\']/assets/(?:bm-cart|bitc-collection-quickadd)\.js(?:\?[^"\']*)?["\'][^>]*>\s*</script\s*>','',html,flags=re.IGNORECASE)
        html=re.sub(r'<script\b[^>]*\bid=["\']bitc-quickadd-data["\'][^>]*>.*?</script\s*>','',html,flags=re.IGNORECASE|re.DOTALL)
        html=re.sub(r'<link\b[^>]*\bid=["\']bm-cart-styles["\'][^>]*>','',html,flags=re.IGNORECASE)
        head_open=re.search(r'<head\b[^>]*>',html,flags=re.IGNORECASE)
        if not head_open:continue
        early='<script>'+early_guard+'</script>'
        if subset:
            early+='<script type="application/json" id="bitc-quickadd-data">'+safe_json(subset)+'</script>'
        early+='<link id="bm-cart-styles" rel="stylesheet" href="/assets/bm-cart.css?v=20261014-fast-cart1">'
        # Async scripts load during page parsing instead of waiting for all 1MB+
        # of product cards and third-party theme scripts to finish parsing.
        early+='<script async src="/assets/bm-cart.js?v=20261014-fast-cart1"></script>'
        early+='<script async src="/assets/bitc-collection-quickadd.js?v=20261014-fast-cart1"></script>'
        html=html[:head_open.end()]+early+html[head_open.end():]
    if inject:
        match=re.search(r'</head\s*>',html,flags=re.IGNORECASE)
        html=html[:match.start()]+inject+'\n'+html[match.start():]
    if inject or collection:
        file.write_text(html,encoding='utf-8')
        count+=1
print('BITC first-party cart and tracking bootstraps:',count,'static pages')
PY
# Private writable pixel settings store; never expose this directory through Nginx.
install -d -o 1000 -g 1000 -m 700 /opt/bitc/pixels
cp -a "$stage/." /opt/bitc/public/
# Ensure the actual Nginx volume cannot still serve the retired block.
if grep -R -E 'recosToggle|recosPanel|Optional accessories \(availability must be verified\)' /opt/bitc/public/checkout --include='*.html' -q; then
  echo "ERROR: obsolete checkout accessories remain in the public webroot." >&2
  exit 1
fi

# Archived storefront folders can carry root-only modes (0700/0750).
# Nginx runs as an unprivileged worker and must traverse each directory.
# Change only directories in the allowlisted PUBLIC static webroot.
find /opt/bitc/public -type d -exec chmod 755 {} +
cd "$source_dir/deploy/hostinger"
docker compose config --quiet
docker compose up -d --build --wait
# nginx.conf is bind-mounted; Docker may keep the existing running container
# rather than restarting it when only the contents of the config file change.
docker compose exec -T storefront nginx -t
docker compose exec -T storefront nginx -s reload
# Test the served HTML, not only the GitHub source: every checkout must have
# zero deprecated optional offers before announcing publication success.
docker compose exec -T storefront sh -c '
  wget -q -O /tmp/bitc-checkout-served.html http://127.0.0.1/checkout/ || exit 1
  if grep -E -q "recosToggle|recosPanel|Optional accessories \(availability must be verified\)" /tmp/bitc-checkout-served.html; then
    echo "ERROR: stale accessory block still in HTTP checkout response" >&2
    exit 1
  fi
  echo "BITC checkout HTML clean: no optional accessory offers"
'
echo "BITC containers started; verify proxy, HTTPS, approved prices, invoice QR and encrypted order before accepting sales."
