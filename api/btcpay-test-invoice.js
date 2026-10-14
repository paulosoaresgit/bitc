/**
 * Private merchant-owned BTCPay payment test. NO web route, NO real order.
 * --create: explicitly create exactly one USD 5.00 mainnet test invoice.
 * --status INVOICE_ID: read the current payment status of that test invoice.
 * --latest: find and inspect newest USD 5 private test invoice, without manual ID.
 * --recent: list last few matching private test invoice IDs (no buyer details).
 * Requires VPS-only scoped BTCPay credentials. Does not change sales gates.
 */
import crypto from 'node:crypto';

const argv=process.argv.slice(2);
const mode=argv[0];
const fail=(message)=>{console.error('[ERROR] '+message);process.exitCode=1;};
const rawURL=process.env.BTCPAY_URL||'';
const apiKey=process.env.BTCPAY_API_KEY||'';
const storeId=process.env.BTCPAY_STORE_ID||'';
let host;
try {
  host=new URL(rawURL);
  if(host.protocol!=='https:'||host.username||host.password||host.search||host.hash)throw Error();
}catch{fail('BTCPAY_URL must be an HTTPS URL.');}
if(!apiKey||!storeId)fail('BTCPay API key or store ID is missing.');
if(process.exitCode)process.exit();
if((mode!=='--create'||argv.length!==1)&&(mode!=='--status'||argv.length!==2)&&(mode!=='--latest'||argv.length!==1)&&(mode!=='--recent'||argv.length!==1)){
 console.log('Usage: node btcpay-test-invoice.js --create');
 console.log('       node btcpay-test-invoice.js --status INVOICE_ID');
 console.log('       node btcpay-test-invoice.js --latest');
 console.log('       node btcpay-test-invoice.js --recent');
 console.log('WARNING: --create creates ONE real USD 5.00 invoice. Sending BTC transfers actual funds and incurs network fees.');
 process.exit(1);
}
const base=host.origin+'/api/v1/stores/'+encodeURIComponent(storeId);
async function request(path,method='GET',body){
 const response=await fetch(base+path,{
  method,
  headers:{Authorization:'token '+apiKey, ...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),
  signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw new Error('BTCPay HTTP '+response.status+' while '+(method==='POST'?'creating':'reading')+' invoice.');
 return response.json();
}
const safeId=id=>/^[A-Za-z0-9_-]{8,150}$/.test(id);
function safeStatus(invoice){
 const status=String(invoice.status||'Unknown');
 const additional=String(invoice.additionalStatus||'None');
 const settled=status==='Settled'&&['None',''].includes(additional);
 console.log('Invoice status: '+status);
 console.log('Additional status: '+additional);
 console.log('Payment settled without exceptions: '+(settled?'YES':'NO'));
 if(!settled)console.log('Do not treat as received or ship any goods. Check BTCPay confirmations.');
 return settled;
}
// Greenfield list endpoint needs only canviewinvoices. Never display another
// customer invoice; only use unique private diagnostic metadata from this CLI.
async function recentTestInvoices(){
 const page=await request('/invoices?count=100&skip=0');
 const invoices=Array.isArray(page)?page:Array.isArray(page?.invoices)?page.invoices:[];
 if(!Array.isArray(invoices)||!invoices.length)return [];
 return invoices.filter(invoice=>
   invoice?.metadata?.bitcTestOnly===true &&
   invoice?.currency==='USD' && Math.round(Number(invoice.amount)*100)===500 &&
   safeId(String(invoice.id||'')))
  .sort((a,b)=>Number(b.createdTime||0)-Number(a.createdTime||0));
}
async function checkedTestStatus(id){
 let invoice;
 try{invoice=await request('/invoices/'+encodeURIComponent(id));}
 catch(err){
  if(String(err.message).includes('HTTP 403'))
   throw Error('HTTP 403 for this invoice ID. Compare with BTCPay store invoice list; verify exact ID and store-scoped View invoices permission. This is NOT proof of payment failure.');
  throw err;
 }
 if(invoice.id!==id||invoice.metadata?.bitcTestOnly!==true||
   invoice.currency!=='USD'||Math.round(Number(invoice.amount)*100)!==500)
   throw Error('The invoice is not a verified USD 5 BITC diagnostic. No payment status can be confirmed.');
 console.log('Verified diagnostic invoice ID: '+id);
 safeStatus(invoice);
}
async function main(){
 console.log('BITC PRIVATE PAYMENT TEST — public checkout remains '+(process.env.BITC_SALES_ENABLED==='true'?'configured by VPS flags':'LOCKED'));
 if(mode==='--create'){
  const testId=crypto.randomUUID();
  console.log('Creating a real BTCPay invoice of USD 5.00 for a PRIVATE TEST ONLY.');
  console.log('This is not a storefront order and must never be fulfilled or counted as a customer sale.');
  const invoice=await request('/invoices','POST',{
   amount:'5.00',currency:'USD',
   metadata:{bitcTestOnly:true,bitcTestId:testId,description:'BITC PRIVATE DIAGNOSTIC — DO NOT FULFILL'}
  });
  if(!safeId(invoice.id))throw Error('Invoice created, but returned invoice ID was invalid. Inspect BTCPay dashboard.');
  console.log('Test invoice ID: '+invoice.id);
  const link=new URL(String(invoice.checkoutLink||''),host.origin);
  if(link.origin!==host.origin||!link.pathname.startsWith('/i/'))throw Error('Invoice created, but checkout URL was unexpected. Inspect in BTCPay dashboard.');
  const persisted=await request('/invoices/'+encodeURIComponent(invoice.id));
  if(persisted.id!==invoice.id||persisted.currency!=='USD'||Math.round(Number(persisted.amount)*100)!==500||
     persisted.metadata?.bitcTestOnly!==true||persisted.metadata?.bitcTestId!==testId)
   throw Error('Invoice exists but persisted metadata or amount could not be verified. Do NOT pay it.');
  console.log('[OK] Create and read-back: USD 5.00 and private test metadata verified.');
  try {
   const methods=await request('/invoices/'+encodeURIComponent(invoice.id)+'/payment-methods');
   const list=Array.isArray(methods)?methods:Array.isArray(methods?.paymentMethods)?methods.paymentMethods:[];
   const btc=list.find(m=>/^BTC[-_](?:CHAIN|ONCHAIN)$/i.test(String(m.paymentMethodId||m.paymentMethod||m.id||'')));
   const address=String(btc?.destination||'');
   const btcDue=String(btc?.due??btc?.amount??'');
   const mainnet=/^(?:[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[ac-hj-np-z02-9]{11,87})$/.test(address);
   const positive=/^(?:0|[1-9]\d{0,7})\.\d{1,8}$/.test(btcDue)&&Number(btcDue)>0;
   console.log(mainnet&&positive?'[OK] Invoice has a BTCPay BTC on-chain address and positive BTC amount.':
     '[CHECK] BTC destination/amount not verified through API; inspect the BTCPay invoice before payment.');
  }catch(err){console.log('[CHECK] Could not verify invoice BTC method: '+err.message);}
  console.log('PRIVATE TEST PAYMENT URL: '+link.href);
  console.log('Open the BTCPay link, verify the BTC address/QR and send the exact BTC amount only if you intend a real USD 5.00 test transfer.');
  console.log('After sending, allow confirmations. Then use: node btcpay-test-invoice.js --status '+invoice.id);
 }else if(mode==='--status'){
  const id=String(argv[1]||'');
  if(!safeId(id))throw Error('Invalid invoice ID. Use --recent to verify it or --latest to avoid typing.');
  await checkedTestStatus(id);
 }else{
  const matches=await recentTestInvoices();
  if(!matches.length)throw Error('No USD 5 test invoice found in the latest 100 store invoices. Open your BTCPay dashboard and verify store and invoice ID; do not create a new invoice yet.');
  if(mode==='--recent'){
   console.log('Recent private USD 5 test invoices (newest first):');
   for(const invoice of matches.slice(0,5))
    console.log('Test invoice ID: '+invoice.id+' — status: '+String(invoice.status||'Unknown'));
   console.log('Use --latest to check the newest invoice automatically.');
  }else{
   console.log('Newest private USD 5 test invoice found in BTCPay store list.');
   await checkedTestStatus(String(matches[0].id));
  }
 }
 console.log('Public sales flags unchanged. No storefront customer order was created.');
}
main().catch(e=>fail(e.message));
