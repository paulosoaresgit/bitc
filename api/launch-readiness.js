// Safe, read-only BITC go-live diagnostic. Never prints credentials, addresses or invoices.
// Usage (on the merchant VPS): docker compose exec -T api node launch-readiness.js
const flags=['BITC_SALES_ENABLED','BITC_SHIPPING_APPROVED','BITC_INVENTORY_APPROVED','BITC_TERMS_APPROVED'];
const status=(name,state,note='')=>console.log((state==='OK'?'[OK]':state==='BLOCK'?'[BLOCK]':'[CHECK]')+' '+name+(note?' — '+note:''));
const timer=ms=>AbortSignal.timeout(ms);
async function main(){
 console.log('BITC GO-LIVE DIAGNOSTIC (read-only; NO invoice or payment is created)');
 let blocked=0;
 const requireCheck=(name,ok,note)=>{status(name,ok?'OK':'BLOCK',note);if(!ok)blocked++};
 const approved=Object.fromEntries(flags.map(name=>[name,process.env[name]==='true']));
 for(const name of flags)status(name,approved[name]?'OK':'CHECK',approved[name]?'enabled':'not enabled');
 const rawHost=process.env.BTCPAY_URL||'';
 let host;
 try{host=new URL(rawHost);if(host.protocol!=='https:')throw new Error('non-https')}catch{
  requireCheck('BTCPay URL',false,'HTTPS URL is missing or invalid');process.exitCode=2;return;
 }
 const key=process.env.BTCPAY_API_KEY||'';
 const store=process.env.BTCPAY_STORE_ID||'';
 const encryption=process.env.BITC_ORDER_ENCRYPTION_KEY||'';
 requireCheck('BTCPay credentials configured',!!key&&!!store,'private values are never printed');
 requireCheck('Encrypted order storage',/^[0-9a-f]{64}$/i.test(encryption),'required for fulfillment');
 const endpoint='/api/v1/stores/'+encodeURIComponent(store);
 async function inspect(path){
  try{
   const resp=await fetch(host.origin+endpoint+path,{headers:{Authorization:'token '+key},signal:timer(12000)});
   if(!resp.ok)return {ok:false,status:resp.status};
   return {ok:true,status:resp.status,data:await resp.json()};
  }catch{return {ok:false,status:'network-error'}}
 }
 if(key&&store){
  const [invoices,methods]=await Promise.all([
   inspect('/invoices?count=1'),
   inspect('/payment-methods?onlyEnabled=true')
  ]);
  requireCheck('BTCPay invoice read permission',invoices.ok,
   invoices.ok?'scoped invoice API accessible':'API returned '+invoices.status);
  let wallet=false;
  if(methods.ok){
   const list=Array.isArray(methods.data)?methods.data:
    Array.isArray(methods.data?.paymentMethods)?methods.data.paymentMethods:[];
   wallet=list.some(x=>{
    const method=String(x?.paymentMethodId||x?.paymentMethod||x?.id||'');
    return (/^BTC[-_]OnChain$/i.test(method)||/^BTC-OnChain$/i.test(method)) &&
      x?.enabled!==false&&x?.activated!==false;
   });
  }
  requireCheck('BTC on-chain payment method',wallet,
   wallet?'enabled for this store (wallet ownership/sync not yet proven)':
   methods.ok?'No enabled BTC-OnChain method was returned':'Payment-method API returned '+methods.status);
  status('BTCPay invoice CREATE permission','CHECK','requires a controlled test invoice; never inferred from read access');
  status('Wallet sync, backup and settlement','CHECK','must be verified in merchant BTCPay and with a test payment');
 }
 try{
  const page=await fetch('http://storefront/checkout/',{signal:timer(6000)});
  const html=await page.text();
  const policies=['Refund policy','Privacy policy','Terms of service','Cancellations'];
  const invalid=policies.filter(label=>{
   const pattern=new RegExp('<a\\b[^>]*href=["\\\x27]#["\\\x27][^>]*>\\s*'+label+'\\s*</a>','i');
   return pattern.test(html);
  });
  requireCheck('Published customer policies',page.ok&&invalid.length===0,
   !page.ok?'storefront HTML unreachable':invalid.length?invalid.join(', ')+' have placeholder links':'no placeholder footer links found; content still needs legal review');
 }catch{requireCheck('Published customer policies',false,'could not verify checkout footer');}
 status('Inventory, shipping and consumer commitments','CHECK','owner must verify stock, supported destinations, returns and fulfillment');
 console.log('Technical blocks found: '+blocked);
 console.log('Sales gates unchanged. NO invoice created. NO payment accepted by this diagnostic.');
 if(blocked)process.exitCode=2;
}
main().catch(()=>{console.error('Diagnostic could not finish; no credentials printed.');process.exitCode=2});
