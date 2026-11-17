import type {ChainPriceHistory} from './priceHistory';
export type FormalPricePoint={at:number;yes:number;no:number};
const WAD=10n**18n;
/** Approximate chart replay of TopicMarketMath.priceYes, never an executable quote.
 * Integer WAD ratio truncation and 60-depth saturation match the contract;
 * floating-point exp approximates its fixed-point exponential for display.
 */
export function buildFormalPriceHistory(history:ChainPriceHistory,stockDecimals:number):FormalPricePoint[]{
 if(!Number.isInteger(stockDecimals)||stockDecimals<0||stockDecimals>18)return [];
 const events=[...history.events].sort((a,b)=>a.blockNumber-b.blockNumber||a.logIndex-b.logIndex);
 const points:FormalPricePoint[]=[];
 let depth:bigint|undefined,difference=0n;
 for(const event of events){
  if(event.kind==='GRADUATE'){
   if(depth!==undefined||event.amount===undefined||event.amount<=0n)return [];
   depth=event.amount*10n**BigInt(18-stockDecimals);
  }else if(event.kind==='FORMAL_BUY'||event.kind==='FORMAL_SELL'){
   if(depth===undefined||event.quantity===undefined||event.quantity<=0n||typeof event.isYes!=='boolean')return [];
   difference+=event.quantity*(event.isYes?1n:-1n)*(event.kind==='FORMAL_BUY'?1n:-1n);
  }else if(event.kind==='REDEEM_PAIRS'){
   if(depth===undefined)return [];
   // Equal burns of both supplies leave their difference and price unchanged.
  }else continue;
  if(!Number.isSafeInteger(event.at))return [];
  const absolute=difference<0n?-difference:difference;
  let yes:number;
  if(absolute>=60n*depth!)yes=difference>0n?1:0;
  else{
   const ratio=Number(absolute*WAD/depth!)/1e18;
   const expNegative=Math.exp(-ratio);
   const small=expNegative/(1+expNegative);
   yes=difference>=0n?1-small:small;
  }
  points.push({at:event.at,yes,no:1-yes});
 }
 return points;
}
