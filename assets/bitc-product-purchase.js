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
 .additional-checkout-buttons,.dynamic-checkout__content,
 iframe[title*="PayPal"],iframe[title*="Shop Pay"] {display:none!important}
 .bitc-buy-now{display:flex;align-items:center;justify-content:center;width:100%;max-width:100%;
  padding:16px 18px;min-height:58px;margin-top:12px;line-height:1.2;
  background:#f5a623;color:#161a20;border:0;border-radius:12px;
  font:800 17px/1.25 system-ui,-apple-system,sans-serif;cursor:pointer;
  box-shadow:0 6px 18px rgba(222,137,18,.15)}
 .bitc-buy-now:hover{background:#ffb745}
 .bitc-buy-now:disabled{opacity:.55;cursor:not-allowed}
 .bitc-option-price{font:600 13px/1.5 system-ui,-apple-system,sans-serif;
  color:#2d4155;margin:9px 0 0}
 .bitc-purchase-note{font:500 12px/1.4 system-ui,-apple-system,sans-serif;color:#4f5c6d;margin:7px 0 0}
 @media(max-width:767px){.bitc-buy-now{min-height:58px;font-size:17px;margin-top:10px}}
 `;
 document.head.append(css);
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
 for(const form of relevantForms()){
  if(form.dataset.bitcPurchaseReady==='1')continue;
  form.dataset.bitcPurchaseReady='1';
  const target=form.querySelector('[data-pf-type="ProductATC"],.product-form__add-button,button[name="add"],button[type="submit"]');
  if(!target)continue;
  const parent=target.closest('[data-pf-type="ProductATC"]')||target;
  const button=document.createElement('button');
  button.type='button';button.className='bitc-buy-now';button.dataset.bitcBuyNow='1';button.textContent='Buy Now — Bitcoin Checkout';
  parent.insertAdjacentElement('afterend',button);
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
  const obs=new MutationObserver(()=>{if(document.querySelector('form[action*="/cart/add"]:not([data-bitc-purchase-ready="1"])'))install()});
  obs.observe(holder,{childList:true,subtree:true});
 }catch(e){console.warn('BITC product checkout unavailable:',e.message)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
