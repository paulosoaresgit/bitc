// Public, read-only BITC production preflight: DNS, HTTPS, host routing and BTCPay.
// Does not access credentials, create invoices or modify any infrastructure.
import { promises as dns } from 'node:dns';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const hosts=['bitcmining.tech','www.bitcmining.tech','pay.bitcmining.tech'];
const expectedVPS='2.25.192.109';
const report={checkedAt:new Date().toISOString(),expectedVPS,dns:{},public:{},catalog:{},policies:{}};
for(const name of hosts){
  try{report.dns[name]={ipv4:await dns.resolve4(name)}}catch(e){report.dns[name]={error:e.code||String(e)}}
  try{report.dns[name].ipv6=await dns.resolve6(name)}catch(e){report.dns[name].ipv6=[]}
}
const urls=['https://bitcmining.tech/','https://bitcmining.tech/checkout/','https://bitcmining.tech/api/health','https://pay.bitcmining.tech/login'];
for(const u of urls){
  try{
    const res=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(11000),headers:{'User-Agent':'BITC-ReadOnlyPrelaunch-Audit'}});
    const body=(await res.text()).slice(0,6000);
    let json;
    try{json=JSON.parse(body)}catch{}
    report.public[new URL(u).pathname+' @ '+new URL(u).hostname]={
      http:res.status,contentType:res.headers.get('content-type')||'',
      parked:/parked domain|domain is parked|hostinger.*parking|site is parked/i.test(body),
      storefront:/BITC MINING|BITC Mining|bm_cart_v1|bitcoin merch/i.test(body),
      apiHealth:json&&typeof json==='object'&&json.ok===true?{
        ok:json.ok,salesEnabled:json.salesEnabled,btcpayConfigured:json.btcpayConfigured,orderEncryptionConfigured:json.orderEncryptionConfigured
      }:null
    };
  }catch(e){report.public[new URL(u).pathname+' @ '+new URL(u).hostname]={error:e.message}}
}
const catalog=JSON.parse(readFileSync('api/catalog.json','utf8'));
const productStatus=JSON.parse(readFileSync('api/live-product-audit.json','utf8'));
report.catalog={skus:Object.keys(catalog).length,sourcePages:productStatus.requested,reviewPending:productStatus.reviewNeededListings};
const checkout=readFileSync('checkout/index.html','utf8');
report.policies={
  footerPolicyLinksStillPlaceholders:/<a\s+href=["']#["']>\s*(Refund policy|Privacy policy|Terms of service|Cancellations)/i.test(checkout),
  privacyPolicyExists:existsSync('pages/privacy-policy/index.html'),
  refundsExists:existsSync('pages/refund-policy/index.html'),
  termsExists:existsSync('pages/terms-of-service/index.html')
};
report.flags={
  rootPointsToVPS:(report.dns['bitcmining.tech'].ipv4||[]).includes(expectedVPS),
  btcpayPointsToVPS:(report.dns['pay.bitcmining.tech'].ipv4||[]).includes(expectedVPS),
  policyPageComplete:!report.policies.footerPolicyLinksStillPlaceholders&&report.policies.privacyPolicyExists&&report.policies.refundsExists&&report.policies.termsExists
};
console.log('BITC_PRODUCTION_PREFLIGHT='+JSON.stringify(report));
