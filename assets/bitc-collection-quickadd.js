/* BITC Mining: first-party fast add for copied Shopify/PageFly product cards.
 * The old storefront tries to POST /cart/add and leaves ADDING... on screen.
 * Prices and default variants MUST come from the verified published catalog.
 */
(()=>{'use strict';
if(!(location.pathname==='/'||location.pathname.startsWith('/collections/')))return;
const MAP='/assets/bitc-variant-map.json';
let entries=null,loading=null,remoteLoaded=false;
const norm=p=>decodeURIComponent(String(p||'')).replace(/\/$/,'');
// The deployment embeds just the verified products visible on this collection.
// This eliminates the network wait on the first add-to-cart click.
function inlineCatalog(){
 const tag=document.getElementById('bitc-quickadd-data');
 if(!tag)return null;
 try{
  const data=JSON.parse(tag.textContent||'{}');
  const ready=new Map();
  for(const [id,p] of Object.entries(data)){
   if(p&&String(p.productId)===id&&p.route?.startsWith('/products/'))ready.set(id,p);
  }
  return ready.size?ready:null;
 }catch(err){console.warn('BITC quick add preload invalid',err);return null}
}
entries=inlineCatalog();
function catalog(forceRemote=false){
 if(entries&&(!forceRemote||remoteLoaded))return Promise.resolve(entries);
 if(loading)return loading;
 loading=fetch(MAP,{cache:'default',credentials:'same-origin'})
  .then(r=>{if(!r.ok)throw Error('catalog_unavailable');return r.json()})
  .then(map=>{
    const byProduct=new Map();
    for(const [route,p] of Object.entries(map)){
      if(!p||!p.productId||!route.startsWith('/products/'))continue;
      byProduct.set(String(p.productId),{...p,route});
    }
    entries=byProduct;
    remoteLoaded=true;
    return byProduct;
  }).finally(()=>{loading=null});
 return loading;
}
catalog().catch(()=>{});
function productButton(node){
 const button=node?.closest?.('form.pf-product-form button[name="add"][data-product-id],form.pf-product-form button[data-pf-type="ProductATC2"]');
 if(!button)return null;
 const form=button.closest('form.pf-product-form[action*="/cart/add"]');
 if(!form||form.closest('[data-bitc-purchase-ready="1"]'))return null;
 const box=form.closest('[data-pf-type="ProductBox"]');
 if(!box)return null; // avoid changing unrelated collection links or forms
 return {button,form,box};
}
function setLabel(btn,label){
 btn.textContent=label;
 btn.setAttribute('aria-label',label);
}
const priceSeen=box=>{
 const el=box.querySelector('[data-product-price="true"],[data-pf-type="ProductPrice2Item"]');
 const m=el?.textContent?.replace(/,/g,'').match(/\$\s*(\d+(?:\.\d{1,2})?)/);
 return m?Math.round(Number(m[1])*100):null;
};
function chosenVariant(form,box,p){
 const eligible=p.variants.filter(v=>v.available&&Number.isSafeInteger(v.cents)&&v.cents>0);
 if(!eligible.length)return null;
 const picked=String(form.querySelector('[name="id"]')?.value||box.getAttribute('data-variant-id')||'');
 if(picked){
   const exact=eligible.find(v=>String(v.id)===picked);
   if(!exact)return null; // never substitute for unavailable selected option
   return exact;
 }
 const shown=priceSeen(box);
 if(shown!==null){
  const matches=eligible.filter(v=>v.cents===shown);
  if(!matches.length)return null; // avoid surprising the buyer with different price
  return matches[0]; // captured cards display the default variant's price
 }
 return eligible.length===1?eligible[0]:null;
}
function safeImage(box,p){
 const img=box.querySelector('img');
 // Only catalog image or original card's own image; never use arbitrary HTML in cart.
 return String(img?.currentSrc||img?.src||p.image||'');
}
async function addToCart({button,form,box}){
 if(button.dataset.bitcPending==='1')return;
 button.dataset.bitcPending='1';
 setLabel(button,'Adding…');
 try{
  let map=await catalog();
  const productId=String(form.dataset.productid||button.dataset.productId||box.dataset.productId||'');
  let p=map.get(productId);
  // Cards inserted after initial HTML may be absent from the embedded subset.
  if(!p&&!remoteLoaded){map=await catalog(true);p=map.get(productId)}
  if(!p||!p.checkoutEnabledForReview)throw Error('unavailable');
  const v=chosenVariant(form,box,p);
  if(!v)throw Error('select_options');
  if(!window.BMCart?.add)throw Error('cart_not_ready');
  const success=window.BMCart.add({
   variantId:String(v.id),qty:1,price:v.cents/100,
   title:p.title,variant:v.title==='Default Title'?'':v.title,
   image:safeImage(box,p),url:p.route+'/'
  });
  if(success===false)throw Error('cart_not_ready');
  setLabel(button,'Added ✓');
  setTimeout(()=>{if(button.isConnected)setLabel(button,'Add To Cart')},850);
 }catch(e){
  if(e.message==='select_options'){
   const productId=String(form.dataset.productid||button.dataset.productId||box.dataset.productId||'');
   const route=entries?.get(productId)?.route;
   if(route){setLabel(button,'Choose options');location.assign(route+'/');return}
  }
  setLabel(button,'View Product');
  const link=box.querySelector('a[href*="/products/"]');
  // A safe fallback when the product isn't in the verified catalog or cart.
  const href=link?.getAttribute('href');
  if(href?.startsWith('/products/'))location.assign(href);
  else window.alert('Unable to add this product. Please open its product page.');
 }finally{
  delete button.dataset.bitcPending;
  if(!button.textContent.includes('Added')&&button.isConnected)setTimeout(()=>setLabel(button,'Add To Cart'),1200);
 }
}
function stopOldCart(e){
 const selected=productButton(e.target);
 if(!selected)return;
 // Capture on window beats any PageFly document click/submit listener.
 e.preventDefault();
 e.stopPropagation();
 e.stopImmediatePropagation();
 if(e.type==='click')void addToCart(selected);
}
window.addEventListener('click',stopOldCart,true);
window.addEventListener('submit',e=>{
 const btn=e.target?.querySelector?.('button[name="add"][data-product-id]');
 if(!btn)return;
 const selected=productButton(btn);
 if(!selected)return;
 e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
 void addToCart(selected);
},true);
function resetOldButtons(){
 for(const btn of document.querySelectorAll('form.pf-product-form button[name="add"][data-product-id]')){
  if(/^adding\.{0,3}$/i.test(btn.textContent.trim()))setLabel(btn,'Add To Cart');
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',resetOldButtons,{once:true});else resetOldButtons();
})();
