(()=>{const KEY='bm_cart_v1';const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const RETIRED_CHECKOUT_EXTRAS=new Set(['reco-cards','reco-gold-nugget']);const load=()=>{try{const items=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(items)?items.filter(item=>!RETIRED_CHECKOUT_EXTRAS.has(String(item?.id||''))):[]}catch{return[]}};let cart=load();const protection=()=>false;
function protectIcon(){return '<svg class="co-protect-icon" viewBox="0 0 70 60" fill="none"><path d="M8 17 31 6l23 11v27L31 55 8 44V17Z" stroke="#252525" stroke-width="3"/><path d="M8 17l23 11 23-11M31 28v27" stroke="#252525" stroke-width="3"/><path d="M45 34c7 0 12-4 12-4s5 4 12 4v9c0 9-12 15-12 15S45 52 45 43v-9Z" fill="#fff" stroke="#252525" stroke-width="2"/></svg>'}
function subtotal(){return cart.reduce((s,x)=>s+(Number(x.price)||0)*(Number(x.qty)||1),0)}function count(){return cart.reduce((s,x)=>s+(Number(x.qty)||1),0)}
function renderSummary(){cart=load();const wrap=document.getElementById('coItems');let html='';if(protection())html+=`<div class="co-summary-item"><div class="co-summary-thumb">${protectIcon()}<span class="co-summary-qty">1</span></div><div class="co-protect-copy"><div class="co-summary-name">Shipping Protection</div><div class="co-summary-variant">16.5</div><small>Disclaimer: This is an optional additional service for expedited replacements and is not a shipping fee.</small></div><div class="co-summary-price">${money(PROTECTION_PRICE)}</div></div>`;html+=cart.map(x=>`<div class="co-summary-item"><div class="co-summary-thumb">${x.image?`<img src="${esc(x.image)}" alt="">`:'₿'}<span class="co-summary-qty">${x.qty}</span></div><div><div class="co-summary-name">${esc(x.title)}</div>${x.variant?`<div class="co-summary-variant">${esc(x.variant)}</div>`:''}</div><div class="co-summary-price">${money(x.price*x.qty)}</div></div>`).join('');if(!html)html='<div style="color:#777;font-size:11px;padding:20px 0">Your cart is empty.</div>';wrap.innerHTML=html;const n=count()+(protection()?1:0),t=subtotal();document.getElementById('coSubtotalLabel').textContent='Subtotal · '+n+' item'+(n===1?'':'s');document.getElementById('coSubtotal').textContent=money(t);document.getElementById('coBagCount').textContent=count();updatePaymentTotals()}
function toast(msg){const t=document.getElementById('coToast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800)}
let selectedMethod='bitcoin';let storefrontReady=false;const CRYPTO_DISCOUNT=0.20,SHIPPING_PRICES={dhl:0,fedex:24.99,ups:29.99};let selectedShipping=localStorage.getItem('bm_shipping_method')||'dhl';
let binanceSession=null,binancePoll=null;
function hydrateBinanceInvoice(){ /* Payment addresses must come ONLY from authenticated BTCPay invoices. */ }
function updatePaymentTotals(){const base=subtotal(),shipping=SHIPPING_PRICES[selectedShipping]??0,isCrypto=selectedMethod==='bitcoin'||selectedMethod==='binance',discount=isCrypto?base*CRYPTO_DISCOUNT:0,final=base-discount+shipping;const row=document.getElementById('coCryptoDiscountRow'),discountEl=document.getElementById('coCryptoDiscount'),original=document.getElementById('coOriginalTotal'),totalEl=document.getElementById('coTotal'),shippingEl=document.getElementById('coShipping');if(row)row.classList.toggle('show',isCrypto);if(discountEl)discountEl.textContent='-'+money(discount);if(original){original.textContent=money(base+shipping);original.classList.toggle('show',isCrypto)}if(shippingEl){shippingEl.textContent=shipping===0?'FREE':money(shipping);shippingEl.style.color='#344054'}if(totalEl)totalEl.textContent=money(final);const mobileTotal=document.getElementById('summaryToggleTotal');if(mobileTotal)mobileTotal.textContent=money(final)}
function updatePayButton(){const btn=document.getElementById('payNow'),label=document.getElementById('payNowLabel');if(!btn||!label)return;btn.setAttribute('aria-disabled',String(!storefrontReady||(selectedMethod==='binance'&&!!binanceSession)));if(!storefrontReady){btn.disabled=true;label.textContent=selectedMethod==='binance'?'Binance selected — checkout not published yet':'Checkout not published yet';return}btn.disabled=selectedMethod==='binance'&&!!binanceSession;
if(btn.disabled){label.textContent='Binance BTC invoice created';return}btn.classList.toggle('alt-selected',!['bitcoin','binance'].includes(selectedMethod));if(selectedMethod==='bitcoin'){label.textContent='Pay with Bitcoin — Save 20%';btn.querySelector('.co-cta-btc').textContent='₿'}else if(selectedMethod==='binance'){label.textContent='Generate BTC wallet for Binance';btn.querySelector('.co-cta-btc').textContent='₿'}else if(selectedMethod==='card'){label.textContent='Pay with Credit Card'}else if(selectedMethod==='paypal'){label.textContent='Continue with PayPal'}else if(selectedMethod==='afterpay'){label.textContent='Continue with Afterpay'}else if(selectedMethod==='cash'){label.textContent='Continue with Cash App'}}
function selectPayment(name){selectedMethod=name;document.querySelectorAll('[data-method]').forEach(r=>{const active=r.dataset.method===name;r.classList.toggle('selected',active);r.setAttribute('aria-pressed',String(active))});const notice=document.getElementById('selectedCryptoNotice');if(notice)notice.textContent=name==='binance'?'Binance BTC transfer selected. Your unique Bitcoin wallet and exact amount will be generated through BTCPay when checkout is published. Binance Pay is not integrated.':'Bitcoin wallet selected. You can also select Binance to transfer BTC using the Bitcoin network. Binance Pay is not integrated.';const cardForm=document.getElementById('cardForm');if(cardForm)cardForm.style.display=name==='card'?'grid':'none';const guide=document.getElementById('binanceGuide');if(guide)guide.classList.toggle('show',name==='binance');const binanceToggle=document.querySelector('[data-method="binance"]');if(binanceToggle)binanceToggle.setAttribute('aria-expanded',String(name==='binance'));if(!['bitcoin','binance'].includes(name)){document.getElementById('otherMethods')?.classList.add('show');document.getElementById('otherMethodsToggle')?.classList.add('open')}hydrateBinanceInvoice();updatePaymentTotals();updatePayButton()}

const paymentApi=()=>String(document.querySelector('meta[name="bitc-payment-api"]')?.content||window.BITC_PAYMENT_API_URL||'').trim().replace(/\/+$/,'');

function showBinanceStatus(text,state='waiting'){
 const el=document.getElementById('binancePaymentStatus');
 if(el){el.textContent=text;el.dataset.state=state}
}
function stopBinancePolling(){if(binancePoll){clearInterval(binancePoll);binancePoll=null}}
async function checkBinancePayment(){
 const session=binanceSession;
 if(!session?.accessToken)return;
 try{
  const url=paymentApi()+'/api/invoice-status?invoiceId='+encodeURIComponent(session.invoiceId)+'&token='+encodeURIComponent(session.accessToken);
  const resp=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(9000)});
  if(!resp.ok)throw Error('status_unavailable');
  const info=await resp.json();
  if(binanceSession!==session)return;
  if(info.state==='settled'){
   showBinanceStatus('Payment confirmed by BTCPay. You can safely close this page.','settled');
   stopBinancePolling();
  }else if(info.state==='processing'){
   showBinanceStatus('Payment detected. Waiting for network confirmations.','processing');
  }else if(info.state==='review'){
   showBinanceStatus('Payment needs manual review. Contact the store before resending.','review');
   stopBinancePolling();
  }else if(info.state==='expired'){
   showBinanceStatus('Invoice expired. Do not send BTC to this address. Open BTCPay for details.','expired');
   stopBinancePolling();
   document.querySelectorAll('#binanceReady [data-copy-target]').forEach(b=>b.disabled=true);
  }else if(session.expiresAt&&Date.now()>=session.expiresAt*1000){
   showBinanceStatus('Invoice time elapsed. Check BTCPay before sending.','expired');
   stopBinancePolling();
   document.querySelectorAll('#binanceReady [data-copy-target]').forEach(b=>b.disabled=true);
  }else{
   showBinanceStatus('Awaiting BTC payment. Use only the Bitcoin network.','waiting');
  }
 }catch{
  if(binanceSession===session)showBinanceStatus('Live status unavailable. Check your secure BTCPay invoice.','unknown');
 }
}
function displayBinanceInvoice(invoice){
 const guide=document.getElementById('binanceGuide');
 guide?.classList.add('show');
 const fallback=document.getElementById('binanceFallback');
 const ready=document.getElementById('binanceReady');
 const waiting=document.getElementById('binanceInvoiceWait');
 const link=invoice.checkoutLink;
 const open=document.getElementById('binanceInvoiceLink');
 const fallbackLink=document.getElementById('binanceFallbackLink');
 if(open)open.href=link;
 if(fallbackLink)fallbackLink.href=link;
 const payment=invoice.binancePayment;
 const valid=payment?.network==='Bitcoin (BTC)' &&
  /^(?:[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[ac-hj-np-z02-9]{11,87})$/.test(payment.address||'') &&
  /^(?:0|[1-9]\d{0,7})\.\d{1,8}$/.test(payment.amountBTC||'') &&
  /^[a-f0-9]{64}$/.test(payment.accessToken||'');
 binanceSession={invoiceId:invoice.id,accessToken:valid?payment.accessToken:null,
    expiresAt:valid?payment.expiresAt:null,amountUSD:invoice.amountUSD};
 if(waiting)waiting.style.display='none';
 if(ready)ready.classList.toggle('show',!!valid);
 if(fallback)fallback.hidden=!!valid;
 if(valid){
  document.getElementById('binanceAddress').textContent=payment.address;
  document.getElementById('binanceAmount').textContent=payment.amountBTC;
  showBinanceStatus('Awaiting BTC payment. Use only the Bitcoin network.','waiting');
  stopBinancePolling();
  void checkBinancePayment();
  binancePoll=setInterval(()=>void checkBinancePayment(),15000);
 }else{
  stopBinancePolling();
 }
 updatePayButton();
 guide?.scrollIntoView({behavior:'smooth',block:'center'});
}

function updateShippingPreview(){document.querySelectorAll('.co-shipping-option').forEach(option=>{const name=option.dataset.shipping;const el=option.querySelector('.co-ship-price');if(el)el.textContent=SHIPPING_PRICES[name]===0?'FREE':money(SHIPPING_PRICES[name]);});const n=document.querySelector('.co-shipping-note');if(n)n.textContent=storefrontReady?'Confirmed fixed shipping price per order for destinations we serve. Check your address and final amount before paying.':'Confirmed flat-rate shipping for served destinations. Checkout remains disabled until you can place orders.';}
async function checkReadiness(){const btn=document.getElementById('payNow');if(btn)btn.disabled=true;storefrontReady=false;try{const r=await fetch(paymentApi()+'/api/health',{signal:AbortSignal.timeout(8000),cache:'no-store'});const data=await r.json();storefrontReady=Boolean(r.ok&&data.salesEnabled===true&&data.btcpayConfigured===true&&data.orderEncryptionConfigured===true); }catch{storefrontReady=false}
const notice=document.getElementById('checkoutReadinessNotice');
if(notice)notice.textContent=storefrontReady?
  'Secure BTCPay invoices are available. Pay only to the BTC address shown on your unique invoice.':
  'Purchases are disabled until the final review and publication are authorized. No Bitcoin invoice will be created while checkout is inactive.';
const totalTitle=document.querySelector('.co-total-final > span:first-child');
if(totalTitle)totalTitle.textContent=storefrontReady?'Total':'Estimated total (not payable yet)';
updateShippingPreview();updatePaymentTotals();updatePayButton();}
function field(name){return document.querySelector('[name="'+name+'"]')?.value?.trim()||''}
function customer(){const keys=['email','firstName','lastName','country','postalCode','street','buildingNumber','city','state','phone','address2','company','neighborhood'];const data={};for(const k of keys)data[k]=field(k);return data}
async function createPayment(){
  const btn=document.getElementById('payNow'),label=document.getElementById('payNowLabel');
  if(btn.disabled||!storefrontReady){toast('Checkout is not published yet. No payment was created.');return}
  if(!['bitcoin','binance'].includes(selectedMethod)){toast('Only Bitcoin network payments are supported.');return}
  cart=load();
  if(!cart.length){toast('Add a product to your cart first.');return}
  const buyer=customer();
  const required=['email','firstName','lastName','country','postalCode','street','city','state'];
  const missing=required.find(k=>!buyer[k]);
  if(missing){alert('Please complete your contact and delivery address before paying. Missing: '+missing);document.querySelector('[name="'+missing+'"]')?.focus();return}
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyer.email)){alert('Enter a valid email address.');document.querySelector('[name="email"]')?.focus();return}
  const cartPayload={items:cart.map(x=>({id:String(x.id),qty:Number(x.qty)})),shipping:selectedShipping,shippingProtection:protection()};
  const previousLabel=label.textContent;
  btn.disabled=true;label.textContent='Verifying your total…';
  try{
    // Before creating any invoice, obtain the amount from the server-owned catalog.
    const quoted=await fetch(paymentApi()+'/api/quote',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cartPayload),
      signal:AbortSignal.timeout(15000)
    });
    const quote=await quoted.json().catch(()=>({error:'invalid_api_response'}));
    if(!quoted.ok)throw new Error(quote.error||'quote_unavailable');
    if(!Number.isSafeInteger(quote.amountCents)||quote.amountCents<=0)throw new Error('invalid_api_response');
    const verifiedTotal=quote.amountCents/100;
    const displayedBaseCents=Math.round(subtotal()*100);const displayedTotal=(displayedBaseCents-Math.round(displayedBaseCents*CRYPTO_DISCOUNT)+Math.round((SHIPPING_PRICES[selectedShipping]||0)*100))/100;
    if(Math.abs(verifiedTotal-displayedTotal)>0.011){
      const accepted=window.confirm('Your cart price differs from the verified price. Server-confirmed total: '+money(verifiedTotal)+' (displayed: '+money(displayedTotal)+'). Continue with the verified amount?');
      if(!accepted)return;
    }
    label.textContent='Creating secure BTCPay invoice…';
    const payload={...cartPayload,customer:buyer,expectedAmountCents:quote.amountCents,
      paymentFlow:selectedMethod==='binance'?'binance_btc':'bitcoin'};
    const response=await fetch(paymentApi()+'/api/create-btcpay-invoice',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),
      signal:AbortSignal.timeout(25000)
    });
    const invoice=await response.json().catch(()=>({error:'invalid_api_response'}));
    if(!response.ok)throw new Error(invoice.error||'invoice_creation_failed');
    if(!invoice.checkoutLink||!invoice.id)throw new Error('invoice_creation_failed');
    if(Math.abs(Number(invoice.amountUSD)-verifiedTotal)>0.011)throw new Error('quote_expired');
    // Wallet is shown only after BTCPay generates and verifies an invoice.
    if(selectedMethod==='binance'){displayBinanceInvoice(invoice);return}
    window.location.assign(invoice.checkoutLink);
  }catch(err){
    const messages={
      catalog_item_unavailable:'This product is not yet registered in the secure server catalog. Payment was not initiated.',
      client_prices_not_allowed:'The checkout rejected an invalid price. Please refresh your cart.',
      checkout_not_configured:'Payment setup is incomplete. No charge was generated.',
      checkout_unavailable:'Payment is temporarily unavailable. No charge was generated.',
      checkout_not_ready:'Checkout is not active yet. No payment was created.',
      inventory_not_verified:'The store has not yet confirmed stock for this product.',
      delivery_country_unavailable:'Delivery to the selected country is not yet approved.',
      protection_not_available:'Optional delivery protection is not available.',
      quote_unavailable:'Unable to confirm the price. No invoice was created.',
      quote_expired:'The price changed before payment. Refresh and try again.',
      price_mismatch_refresh_cart:'The verified server price differs from the cart. Please refresh your cart before paying.',
      invalid_api_response:'The payment API is not connected to this storefront.'
    };
    const code=String(err?.message||'checkout_unavailable');
    alert(messages[code]||('Could not start payment ('+code+'). No charge was generated.'));
  }finally{label.textContent=previousLabel;updatePayButton()}
}

function init(){renderSummary();document.querySelectorAll('[data-method]').forEach(r=>r.onclick=()=>selectPayment(r.dataset.method));const bindToggle=(buttonId,panelId)=>{const button=document.getElementById(buttonId),panel=document.getElementById(panelId);if(button&&panel){button.onclick=()=>{const open=panel.classList.toggle('show');button.classList.toggle('open',open)}}};bindToggle('optionalFieldsToggle','optionalFields');bindToggle('summaryToggle','summaryInner');const toggle=document.getElementById('otherMethodsToggle'),other=document.getElementById('otherMethods');if(toggle&&other){toggle.onclick=()=>{const open=other.classList.toggle('show');toggle.classList.toggle('open',open)}};document.getElementById('applyCoupon')?.addEventListener('click',()=>toast('Promo codes are not currently enabled'));document.getElementById('payNow').onclick=createPayment;document.addEventListener('click',async e=>{const b=e.target.closest('[data-copy-target]');if(!b)return;const el=document.getElementById(b.dataset.copyTarget);if(!el)return;try{await navigator.clipboard.writeText(el.textContent.trim());toast('Copied')}catch{toast('Copy failed — select the value manually')}});document.querySelectorAll('.co-shipping-option').forEach(option=>option.addEventListener('click',()=>{if(binanceSession){toast('Your BTC invoice is fixed. Refresh checkout before changing shipping.');return}document.querySelectorAll('.co-shipping-option').forEach(x=>x.classList.remove('selected'));option.classList.add('selected');selectedShipping=option.dataset.shipping||'dhl';localStorage.setItem('bm_shipping_method',selectedShipping);updatePaymentTotals();toast(selectedShipping==='dhl'?'DHL free shipping selected':'Shipping method updated')}));const savedShip=localStorage.getItem('bm_shipping_method')||'dhl';selectedShipping=SHIPPING_PRICES[savedShip]!==undefined?savedShip:'dhl';const el=document.querySelector('.co-shipping-option[data-shipping="'+selectedShipping+'"]');if(el){document.querySelectorAll('.co-shipping-option').forEach(x=>x.classList.remove('selected'));el.classList.add('selected')}selectPayment('bitcoin');checkReadiness()}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init()})();