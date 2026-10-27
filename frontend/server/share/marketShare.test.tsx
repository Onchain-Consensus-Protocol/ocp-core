import {Readable} from 'node:stream';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {describe,it,expect,vi} from 'vitest';
import {createMarketShareHandler,marketShareHtml} from './marketShare';
import {marketCardFacts,type ShareMarket} from './marketCard';
import {marketShareUrl,marketXIntent} from '../../shared/marketShare';
import type {MarketShareSnapshot} from '../../shared/marketShare';
import {MarketCard} from './marketCard';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadMarketBrand} from './marketBrand';
const market:ShareMarket={id:'test-market',title:'Will Tesla reach a new high?',assetSymbol:'TSLA',phase:'GENESIS',result:null,R:'1800',B:'300',rTarget:'7200',bTarget:'1200',yesPrice:.6,noPrice:.4,volumeUSD:'12345',participants:8};
async function request(url:string,method='GET',load=vi.fn(async()=>market as ShareMarket|null)){
 const req=Object.assign(Readable.from([]),{method,url,headers:{host:'untrusted.test'}}) as IncomingMessage;
 const headers:Record<string,unknown>={};let body:string|Buffer='';
 const res={statusCode:200,setHeader:(key:string,value:unknown)=>{headers[key]=value;},end:(value?:string|Buffer)=>{body=value??'';}} as unknown as ServerResponse;
 await createMarketShareHandler(load)(req,res);return {status:res.statusCode,headers,body,load};
}
describe('public market share cards',()=>{
 it('serves frozen snapshots independent of visitor identity, URL theme, or later market changes',async()=>{
  const id='00000000-0000-4000-8000-000000000001';
  const snapshot:MarketShareSnapshot={id,market:{...market},at:1793088000,revision:1,theme:'dark',prices:[{label:'gTOKEN PRICE',value:'$0.0001',change:'+25.00%',positive:true}],priceSince:1793087000,priceNote:'Retained record comparison.',pnl:{label:'MY EXIT P&L',low:123,high:123,note:'Locked B excluded.'}};
  const frozen=vi.fn(async()=>snapshot),live=vi.fn(async()=>({...market,title:'Later changed title'}));
  const req=Object.assign(Readable.from([]),{method:'GET',url:`/api/market-share?snapshot=${id}&theme=light`,headers:{authorization:'Bearer ignored'}}) as IncomingMessage;
  const headers:Record<string,string>={};let html='';
  const res={statusCode:200,setHeader:(k:string,v:string)=>{headers[k]=v;},end:(v:string)=>{html=v;}} as unknown as ServerResponse;
  await createMarketShareHandler(live,frozen)(req,res);
  expect(res.statusCode).toBe(200);expect(frozen).toHaveBeenCalledWith(id);expect(live).not.toHaveBeenCalled();expect(html).toContain('123.00');expect(html).toContain('snapshot='+id+'&amp;image=1');expect(html).not.toContain('Later changed title');expect(html).not.toContain('Bearer');
  const dark=renderToStaticMarkup(React.createElement(MarketCard,{market:snapshot.market,snapshot,...await loadMarketBrand('dark')}));
  const light=renderToStaticMarkup(React.createElement(MarketCard,{market:snapshot.market,snapshot:{...snapshot,theme:'light'},...await loadMarketBrand('light')}));
  expect(dark).toContain('+25.00%');expect(dark).toContain('+123.00');expect(dark).toContain('Snapshot:');expect(light).not.toBe(dark);
  const wordmark=(await loadMarketBrand('dark')).wordmarkUrl.split(',')[1];expect(Buffer.from(wordmark,'base64').toString()).toContain('#ffffff');
 });
 it('builds an encoded X composer URL, without posting',()=>{
  const url=new URL(marketXIntent('id','Test & 中文?'));
  expect(url.origin+url.pathname).toBe('https://x.com/intent/tweet');expect(url.searchParams.get('text')).toContain('Test & 中文?');expect(url.searchParams.get('url')).toBe(marketShareUrl('id'));
 });
 it('shows phase-specific facts without invented odds',()=>{
  expect(marketCardFacts(market).map(x=>x.value)).toEqual(['25.0%','25.0%']);
  for(const result of ['YES','NO','INVALID'] as const)expect(marketCardFacts({...market,phase:'SETTLED',result})).toEqual([{label:'FINAL RESULT',value:result,color:'#ea580c'}]);
  expect(marketCardFacts({...market,phase:'FAILED'}).map(x=>x.value).join()).toContain('Refunds available');expect(marketCardFacts({...market,phase:'WAIT_CORE'}).map(x=>x.value)).toEqual(['60.0%','40.0%']);
 });
 it('escapes hostile titles and omits private fields',()=>{
  const html=marketShareHtml({...market,title:'</script><img src=x onerror="alert(1)">',email:'secret@example.test',position:{wallet:'private'}} as ShareMarket);
  expect(html).not.toContain('<img src=x');expect(html).toContain('&lt;/script&gt;');expect(html).not.toContain('secret@example.test');expect(html).not.toContain('wallet');expect(html).toContain('name="twitter:card" content="summary_large_image"');expect(html).toContain('https://market.ocp-protocol.org/api/market-share?id=test-market&amp;image=1');
 });
 it('serves anonymous HTML with fixed canonical and destination origins',async()=>{
  const r=await request('/api/market-share?id=test-market');expect(r.status).toBe(200);expect(r.headers['Content-Type']).toContain('text/html');expect(r.body).toContain(market.title);expect(r.body).not.toContain('untrusted.test');expect(r.body).toContain('location.replace("https://market.ocp-protocol.org/?market=test-market")');
 });
 it('rejects invalid input before loading and never caches failures',async()=>{
  for(const [url,method,status]of [['/api/market-share?id=%3Cscript%3E','GET',400],['/api/market-share?id=test-market','POST',405]] as const){const r=await request(url,method);expect(r.status).toBe(status);expect(r.load).not.toHaveBeenCalled();}
  const missing=await request('/api/market-share?id=missing','GET',vi.fn(async()=>null));expect(missing.status).toBe(404);expect(missing.headers['Cache-Control']).toBe('no-store');
  const failed=await request('/api/market-share?id=test-market','GET',vi.fn(async()=>{throw new Error('postgres://secret');}));expect(failed.status).toBe(503);expect(failed.body).not.toContain('postgres');expect(failed.headers['Cache-Control']).toBe('no-store');
 });
 it('supports HEAD without returning a body',async()=>{const r=await request('/api/market-share?id=test-market&image=1','HEAD');expect(r.status).toBe(200);expect(r.body).toBe('');expect(r.headers['Content-Type']).toBe('image/png');});
 it('renders a real 1200 × 630 PNG',async()=>{
  const r=await request('/api/market-share?id=test-market&image=1');expect(r.status).toBe(200);expect(Buffer.isBuffer(r.body)).toBe(true);
  const png=Buffer.from(r.body);expect(png.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');expect(png.readUInt32BE(16)).toBe(1200);expect(png.readUInt32BE(20)).toBe(630);
 });
});
