/* First-party first-click guard. Included inline in the HEAD by the publisher. */
(()=>{'use strict';
if(!(location.pathname==='/'||location.pathname.startsWith('/collections/')))return;
const queued=[];let active=false;
function target(event){
 const button=event.type==='submit'
  ?event.target?.querySelector?.('button[name="add"][data-product-id],button[data-pf-type="ProductATC2"]')
  :event.target?.closest?.('form.pf-product-form button[name="add"][data-product-id],form.pf-product-form button[data-pf-type="ProductATC2"]');
 if(!button)return null;
 const form=button.closest('form.pf-product-form[action*="/cart/add"]');
 const box=form?.closest('[data-pf-type="ProductBox"]');
 if(!form||!box||form.closest('[data-bitc-purchase-ready="1"]'))return null;
 return {button,form,box};
}
function guard(event){
 if(active)return;
 const found=target(event);if(!found)return;
 event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
 if(queued.some(x=>x.button===found.button)||queued.length>=20)return;
 found.button.dataset.bitcQueued='1';
 found.button.textContent='Preparing cart…';
 queued.push(found);
}
window.addEventListener('click',guard,true);
window.addEventListener('submit',guard,true);
window.BITCEarlyCart={activate(handler){
 if(active)return;
 active=true;
 window.removeEventListener('click',guard,true);
 window.removeEventListener('submit',guard,true);
 for(const found of queued.splice(0)){
  delete found.button.dataset.bitcQueued;
  if(found.button.isConnected)handler(found);
 }
}};
})();