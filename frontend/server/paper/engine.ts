import {
 topicMarketCreate,topicMarketAdvanceTime,topicMarketFinalize,topicMarketAssertLedger,topicMarketPrices,topicMarketClaimPreview,
 topicMarketBuy,topicMarketSell,topicMarketFormalBuyBudget,topicMarketFormalSell,topicMarketCoreStake,topicMarketClaim,topicMarketClaimCore,topicMarketClaimFees,
 topicMarketFormalBuy,topicMarketQuoteFormalBuy,topicMarketRedeemPairs,topicMarketQuoteBuy,topicMarketQuoteSell,topicMarketQuoteFormalBuyBudget,topicMarketQuoteFormalSell,
 type TopicMarketState,type TopicMarketAccount,type TopicMarketTradeQuote,
} from '../../components/topicMarketDemoModel.js';
import {createStockDemo,STOCK_DEMO_ASSETS} from '../../components/stockDemoRouting.js';
import {PAPER_GTOKEN_SCALE,type StoredPaperMarket,type PaperCreateInput,type PaperAction,type PaperMarket,type PaperQuote} from '../../shared/paperTypes.js';

/** Paper-only floating asset ledger; global USD is exact integer microdollars. */
export function parseUSD(value:string):bigint {
 if(typeof value!=='string'||! /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value)||value.length>24)throw new Error('USD_AMOUNT');
 const [whole,part='']=value.split('.');const amount=BigInt(whole)*1000000n+BigInt(part.padEnd(6,'0'));
 if(amount>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('USD_RANGE');return amount;
}
export function formatUSD(value:bigint):string {
 const sign=value<0n?'-':'';const abs=value<0n?-value:value;
 return `${sign}${abs/1000000n}.${(abs%1000000n).toString().padStart(6,'0')}`;
}
const numberString=(value:number)=>{if(!Number.isFinite(value))throw new Error('NUMERIC');return Math.max(0,value).toFixed(10).replace(/\.?0+$/,'')||'0';};
const quantity=(value:string)=>{if(typeof value!=='string'||! /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value))throw new Error('QUANTITY');const n=Number(value);if(!Number.isFinite(n)||n<=0||n>1e15)throw new Error('QUANTITY');return n;};
const dollars=(value:number)=>{if(!Number.isFinite(value))throw new Error('NUMERIC');return Math.max(0,value).toFixed(6);};
function emptyAccount():TopicMarketAccount {return {name:'Player',wallet:0,g:0,lp:0,z:0,yes:0,no:0,coreSide:null,coreStake:0,coreRewards:[0,0,0],claimed:false,coreClaimed:false,paid:0,received:0};}
function actor(m:StoredPaperMarket,userId:string):number {
 if(!userId)throw new Error('AUTH_REQUIRED');let id=m.users.indexOf(userId);
 if(id<0){id=m.users.length;m.users.push(userId);m.state.accounts.push(emptyAccount());if(m.state.phase==='SETTLED')m.state.corePayouts.push(0);}
 return id;
}
function timestamp(now:number):number {if(!Number.isSafeInteger(now)||now<0)throw new Error('TIME');return now;}
function history(m:StoredPaperMarket){const p=topicMarketPrices(m.state),last=m.history.at(-1);const point={at:m.createdAt+m.state.now,genesisPriceUSD:(m.state.phase==='FAILED'?2*m.state.k*m.state.failedSupply:p.genesis)*m.assetPriceUSD/PAPER_GTOKEN_SCALE,yesPrice:p.probability?.[0]??null};if(!last||last.genesisPriceUSD!==point.genesisPriceUSD||last.yesPrice!==point.yesPrice)m.history.push(point);if(m.history.length>500)m.history.splice(0,m.history.length-500);}
export function createPaperMarket(id:string,creatorId:string,input:PaperCreateInput,nowMs:number):StoredPaperMarket {
 timestamp(nowMs);if(!id||!creatorId)throw new Error('IDENTITY');
 for(const [value,max] of [[input.title,512],[input.yesRule,2048],[input.noRule,2048],[input.invalidRule,2048]] as const){if(typeof value!=='string'||!value.trim()||new TextEncoder().encode(value).length>max)throw new Error('METADATA');}
 const asset=STOCK_DEMO_ASSETS.find(a=>a.symbol===input.assetSymbol);if(!asset)throw new Error('ASSET');
 // 创建只接受最终截止；存量市场仍沿用已保存的截止节点。
 if(['formalHours','topicHours','TF','TT'].some(key=>Object.hasOwn(input,key)))throw new Error('TIME');
 const TC=input.coreHours*3600;
 if(typeof input.coreHours!=='number'||!Number.isSafeInteger(TC)||TC<=14400||!Number.isSafeInteger(Math.floor(nowMs/1000)+TC))throw new Error('TIME');
 const s=createStockDemo(asset.price,2000,150,{TC});s.accounts=[];s.initialCapital=0;s.config={creatorAccount:0,protocolAccount:-1,depthPolicy:"GRADUATION_CAPITAL"};s.accounts.push(emptyAccount());
 const m:StoredPaperMarket={id,creatorId,title:input.title.trim(),yesRule:input.yesRule.trim(),noRule:input.noRule.trim(),invalidRule:input.invalidRule.trim(),assetSymbol:asset.symbol,assetPriceUSD:asset.price,createdAt:Math.floor(nowMs/1000),revision:0,users:[creatorId],state:topicMarketCreate(s),history:[]};history(m);return m;
}
/** 仅用于已获授权的存量模拟市场迁移；修订号变化使旧报价失效，资产/持仓不变。 */
export function upgradePaperDepth(market:StoredPaperMarket):StoredPaperMarket {
 const m=structuredClone(market),s=m.state;
 if(!['FORMAL','WAIT_CORE'].includes(s.phase)||!(s.M0>0)||s.config.depthPolicy==='GRADUATION_CAPITAL')return m;
 const old=s.b,before=topicMarketPrices(s).probability?.[0];s.b=s.M0;s.config.depthPolicy='GRADUATION_CAPITAL';m.revision++;
 s.events.push({id:(s.events.at(-1)?.id??0)+1,at:s.now,kind:'DEPTH_UPDATED',detail:`b ${old} → ${s.b}; YES ${before} → ${topicMarketPrices(s).probability?.[0]}`});
 topicMarketAssertLedger(s);history(m);return m;
}
export function advancePaperMarket(market:StoredPaperMarket,nowMs:number):StoredPaperMarket {
 const m=structuredClone(market);if(m.state.phase==='GENESIS')m.state.config.depthPolicy="GRADUATION_CAPITAL";const now=Math.max(m.state.now,Math.floor(timestamp(nowMs)/1000)-m.createdAt);
 const phase=m.state.phase;m.state=topicMarketAdvanceTime(m.state,now);
 if(['FORMAL','WAIT_CORE'].includes(m.state.phase)&&m.state.now>=m.state.TC)m.state=topicMarketFinalize(m.state);
 if(phase!==m.state.phase)m.revision++;
 history(m);return m;
}
function budgetC(action:PaperAction,price:number):number {if(!('budgetUSD' in action))return 0;const n=parseUSD(action.budgetUSD);if(n<=0n)throw new Error('AMOUNT');return Number(n)/1000000/price;}
function execute(m:StoredPaperMarket,id:number,action:PaperAction):void {
 const s=m.state;const budget=budgetC(action,m.assetPriceUSD);
 switch(action.type){
 case 'GENESIS_BUY':m.state=topicMarketBuy(s,id,budget);break;
 case 'GENESIS_SELL':m.state=topicMarketSell(s,id,quantity(action.quantity)/PAPER_GTOKEN_SCALE);break;
 case 'FORMAL_BUY':m.state=topicMarketFormalBuyBudget(s,id,action.side,budget);break;
 case 'FORMAL_BUY_SHARES':m.state=topicMarketFormalBuy(s,id,action.side,quantity(action.quantity));break;
 case 'REDEEM_PAIRS':m.state=topicMarketRedeemPairs(s,id,quantity(action.quantity));break;
 case 'FORMAL_SELL':m.state=topicMarketFormalSell(s,id,action.side,quantity(action.quantity));break;
 case 'CORE_STAKE':m.state=topicMarketCoreStake(s,id,action.side,budget);break;
 case 'CLAIM_MARKET':m.state=topicMarketClaim(s,id);break;
 case 'CLAIM_CORE':m.state=topicMarketClaimCore(s,id);break;
 case 'CLAIM_CREATOR_FEES':if(m.users[id]!==m.creatorId)throw new Error('FEE_OWNER');m.state=topicMarketClaimFees(s,'CREATOR',id);break;
 default:throw new Error('ACTION');
 }
}
/** Conservative float->USD conversion: round strictly down before the integer floor.
 * Any fractional microdollar stays as the user's C wallet dust, never discarded or minted. */
function withdrawMicros(value:number):bigint {
 if(!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER)throw new Error('USD_RANGE');
 return BigInt(Math.max(0,Math.floor(value-Math.max(Math.abs(value)*Number.EPSILON*4,1e-8))));
}
export function applyPaperAction(market:StoredPaperMarket,userId:string,walletMicros:bigint,action:PaperAction,nowMs:number):{market:StoredPaperMarket;walletMicros:bigint} {
 if(walletMicros<0n||walletMicros>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('BALANCE');
 const m=advancePaperMarket(market,nowMs),id=actor(m,userId),credit=Number(walletMicros)/1000000/m.assetPriceUSD;
 m.state.accounts[id].wallet+=credit;m.state.initialCapital=(m.state.initialCapital??0)+credit;
 execute(m,id,action);
 const wallet=withdrawMicros(m.state.accounts[id].wallet*m.assetPriceUSD*1000000);
 const extracted=Number(wallet)/1000000/m.assetPriceUSD;
 m.state.accounts[id].wallet-=extracted;m.state.initialCapital=(m.state.initialCapital??0)-extracted;
 topicMarketAssertLedger(m.state);m.revision++;history(m);return {market:m,walletMicros:wallet};
}
export function quotePaperAction(market:StoredPaperMarket,userId:string,action:PaperAction,nowMs:number):PaperQuote {
 const m=advancePaperMarket(market,nowMs),id=actor(m,userId),s=m.state,price=m.assetPriceUSD;
 let q:TopicMarketTradeQuote|undefined;
 switch(action.type){
 case 'GENESIS_BUY':if(s.phase!=='GENESIS')throw new Error('GENESIS_CLOSED');q=topicMarketQuoteBuy(s,budgetC(action,price));break;
 case 'GENESIS_SELL':if(s.phase!=='GENESIS')throw new Error('GENESIS_CLOSED');if(quantity(action.quantity)/PAPER_GTOKEN_SCALE>s.accounts[id].g)throw new Error('HOLDINGS');q=topicMarketQuoteSell(s,quantity(action.quantity)/PAPER_GTOKEN_SCALE);break;
 case 'FORMAL_BUY':if(s.phase!=='FORMAL')throw new Error('FORMAL_CLOSED');q=topicMarketQuoteFormalBuyBudget(s,action.side,budgetC(action,price));break;
 case 'FORMAL_BUY_SHARES':if(s.phase!=='FORMAL')throw new Error('FORMAL_CLOSED');q=topicMarketQuoteFormalBuy(s,action.side,quantity(action.quantity));break;
 case 'FORMAL_SELL':if(s.phase!=='FORMAL')throw new Error('FORMAL_CLOSED');if(quantity(action.quantity)>(action.side==='YES'?s.accounts[id].yes:s.accounts[id].no))throw new Error('HOLDINGS');q=topicMarketQuoteFormalSell(s,action.side,quantity(action.quantity));break;
 default:{const temp=structuredClone(m);temp.state.accounts[id].wallet+=budgetC(action,price);temp.state.initialCapital=(temp.state.initialCapital??0)+budgetC(action,price);const before=temp.state.accounts[id].wallet;execute(temp,id,action);const delta=temp.state.accounts[id].wallet-before;return {revision:m.revision,expiresAt:Math.floor(nowMs/1000)+15,payUSD:dollars(-delta*price),receiveUSD:dollars(delta*price),quantity:'0',feeUSD:'0.000000',BContributionUSD:'0.000000',wouldGraduate:false};}
 }
 const buy=action.type==='GENESIS_BUY'||action.type==='FORMAL_BUY'||action.type==='FORMAL_BUY_SHARES';
 return {detail:q,revision:m.revision,expiresAt:Math.floor(nowMs/1000)+15,payUSD:dollars(buy?q.gross*price:0),receiveUSD:dollars(buy?0:q.net*price),quantity:numberString(q.quantity*(action.type.startsWith('GENESIS')?PAPER_GTOKEN_SCALE:1)),feeUSD:dollars((q.creatorFee+q.lpFee+q.coreFee+q.protocolFee+q.fees.B)*price),BContributionUSD:dollars(q.contribution*price),wouldGraduate:q.wouldGraduate};
}
export function projectPaperMarket(market:StoredPaperMarket,userId:string|null,nowMs:number):PaperMarket {
 const m=advancePaperMarket(market,nowMs),s=m.state,p=topicMarketPrices(s),id=userId?m.users.indexOf(userId):-1,a=id>=0?s.accounts[id]:null;
 const claim=id>=0?topicMarketClaimPreview(s,id):null;
 const position=a?{gToken:numberString(a.g*PAPER_GTOKEN_SCALE),yes:numberString(a.yes),no:numberString(a.no),lp:numberString(a.lp),B:numberString(a.z),coreSide:a.coreSide,coreStake:numberString(a.coreStake),claimMarketUSD:dollars((claim?.total??0)*m.assetPriceUSD),claimCoreUSD:dollars(s.phase==='SETTLED'&&!a.coreClaimed?(s.corePayouts[id]??0)*m.assetPriceUSD:0),creatorFeesUSD:dollars(userId===m.creatorId?s.creatorFees*m.assetPriceUSD:0)}:null;
 const genesisCost=s.events.filter(e=>e.actor===id).reduce((v,e)=>{if(e.kind==='GENESIS_BUY')return {qty:v.qty+(e.quantity??0),cost:v.cost+(e.amount??0)*.955};if(e.kind==='GENESIS_SELL'){const fraction=v.qty>0?Math.max(0,1-(e.quantity??0)/v.qty):0;return {qty:Math.max(0,v.qty-(e.quantity??0)),cost:v.cost*fraction}}return v},{qty:0,cost:0});
 const presentation={config:{creatorAccount:-1,protocolAccount:-1,depthPolicy:s.config.depthPolicy},TG:s.TG,TF:s.TF,TC:s.TC,TT:s.TT,Q:s.Q,k:s.k,S:s.S,M0:s.M0,cash:s.cash,lpFees:s.lpFees,basis:s.basis,b:s.b,lpSupply:s.lpSupply,inventory:s.inventory,liquidityClosed:s.liquidityClosed,lpBudget:s.lpBudget,bBudget:s.bBudget,failedSupply:s.failedSupply,
 // 仅公开聚合状态及请求者自己的账户，绝不序列化其他玩家账户或身份。
 own:a?{...a,name:'Player',wallet:0}:null,claim,corePayout:id>=0?s.corePayouts[id]??0:0,coreFees:s.core.feeTotal,genesisPnl:a&&s.phase==='GENESIS'?(a.g>0?topicMarketQuoteSell(s,a.g).net:0)-genesisCost.cost:0,
 outstanding:[s.accounts.reduce((n,a)=>n+a.yes,0),s.accounts.reduce((n,a)=>n+a.no,0)] as [number,number],
 lpBEstimates:(['YES','NO','INVALID'] as const).map(outcome=>{const inventory=outcome==='YES'?s.inventory[0]:outcome==='NO'?s.inventory[1]:(s.inventory[0]+s.inventory[1])/2;const nav=s.cash+s.lpFees+inventory,cover=Math.min(s.B,Math.max(s.basis-nav,0)),totalB=s.accounts.reduce((v,x)=>v+x.z,0);return {outcome,lp:a&&s.lpSupply>0?(nav+cover)*a.lp/s.lpSupply:0,B:a&&totalB>0?(s.B-cover)*a.z/totalB:0}})};
 return {presentation,id:m.id,title:m.title,yesRule:m.yesRule,noRule:m.noRule,invalidRule:m.invalidRule,assetSymbol:m.assetSymbol,assetPriceUSD:m.assetPriceUSD,createdAt:m.createdAt,serverNow:Math.floor(nowMs/1000),revision:m.revision,phase:s.phase,genesisDeadline:m.createdAt+s.TG,formalDeadline:m.createdAt+s.TF,coreDeadline:m.createdAt+s.TC,topicDeadline:m.createdAt+s.TT,R:numberString(s.R),B:numberString(s.B),rTarget:numberString(s.rTarget),bTarget:numberString(s.bTarget),genesisPriceUSD:(s.phase==='FAILED'?2*s.k*s.failedSupply:p.genesis)*m.assetPriceUSD/PAPER_GTOKEN_SCALE+'',yesPrice:p.probability?.[0]??.5,noPrice:p.probability?.[1]??.5,coreYes:numberString(s.core.yes),coreNo:numberString(s.core.no),coreInvalid:numberString(s.core.invalid),coreOpenedAt:s.core.openedAt===null?null:m.createdAt+s.core.openedAt,result:s.result,volumeUSD:dollars(s.formalVolume*m.assetPriceUSD),participants:m.users.length,events:s.events.map(e=>({at:m.createdAt+e.at,kind:e.kind,actor:e.actor===undefined?'':`Player ${e.actor+1}`,amount:dollars((e.amount??0)*m.assetPriceUSD),detail:e.detail??''})),history:m.history,position,isCreator:userId===m.creatorId};
}
