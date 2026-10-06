import http from 'node:http';
import { URL } from 'node:url';

const PORT = process.env.PORT || 10000;
const BTCPAY_URL = (process.env.BTCPAY_URL || 'https://pay.bitcmining.tech').replace(/\/$/,'');
const API_KEY = process.env.BTCPAY_API_KEY || '';
const STORE_ID = process.env.BTCPAY_STORE_ID || '';
const ALLOWED = new Set([
  'https://bitc-mining-preview.onrender.com',
  'https://bitcmining.tech',
  'https://www.bitcmining.tech'
]);

function json(res,status,body,origin=''){
  if(ALLOWED.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.writeHead(status);
  res.end(JSON.stringify(body));
}

async function readJson(req){
  let body=''; for await (const chunk of req){ body += chunk; if(body.length>100000) throw new Error('payload too large'); }
  return body ? JSON.parse(body) : {};
}

const server=http.createServer(async (req,res)=>{
  const origin=req.headers.origin||'';
  if(req.method==='OPTIONS'){
    if(ALLOWED.has(origin)) res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Access-Control-Allow-Methods','POST,GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
    res.writeHead(204); return res.end();
  }
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/health') return json(res,200,{ok:true,btcpayConfigured:Boolean(API_KEY&&STORE_ID)},origin);
  if(url.pathname!=='/api/create-btcpay-invoice' || req.method!=='POST') return json(res,404,{error:'not_found'},origin);
  if(!ALLOWED.has(origin)) return json(res,403,{error:'origin_not_allowed'},origin);
  if(!API_KEY || !STORE_ID) return json(res,503,{error:'btcpay_not_configured'},origin);

  try{
    const data=await readJson(req);
    // Temporary server-side validation. The production catalog should resolve item prices by product ID.
    const amount=Number(data.amount);
    if(!Number.isFinite(amount) || amount<=0 || amount>100000) return json(res,400,{error:'invalid_amount'},origin);
    const orderId=String(data.orderId||('BITC-'+Date.now())).slice(0,80);
    const payload={
      amount: amount.toFixed(2),
      currency:'USD',
      metadata:{orderId},
      checkout:{
        redirectURL:'https://bitcmining.tech/checkout/success',
        redirectAutomatically:false
      }
    };
    const r=await fetch(`${BTCPAY_URL}/api/v1/stores/${encodeURIComponent(STORE_ID)}/invoices`,{
      method:'POST',
      headers:{'Authorization':`token ${API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const text=await r.text();
    let out={}; try{out=JSON.parse(text)}catch{out={message:text}}
    if(!r.ok) return json(res,502,{error:'btcpay_error',status:r.status,details:out},origin);
    return json(res,200,{id:out.id,checkoutLink:out.checkoutLink,status:out.status},origin);
  }catch(err){
    return json(res,500,{error:'server_error',message:String(err?.message||err)},origin);
  }
});
server.listen(PORT,()=>console.log(`BITC pay API listening on ${PORT}`));
