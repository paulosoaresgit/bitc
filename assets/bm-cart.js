(()=>{const KEY='bm_cart_v1';const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};const save=v=>{localStorage.setItem(KEY,JSON.stringify(v));render()};let cart=load();
function normalizeText(s){return String(s||'').replace(/\s+/g,' ').trim()}
function parsePrice(s){const m=String(s||'').replace(/,/g,'').match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/);return m?Number(m[1]):0}
function findProduct(el){const root=el.closest('product-form,.product-form,.card,.product-card,.grid-product,.product,.product__info-container,.product-single,.product-block')||document;
 const titleEl=root.querySelector('h1,h2,h3,.card__heading,.product__title,.product-single__title,[class*="title"]');
 const priceEl=root.querySelector('.price,.price-item,.money,[class*="price"]');
 const imgEl=root.querySelector('img');
 const title=normalizeText(titleEl?.textContent)||normalizeText(document.querySelector('h1')?.textContent)||document.title.split('|')[0].trim();
 const price=parsePrice(priceEl?.textContent)||parsePrice(root.textContent);
 const image=imgEl?.currentSrc||imgEl?.src||'';
 return {title,price,image,url:location.href};
}
function add(p){const id=(p.variant||p.url||p.title);const ex=cart.find(x=>x.id===id);if(ex)ex.qty+=p.qty||1;else cart.push({id,title:p.title,price:p.price,image:p.image,url:p.url,qty:p.qty||1});save(cart);open();toast('Added to cart')}
function update(id,d){const x=cart.find(i=>i.id===id);if(!x)return;x.qty+=d;if(x.qty<=0)cart=cart.filter(i=>i.id!==id);save(cart)}
function remove(id){cart=cart.filter(i=>i.id!==id);save(cart)}
function total(){return cart.reduce((s,x)=>s+x.price*x.qty,0)}
function count(){return cart.reduce((s,x)=>s+x.qty,0)}
function shell(){if(document.getElementById('bmCartDrawer'))return;document.body.insertAdjacentHTML('beforeend',`
<div class="bm-cart-backdrop" id="bmCartBackdrop"></div>
<aside class="bm-cart-drawer" id="bmCartDrawer" aria-hidden="true">
 <div class="bm-cart-head"><h2>Your cart</h2><button class="bm-cart-close" id="bmCartClose" aria-label="Close">×</button></div>
 <div class="bm-cart-body" id="bmCartBody"></div>
 <div class="bm-cart-footer"><div class="bm-cart-summary"><span>Subtotal</span><span id="bmCartTotal">$0.00</span></div><div class="bm-cart-note">Taxes and shipping calculated at checkout.</div><a class="bm-cart-checkout" href="/checkout/">Checkout</a></div>
</aside>
<button class="bm-floating-cart" id="bmFloatingCart" aria-label="Cart">🛒<b id="bmCartCount">0</b></button>
<div class="bm-toast" id="bmToast"></div>`);
document.getElementById('bmCartClose').onclick=close;document.getElementById('bmCartBackdrop').onclick=close;document.getElementById('bmFloatingCart').onclick=open}
function render(){shell();const body=document.getElementById('bmCartBody');document.getElementById('bmCartCount').textContent=count();document.getElementById('bmCartTotal').textContent=money(total());
 if(!cart.length){body.innerHTML='<div class="bm-cart-empty"><strong>Your cart is empty</strong><br><br>Browse the store and add a miner or accessory.</div>';return}
 body.innerHTML=cart.map(x=>`<div class="bm-cart-item" data-id="${encodeURIComponent(x.id)}"><img src="${x.image||''}" alt=""><div><div class="bm-cart-title">${x.title}</div><div class="bm-cart-price">${money(x.price)}</div><div class="bm-cart-qty"><button data-act="minus">−</button><span>${x.qty}</span><button data-act="plus">+</button></div><button class="bm-cart-remove" data-act="remove">Remove</button></div><div><strong>${money(x.price*x.qty)}</strong></div></div>`).join('');
 body.querySelectorAll('[data-id]').forEach(row=>{const id=decodeURIComponent(row.dataset.id);row.onclick=e=>{const a=e.target.dataset.act;if(a==='plus')update(id,1);if(a==='minus')update(id,-1);if(a==='remove')remove(id)}})}
function open(){shell();document.getElementById('bmCartDrawer').classList.add('is-open');document.getElementById('bmCartBackdrop').classList.add('is-open');document.getElementById('bmCartDrawer').setAttribute('aria-hidden','false')}
function close(){document.getElementById('bmCartDrawer')?.classList.remove('is-open');document.getElementById('bmCartBackdrop')?.classList.remove('is-open')}
function toast(s){const t=document.getElementById('bmToast');if(!t)return;t.textContent=s;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1500)}
function bind(){shell();render();
 document.addEventListener('click',e=>{const a=e.target.closest('a[href="/cart"],a[href$="/cart"],[href*="/cart?"]');if(a){e.preventDefault();open()}});
 document.addEventListener('submit',e=>{const f=e.target;if(!(f instanceof HTMLFormElement)||!String(f.action).includes('/cart/add'))return;e.preventDefault();const fd=new FormData(f);const p=findProduct(f);p.variant=fd.get('id')||p.url;p.qty=Number(fd.get('quantity')||1);add(p)});
 document.addEventListener('click',e=>{const b=e.target.closest('button[name="add"],button[type="submit"][name="add"],.quick-add__submit,[data-add-to-cart]');if(!b)return;const f=b.closest('form');if(f&&String(f.action).includes('/cart/add'))return;const p=findProduct(b);if(p.title&&p.price){e.preventDefault();add(p)}})}
window.BMCart={get:()=>load(),add,open,total};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();})();