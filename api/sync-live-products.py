#!/usr/bin/env python3
"""Pin current variant prices using public read-only product JSON.
Generated product pages are safe to preview. Never deploy without merchant review.
"""
from concurrent.futures import ThreadPoolExecutor,as_completed
import datetime,html,json,pathlib,re,sys,time,urllib.parse,urllib.request,urllib.error

ROOT=pathlib.Path(__file__).resolve().parents[1]
report=json.loads((ROOT/"api/product-page-report.json").read_text(encoding="utf-8"))
previous=json.loads((ROOT/"api/catalog.json").read_text(encoding="utf-8"))
product_paths=sorted(report["products"])
BASE={"reco-cards":previous["reco-cards"],"reco-gold-nugget":previous["reco-gold-nugget"]}
def grab(path):
 slug=path.split("/")[-1]
 endpoint="https://bitcoinmerch.com/products/"+urllib.parse.quote(slug,safe="-")+".js"
 for attempt in range(2):
  try:
   req=urllib.request.Request(endpoint,headers={"Accept":"application/json","User-Agent":"BITC-MerchantCatalogReview/1.0"})
   with urllib.request.urlopen(req,timeout=18) as response:
    if response.status!=200:raise RuntimeError("HTTP "+str(response.status))
    raw=response.read(2_500_001)
    if len(raw)>2_500_000:raise RuntimeError("Product feed too large")
    product=json.loads(raw)
   if not isinstance(product,dict) or not isinstance(product.get("variants"),list) or not product.get("title"):
    raise RuntimeError("Invalid product feed")
   variants=[]
   for v in product["variants"]:
    id=str(v.get("id",""))
    cents=v.get("price")
    if not re.fullmatch(r"\d{8,17}",id) or not isinstance(cents,int) or not 50<=cents<=10000000:
     continue
    variants.append({"id":id,"title":str(v.get("title") or "Standard").strip()[:120],
      "cents":cents,"available":v.get("available") is True})
   if not variants:raise RuntimeError("No well-formed variants")
   image=product.get("featured_image") or (product.get("images") or [""])[0] or ""
   if image.startswith("//"):image="https:"+image
   if image.startswith("/"):image="https://bitcoinmerch.com"+image
   if not (image.startswith("https://bitcoinmerch.com/cdn/") or image.startswith("https://cdn.shopify.com/")):image=""
   return path,{"title":str(product.get("title") or "")[:200],
    "variants":variants,"image":image,"productId":str(product.get("id") or ""),
    "sourceUrl":endpoint,"source":"public_product_feed"},None
  except Exception as e:
   if attempt==1 or isinstance(e,urllib.error.HTTPError) and e.code==429:
    return path,None,str(e)[:180]
   time.sleep(0.7)
def esc(v):return html.escape(str(v),quote=True)
def fmt(n):return "$"+format(n/100,",.2f")
def page(path,p,approved,reason):
 title=p["title"]
 av=[v for v in p["variants"] if v["available"]]
 price=min((v["cents"] for v in av),default=None)
 select=''.join('<option value="'+esc(v["id"])+'" data-cents="'+str(v["cents"])+'"'+(' disabled' if not v["available"] else '')+'>'+esc(v["title"])+' — '+fmt(v["cents"])+(' (Unavailable)' if not v["available"] else '')+'</option>' for v in p["variants"])
 image=p.get("image") or report["products"][path].get("image") or ""
 hero='<img src="'+esc(image)+'" alt="'+esc(title)+'" loading="eager">' if image else '<span class="placeholder">₿</span>'
 can_buy=bool(av and approved)
 notice="Price and variants verified against product feed. Fulfillment and stock must be confirmed by the store operator before launch." if can_buy else reason
 form=('<label for="v"><b>Model / option</b></label><select id="v" name="id" aria-label="Select product option">'+select+'</select>'
       +'<label for="qty"><b>Quantity</b></label><input id="qty" type="number" name="quantity" min="1" max="10" value="1">'
       +('<img class="hidden-cart-image" src="'+esc(image)+'" alt="">' if image else '')
       +'<span class="price" id="cartPrice">'+(fmt(av[0]["cents"]) if av else 'Unavailable')+'</span>'
       +('<button class="buy active" type="submit">Add to cart</button>' if can_buy else '<button class="buy" type="button" disabled>Checkout temporarily unavailable</button>'))
 if not av:form='<button type="button" class="buy" disabled>Out of stock</button>'
 return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,follow"><title>{esc(title)} | BITC Mining</title>
<meta name="description" content="{esc(title)} — Bitcoin hardware and accessories. Check model and current price before ordering.">
<link rel="canonical" href="https://bitcmining.tech{esc(path)}/">
<link rel="stylesheet" href="/assets/bitc-product.css"><script defer src="/assets/bm-cart.js"></script><script defer src="/assets/bitc-product.js"></script></head><body>
<header class="top"><div class="nav"><a class="brand" href="/"><span class="coin">₿</span> BITC <b>MINING</b></a>
<nav><a href="/">Home</a><a href="/collections/all/">All products</a><a href="/checkout/">Cart / Checkout</a></nav></div></header>
<main class="shell"><div class="crumbs"><a href="/">Home</a> / <a href="/collections/all/">All products</a> / {esc(title)}</div>
<section class="detail"><div class="gallery">{hero}</div><div class="info"><p class="eyebrow">BITCOIN MINING • HARDWARE & MERCH</p>
<h1>{esc(title)}</h1><p class="category">Choose a model and confirm the displayed amount</p>
<p class="price" id="displayPrice">{('From '+fmt(price)) if price else 'Not available'}</p>
<p class="notice" role="status">{esc(notice)}</p>
<form class="product-form" method="post" action="/cart/add">{form}</form>
<div class="facts"><div><b>Bitcoin checkout</b><span>Payments are processed through BTCPay only for available, verified options.</span></div>
<div><b>Shipment and fulfillment</b><span>Shipping costs, inventory and delivery promises must be approved by the merchant before launch.</span></div></div>
</div></section><section class="more"><h2>More mining equipment</h2><p>Browse all available products and compare your options.</p>
<a class="back" href="/collections/all/">Browse all products →</a></section></main>
<footer>© BITC Mining · <a href="/">Home</a> · <a href="/pages/contact-us/">Contact</a></footer>
</body></html>"""
# Keep previously verified products across incremental runs. Respect HTTP 429;
# never bombard the upstream feed and never erase existing verified prices.
cached=ROOT/"api/live-products.json"
entries=json.loads(cached.read_text(encoding="utf-8")) if cached.exists() else {}
errors={}
remaining=[p for p in product_paths if p not in entries]
rate_limited=False
for i,path in enumerate(remaining):
 if i>=45:
  errors.update({p:"awaiting_next_authorized_import" for p in remaining[i:]})
  break
 key,p,err=grab(path)
 if p:entries[key]=p
 else:
  errors[key]=err
  if "429" in (err or ""):
   rate_limited=True
   errors.update({rest:"source_rate_limited" for rest in remaining[i+1:]})
   break
 time.sleep(1.2)

print("LIVE_SYNC_FETCH="+json.dumps({"requested":len(product_paths),"fetched":len(entries),"failed":len(errors),"sampleErrors":list(errors.items())[:12]}))
catalog=dict(previous)
collisions=[]
mismatches=[]
enabled=0
blocked=0
total_variants=0
for path in product_paths:
 p=entries.get(path)
 if not p:continue
 total_variants+=len(p["variants"])
 old=report["products"][path]
 available=[v for v in p["variants"] if v["available"]]
 # Never keep a purchasable server SKU that the source now explicitly marks unavailable.
 for v in p["variants"]:
  if not v["available"]:catalog.pop(v["id"],None)
 minprice=min((v["cents"] for v in available),default=None)
 listed=old.get("priceCents")
 # If the captured page says a different minimum amount, do not silently charge more.
 mismatch=bool(listed is not None and minprice is not None and listed!=minprice)
 if mismatch:
  mismatches.append({"path":path,"capturedMin":listed,"feedMin":minprice})
  for v in p["variants"]:catalog.pop(v["id"],None)
 # Do not charge with a newer price before both visible UI and catalog agree.
 approved=bool(available and not mismatch)
 conflict=False
 if approved:
  for v in available:
   prev=catalog.get(v["id"])
   if prev is not None and prev["cents"]!=v["cents"]:
    collisions.append({"path":path,"variant":v["id"],"oldPrice":prev["cents"],"newPrice":v["cents"]})
    conflict=True
 if conflict:
  approved=False
  for v in p["variants"]:catalog.pop(v["id"],None)
 if approved:
  for v in available:catalog[v["id"]]={"title":(p["title"]+" — "+v["title"]).strip()[:200],"cents":v["cents"]}
  enabled+=1
 else:blocked+=1
 p["checkoutEnabledForReview"]=approved
 p["capturedListingPriceCents"]=listed
 p["priceMismatchWithListing"]=mismatch
 p["availableVariants"]=len(available)
 file=ROOT/path.lstrip("/")/"index.html"
 if not old["localPageExists"]:
  msg="Product feed does not confirm a matching price or availability. Checkout temporarily unavailable."
  file.write_text(page(path,p,approved,msg),encoding="utf-8")
# ensure main two products continue using existing HTML; server prices came from the live feed
live_out=ROOT/"api/live-products.json"
live_out.write_text(json.dumps(entries,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
(ROOT/"api/catalog.json").write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
(ROOT/"api/live-product-audit.json").write_text(json.dumps({"requested":len(product_paths),
 "resolved":len(entries),"failedProducts":errors,"listingPriceMismatches":mismatches,
 "variantIdConflicts":collisions,"liveVariants":total_variants,
 "purchaseEligibleListings":enabled,"reviewNeededListings":blocked+len(errors),
 "note":"Data from the public source storefront; merchant must verify inventory, fulfillment, sourcing, and captured storefront price before production."},indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
js="""document.addEventListener('DOMContentLoaded',()=>{const form=document.querySelector('.product-form');const sel=form?.querySelector('select[name=id]');if(!sel)return;const label=document.getElementById('displayPrice'),formPrice=document.getElementById('cartPrice');const fmt=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);function update(){const o=sel.selectedOptions[0];if(!o||o.disabled)return;const cents=Number(o.dataset.cents);if(!Number.isSafeInteger(cents))return;if(label)label.textContent=fmt(cents/100);if(formPrice)formPrice.textContent=fmt(cents/100);}if(sel.options.length){const first=[...sel.options].find(o=>!o.disabled);if(first)sel.value=first.value;}sel.addEventListener('change',update);update();});"""
(ROOT/"assets/bitc-product.js").write_text(js+"\n",encoding="utf-8")
css=ROOT/"assets/bitc-product.css"
cc=css.read_text(encoding="utf-8")
addon="""
.product-form{display:grid;gap:9px;margin-top:20px}.product-form label{font-size:13px;color:#526170}
.product-form select,.product-form input{width:100%;max-width:100%;font:inherit;background:white;border:1px solid #cfd7dc;border-radius:9px;padding:13px 10px;color:#17212c}.product-form input{width:115px}.product-form .price{font-size:24px;margin:7px 0 0}.product-form .hidden-cart-image{display:none}.product-form .buy.active{background:#f7931a;color:#181b20;cursor:pointer}.product-form .buy.active:hover{background:#eda021}
"""
if ".product-form .buy.active" not in cc:css.write_text(cc+"\n"+addon,encoding="utf-8")
print("LIVE_SYNC_RESULT="+json.dumps({"productsWithFeed":len(entries),"failed":len(errors),
 "liveVariants":total_variants,"catalogSKUs":len(catalog),"enabledListings":enabled,
 "reviewNeededListings":blocked+len(errors),"capturedPriceMismatches":len(mismatches),
 "collisions":len(collisions),"examples":mismatches[:4]}))
