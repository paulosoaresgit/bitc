#!/usr/bin/env python3
"""Remove only identified previous merchant's hardcoded analytics tags from staged HTML.

Do not modify source pages, Shopify product data, or any of the new dynamic pixel
manager configuration. Operate only on the temporary public deployment stage.
"""
import pathlib,re,sys
ROOT=pathlib.Path(sys.argv[1])
OLD_GTM="GTM-W22X2BFR"
OLD_ADS="AW-807906555"
SCRIPTS=re.compile(r"<script\b[^>]*>[\s\S]*?</script\s*>",re.I)
NOSCRIPT=re.compile(r"<noscript\b[^>]*>[\s\S]*?</noscript\s*>",re.I)
total=0
files=0
for file in ROOT.rglob("*.html"):
 if "admin" in file.relative_to(ROOT).parts:continue
 old=file.read_text(encoding="utf-8")
 def filter_script(m):
  global total
  tag=m.group(0)
  if (OLD_GTM in tag and "googletagmanager.com/gtm.js" in tag) or (
      OLD_ADS in tag and ("gtag(" in tag or "googletagmanager.com/gtag/js" in tag)):
   total+=1
   return ""
  return tag
 updated=SCRIPTS.sub(filter_script,old)
 def filter_noscript(m):
  global total
  tag=m.group(0)
  if OLD_GTM in tag and "googletagmanager.com/ns.html" in tag:
   total+=1
   return ""
  return tag
 updated=NOSCRIPT.sub(filter_noscript,updated)
 if updated!=old:
  files+=1
  file.write_text(updated,encoding="utf-8")
print("REMOVED_LEGACY_MERCHANT_TRACKING="+str(total)+";FILES="+str(files))
