#!/usr/bin/env python3
"""Audit collections' product cards before generating any pages or assigning checkout prices."""
import json, re, html as h, pathlib
from bs4 import BeautifulSoup

root=pathlib.Path(__file__).resolve().parents[1]
docs=[root/"index.html",*sorted((root/"collections").glob("*/index.html"))]
rows={}
samples=[]
def clean(s):return re.sub(r'\s+',' ',s or '').strip()
for path in docs:
 soup=BeautifulSoup(path.read_text(encoding="utf-8"),"html.parser")
 links=soup.select('a[href*="/products/"]')
 for a in links:
  href=a.get('href','').split('?')[0].split('#')[0]
  if not re.fullmatch(r'/products/[^/]+/?',href):continue
  href=href.rstrip('/')
  card=a
  for ancestor in [a,*list(a.parents)[:9]]:
   classes=ancestor.get('class',[]) if hasattr(ancestor,'get') else []
   if any('product-item' in c for c in classes) and not any('grid' in c for c in classes):
    card=ancestor
    break
  raw=clean(card.get_text(" ",strip=True))
  titleNode=card.select_one('.product-item__title, .product-item__info a, [class*="product-item__title"]')
  title=clean(titleNode.get_text(" ",strip=True)) if titleNode else clean(a.get_text(" ",strip=True))
  sale=card.select_one('.price--highlight, .price--default, .price-list .price, [class*="product-item__price"]')
  price=clean(sale.get_text(" ",strip=True)) if sale else ''
  img=card.select_one('img')
  variant=card.select_one('input[name="id"], select[name="id"]')
  vid=variant.get("value") if variant else None
  entry={"href":href,"title":title,"priceText":price,"variantId":vid,"image":(img.get("src") or img.get("data-src") or "")[:250] if img else "","rawText":raw[:170],"source":str(path.relative_to(root))}
  if href not in rows or (len(title)>len(rows[href]['title']) and price):rows[href]=entry
  if len(samples)<8 and price and title:samples.append(entry)
stats={"totalProducts":len(rows),"hasTitle":sum(bool(x['title']) for x in rows.values()),"hasPrice":sum(bool(re.search(r'\$\s*\d',x['priceText'])) for x in rows.values()),"hasVariantId":sum(bool(re.fullmatch(r'\d{8,17}',str(x['variantId']))) for x in rows.values()),"hasImage":sum(bool(x['image']) for x in rows.values())}
print("PRODUCT_CARD_STATS="+json.dumps(stats,ensure_ascii=False))
print("PRODUCT_CARD_EXAMPLES="+json.dumps(samples[:5],ensure_ascii=False))
print("PRODUCT_CARD_GAPS="+json.dumps([x for x in rows.values() if not x['priceText'] or not x['variantId']][:12],ensure_ascii=False))
