#!/usr/bin/env python3
"""Read-only check whether the existing product feed can verify all variants.
No login, keys or checkout actions; errors keep products unavailable.
"""
import json, urllib.request, urllib.error, urllib.parse
paths=[
"bitcoin-merch-bitaxe-601-gamma-power-supply-bitcoin-miner-1-5th-s",
"bitcoin-merch-x-node-mini-bitcoin-full-node",
"bitcoin-merch-nerdminer-v2-usb-lottery-miner-with-wifi",
"bitcoin-merch-ledger-nano-s-plus"]
for slug in paths:
 url="https://bitcoinmerch.com/products/"+urllib.parse.quote(slug,safe="-")+".js"
 try:
  req=urllib.request.Request(url,headers={"User-Agent":"BITC-Store-Price-Review/1.0","Accept":"application/json"})
  with urllib.request.urlopen(req,timeout=12) as resp:
   obj=json.load(resp)
   variants=obj.get("variants",[])
   print("LIVE_PRICE_AUDIT="+json.dumps({"slug":slug,"http":resp.status,"id":obj.get("id"),
    "title":obj.get("title","")[:100],"variants":len(variants),
    "samples":[{"id":v.get("id"),"title":v.get("title"),"priceCents":v.get("price"),"available":v.get("available")} for v in variants[:4]],
    "images":len(obj.get("images") or [])},ensure_ascii=False))
 except Exception as e:
  print("LIVE_PRICE_AUDIT="+json.dumps({"slug":slug,"error":str(e)[:150]}))
