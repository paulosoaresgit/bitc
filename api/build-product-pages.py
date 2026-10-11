#!/usr/bin/env python3
"""Build offline product pages from the store's captured collection cards.
Creates no fake prices, variants, inventory or product specifications.
The only purchase-enabled product pages remain the two existing canonical captures.
"""
import html, json, pathlib, re, sys
from urllib.parse import urljoin, urlsplit, unquote
from bs4 import BeautifulSoup

ROOT=pathlib.Path(__file__).resolve().parents[1]
DOCS=[ROOT/"index.html",*sorted((ROOT/"collections").glob("*/index.html"))]
CANONICAL=json.loads((ROOT/"api/catalog.json").read_text(encoding="utf-8"))
HOSTS={"bitcmining.tech","www.bitcmining.tech"}
CARD={}
ALL_LINKS=set()
EXCLUDED={"navidium-shipping-protection"}
def clean(s):
 return re.sub(r"\s+"," ",s or "").strip()
def slug_url(href):
 try:
  u=urlsplit(urljoin("https://bitcmining.tech/",html.unescape(href)))
  if u.hostname not in HOSTS:return None
  p=unquote(u.path).rstrip("/")
  if not re.fullmatch(r"/products/[^/?#]+",p):return None
  if any(s in p for s in ("..","\\","\x00")):return None
  return p
 except (ValueError,UnicodeError):return None
def txtprice(s):
 m=re.search(r"\$\s*([0-9][0-9,]*\.[0-9]{2})",s or "")
 return int(m.group(1).replace(",","").replace(".","")) if m else None
def safe_image(s):
 # Only captured storefront product CDN images; no injected JS or unsafe URLs.
 s=(s or "").strip().replace("{width}","800").replace("{height}","800")
 if s.startswith("//"):s="https:"+s
 elif s.startswith("/"):s="https://bitcoinmerch.com"+s
 if not re.fullmatch(r"https://(?:bitcoinmerch\.com|cdn\.shopify\.com)/cdn/[^\s<>\"']+",s):
  return ""
 return s
def description(slug):
 return "Product information based on the existing storefront listing. Please confirm the exact configuration, availability and shipping details before ordering."
for file in DOCS:
 soup=BeautifulSoup(file.read_text(encoding="utf-8"),"html.parser")
 for a in soup.select("a[href]"):
  p=slug_url(a.get("href"))
  if p: ALL_LINKS.add(p)
 # Only read cards, avoiding promotional/navigation anchors.
 for container in soup.select(".product-item"):
  link=next((a for a in container.select("a[href]") if slug_url(a.get("href"))),None)
  if not link:continue
  p=slug_url(link.get("href"))
  if not p:continue
  title_tag=container.select_one(".product-item__title")
  title=clean(title_tag.get_text(" ",strip=True)) if title_tag else ""
  if not title:continue
  price_el=container.select_one(".price--highlight, .price--default, .price-list .price")
  price_text=clean(price_el.get_text(" ",strip=True)) if price_el else ""
  price=txtprice(price_text)
  im=container.select_one("img")
  src=safe_image((im.get("src") or im.get("data-src") or "") if im else "")
  variant=container.select_one('input[name="id"],select[name="id"]')
  vid=str(variant.get("value") or "") if variant else ""
  candidate={"path":p,"title":title,"priceText":price_text,"priceCents":price,
             "variantId":vid if re.fullmatch(r"\d{8,17}",vid) else None,
             "image":src,"source":str(file.relative_to(ROOT))}
  old=CARD.get(p)
  quality=lambda q:int(bool(q.get("title")))+int(bool(q.get("priceCents")))*4+int(bool(q.get("variantId")))*2+int(bool(q.get("image")))
  if old is None or quality(candidate)>quality(old):CARD[p]=candidate
def esc(s):return html.escape(str(s),quote=True)
def money(cents):return "$"+format(cents/100,",.2f")
def render(item):
 slug=item["path"].split("/")[-1]
 title=item.get("title") or slug.replace("-"," ").replace("®"," ").title()
 price=item.get("priceCents")
 display=("From "+money(price)) if price is not None else "Price under review"
 img=item.get("image") or ""
 hero=(f'<img src="{esc(img)}" alt="{esc(title)}" loading="eager" width="740" height="740">' if img else '<span class="placeholder">₿</span>')
 # IMPORTANT: the collection "From" amount does not establish which variant is selected.
 # These newly generated pages MUST NOT accept payment until individually audited.
 message="Exact variant price and availability have not been verified. Checkout for this item is temporarily unavailable."
 cattext=" • ".join(item.get("collections",[])) if item.get("collections") else "Bitcoin mining equipment & accessories"
 return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,follow"><title>{esc(title)} | BITC Mining</title>
<meta name="description" content="{esc(description(slug))}">
<link rel="canonical" href="https://bitcmining.tech{esc(item['path'])}/">
<link rel="stylesheet" href="/assets/bitc-product.css"></head><body>
<header class="top"><div class="nav"><a class="brand" href="/"><span class="coin">₿</span> BITC <b>MINING</b></a><nav><a href="/">Home</a><a href="/collections/all/">All products</a><a href="/checkout/">Cart / Checkout</a></nav></div></header>
<main class="shell"><div class="crumbs"><a href="/">Home</a> / <a href="/collections/all/">All products</a> / {esc(title)}</div>
<section class="detail"><div class="gallery">{hero}</div><div class="info"><p class="eyebrow">BITCOIN MINING • HARDWARE & MERCH</p><h1>{esc(title)}</h1>
<p class="category">{esc(cattext[:160])}</p><p class="price">{esc(display)}</p>
<p class="notice" role="status">{esc(message)}</p><p class="description">{esc(description(slug))}</p>
<form class="product-form" action="/cart/add" method="post">
<button type="button" class="buy" disabled aria-disabled="true">Not available to order yet</button></form>
<div class="facts"><div><b>Secure Bitcoin checkout</b><span>BTCPay invoices are available for verified products only.</span></div>
<div><b>Product details</b><span>Exact model, options and final USD amount will be verified before purchase.</span></div></div>
</div></section>
<section class="more"><h2>Continue shopping</h2><p>Explore the collection or return to the homepage while we complete verification of this listing.</p>
<a class="back" href="/collections/all/">Browse all products →</a></section>
</main><footer>© BITC Mining · <a href="/">Home</a> · <a href="/pages/contact-us/">Contact</a></footer>
</body></html>
"""
CSS="""*{box-sizing:border-box}body{margin:0;background:#f6f7f8;color:#17212c;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.45}a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}.top{background:#101820;color:white}.nav{max-width:1180px;padding:18px 22px;margin:auto;display:flex;justify-content:space-between;gap:20px;align-items:center}.brand{font-size:22px;font-weight:900;letter-spacing:-.7px}.brand b{color:#f7a317}.coin{color:#f7a317;font-size:27px}.nav nav{display:flex;gap:22px;font-size:13px;font-weight:600}.shell{max-width:1180px;margin:auto;padding:24px 22px 70px}.crumbs{font-size:12px;color:#7c8993;margin-bottom:28px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.detail{display:grid;grid-template-columns:minmax(0,1.03fr) minmax(0,.97fr);gap:58px;align-items:start}.gallery{border-radius:17px;display:flex;min-height:445px;overflow:hidden;align-items:center;justify-content:center;background:white;border:1px solid #e7eaed;box-shadow:0 4px 25px #10182008}.gallery img{display:block;width:100%;height:auto;max-height:590px;object-fit:contain}.placeholder{font-size:125px;color:#f7931a}.info{padding:18px 0}.eyebrow{font-size:11px;color:#cc7e00;font-weight:800;letter-spacing:1.5px}.info h1{font-size:clamp(27px,3vw,40px);line-height:1.15;letter-spacing:-1px;margin:12px 0 9px}.category{font-size:13px;color:#78838d}.price{font-size:31px;font-weight:800;margin:25px 0 20px}.notice{padding:16px 18px;border:1px solid #ecd8ab;border-radius:12px;background:#fff9e9;color:#654b17;font-size:14px}.description{color:#64717c;font-size:14px}.buy{border:0;border-radius:10px;background:#aeb7c0;color:white;width:100%;font-weight:800;font-size:15px;padding:17px;margin:10px 0;cursor:not-allowed}.facts{margin-top:20px;border-top:1px solid #dfe4e7}.facts>div{padding:16px 0;border-bottom:1px solid #e1e5e8;display:flex;flex-direction:column;gap:5px;font-size:13px}.facts span{color:#687885}.more{margin-top:74px;padding:25px 28px;background:white;border:1px solid #e7eaed;border-radius:16px}.more h2{font-size:23px;margin:4px 0}.more p{color:#64717c;font-size:14px}.back{display:inline-block;background:#111c27;color:white;border-radius:9px;padding:12px 19px;font-weight:700;font-size:13px;margin-top:9px}footer{text-align:center;background:#101820;color:#a2aab0;padding:25px;font-size:12px}@media(max-width:720px){.nav{padding:15px 17px}.brand{font-size:19px}.nav nav{gap:11px;font-size:10px}.nav nav a:nth-child(3){display:none}.shell{padding:15px 15px 45px}.crumbs{margin-bottom:14px}.detail{grid-template-columns:1fr;gap:8px}.gallery{min-height:280px}.info{padding:6px 0}.info h1{font-size:29px}.price{font-size:26px}.more{margin-top:35px;padding:20px}.more h2{font-size:19px}}
"""
by={}
created=0
for pathname in sorted(ALL_LINKS):
 slug=pathname.split("/")[-1]
 file=ROOT/"products"/slug/"index.html"
 item=CARD.get(pathname) or {"path":pathname,"title":slug.replace("-"," ").title(),"source":"navigation-only","priceCents":None,"priceText":""}
 item={**item,"localPageExists":file.is_file(),"listingPriceIsFrom":'from' in item.get('priceText','').lower(),
       "checkoutApproved":file.is_file() and bool(item.get("priceCents"))}
 by[pathname]=item
 if not file.is_file():
  if not re.fullmatch(r"[\w\-\. ®\(\)]+",slug,re.UNICODE):
   print("REVIEW_INVALID_PATH",repr(slug),file=sys.stderr);continue
  file.parent.mkdir(parents=True,exist_ok=True)
  file.write_text(render(item),encoding="utf-8")
  created+=1
CSS_PATH=ROOT/"assets/bitc-product.css"
CSS_PATH.write_text(CSS,encoding="utf-8")
output=ROOT/"api/product-page-report.json"
output.write_text(json.dumps({"note":"Draft generated pages are intentionally NOT purchase enabled without exact variant verification.","totalRoutes":len(ALL_LINKS),"generatedPages":created,"existingCanonicalPages":sum(x["localPageExists"] for x in by.values()),
 "products":by},indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
print("PRODUCT_PAGE_BUILD="+json.dumps({"totalRoutes":len(ALL_LINKS),"newPages":created,
"existing":sum(x["localPageExists"] for x in by.values()),"draftWithoutPrice":sum(not x.get("priceCents") for x in by.values()),
"draftWithListingPrice":sum(bool(x.get("priceCents")) and not x.get("localPageExists") for x in by.values()),
"invalidPaths":len(ALL_LINKS)-created-sum(x["localPageExists"] for x in by.values())}))
