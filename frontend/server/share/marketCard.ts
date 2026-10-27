import React from 'react';
import type {MarketShareSnapshot,ShareMarket} from '../../shared/marketShare.js';
export type {ShareMarket} from '../../shared/marketShare.js';
const phases={GENESIS:'Genesis',FORMAL:'Market open',WAIT_CORE:'Awaiting Core',SETTLED:'Settled',FAILED:'Not graduated'};
const percent=(n:number)=>`${Math.min(100,Math.max(0,Number.isFinite(n)?n:0)).toFixed(1)}%`;
const progress=(n:number|string,total:number|string)=>percent(Number(total)>0?Number(n)/Number(total)*100:0);
export function marketCardFacts(m:ShareMarket){
 if(m.phase==='SETTLED')return [{label:'FINAL RESULT',value:m.result??'Pending',color:'#ea580c'}];
 if(m.phase==='FAILED')return [{label:'GENESIS ENDED',value:'Not graduated · Refunds available',color:'#64748b'}];
 if(m.phase==='GENESIS')return [{label:'R TARGET',value:progress(m.R,m.rTarget),color:'#ea580c'},{label:'B TARGET',value:progress(m.B,m.bTarget),color:'#7c3aed'}];
 return [{label:'YES',value:percent(m.yesPrice*100),color:'#15803d'},{label:'NO',value:percent(m.noPrice*100),color:'#b91c1c'}];
}
export function marketDescription(m:ShareMarket){return `${m.assetSymbol} · ${phases[m.phase]??m.phase} · ${marketCardFacts(m).map(x=>`${x.label}: ${x.value}`).join(' · ')} · Virtual funds only`;}
const h=React.createElement;
const utc=(seconds:number)=>new Date(seconds*1000).toISOString().replace('T',' ').replace('.000Z',' UTC');
const signed=(value:number)=>`${value>0?'+':''}${value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export function MarketCard({market:m,logoUrl,wordmarkUrl,snapshot}:{market:ShareMarket;logoUrl:string;wordmarkUrl:string;snapshot?:MarketShareSnapshot}){
 const dark=snapshot?.theme==='dark';
 const palette=dark?{bg:'#0d0f12',card:'#17191f',text:'#f1f5f9',muted:'#9ba3b1',line:'#2b2f36',accent:'#ff9454',pill:'#332116',up:'#4ade80',down:'#fb7185'}:{bg:'#f8fafc',card:'#ffffff',text:'#0f172a',muted:'#64748b',line:'#e2e8f0',accent:'#ea580c',pill:'#fff7ed',up:'#15803d',down:'#b91c1c'};
 const title=Array.from(m.title),longCjk=title.length>80&&/[\u3400-\u9fff]/.test(m.title),displayTitle=title.length>125?title.slice(0,124).join('')+'…':m.title;
 const facts=snapshot?.prices.length?snapshot.prices.map(p=>({...p,color:palette.text})):marketCardFacts(m).map(p=>({...p,change:null,positive:null}));
 const pnl=snapshot?.pnl;
 const pnlColor=pnl&&pnl.low>=0?palette.up:pnl&&pnl.high<0?palette.down:palette.text;
 return h('div',{style:{width:'100%',height:'100%',display:'flex',flexDirection:'column',background:palette.bg,color:palette.text,padding:snapshot?'28px 44px':'42px 52px',fontFamily:'sans-serif',borderTop:'8px solid #f97316'}},
  h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',height:54,flexShrink:0}},
   h('div',{style:{display:'flex',alignItems:'center',gap:14}},h('img',{src:logoUrl,width:50,height:50,alt:'OCP',style:{borderRadius:10}}),h('img',{src:wordmarkUrl,width:112,height:48,alt:'OCP'}),h('span',{style:{fontSize:23,marginLeft:6}},'Ticker. Topic. Trade.')),
   h('span',{style:{fontSize:20,color:palette.accent,background:palette.pill,padding:'10px 18px',borderRadius:28}},`${m.assetSymbol} · ${phases[m.phase]??m.phase}`)),
  h('div',{style:{display:'flex',fontSize:longCjk?26:title.length>80?32:40,fontWeight:700,lineHeight:1.24,marginTop:snapshot?20:34,height:snapshot?134:174,flexShrink:0,overflow:'hidden',wordBreak:'break-word'}},displayTitle),
  h('div',{style:{display:'flex',gap:16,marginTop:snapshot?8:16,flexShrink:0}},facts.map(f=>h('div',{key:f.label,style:{display:'flex',flexDirection:'column',flex:1,minWidth:0,background:palette.card,border:`1px solid ${palette.line}`,borderRadius:16,padding:snapshot?'12px 18px':'20px 24px',height:snapshot?92:120,overflow:'hidden'}},
   h('span',{style:{fontSize:14,color:palette.muted,letterSpacing:1}},f.label),
   h('div',{style:{display:'flex',alignItems:'baseline',gap:12,marginTop:6}},h('span',{style:{fontSize:m.phase==='FAILED'?26:snapshot?30:42,fontWeight:700,color:dark?palette.text:f.color}},f.value),f.change!==null?h('span',{style:{fontSize:18,color:f.positive===true?palette.up:f.positive===false?palette.down:palette.muted}},f.change):null)))),
  pnl?h('div',{style:{display:'flex',flexDirection:'column',marginTop:12,padding:'10px 18px',background:palette.card,border:`1px solid ${palette.line}`,borderRadius:14,flexShrink:0}},
   h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:14}},h('span',{style:{fontSize:16,color:palette.muted}},pnl.label),h('span',{style:{fontSize:26,fontWeight:700,color:pnlColor}},`${signed(pnl.low)}${pnl.low===pnl.high?'':` to ${signed(pnl.high)}`} virtual USD`)),
   h('span',{style:{fontSize:13,color:palette.muted,marginTop:5,lineHeight:1.25}},pnl.note)):null,
  snapshot?h('div',{style:{display:'flex',flexDirection:'column',gap:5,marginTop:12,fontSize:13,color:palette.muted,lineHeight:1.25,flexShrink:0}},
   h('span',null,snapshot.priceNote),
   h('span',null,`Comparison from: ${snapshot.priceSince===null?'Not available':utc(snapshot.priceSince)}`),
   h('span',null,`Snapshot: ${utc(snapshot.at)} · Virtual funds only`)):
   h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:18,color:palette.muted,marginTop:22}},h('span',null,`${m.participants} players · ${Number(m.volumeUSD).toLocaleString('en-US',{maximumFractionDigits:0})} virtual USD traded`),h('span',null,'Snapshot · Virtual funds only')),
  h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'auto',paddingTop:snapshot?12:18,borderTop:`1px solid ${palette.line}`,flexShrink:0}},h('span',{style:{fontSize:18,color:palette.accent,fontWeight:700}},'OCP Market'),h('span',{style:{fontSize:17}},'market.ocp-protocol.org')));
}
