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
count=0
for file in root.rglob('*.html'):
    relative=file.relative_to(root)
    if 'admin' in relative.parts:continue
    html=file.read_text(encoding='utf-8')
    match=re.search(r'</head\s*>',html,flags=re.IGNORECASE)
    if not match:continue
    product=relative.parts[0]=='products'
    collection=file==root/'index.html' or relative.parts[0]=='collections'
    inject='' if 'src="/assets/bitc-tracking.js"' in html else tag
    # Load cart CSS before the JS and with a versioned URL to avoid stale styles.
    if product or collection:
        if 'id="bm-cart-styles"' not in html:
            inject='<link id="bm-cart-styles" rel="stylesheet" href="/assets/bm-cart.css?v=20261013-layout2">'+inject
    if product:
        if 'bm-cart.js' not in html:
            inject+='<script defer src="/assets/bm-cart.js"></script>'
        if 'bitc-product-purchase.js' not in html:
            inject+='<script defer src="/assets/bitc-product-purchase.js"></script>'
        route='/'+'/'.join(relative.parts[:-1])
        entry=variant_map.get(route)
        if entry and 'id="bitc-product-data"' not in html:
            record={'route':route,'entry':entry}
            inject+='<script type="application/json" id="bitc-product-data">'+safe_json(record)+'</script>'
    if collection:
        if 'bm-cart.js' not in html:
            inject+='<script defer src="/assets/bm-cart.js"></script>'
        if 'bitc-collection-quickadd.js' not in html:
            inject+='<script defer src="/assets/bitc-collection-quickadd.js"></script>'
        if 'id="bitc-quickadd-data"' not in html:
            ids=set(re.findall(r'data-product(?:-)?id\s*=\s*["\'](\d{8,17})["\']',html,flags=re.IGNORECASE))
            subset={pid:by_product[pid] for pid in sorted(ids) if pid in by_product}
            if subset:
                inject+='<script type="application/json" id="bitc-quickadd-data">'+safe_json(subset)+'</script>'
    if not inject:continue
    html=html[:match.start()]+inject+'\n'+html[match.start():]
    file.write_text(html,encoding='utf-8')
    count+=1
print('BITC first-party cart and tracking bootstraps:',count,'static pages')
PY
# Private writable pixel settings store; never expose this directory through Nginx.
install -d -o 1000 -g 1000 -m 700 /opt/bitc/pixels
cp -a "$stage/." /opt/bitc/public/
# Archived storefront folders can carry root-only modes (0700/0750).
# Nginx runs as an unprivileged worker and must traverse each directory.
# Change only directories in the allowlisted PUBLIC static webroot.
find /opt/bitc/public -type d -exec chmod 755 {} +
cd "$source_dir/deploy/hostinger"
docker compose config --quiet
docker compose up -d --build --wait
echo "BITC containers started; verify proxy, HTTPS, approved prices, invoice QR and encrypted order before accepting sales."
