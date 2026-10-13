(()=>{const KEY='bm_cart_v1';
const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const money=n=>usd.format(Number(n)||0);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};
let cart=load();
const save=()=>{localStorage.setItem(KEY,JSON.stringify(cart));render()};
function parsePrice(s){const a=[...String(s||'').replace(/,/g,'').matchAll(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/g)].map(m=>Number(m[1]));return a.find(n=>n>0)||0}
function txt(el){return String(el?.textContent||'').replace(/\s+/g,' ').trim()}
function findProduct(el){const root=el.closest('product-form,.product-form,.card,.product-card,.grid-product,.product,.product__info-container,.product-single,.product-block')||document;const title=txt(root.querySelector('h1,h2,h3,.card__heading,.product__title,.product-single__title,[class*="title"]'))||txt(document.querySelector('h1'))||document.title.split('|')[0].trim();const p=txt(root.querySelector('.price,.price-item,.money,[class*="price"]'))||txt(root);const img=root.querySelector('img');const variant=txt(root.querySelector('select option:checked,.product-form__input input:checked+label,[class*="variant"]'))||'';return{title,price:parsePrice(p),image:img?.currentSrc||img?.src||'',url:location.href,variant}}
function count(){return cart.reduce((s,x)=>s+(Number(x.qty)||1),0)}function productSubtotal(){return cart.reduce((s,x)=>s+(Number(x.price)||0)*(Number(x.qty)||1),0)}function total(){return productSubtotal()}
function add(p,options={}){const id=String(p.variantId||p.id||'');const qty=Number(p.qty||1);
if(!/^(\d{8,17}|reco-cards|reco-gold-nugget)$/.test(id)||!Number.isSafeInteger(qty)||qty<1||qty>10){window.alert('Select a valid product option before adding to the cart.');return false}
const ex=cart.find(x=>x.id===id);
if(ex){if(ex.qty+qty>10){window.alert('Maximum 10 units per product.');return false}ex.qty+=qty;}
else cart.push({id,title:p.title||'Product',price:Number(p.price)||0,image:p.image||'',url:p.url||'',variant:p.variant||'',qty});
save();window.BITCTracking?.event?.('AddToCart',{id,qty});if(options.open!==false)open(true);return true;}
function change(id,d){const x=cart.find(i=>i.id===id);if(!x)return;x.qty=(Number(x.qty)||1)+d;if(x.qty<=0)cart=cart.filter(i=>i.id!==id);else x.qty=Math.min(x.qty,10);save()}
function remove(id){cart=cart.filter(i=>i.id!==id);save()}
function icon(){return '<svg class="bm-protection-icon" viewBox="0 0 70 60" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 17 31 6l23 11v27L31 55 8 44V17Z" stroke="#252525" stroke-width="3"/><path d="M8 17l23 11 23-11M31 28v27" stroke="#252525" stroke-width="3"/><path d="M45 34c7 0 12-4 12-4s5 4 12 4v9c0 9-12 15-12 15S45 52 45 43v-9Z" fill="#069879"/><path d="m51 43 4 4 7-9" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'}
function shell(){if(document.getElementById('bmCartDrawer'))return;document.body.insertAdjacentHTML('beforeend',`<div class="bm-cart-backdrop" id="bmCartBackdrop"></div><aside class="bm-cart-drawer" id="bmCartDrawer" aria-hidden="true"><div class="bm-cart-head"><h2>Cart</h2><span class="bm-cart-badge" id="bmCartBadge">0</span><button class="bm-cart-close" id="bmCartClose" aria-label="Close">×</button></div><div class="bm-cart-body" id="bmCartBody"></div><div class="bm-cart-footer" id="bmCartFooter"></div></aside>`);document.getElementById('bmCartClose').onclick=close;document.getElementById('bmCartBackdrop').onclick=close}

function render(){
 shell();cart=load();const c=count(),grand=total();
 document.getElementById('bmCartBadge').textContent=c;
 const body=document.getElementById('bmCartBody');
 let html='<div class="bm-ship-progress"><div class="bm-progress-copy"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h11v12H3zM14 9h4l3 4v4h-7z"/><circle cx="7.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/></svg><span>Free DHL shipping · More options at checkout</span></div></div>';
 if(!cart.length){
   html+='<div class="bm-cart-empty"><b>Your cart is empty</b>Explore our products and add your favorites.</div>';
 }else{
   const trash='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v7m4-7v7"/></svg>';
   html+=cart.map(x=>`<article class="bm-cart-item" data-id="${encodeURIComponent(x.id)}">
    <img src="${esc(x.image)}" alt="${esc(x.title)}" loading="lazy">
    <div class="bm-cart-info">
      <div class="bm-cart-title" title="${esc(x.title)}">${esc(x.title)}</div>
      ${x.variant?`<div class="bm-cart-variant">${esc(x.variant)}</div>`:''}
    </div>
    <div class="bm-cart-side">
      <div class="bm-cart-price">${money(x.price*x.qty)}</div>
      <div class="bm-item-tools">
        <div class="bm-cart-qty" role="group" aria-label="Quantity for ${esc(x.title)}">
          <button type="button" data-act="minus" aria-label="Decrease quantity">−</button>
          <span aria-live="polite">${x.qty}</span>
          <button type="button" data-act="plus" aria-label="Increase quantity">+</button>
        </div>
        <button type="button" class="bm-cart-remove" data-act="remove" aria-label="Remove ${esc(x.title)}">${trash}</button>
      </div>
    </div>
   </article>`).join('');
 }
 body.innerHTML=html;
 body.querySelectorAll('[data-id]').forEach(row=>{
   row.addEventListener('click',e=>{
    const a=e.target.closest('[data-act]')?.dataset.act;
    if(!a)return;
    const id=decodeURIComponent(row.dataset.id);
    if(a==='plus')change(id,1);
    else if(a==='minus')change(id,-1);
    else if(a==='remove')remove(id);
   });
 });
 const footer=document.getElementById('bmCartFooter');
 const shippingIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 5h11v12H3zM14 9h4l3 4v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>';
 footer.innerHTML=`<div class="bm-shipping-compact">
   <div class="bm-shipping-title">${shippingIcon} Shipping options</div>
   <div class="bm-shipping-options"><span>DHL <b>FREE</b></span><span>FedEx $24.99</span><span>UPS $29.99</span></div>
   <div class="bm-shipping-note">Flat rate per order for serviced regions.</div>
 </div>
 <div class="bm-subtotal"><span>Items subtotal (${c})</span><strong>${money(grand)}</strong></div>
 ${c?'<a class="bm-cart-checkout" href="/checkout/">Review your order &nbsp; →</a>':'<span class="bm-cart-checkout is-disabled" aria-disabled="true">Your cart is empty</span>'}
 <div class="bm-cart-footnote">Shipping and discounts shown at checkout.</div>`;
}
function open(alreadyRendered=false){shell();if(!alreadyRendered)render();document.body.classList.add('bm-cart-lock');document.getElementById('bmCartDrawer').classList.add('is-open');document.getElementById('bmCartBackdrop').classList.add('is-open');document.getElementById('bmCartDrawer').setAttribute('aria-hidden','false')}
function close(){document.body.classList.remove('bm-cart-lock');document.getElementById('bmCartDrawer')?.classList.remove('is-open');document.getElementById('bmCartBackdrop')?.classList.remove('is-open');document.getElementById('bmCartDrawer')?.setAttribute('aria-hidden','true')}
function bind(){shell();render();document.addEventListener('click',e=>{const a=e.target.closest('a[href="/cart"],a[href$="/cart"],a[href*="/cart?"]');if(a){e.preventDefault();open()}});document.addEventListener('submit',e=>{const f=e.target;if(!(f instanceof HTMLFormElement)||!String(f.action).includes('/cart/add'))return;e.preventDefault();const fd=new FormData(f),p=findProduct(f);p.variantId=fd.get('id')||'';p.qty=Number(fd.get('quantity')||1);const sel=f.querySelector('select[name="id"]');const selected=sel?.selectedOptions?.[0];if(selected?.disabled){window.alert('This option is not available.');return}const exact=selected?.dataset?.cents;if(exact!==undefined){const cents=Number(exact);if(!Number.isSafeInteger(cents)||cents<50){window.alert('Unable to verify this option price.');return}p.price=cents/100;p.variant=selected.textContent.split(' — ')[0].trim();}add(p)});document.addEventListener('click',e=>{const b=e.target.closest('button[name="add"],button[type="submit"][name="add"],.quick-add__submit,[data-add-to-cart]');if(!b)return;const f=b.closest('form');if(f&&String(f.action).includes('/cart/add'))return;const p=findProduct(b);if(p.title&&p.price){e.preventDefault();p.variantId=f?.querySelector('input[name="id"],select[name="id"]')?.value||'';add(p)}})}
window.BMCart={get:()=>load(),add,open,total};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind()})();