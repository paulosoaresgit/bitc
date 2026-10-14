(()=>{'use strict';
const STORAGE='bitc_marketing_consent_v1';
const API='/api/tracking-config';
let vendors=[],ready=false,selected=false;
const cleanId=id=>String(id||'');
function allowed(){return localStorage.getItem(STORAGE)==='granted'}
function save(choice){localStorage.setItem(STORAGE,choice);document.getElementById('bitc-consent-banner')?.remove();if(choice==='granted')activate();else if(selected)location.reload()}
function css(){
 if(document.getElementById('bitc-consent-style'))return;
 const style=document.createElement('style');style.id='bitc-consent-style';
 style.textContent='#bitc-consent-banner{position:fixed;bottom:14px;left:14px;right:14px;max-width:600px;padding:17px;background:#142331;color:white;border:1px solid #d8a448;border-radius:13px;box-shadow:0 12px 35px #0007;z-index:2147483640;font:14px/1.5 system-ui,sans-serif}#bitc-consent-banner p{margin:0 0 12px;color:#f2f2f2}#bitc-consent-banner strong{display:block;margin-bottom:4px;font-size:16px}#bitc-consent-banner button{cursor:pointer;border:0;border-radius:7px;padding:10px 15px;font-weight:700;margin-right:8px;background:#fda72b;color:#202326}#bitc-consent-banner button.reject{background:#263b4f;color:#fff;border:1px solid #627080}#bitc-privacy-toggle{position:fixed;bottom:4px;right:6px;font:11px system-ui,sans-serif;z-index:2147483600;background:#243746;color:#fff;border:1px solid #526574;padding:5px 8px;border-radius:6px;opacity:.75;cursor:pointer}';
 document.head.appendChild(style)
}
function banner(){
 if(document.getElementById('bitc-consent-banner'))return;
 css();const el=document.createElement('div');el.id='bitc-consent-banner';el.setAttribute('role','dialog');el.setAttribute('aria-label','Marketing cookies');
 const heading=document.createElement('strong');heading.textContent='Marketing & analytics preferences';
 const p=document.createElement('p');p.textContent='With your permission, we use Meta and Google tags to measure visits and improve our ads. You can decline and continue shopping normally.';
 const yes=document.createElement('button');yes.textContent='Accept';yes.type='button';yes.onclick=()=>save('granted');
 const no=document.createElement('button');no.textContent='Decline';no.type='button';no.className='reject';no.onclick=()=>save('denied');
 el.append(heading,p,yes,no);document.body.appendChild(el);
}
function toggle(){
 if(document.getElementById('bitc-privacy-toggle'))return;
 const btn=document.createElement('button');btn.id='bitc-privacy-toggle';btn.textContent='Cookie choices';btn.type='button';
 btn.onclick=()=>{if(ready)banner()};document.body.appendChild(btn);
}
function pageEvents(){
 event('PageView',{});
 if(/^\/products\/[^/]+/.test(location.pathname)){
   const id=document.querySelector('select[name="id"]')?.value||location.pathname.split('/').filter(Boolean).pop();
   event('ViewContent',{id});
 }
 if(/^\/checkout\//.test(location.pathname)){
   let items=[];try{items=JSON.parse(localStorage.getItem('bm_cart_v1')||'[]')}catch{}
   if(Array.isArray(items)&&items.length)event('InitiateCheckout',{items:items.map(x=>({id:String(x.id),qty:Number(x.qty)||1}))});
 }
}
function initMeta(ids){
 if(!ids.length)return;
 if(!window.fbq){
  const fbq=function(){fbq.callMethod?fbq.callMethod.apply(fbq,arguments):fbq.queue.push(arguments)};
  fbq.queue=[];fbq.loaded=true;fbq.version='2.0';window.fbq=fbq;
  const script=document.createElement('script');script.async=true;script.src='https://connect.facebook.net/en_US/fbevents.js';document.head.appendChild(script);
 }
 for(const id of ids)window.fbq('init',id);
}
function initGoogle(ids){
 if(!ids.length)return;
 if(!window.gtag){window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments)};window.gtag('js',new Date())}
 const script=document.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(ids[0]);document.head.appendChild(script);
 for(const id of ids)window.gtag('config',id,{send_page_view:false});
}
async function activate(){
 if(selected||!allowed())return;
 try{
 const res=await fetch(API,{cache:'no-store',credentials:'same-origin'});if(!res.ok)return;
 const data=await res.json();vendors=Array.isArray(data.pixels)?data.pixels:[];
 const meta=[...new Set(vendors.filter(v=>v.type==='meta'&&/^\d{9,20}$/.test(cleanId(v.id))).map(v=>v.id))];
 const google=[...new Set(vendors.filter(v=>v.type==='ga4'&&/^G-[A-Z0-9]{6,20}$/.test(cleanId(v.id))||v.type==='google_ads'&&/^AW-\d{8,15}$/.test(cleanId(v.id))).map(v=>v.id))];
 selected=true;initMeta(meta);initGoogle(google);pageEvents();
 }catch(e){console.warn('BITC tracking unavailable')}
}
function event(name,payload={}){
 if(!selected||!allowed()||!vendors.length)return;
 // Only funnel events are client-side; Purchase requires a verified BTCPay settlement.
 if(!['PageView','ViewContent','AddToCart','InitiateCheckout'].includes(name))return;
 const metaNames={PageView:'PageView',ViewContent:'ViewContent',AddToCart:'AddToCart',InitiateCheckout:'InitiateCheckout'};
 if(vendors.some(v=>v.type==='meta')&&typeof window.fbq==='function'){
  const p={};if(payload.id)p.content_ids=[String(payload.id)];if(Number.isSafeInteger(payload.qty))p.num_items=payload.qty;
  window.fbq('track',metaNames[name],p);
 }
 const ga={PageView:'page_view',ViewContent:'view_item',AddToCart:'add_to_cart',InitiateCheckout:'begin_checkout'}[name];
 if(vendors.some(v=>v.type==='ga4')&&typeof window.gtag==='function'){
  const p={page_location:location.href,page_title:document.title};if(payload.id)p.items=[{item_id:String(payload.id),quantity:Number(payload.qty)||1}];
  if(Array.isArray(payload.items))p.items=payload.items.map(x=>({item_id:x.id,quantity:x.qty}));
  window.gtag('event',ga,p);
 }
}
window.BITCTracking={event,consent:()=>localStorage.getItem(STORAGE)||'unset'};
document.addEventListener('DOMContentLoaded',async()=>{
 try{
  const response=await fetch(API,{cache:'no-store',credentials:'same-origin'});
  if(!response.ok)return;
  const cfg=await response.json();
  if(!Array.isArray(cfg.pixels)||!cfg.pixels.length)return;
  ready=true;css();toggle();
  if(allowed())await activate();
  else if(localStorage.getItem(STORAGE)!=='denied')banner();
 }catch{}
});
})();
