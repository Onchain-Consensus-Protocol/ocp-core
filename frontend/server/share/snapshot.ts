import {advancePaperMarket,projectPaperMarket} from '../paper/engine.js';
import {topicMarketQuoteSell,topicMarketClaimPreview} from '../../components/topicMarketDemoModel.js';
import type {StoredPaperMarket} from '../../shared/paperTypes.js';
import type {MarketShareSnapshot,ShareTheme,SharePrice,ShareMarket} from '../../shared/marketShare.js';

const price=(n:number)=>n>=.01?`$${n.toFixed(4)}`:`$${n.toPrecision(4)}`;
const signed=(n:number,suffix:string)=>`${n>=0?'+':''}${n.toFixed(2)}${suffix}`;
/** Only constructs display data from a server-owned copy. It never persists an advanced market. */
export function createShareSnapshot(stored:StoredPaperMarket,userId:string,theme:ShareTheme,nowMs:number,snapshotId:string):MarketShareSnapshot {
 const m=advancePaperMarket(stored,nowMs),view=projectPaperMarket(m,userId,nowMs),s=m.state;
 const id=m.users.indexOf(userId),a=id>=0?s.accounts[id]:null;
 const market:ShareMarket={id:m.id,title:m.title,assetSymbol:m.assetSymbol,phase:s.phase,result:s.result,R:view.R,B:view.B,rTarget:view.rTarget,bTarget:view.bTarget,yesPrice:view.yesPrice,noPrice:view.noPrice,volumeUSD:view.volumeUSD,participants:view.participants};
 const formal=s.core.openedAt!==null;
 const history=m.history.filter(p=>formal?p.yesPrice!==null&&p.at<=view.formalDeadline:p.yesPrice===null&&p.genesisPriceUSD>0);
 const first=history[0],last=history.at(-1);let prices:SharePrice[];
 if(formal){
  // Settled state may contain fallback 50/50. Use retained pre-close quotes instead.
  const current=s.phase==='SETTLED'?(last?.yesPrice??null):view.yesPrice,base=first?.yesPrice??null;
  prices=(['YES','NO'] as const).map((side,i)=>{const value=current===null?null:i===0?current:1-current,b=base===null?null:i===0?base:1-base,d=value===null||b===null?null:(value-b)*100;return {label:`${side} ${s.phase==='SETTLED'?'LAST QUOTE':'PRICE'}`,value:value===null?'Unavailable':`${(value*100).toFixed(2)}%`,change:d===null?null:signed(d,' pp'),positive:d===null?null:d>=0};});
 }else{
  const current=Number(view.genesisPriceUSD),base=first?.genesisPriceUSD??0,d=base>0?(current/base-1)*100:null;
  prices=[{label:s.phase==='FAILED'?'gTOKEN LAST PRICE':'gTOKEN PRICE',value:price(current),change:d===null?null:signed(d,'%'),positive:d===null?null:d>=0}];
 }
 const creator=m.creatorId===userId?s.creatorFees:0;
 let pnl:MarketShareSnapshot['pnl']=null;
 if(a){
  const net=a.received-a.paid,P=m.assetPriceUSD;
  if(s.phase==='SETTLED'||s.phase==='FAILED'){
   const value=(net+topicMarketClaimPreview(s,id).total+(s.phase==='SETTLED'&&!a.coreClaimed?(s.corePayouts[id]??0):0)+creator)*P;
   pnl={label:'MY TOTAL P&L',low:value,high:value,note:'Received + unclaimed payouts - all invested. Virtual USD.'};
  }else if(s.phase==='GENESIS'){
   // This is cash-out P&L, not total account NAV: locked B is explicitly excluded.
   const sale=a.g>0?topicMarketQuoteSell(s,a.g):null;
   const value=(net+(sale?.net??0)+creator+(m.creatorId===userId?(sale?.creatorFee??0):0))*P;
   pnl={label:'MY EXIT P&L (EST.)',low:value,high:value,note:'Net gToken sale + receipts/claimable creator fees - all invested. Locked B excluded.'};
  }else{
   const scenarios=view.presentation!.lpBEstimates.map((r,i)=>{
    const shares=r.outcome==='YES'?a.yes:r.outcome==='NO'?a.no:(a.yes+a.no)/2;
    const stake=r.outcome==='INVALID'?a.coreStake:a.coreSide===r.outcome?s.core.cash*a.coreStake/(r.outcome==='YES'?s.core.yes:s.core.no):0;
    return (net+shares+r.lp+r.B+stake+a.coreRewards[i]+creator)*P;
   });
   pnl={label:'MY SETTLEMENT P&L (EST.)',low:Math.min(...scenarios),high:Math.max(...scenarios),note:'YES / NO / INVALID at current positions. Future trades/stakes excluded; not withdrawable.'};
  }
 }
 return {id:snapshotId,market,theme,at:Math.floor(nowMs/1000),revision:m.revision,prices,priceSince:first?.at??null,priceNote:s.phase==='FAILED'?'Trading stopped: not graduated.':s.phase==='SETTLED'?`Settled: ${s.result}. Prices are last retained trading quotes.`:'Change from earliest retained price record, not necessarily 24h.',pnl};
}
