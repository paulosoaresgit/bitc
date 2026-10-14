#!/usr/bin/env python3
"""Apply ONLY the five explicitly merchant-approved catalog price corrections.

Uses pinned public-feed data already in the repository; changes no deployments,
DNS, other products or live payments. Refuses unexpected source values.
"""
import html
import json
import pathlib
import re
import sys
from urllib.parse import urljoin, urlsplit, unquote

ROOT=pathlib.Path(__file__).resolve().parents[1]
approvals=json.loads((ROOT/"api/approved-price-fixes.json").read_text(encoding="utf-8"))
records=json.loads((ROOT/"api/product-page-report.json").read_text(encoding="utf-8"))
live=json.loads((ROOT/"api/live-products.json").read_text(encoding="utf-8"))
catalog=json.loads((ROOT/"api/catalog.json").read_text(encoding="utf-8"))
items=approvals["prices"]
assert len(items)==5 and len({r["path"] for r in items})==5
assert approvals.get("scope")=="price_update_only_no_publication"
def money(c):
 return "$"+format(c/100,",.2f")
def normalized_url(link):
 try:
  u=urlsplit(urljoin("https://bitcmining.tech/",html.unescape(link)))
  return unquote(u.path).rstrip("/") if u.hostname in ("bitcmining.tech","www.bitcmining.tech") else ""
 except (UnicodeError,ValueError):
  return ""
by_path={i["path"]:i for i in items}
source_counts={p:0 for p in by_path}
for i in items:
 path=i["path"]
 record=records["products"].get(path)
 product=live.get(path)
 if not record or not product:
  raise RuntimeError("Missing merchant listing or verified feed for "+path)
 variant=next((v for v in product["variants"] if v["id"]==i["variantId"]),None)
 available=[v for v in product["variants"] if v["available"]]
 if len(available)!=1 or variant is None or not variant["available"] or variant["cents"]!=i["newCents"]:
  raise RuntimeError("Approved variant is not the only available option or price changed: "+path)
 if min(x["cents"] for x in available)!=i["newCents"]:
  raise RuntimeError("Current feed minimum differs from approval: "+path)
 if record.get("priceCents") not in (i["oldCents"],i["newCents"]):
  raise RuntimeError("Captured price differs from approved old price: "+path)
 existing=catalog.get(i["variantId"])
 if existing and existing["cents"]!=i["newCents"]:
  raise RuntimeError("Server already has a conflicting price: "+path)
 if not record["source"].endswith(".html") or not (ROOT/record["source"]).is_file():
  raise RuntimeError("Missing original listing source: "+path)

CARD=re.compile(r'<div\b[^>]*\bclass\s*=\s*["\x27]product-item(?:\s|["\x27])',re.IGNORECASE)
LINK=re.compile(r'\bhref\s*=\s*["\x27]([^"\x27]+)["\x27]',re.IGNORECASE)
PRICE_LIST=re.compile(r'\bclass\s*=\s*["\x27][^"\x27]*price-list[^"\x27]*["\x27]',re.IGNORECASE)
files=[ROOT/"index.html",*sorted((ROOT/"collections").glob("*/index.html"))]
file_updates={}
for file in files:
 source=file.read_text(encoding="utf-8")
 starts=[m.start() for m in CARD.finditer(source)]
 if not starts:
  continue
 updated=source
 changes=[]
 for idx,start in enumerate(starts):
  end=starts[idx+1] if idx+1<len(starts) else len(source)
  card=source[start:end]
  paths={normalized_url(m.group(1)) for m in LINK.finditer(card)}
  matches=paths & by_path.keys()
  if not matches: continue
  if len(matches)>1:
   raise RuntimeError("Ambiguous product card contains multiple approved slugs: "+str(matches))
  p=next(iter(matches))
  item=by_path[p]
  price_list=PRICE_LIST.search(card)
  if price_list is None:
   raise RuntimeError("Missing original price element in card: "+p+" in "+str(file))
  window_start=price_list.end()
  window_end=min(window_start+700,len(card))
  window=card[window_start:window_end]
  before=money(item["oldCents"])
  after=money(item["newCents"])
  # Only replace the displayed price immediately after the identified price-list.
  if before in window:
   at=start+window_start+window.index(before)
   changes.append((at,at+len(before),after))
  elif after in window:
   pass
  else:
   raise RuntimeError("Missing expected old or new card price: "+p+" in "+str(file))
  source_counts[p]+=1
 for a,b,new in reversed(changes):
  updated=updated[:a]+new+updated[b:]
 if changes:
  file_updates[file]=updated
if any(v==0 for v in source_counts.values()):
 raise RuntimeError("Did not locate an approved product card for: "+str({k:v for k,v in source_counts.items() if v==0}))

# All checks are complete: stage the exact byte-range price replacements and snapshots.
for file,data in file_updates.items():
 file.write_text(data,encoding="utf-8")
for item in items:
 p=item["path"]
 old=money(item["oldCents"])
 new=money(item["newCents"])
 rec=records["products"][p]
 if rec["priceText"].count(old)!=1 and new not in rec["priceText"]:
  raise RuntimeError("Unexpected card price text in audit record: "+p)
 rec["priceText"]=rec["priceText"].replace(old,new)
 rec["priceCents"]=item["newCents"]
 # Do not change the immutable, public feed snapshots; they already contain the new price.
records["approvedPriceChanges"]=items
(ROOT/"api/product-page-report.json").write_text(json.dumps(records,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("APPROVED_PRICE_CHANGES="+json.dumps({"products":len(items),"filesModified":len(file_updates),
  "cardsVerified":source_counts,"changes":[{"path":r["path"],"beforeUSD":money(r["oldCents"]),
  "afterUSD":money(r["newCents"])} for r in items]},ensure_ascii=False))
