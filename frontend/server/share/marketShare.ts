import React from 'react';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {ImageResponse} from '@vercel/og';
import {PaperStore} from '../paper/store.js';
import {projectPaperMarket} from '../paper/engine.js';
import {marketShareUrl} from '../../shared/marketShare.js';
import {loadMarketBrand} from './marketBrand.js';
import {MarketCard,marketDescription,type ShareMarket} from './marketCard.js';

const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function marketShareHtml(m:ShareMarket):string {
 const share=marketShareUrl(m.id),image=share+'&image=1',target=`https://market.ocp-protocol.org/?market=${encodeURIComponent(m.id)}`;
 const title=escapeHtml(m.title),description=escapeHtml(marketDescription(m));
 // 公开页只序列化话题与聚合状态；不传用户身份、钱包、持仓或整个市场对象。
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | OCP Market</title><link rel="canonical" href="${escapeHtml(share)}"><meta name="description" content="${description}"><meta property="og:type" content="website"><meta property="og:site_name" content="OCP Market"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${escapeHtml(share)}"><meta property="og:image" content="${escapeHtml(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${title}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@ocp_protocol"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${escapeHtml(image)}"><meta name="twitter:image:alt" content="${title}"></head><body><h1>${title}</h1><p>${description}</p><a href="${escapeHtml(target)}">Open OCP Market</a><script>location.replace(${JSON.stringify(target).replace(/</g,'\\u003c')})</script></body></html>`;
}
let store:PaperStore|undefined;
async function loadMarket(id:string):Promise<ShareMarket|null>{
 store??=new PaperStore();const m=await store.getMarket(id);
 return m?projectPaperMarket(m,null,Date.now()):null;
}
export function createMarketShareHandler(load:(id:string)=>Promise<ShareMarket|null>=loadMarket){
 return async(req:IncomingMessage,res:ServerResponse)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'&&req.method!=='HEAD'){res.statusCode=405;res.setHeader('Allow','GET, HEAD');res.end('Method not allowed');return;}
  const url=new URL(req.url??'/','https://market.ocp-protocol.org'),id=url.searchParams.get('id');
  if(!id||!/^[a-zA-Z0-9_-]{1,200}$/.test(id)){res.statusCode=400;res.end('Invalid market');return;}
  try{
   const m=await load(id);
   if(!m){res.statusCode=404;res.end('Market not found');return;}
   const image=url.searchParams.get('image')==='1';
   res.setHeader('Content-Type',image?'image/png':'text/html; charset=utf-8');
   if(req.method==='HEAD'){res.setHeader('Cache-Control','public, max-age=60, s-maxage=300');res.end();return;}
   const body=image?Buffer.from(await new ImageResponse(React.createElement(MarketCard,{market:m,...await loadMarketBrand()}),{width:1200,height:630}).arrayBuffer()):marketShareHtml(m);
   res.setHeader('Cache-Control','public, max-age=60, s-maxage=300');res.end(body);
  }catch{
   // 不把数据库连接信息、内部错误或其他账户数据暴露给公开爬虫。
   res.statusCode=503;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end('Market preview temporarily unavailable');
  }
 };
}
export const marketShareHandler=createMarketShareHandler();
