/* First-party product purchase controls. Shopify wallet buttons are deliberately hidden.
 * Exact price and SKU come from our verified static variant map, NOT captured legacy HTML.
 */
(()=>{'use strict';
if(!location.pathname.startsWith('/products/'))return;
const path=decodeURIComponent(location.pathname).replace(/\/$/,'');
const STYLE='bitc-purchase-style';
let entry=null;
const normalize=x=>String(x||'').trim().replace(/\s+/g,' ').toLowerCase();
function addStyle(){
 if(document.getElementById(STYLE))return;
 const css=document.createElement('style');css.id=STYLE;
 css.textContent=`
 .shopify-payment-button,shopify-accelerated-checkout,[data-shopify="payment-button"],
 [data-pf-type="ProductDynamicCheckout"],.shopify-payment-button__more-options,
 .additional-checkout-buttons,.dynamic-checkout__content,.payment-list,
 iframe[title*="PayPal"],iframe[title*="Shop Pay"] {display:none!important}
 .bitc-purchase-layout{
    display:grid!important;
    grid-template-columns:minmax(105px,125px) minmax(0,1fr)!important;
    grid-auto-flow:row!important;
    column-gap:12px!important;
    row-gap:10px!important;
    align-items:center!important;
    justify-content:stretch!important;
    width:100%!important;
    max-width:100%!important;
    box-sizing:border-box!important;
    min-height:0!important;
    margin:14px 0 0!important;
    padding:0!important;
    overflow:visible!important;
 }
 .bitc-purchase-layout > [data-pf-type="ProductQuantity"],
 .bitc-purchase-layout > .bitc-native-qty {
    grid-column:1!important;
    grid-row:1!important;
    min-width:0!important;
    max-width:125px!important;
    width:100%!important;
    margin:0!important;
    align-self:center!important;
 }
 .bitc-purchase-layout > .bitc-native-add{
    grid-column:2!important;
    grid-row:1!important;
    min-height:54px!important;
    width:100%!important;
    min-width:0!important;
    margin:0!important;
    padding:12px 16px!important;
    box-sizing:border-box!important;
    font:700 16px/1.2 system-ui,-apple-system,sans-serif!important;
    white-space:normal!important;
    overflow-wrap:normal!important;
    word-break:normal!important;
    text-align:center!important;
    border-radius:12px!important;
    cursor:pointer!important;
 }
 .bitc-purchase-layout > .bitc-buy-now{
    grid-column:1/-1!important;
    grid-row:2!important;
    display:flex!important;
    justify-content:center!important;
    align-items:center!important;
    width:100%!important;
    max-width:100%!important;
    min-width:0!important;
    min-height:56px!important;
    padding:15px!important;
    margin:0!important;
    box-sizing:border-box!important;
    color:#171923!important;
    background:#f5a623!important;
    border:0!important;
    border-radius:12px!important;
    font:800 17px/1.25 system-ui,-apple-system,sans-serif!important;
    white-space:normal!important;
    text-align:center!important;
    box-shadow:0 5px 14px rgba(222,137,18,.14);
    cursor:pointer!important;
 }
 .bitc-purchase-layout > .bitc-buy-now:hover{background:#ffb745!important}
 .bitc-purchase-layout > .bitc-buy-now:disabled{opacity:.55;cursor:not-allowed!important}
 .bitc-purchase-layout > .bitc-option-price{
    grid-column:1/-1!important;
    grid-row:3!important;
    display:block!important;
    min-width:0!important;
    width:100%!important;
    box-sizing:border-box!important;
    font:500 12px/1.45 system-ui,-apple-system,sans-serif!important;
    color:#485569!important;
    margin:0!important;
    padding:0 2px!important;
    white-space:normal!important;
    overflow-wrap:break-word!important;
    text-align:left!important;
 }
 .bitc-purchase-layout > .bitc-purchase-note{
    display:none!important;
 }
 @media(max-width:420px){
   .bitc-purchase-layout{grid-template-columns:minmax(100px,118px) minmax(0,1fr)!important;gap:10px!important}
   .bitc-purchase-layout > .bitc-native-add{font-size:15px!important;padding:10px 12px!important}
   .bitc-purchase-layout > .bitc-buy-now{font-size:16px!important}
 }
 `;
 document.head.append(css);
}
function stripOldWallets(){
 // Remove only accelerated payment areas from the captured merchant product HTML.
 // Never remove the first-party Add To Cart button, quantity selector or product options.
 document.querySelectorAll('[data-shopify="payment-button"],.shopify-payment-button,[data-pf-type="ProductDynamicCheckout"]')
  .forEach(el=>el.remove());
}
function relevantForms(){
 if(!entry)return [];
 return [...document.querySelectorAll('form[action*="/cart/add"]')].filter(form=>{
  const id=form.dataset.productid||form.getAttribute('data-product-id');
  if(id)return id===String(entry.productId);
  // Generated static pages have only one main .product-form with a price-pinned select.
  return form.classList.contains('product-form') && !!form.querySelector('select[name="id"] option[data-cents]');
 });
}
function controls(form){
 const selectors=[...form.querySelectorAll('select.pf-variant-select,select[name^="options["],variant-selects select')];
 if(selectors.length)return selectors.map(el=>el.value.trim());
 const checked=[...form.querySelectorAll('input[type="radio"][name^="options["]:checked, input.product-form__single-selector:checked')];
 if(checked.length)return checked.map(el=>el.value.trim());
 return [];
}
function picked(form){
 if(!entry)return null;
 const variants=entry.variants.filter(v=>v.available);
 const userSelected=controls(form);
 if(userSelected.length){
  const wanted=userSelected.map(normalize);
  const matched=variants.filter(v=>{
   const parts=v.title.split(' / ').map(normalize);
   return parts.length===wanted.length&&parts.every((part,i)=>part===wanted[i]);
  });
  // When the visitor selected an unavailable combination, NEVER substitute another variant.
  return matched.length===1?matched[0]:null;
 }
 const select=form.querySelector('select[name="id"]');
 const input=form.querySelector('input[name="id"]');
 const id=String(select?.value||input?.value||'');
 const found=variants.find(v=>v.id===id);
 return found || (variants.length===1?variants[0]:null);
}
function quantity(form){
 const field=form.querySelector('input[name="quantity"],input.quantity__input,[data-quantity-input]');
 const n=Number(field?.value||1);
 return Number.isSafeInteger(n)&&n>=1&&n<=10?n:null;
}
function note(form){
 const el=form.querySelector('.bitc-option-price');if(!el)return;
 const v=picked(form);
 el.textContent=v?'Selected: '+v.title+' — '+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v.cents/100):
 'Select an available option to continue.';
 const buy=form.querySelector('.bitc-buy-now');
 if(buy)buy.disabled=!v;
}
function add(form,direct){
 if(!entry||!entry.checkoutEnabledForReview){alert('This product is not available for checkout.');return false}
 const v=picked(form);
 if(!v){alert('Please select an available product option.');return false}
 const qty=quantity(form);
 if(qty===null){alert('Choose a quantity between 1 and 10.');return false}
 if(!window.BMCart?.add){alert('The cart is loading. Please refresh and try again.');return false}
 const saved=window.BMCart.add({
  variantId:v.id,qty,price:v.cents/100,title:entry.title,variant:v.title,
  image:entry.image||'',url:location.pathname
 },{open:!direct});
 if(saved===false)return false;
 if(direct)location.assign('/checkout/');
 return true;
}
function install(){
 if(!entry)return;
 addStyle();
 stripOldWallets();
 for(const form of relevantForms()){
  if(form.dataset.bitcPurchaseReady==='1')continue;
  form.dataset.bitcPurchaseReady='1';
  const target=form.querySelector('[data-pf-type="ProductATC"],.product-form__add-button,button[name="add"],button[type="submit"]');
  if(!target)continue;
  const parent=target.closest('[data-pf-type="ProductATC"]')||target;
  const button=document.createElement('button');
  button.type='button';button.className='bitc-buy-now';button.dataset.bitcBuyNow='1';button.textContent='Buy Now — Bitcoin';
  parent.insertAdjacentElement('afterend',button);
  // PageFly renders quantity and cart in a single non-wrapping flex line.
  // Give that line its own two-column grid to prevent narrow side-by-side buttons.
  const group=parent.parentElement;
  if(group && group.matches('[data-pf-type="FlexBlock"]')){
    group.classList.add('bitc-purchase-layout');
    parent.classList.add('bitc-native-add');
    const legacyQty=group.querySelector(':scope > [data-pf-type="ProductQuantity"]');
    if(legacyQty)legacyQty.classList.add('bitc-native-qty');
  }
  const price=document.createElement('div');price.className='bitc-option-price';
  button.insertAdjacentElement('afterend',price);
  const tip=document.createElement('p');tip.className='bitc-purchase-note';
  tip.textContent='Your order will open in our secure checkout. No payment is charged until you confirm it.';
  price.insertAdjacentElement('afterend',tip);
  form.addEventListener('change',()=>note(form),true);
  form.addEventListener('input',()=>note(form),true);
  note(form);
 }
}
function mainForm(node){
 const form=node?.closest?.('form[action*="/cart/add"]');
 return form&&relevantForms().includes(form)?form:null;
}
document.addEventListener('click',e=>{
 if(!entry||!e.target?.closest)return;
 const direct=e.target.closest('[data-bitc-buy-now]');
 if(direct){
  const form=mainForm(direct);
  if(!form)return;
  e.preventDefault();e.stopImmediatePropagation();add(form,true);return;
 }
 const btn=e.target.closest('button[name="add"],button[data-action="add-to-cart"],.product-form__add-button,[data-pf-type="ProductATC"] button,.product-form__submit,button[type="submit"]');
 const form=mainForm(btn);
 if(!form||!btn||btn.disabled)return;
 e.preventDefault();e.stopImmediatePropagation();add(form,false);
},true);
document.addEventListener('submit',e=>{
 if(!entry)return;
 const form=mainForm(e.target);
 if(!form)return;
 e.preventDefault();e.stopImmediatePropagation();add(form,false);
},true);
async function init(){
 addStyle();
 try{
  const r=await fetch('/assets/bitc-variant-map.json',{cache:'no-store'});
  if(!r.ok)throw Error('Unable to load product catalog');
  const map=await r.json();entry=map[path]||null;
  if(!entry)throw Error('Product not found in verified catalog');
  install();
  // Re-run after captured Shopify scripts render or replace product controls.
  const holder=document.querySelector('main')||document.body;
  const obs=new MutationObserver(()=>{stripOldWallets();if(document.querySelector('form[action*="/cart/add"]:not([data-bitc-purchase-ready="1"])'))install()});
  obs.observe(holder,{childList:true,subtree:true});
 }catch(e){console.warn('BITC product checkout unavailable:',e.message)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
