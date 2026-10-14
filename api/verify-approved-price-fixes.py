#!/usr/bin/env python3
"""Offline acceptance test: displayed USD totals, selected variant IDs and server prices agree."""
import html,json,pathlib,re
from urllib.parse import unquote,urlsplit,urljoin
from bs4 import BeautifulSoup
ROOT=pathlib.Path(__file__).resolve().parents[1]
approval=json.loads((ROOT/"api/approved-price-fixes.json").read_text())
catalog=json.loads((ROOT/"api/catalog.json").read_text())
report=json.loads((ROOT/"api/product-page-report.json").read_text())
live=json.loads((ROOT/"api/live-products.json").read_text())
audit=json.loads((ROOT/"api/live-product-audit.json").read_text())
assert len(approval["prices"])==5
assert audit["listingPriceMismatches"]==[],audit["listingPriceMismatches"]
def fmt(v):return "$"+format(v/100,",.2f")
def canonical(link):
 try:return unquote(urlsplit(urljoin("https://bitcmining.tech",html.unescape(link))).path).rstrip("/")
 except (ValueError,UnicodeError):return ""
for row in approval["prices"]:
 p=row["path"]
 variant=row["variantId"]
 assert catalog[variant]["cents"]==row["newCents"],"Server price: "+p
 assert report["products"][p]["priceCents"]==row["newCents"],"Audit price: "+p
 assert live[p]["checkoutEnabledForReview"],"Not enabled for review: "+p
 assert not live[p]["priceMismatchWithListing"],"Unexpected mismatch: "+p
 for v in live[p]["variants"]:
  if v["available"]:
   assert catalog[v["id"]]["cents"]==v["cents"],"SKU variant differs: "+p
 local=ROOT/p.lstrip("/")/"index.html"
 assert local.is_file(), "Missing product page: "+p
 product=BeautifulSoup(local.read_text(encoding="utf-8"),"html.parser")
 option=product.select_one('select[name="id"] option[value="'+variant+'"]')
 assert option and fmt(row["newCents"]) in option.get_text(" ",strip=True), "Wrong variant option: "+p
 assert product.select_one("button.buy.active[type=submit]"),"Checkout disabled unexpectedly: "+p
 matches=0
 for file in (ROOT/"index.html",*sorted((ROOT/"collections").glob("*/index.html"))):
  soup=BeautifulSoup(file.read_text(encoding="utf-8"),"html.parser")
  for card in soup.select(".product-item"):
   links={canonical(a.get("href","")) for a in card.select("a[href]")}
   if p not in links:continue
   price_node=card.select_one(".price--highlight, .price--default, .price-list .price")
   assert price_node,"Missing sale price element: "+p
   label=price_node.get_text(" ",strip=True)
   assert fmt(row["newCents"]) in label, "Card not updated: "+p+" "+label
   assert fmt(row["oldCents"]) not in label, "Old card price present: "+p
   matches+=1
 assert matches>0,"No card matching approved product: "+p
 print("PRICE_CHECK_OK="+json.dumps({"path":p,"variantId":variant,"amountUSD":fmt(row["newCents"]),"cards":matches},ensure_ascii=False))
for path,p in live.items():
 if p["checkoutEnabledForReview"]:continue
 page=ROOT/path.lstrip("/")/"index.html"
 if not page.exists():continue
 doc=BeautifulSoup(page.read_text(encoding="utf-8"),"html.parser")
 assert not doc.select_one("button.buy.active[type=submit]"),"Review-only product must not be purchasable: "+path
 for v in p["variants"]:
  if not v["available"]:
   assert v["id"] not in catalog,"Unavailable variant still in server catalog: "+path
print("APPROVED_PRICES_CHECK=OK")
