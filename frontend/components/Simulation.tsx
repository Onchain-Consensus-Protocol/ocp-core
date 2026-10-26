import {FinalDeadlineInput} from './FinalDeadlineInput';
import {defaultDeadlineLocal,parseLocalDeadline,validDeadlineTimestamp} from '../shared/deadlineDate';
import {STOCK_DEMO_ASSETS,createStockDemo,routeStockDemo} from './stockDemoRouting';
import React,{useEffect,useState} from 'react';
import {ArrowLeftRight,ShieldAlert,LayoutDashboard,Zap} from 'lucide-react';
import {Button} from './Button';
import {GenesisPriceChart} from './GenesisPriceChart';
import {genesisTokens,genesisShares,genesisPrice} from './genesisDisplay';
import type {Language} from '../types';
import {createTopicMarketDemo,topicMarketCreate,topicMarketBuy,topicMarketSell,topicMarketFormalBuyBudget,topicMarketFormalBuy,topicMarketFormalSell,topicMarketQuoteBuy,topicMarketQuoteSell,topicMarketQuoteFormalBuyBudget,topicMarketQuoteFormalBuy,topicMarketQuoteFormalSell,topicMarketCoreStake,topicMarketAdvanceTime,topicMarketFinalize,topicMarketClaim,topicMarketClaimCore,topicMarketClaimPreview,topicMarketRedeemPairs,topicMarketPrices,type TopicMarketState,type TopicMarketTradeQuote,type Side,type Outcome} from './topicMarketDemoModel';
export interface RemoteSimulation {
 input:{tab:'MARKET'|'PROTOCOL';mode:'BUY'|'SELL';amount:number;useStable:boolean};state:TopicMarketState;assetSymbol:string;balanceUSD:number;topic:{title:string;YES:string;NO:string;INVALID:string};pending:boolean;
 prices:{genesis:number;probability:[number,number]|null};preview:ReturnType<typeof topicMarketClaimPreview>;
 genesisPnl:number;lpBEstimates:{outcome:Outcome;lp:number;B:number}[];outstanding:[number,number];
 chart:{price:number;at:number;kind:string}[];
 onInput:(input:{tab:'MARKET'|'PROTOCOL';mode:'BUY'|'SELL';amount:number;useStable:boolean})=>void;
 quote:(side:Side|'G'|'INVALID')=>TopicMarketTradeQuote|null;trade:(side:Side|'G')=>void;stake:(side:Outcome)=>void;
 canStake:(side:Outcome)=>boolean;claimMarket:()=>void;claimCore:()=>void;redeemPairs:(amount:number)=>void;
}
interface Props{remote?:RemoteSimulation;lang:Language;isWalletConnected:boolean;balance:number;setBalance:(n:number)=>void;connectWallet:()=>void}
const num=(v:number,d=2)=>v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const clock=(v:number)=>{const n=Math.max(0,Math.floor(v));return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(x=>String(x).padStart(2,'0')).join(':')};
const box='rounded-xl border border-border p-4';
const small='rounded-lg border border-border px-3 py-2 text-xs hover:bg-accent/5 disabled:opacity-40';
const feeRecipients={creatorAccount:-1,protocolAccount:-1};
export const Simulation:React.FC<Props>=({lang,setBalance,isWalletConnected,connectWallet,remote})=>{
 const zh=lang==='zh';
 const [assetIndex,setAssetIndex]=useState(0),[useStable,setUseStable]=useState(true),[localStableWallets,setStableWallets]=useState([5000,5000,5000]);
 const stableWallets=remote?[remote.balanceUSD]:localStableWallets;
 const asset=remote?STOCK_DEMO_ASSETS.find(a=>a.symbol===remote.assetSymbol)!:STOCK_DEMO_ASSETS[assetIndex];
 const t=(cn:string,en:string)=>(zh?cn:en).replaceAll('dUSDC',asset.symbol);
 const [localState,setS]=useState<TopicMarketState>(()=>createStockDemo(STOCK_DEMO_ASSETS[0].price));
 const s=remote?.state??localState;
 const [localTopic,setTopic]=useState({title:'',YES:'',NO:'',INVALID:''});
 const topic=remote?.topic??localTopic;
 const topicRules=<div className="space-y-2">{(['YES','NO','INVALID'] as const).map(side=><div key={side} className="flex items-start gap-2"><strong className="shrink-0">{side}:</strong><span className="min-w-0 whitespace-pre-wrap break-words">{topic[side]}</span></div>)}</div>;
 const [id,setId]=useState(0),[tab,setTab]=useState<'MARKET'|'PROTOCOL'>('MARKET'),[mode,setMode]=useState<'BUY'|'SELL'>('BUY');
 const [amount,setAmount]=useState(10),[running,setRunning]=useState(false),[notice,setNotice]=useState('');
 const [snapshot,setSnapshot]=useState(2000),[depth,setDepth]=useState(150);
 const [pairs,setPairs]=useState(1);
 const [coreDateTime,setCoreDateTime]=useState(()=>defaultDeadlineLocal());
 const [createNow,setCreateNow]=useState(()=>Date.now());
 const coreDeadline=parseLocalDeadline(coreDateTime);
 const deadlinesValid=validDeadlineTimestamp(coreDeadline)&&coreDeadline-Math.floor(createNow/1000)>14400;
 useEffect(()=>{if(s.phase!=='CREATE')return;const timer=window.setInterval(()=>setCreateNow(Date.now()),1000);return()=>window.clearInterval(timer)},[s.phase]);
 const a=s.accounts[id],names=[t('账户1','Account 1'),t('账户2','Account 2'),t('账户3','Account 3')];
 const gen=s.phase==='GENESIS'&&s.now<s.TG,formal=s.phase==='FORMAL'&&s.now<s.TF,terminal=['SETTLED','FAILED'].includes(s.phase);
 const coreOpen=!remote?.pending&&s.core.openedAt!==null&&s.now<s.TC&&!terminal,ticking=!['CREATE','FAILED','SETTLED'].includes(s.phase)&&s.now<s.TC;
 const cut=gen?s.TG:s.now<s.TF?s.TF:s.TC,stage=gen?'Genesis':s.now<s.TF?'Formal':'Core';
 const phases={CREATE:t('待创建','Not created'),GENESIS:'Genesis',FORMAL:'Formal',WAIT_CORE:t('等待Core结果','Awaiting Core'),SETTLED:t('已结算','Settled'),FAILED:t('未毕业清算','Funding failed')};
 const px=remote?.prices??topicMarketPrices(s),preview=remote?.preview??topicMarketClaimPreview(s,id);
 const genesisCost=s.events.filter(e=>e.actor===id).reduce((v,e)=>{if(e.kind==='GENESIS_BUY')return {qty:v.qty+(e.quantity??0),cost:v.cost+(e.amount??0)*.955};if(e.kind==='GENESIS_SELL'){const fraction=v.qty>0?Math.max(0,1-(e.quantity??0)/v.qty):0;return {qty:Math.max(0,v.qty-(e.quantity??0)),cost:v.cost*fraction}}return v},{qty:0,cost:0});
 const genesisPnl=remote?.genesisPnl??((a.g>0&&gen?topicMarketQuoteSell(s,a.g).net:0)-genesisCost.cost);
 const lpBEstimates=remote?.lpBEstimates??(['YES','NO','INVALID'] as Outcome[]).map(outcome=>{const inventory=outcome==='YES'?s.inventory[0]:outcome==='NO'?s.inventory[1]:(s.inventory[0]+s.inventory[1])/2;const nav=s.cash+s.lpFees+inventory;const cover=Math.min(s.B,Math.max(s.basis-nav,0));const totalB=s.accounts.reduce((v,x)=>v+x.z,0);return {outcome,lp:s.lpSupply>0?(nav+cover)*a.lp/s.lpSupply:0,B:totalB>0?(s.B-cover)*a.z/totalB:0}});
 const lpBValuePanel=s.phase==='SETTLED'?<div className="mt-2 text-[10px]"><span>{t("可领取金额","Claimable")}</span><div>LP {num(preview.lp,4)} · B {num(preview.B,4)} {asset.symbol}</div></div>:['FORMAL','WAIT_CORE'].includes(s.phase)?<details className="mt-2 text-[10px]"><summary className="cursor-pointer">{t("LP／B 预计领取金额","Estimated LP / B payouts")}</summary><table className="w-full mt-2 text-right"><thead><tr><th className="text-left">{t("最终结果","Outcome")}</th><th>LP</th><th>B</th></tr></thead><tbody>{lpBEstimates.map(v=><tr key={v.outcome}><td className="text-left">{v.outcome}</td><td>{num(v.lp,4)}</td><td>{num(v.B,4)}</td></tr>)}</tbody></table><p className="mt-1">{t("单位 dUSDC。按当前资金状态估算，不含未来交易及费用；以最终结算为准。","In dUSDC. Current-state estimates exclude future trading and fees; final settlement determines payouts.")}</p></details>:null;
 const hasClaim=(s.phase==='FAILED'?a.g+a.z:a.lp+a.z+a.yes+a.no)>0;
 const errors:Record<string,string>={HOLDINGS:t('持仓不足，请检查数量。','Check holdings and amount.'),BALANCE:t('余额不足。','Insufficient balance.'),CLAIM:t('当前没有可领取权益。','No claim available.'),SIDE_LOCKED:t('Core方向已锁定，只能同侧追加。','Core side is locked.'),AMOUNT:t('请输入有效的正数。','Enter a positive amount.'),INVENTORY:t('可用结果库存不足，请减少买入。','Reduce the buy; inventory is limited.'),CORE_CLOSED:t('Core尚未开启或已经截止。','Core is not open.'),CASH:t('当前报价无法执行。','Quote cannot be executed.'),PHASE:t('当前阶段不可执行。','Unavailable in this phase.')};
 const act=(fn:(s:TopicMarketState)=>TopicMarketState,msg=t('操作成功。','Done.'))=>{try{const routed=routeStockDemo(s,stableWallets,id,asset.price,useStable&&s.phase!=='CREATE',fn);setS(routed.state);setStableWallets(routed.stable);setNotice(msg+(Math.abs(routed.deltaStable)>1e-8?' '+t('稳定币兑换：','Stablecoin swap: ')+num(routed.deltaStable,2)+' dUSDC':''));return true}catch(e){setNotice(errors[e instanceof Error?e.message:'']??t('请检查金额、持仓和阶段。','Check amount, holdings and stage.'));return false}};
 useEffect(()=>{if(!remote)setBalance(a.wallet*asset.price+stableWallets[id]);},[a.wallet,asset.price,stableWallets,id,setBalance]);
 useEffect(()=>{if(remote||!running||!ticking)return;const timer=window.setInterval(()=>setS(v=>topicMarketAdvanceTime(v,Math.min(v.TC,v.now+1))),1000);return()=>window.clearInterval(timer)},[running,ticking]);
 useEffect(()=>{if(!ticking)setRunning(false)},[ticking]);
 useEffect(()=>{remote?.onInput({tab,mode,amount,useStable});},[tab,mode,amount,useStable,remote?.onInput]);
 const reset=()=>{try{setS(createStockDemo(asset.price,snapshot,depth));setCoreDateTime(defaultDeadlineLocal());setCreateNow(Date.now());setStableWallets([5000,5000,5000]);setRunning(false);setNotice('');setId(0);setTab('MARKET');setMode('BUY');setAmount(10)}catch{setNotice(t('请检查创建参数。','Check creation parameters.'))}};
 const paymentAmount=useStable?amount/asset.price:amount;
 const spendable=useStable?stableWallets[id]/asset.price:a.wallet;
 const quote=(side:Side|'G'):TopicMarketTradeQuote|null=>{try{if(!(amount>0)||!Number.isFinite(amount))return null;if(remote){if(remote.pending||remote.input.tab!==tab||remote.input.mode!==mode||remote.input.amount!==amount||remote.input.useStable!==useStable)return null;const q=remote.quote(side);if(!q||mode==='BUY'&&q.gross>a.wallet||mode==='SELL'&&(gen?genesisShares(amount)>a.g:amount>(side==='YES'?a.yes:a.no)))return null;return q;}if(gen){if(mode==='BUY'&&paymentAmount>spendable||mode==='SELL'&&genesisShares(amount)>a.g)return null;return mode==='BUY'?topicMarketQuoteBuy(s,paymentAmount):topicMarketQuoteSell(s,genesisShares(amount))}if(!formal||side==='G')return null;if(mode==='BUY'){const q=topicMarketQuoteFormalBuy(s,side,amount);if(q.gross>spendable)return null;return q}if(amount>(side==='YES'?a.yes:a.no))return null;return topicMarketQuoteFormalSell(s,side,amount)}catch{return null}};
 const execute=(side:Side|'G')=>remote?remote.trade(side):act(v=>gen?(mode==='BUY'?topicMarketBuy(v,id,paymentAmount):topicMarketSell(v,id,genesisShares(amount))):mode==='BUY'?topicMarketFormalBuy(v,id,side as Side,amount):topicMarketFormalSell(v,id,side as Side,amount),t('交易完成。','Trade completed.'));
 const routePanel=<div className={box+' space-y-2 text-xs'} data-testid="stock-route-panel"><strong>{asset.symbol} {t('股票代币底池','stock-token pool')}</strong><label className="flex justify-between items-center gap-2">{t('支付／收款资产','Pay / receive')}<select aria-label="Payment asset" value={useStable?'STABLE':'STOCK'} onChange={e=>setUseStable(e.target.value==='STABLE')} className="border border-border rounded p-2 bg-white"><option value="STABLE">dUSDC</option><option value="STOCK">{asset.symbol}</option></select></label><div>{remote?<>{num(remote.balanceUSD)} {t("虚拟USD","virtual USD")} ≈ {num(a.wallet,6)} {asset.symbol}</>:<>{num(a.wallet,6)} {asset.symbol} · {num(stableWallets[id])} dUSDC</>}</div><p className="text-text-muted">{t('固定演示价：1','Fixed demo rate: 1')} {asset.symbol} = {asset.price} dUSDC</p><p className="text-text-muted">{t('仅模拟兑换，零兑换费、零滑点；不代表真实行情、资产可用性或兑换流动性。','Mock swaps only: zero swap fee/slippage; not live prices, asset availability or executable liquidity.')}</p>{useStable&&<p>{gen&&mode==='BUY'||tab==='PROTOCOL'?`${num(amount)} dUSDC → ${num(paymentAmount,6)} ${asset.symbol}`:t('按股票数量报价；卖出／领取净款兑换为稳定币。','Quotes use stock units; sale / claim proceeds convert to stablecoin.')}</p>}</div>;
 const Row=({label,value}:{label:string,value:React.ReactNode})=><div className="flex justify-between gap-3 py-1"><span className="text-text-muted">{label}</span><strong className="tabular-nums text-right break-words">{value}</strong></div>;
 const quotes=(gen?['G']:['YES','NO']) as (Side|'G')[];
 const stakeTotal=s.core.yes+s.core.no+s.core.invalid;

 type MarketSide=Side;type VaultSide=Outcome;
 const activeTab=tab,setActiveTab=setTab,tradeMode=mode,setTradeMode=setMode;
 const balance=a.wallet,userShares={YES:a.yes,NO:a.no},userStake=a.coreStake,userVaultSide=a.coreSide;
 const stakes={YES:s.core.yes,NO:s.core.no,INVALID:s.core.invalid},totalStake=stakeTotal;
 const phase=s.phase==='CREATE'?'CREATE':terminal?'FINALIZED':s.now>=s.TC?'READY':'STAKING';
 const finalOutcome=s.result,vaultClaimed=a.coreClaimed,marketRedeemed=!hasClaim;
 const corePending=activeTab==='PROTOCOL'&&s.core.openedAt===null;
 const phaseLabel=corePending?t(s.phase==='FAILED'?'Core未开启':'毕业后开启',s.phase==='FAILED'?'Core never opened':'Opens after graduation'):phases[s.phase],phaseBadgeClass='border-accent/50 text-accent bg-accent/10';
 const displayDeadline=activeTab==='PROTOCOL'?s.TC:(s.phase==='CREATE'||s.phase==='GENESIS'?s.TG:s.TF);
 const timeLeft=terminal||corePending?0:Math.max(0,displayDeadline-s.now);
 const yesPrice=px.probability?.[0]??(s.result==='YES'?1:s.result==='NO'?0:.5),noPrice=1-yesPrice;
 const yesStakePct=totalStake?stakes.YES/totalStake*100:0,noStakePct=totalStake?stakes.NO/totalStake*100:0,invalidStakePct=totalStake?stakes.INVALID/totalStake*100:0;
 const provisionalOutcome:Outcome=stakes.YES>totalStake/2?'YES':stakes.NO>totalStake/2?'NO':'INVALID';
 const leaders=(['YES','NO','INVALID'] as Outcome[]).filter(v=>stakes[v]===Math.max(...Object.values(stakes))),leaderSide=leaders.length===1?leaders[0]:null;
 const marketShares=remote?{YES:remote.outstanding[0],NO:remote.outstanding[1]}:{YES:s.accounts.reduce((n,a)=>n+a.yes,0),NO:s.accounts.reduce((n,a)=>n+a.no,0)};
 const totalVolume=s.formalVolume??0,vaultFees=s.core.feeTotal,feeRoi=totalStake?vaultFees/totalStake*100:0;
 const formatAmount=num,sideTextColor=(side:Outcome)=>side==='YES'?'text-success':side==='NO'?'text-danger':'text-yellow-700';
 const primaryActionTitle=corePending?t('Core未开启','Core not open'):terminal?t('领取结算资金','Claim settlement'):activeTab==='MARKET'?(gen?t('交易gToken','Trade gToken'):t('交易','Trade')):t('选择方向并质押','Choose a side and stake');
 const primaryActionDescription=corePending?t('等待Genesis毕业。','Waiting for Genesis graduation.'):activeTab==='MARKET'?t('输入数量，查看成交报价与价格影响。','Enter an amount to preview execution and price impact.'):t('选择方向后只能同侧追加，资金锁定至结算。','Once selected, add only to the same side until settlement.');
 const MIN_STAKE=0.01;
 const stake=(side:Outcome)=>{if(remote){if(remote.input.amount!==amount||remote.input.tab!==tab||remote.input.useStable!==useStable)return false;remote.stake(side);return true}if(paymentAmount<MIN_STAKE){setNotice(t('低于最小质押数量。','Below minimum stake.'));return false}return act(v=>topicMarketCoreStake(v,id,side,paymentAmount))};
 const trade=(side:Side)=>execute(gen?'G':side);
 const fastForward=()=>act(v=>topicMarketAdvanceTime(v,Math.min(v.TC,v.now+600)));
 const finalize=()=>act(topicMarketFinalize);
 const selectedFeePayout=s.result?a.coreRewards[s.result==='YES'?0:s.result==='NO'?1:2]:0;
 const vaultPayout=s.corePayouts[id]??0,marketPayout=preview.total;
 const withdrawVault=()=>remote?remote.claimCore():act(v=>topicMarketClaimCore(v,id));
 const redeemMarket=()=>remote?remote.claimMarket():act(v=>topicMarketClaim(v,id),t('对应LP／B已销毁，结算款已到账。','LP / B burned; payout received.'));
 const userConditionalFees={YES:a.coreRewards[0],NO:a.coreRewards[1],INVALID:a.coreRewards[2]};
 const quoteRows=(side:Side)=>{
  const q=quote(gen?'G':side),tokens=q?(gen?genesisTokens(q.quantity):q.quantity):0;
  const fee=q?q.creatorFee+q.protocolFee+q.lpFee+q.coreFee+(gen?0:q.B):0;
  const cash=q?(mode==='BUY'?q.gross:q.net):0;
  const before=side==='YES'?yesPrice:noPrice;
  const endDifference=(s.basis-s.inventory[0])-(s.basis-s.inventory[1])+(side==='YES'?1:-1)*(mode==='BUY'?1:-1)*(q?.quantity??0);
  const endYes=1/(1+Math.exp(-endDifference/s.b));const impact=gen?0:Math.abs((side==='YES'?endYes:1-endYes)-before)*100;
  return <div className="rounded-lg border border-border bg-white/60 px-2.5 py-2 text-[10px] font-mono"><div className={`mb-1.5 font-bold ${sideTextColor(side)}`}>{gen?'Genesis':side}</div><div className="space-y-1 text-text-muted"><Row label={t('平均成交价','Avg. price')} value={q?(gen?num(cash/tokens,10):num((mode==='BUY'?q.net:q.gross)/q.quantity,4)):'—'}/><Row label={gen?t('获得／卖出代币','Tokens'):t('价格影响','Price impact')} value={q?(gen?num(tokens):`${num(impact)}%`):'—'}/><Row label={t('手续费','Fee')} value={q?num(fee,4):'—'}/>{gen&&<Row label={t('做市风险准备金（4.5%）','Market-making risk reserve (4.5%)')} value={q?num(q.contribution,4):'—'}/>}<div className="border-t border-border pt-1"><Row label={mode==='BUY'?t('预计支付','Est. payment'):t('预计到账','Est. receipt')} value={q?`${num(cash,6)} ${asset.symbol}${useStable?' ≈ '+num(cash*asset.price)+' dUSDC':''}`:'—'}/></div><Row label={mode==='BUY'?t('最大支付（滑点上限1%）','Max payment (1% slippage)'):t('最低到账（滑点上限1%）','Min receipt (1% slippage)')} value={q?`${num(cash*(mode==='BUY'?1.01:.99),6)} ${asset.symbol}${useStable?' ≈ '+num(cash*(mode==='BUY'?1.01:.99)*asset.price)+' dUSDC':''}`:'—'}/>{gen&&q?.wouldGraduate&&<p className="text-accent mt-2">{t('本笔触发毕业，持仓转为LP；权益估值可能低于成本。','This trade graduates into LP; value may be below cost.')}</p>}</div></div>
 };
 const activityPanel=<details><summary className="cursor-pointer">{t('交易记录','Activity')}</summary><div className="mt-3 max-h-48 overflow-auto text-[11px] font-mono space-y-2">{[...s.events].reverse().filter(e=>!['CLAIM_FEES','CLAIM_CORE_OFFICIAL'].includes(e.kind)).map(e=><div key={e.id}>{clock(e.at)} · {({CREATE:t('创建市场','Created'),GENESIS_BUY:t('买入gToken','Bought gToken'),GENESIS_SELL:t('卖出gToken','Sold gToken'),GRADUATE:t('毕业','Graduated'),FORMAL_BUY:t('买入份额','Bought shares'),FORMAL_SELL:t('卖出份额','Sold shares'),CORE_STAKE:t('Core质押','Core stake'),FORMAL_CLOSE:t('市场交易截止','Trading closed'),SETTLE:t('结算','Settled'),FAIL:t('筹资未达标','Funding failed'),CLAIM_MARKET:t('领取市场结算款','Market payout'),CLAIM_CORE:t('领取Core结算款','Core payout'),BURN_LP:t('销毁LP并领取','LP redeemed'),BURN_B:t('销毁B并领取','B redeemed'),REDEEM_PAIRS:t('成对兑换','Pair redemption'),DEPTH_UPDATED:t('调整市场深度（赔率已重新计算）','Depth updated (odds recalculated)')} as Record<string,string>)[e.kind]??t('操作完成','Action completed')} {e.actor!==undefined?names[e.actor]:''} {e.amount!==undefined?`${num(e.amount,4)} ${asset.symbol}`:''}</div>)}</div></details>;
  if(s.phase==='CREATE')return <div className="max-w-xl mx-auto bg-white/80 border border-border rounded-2xl p-6 sm:p-8" data-testid="launch-market-card"><h2 className="text-xl font-display font-bold mb-5">{t('0成本发射你的市场','Launch your market at zero cost')}</h2><form className="space-y-4" onSubmit={e=>{e.preventDefault();const TC=parseLocalDeadline(coreDateTime)-Math.floor(Date.now()/1000);if(!Object.values(topic).every(v=>v.trim())||!deadlinesValid||TC<=14400)return;if(act(()=>topicMarketCreate(createStockDemo(asset.price,snapshot,depth,{TC})),t('已发射，Genesis倒计时开始。','Launched; Genesis countdown started.'))){setTopic(v=>({title:v.title.trim(),YES:v.YES.trim(),NO:v.NO.trim(),INVALID:v.INVALID.trim()}));setRunning(true);setTab('MARKET')}}}><label className="block text-sm">{t('底池股票代币','Pool stock token')}<select aria-label="Pool stock token" value={assetIndex} onChange={e=>{const i=Number(e.target.value);setAssetIndex(i);setS(createStockDemo(STOCK_DEMO_ASSETS[i].price));setStableWallets([5000,5000,5000])}} className="block w-full border border-border rounded-lg p-3 mt-2 bg-white">{STOCK_DEMO_ASSETS.map((v,i)=><option key={v.symbol} value={i}>{zh?v.name:v.en} · {v.symbol}</option>)}</select></label><p className="text-xs text-text-muted">{t('Robinhood Chain 模拟 · 全部为演示资产及固定价格；SpaceX仅为模拟占位，不代表真实代币已可用。','Robinhood Chain simulation · All assets and prices are illustrative; SpaceX is a mock placeholder, not a claim of token availability.')}</p><label className="block text-sm">{t('话题内容','Market question')}<textarea required maxLength={300} rows={2} value={topic.title} onChange={e=>setTopic(v=>({...v,title:e.target.value}))} placeholder={t('输入你想发射的市场话题','Enter your market question')} className="block w-full border border-border rounded-lg p-3 mt-2 bg-white"/></label>{(['YES','NO','INVALID'] as const).map(side=><label key={side} className="block text-sm">{side} {t('判定条件','resolution criteria')}<textarea required maxLength={1000} rows={2} value={topic[side]} onChange={e=>setTopic(v=>({...v,[side]:e.target.value}))} placeholder={t(side==='INVALID'?'什么情况下无法有效判定？':'什么情况下判定为 '+side+'？','When should the result be '+side+'?')} className="block w-full border border-border rounded-lg p-3 mt-2 bg-white"/></label>)}<FinalDeadlineInput lang={lang} value={coreDateTime} onChange={setCoreDateTime} now={Math.floor(createNow/1000)}/><p className="text-xs text-text-muted">{t('Genesis在最终截止前2小时截止，市场在最终截止前1小时停止交易；Core与话题同时截止。最终截止须晚于创建后4小时。','Genesis closes 2 hours before the final deadline. Market trading closes 1 hour before the final deadline; Core and the topic end together. The final deadline must be more than 4 hours after creation.')}</p>{!deadlinesValid&&<p role="alert" className="text-xs text-danger">{t('最终截止须晚于4小时。','The final deadline must be later than 4 hours.')}</p>}<Button type="submit" className="w-full" disabled={!Object.values(topic).every(v=>v.trim())||!deadlinesValid}>{t('发射市场，开始模拟','Launch market and start demo')}</Button><p className="text-xs text-text-muted">{t('本地模拟演示，不会发起链上交易。','Local simulation; no on-chain transactions.')}</p></form></div>;
  return (
    <div data-testid="homepage-lifecycle" className="vault-shell bg-white/80 border-y sm:border border-border sm:rounded-2xl shadow-sm sm:shadow-2xl flex flex-col md:flex-row max-w-6xl mx-auto md:min-h-[600px] overflow-hidden backdrop-blur-xl relative">
      <div className="absolute top-10 right-10 w-72 sm:w-96 h-72 sm:h-96 bg-accent/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="md:hidden w-full px-4 pt-5 pb-4 border-b border-border relative z-10 bg-gradient-to-b from-orange-50/70 to-transparent">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl leading-7 font-bold text-text tracking-tight font-display">
              {topic.title}
            </h2>
            <div className="mt-2 text-xs leading-5 text-text-muted font-mono">
              {topicRules}
            </div>
          </div>
          <span className={`inline-flex shrink-0 px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border font-mono ${phaseBadgeClass}`}>
            {phaseLabel}
          </span>
        </div>
        <div className="flex items-end justify-between rounded-xl border border-border bg-white/70 px-3.5 py-3 mt-3">
          <div className="text-[10px] text-text-muted font-mono uppercase tracking-wider">
            {zh ? "阶段剩余时间" : "Phase time left"}
          </div>
          <div className="w-[15ch] shrink-0 whitespace-nowrap text-right text-lg leading-none font-bold text-text tabular-nums font-display">
            {timeLeft > 0 ? `${Math.floor(timeLeft/3600)}h ${Math.floor(timeLeft/60)%60}m ${Math.floor(timeLeft)%60}s` : "—"}
          </div>
        </div>
      </div>

      <div className="px-4 py-5 sm:p-6 md:w-1/3 border-b md:border-b-0 md:border-r border-border bg-transparent flex flex-col gap-4 sm:gap-6 relative z-10">
        {!isWalletConnected && (
          <div className="bg-accent/10 border border-accent/30 rounded-lg px-3 py-2 text-xs font-mono text-accent flex items-center justify-between gap-3">
            <span>{remote?t("验证邮箱后即可交易。","Sign in with email to trade."):(zh ? "连接模拟钱包后执行操作。" : "Connect the demo wallet to act.")}</span>
            <Button onClick={connectWallet} variant="outline" size="sm" className="shrink-0 border-accent/40 text-accent">
              {remote?t("登录","Sign in"):(zh ? "连接" : "Connect")}
            </Button>
          </div>
        )}

        <div>
          <h3 className="text-lg font-display font-bold text-text mb-1 flex items-center gap-2 tracking-wide text-glow">
            {activeTab === "MARKET"
              ? <ArrowLeftRight className="text-purple-600 w-5 h-5" />
              : <LayoutDashboard className="text-accent w-5 h-5" />}
            {primaryActionTitle}
          </h3>
          <p className="text-text-muted text-xs font-mono">{primaryActionDescription}</p>
        </div>

        <div className="flex p-1 bg-transparent border border-border rounded-lg mb-2">
          <button
            type="button"
            onClick={() => setActiveTab("PROTOCOL")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-md transition-all font-display tracking-wider ${
              activeTab === "PROTOCOL"
                ? "bg-transparent text-text shadow-glow border border-accent"
                : "text-text-muted hover:text-text"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            {zh ? "OCP Core" : "OCP Core"}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("MARKET")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-md transition-all font-display tracking-wider ${
              activeTab === "MARKET"
                ? "bg-transparent text-text shadow-glow border border-purple-500"
                : "text-text-muted hover:text-text"
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            {zh ? "市场" : "Market"}
          </button>
        </div>

        {!remote&&<label className="flex justify-between items-center text-xs font-mono text-text-muted">{t("当前账户","Account")}<select aria-label={t("当前模拟账户","Demo account")} value={id} onChange={e=>{setId(Number(e.target.value));setNotice('')}} className="border border-border rounded-lg p-2 bg-white">{names.map((n,i)=><option key={n} value={i}>{n}</option>)}</select></label>}

        {routePanel}
        {corePending&&<div className={box+' text-sm text-text-muted'} data-testid="core-pending">{s.phase==='FAILED'?t('Genesis未毕业，Core未开启。','Genesis failed; Core did not open.'):t('Genesis毕业后，Core与正式市场同时开启。当前尚不能质押。','Core opens together with the market after Genesis graduates. Staking is not available yet.')}</div>}
        {!corePending && phase === "STAKING" && activeTab === "PROTOCOL" && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-transparent border border-border rounded-xl p-4 mb-2 text-xs text-text-muted">
              <h5 className="font-bold text-text flex items-center gap-1.5 mb-2 font-display">
                <ShieldAlert className="w-3.5 h-3.5 text-accent" />
                {zh ? "OCP Core" : "OCP Core"}
              </h5>
              <p className="leading-relaxed font-mono">
                {zh ? "质押资本决定最终结果。资金锁定至结算；市场交易不会改变结果。" : "Staked capital decides the result. Funds remain locked until settlement; market trades do not change it."}
              </p>
            </div>
            <div className="text-xs font-mono text-text-muted">
              {zh ? "可用余额" : "Available balance"}:{" "}
              <strong className="text-text">{num(useStable?stableWallets[id]:balance,6)} {useStable?'dUSDC':asset.symbol}</strong>
            </div>
            <div className="bg-transparent border border-border rounded-xl p-3 text-xs font-mono text-text-muted">
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2 text-text-muted font-display">
                {zh ? "我的质押" : "My Stake"}
              </div>
              {(["YES", "NO", "INVALID"] as VaultSide[]).map((side) => (
                <div key={side} className="flex justify-between mt-1">
                  <span className={sideTextColor(side)}>{side}</span>
                  <strong className="text-text">
                    {formatAmount(userVaultSide === side ? userStake : 0)} {asset.symbol}
                  </strong>
                </div>
              ))}
            </div>
            <label className="block">
              <span className="block text-xs font-bold text-text-muted uppercase tracking-widest mb-2 font-display">
                {zh ? '质押金额' : 'Stake amount'} ({useStable?'dUSDC':asset.symbol}){" "}
                <span className="font-mono normal-case">({zh ? "最小" : "Min"} {MIN_STAKE} {asset.symbol})</span>
              </span>
              <input
                type="number"
                min={useStable?MIN_STAKE*asset.price:MIN_STAKE}
                step="0.01"
                value={amount}
                aria-label={t("Core质押金额","Core stake amount")} onChange={(event) => setAmount(Number(event.target.value))}
                className="w-full bg-transparent border border-border rounded-lg px-3 py-3 text-text font-mono text-sm"
              />
            </label>
            <p className="text-[10px] leading-5 text-text-muted font-mono">
              {zh ? "YES、NO、INVALID 全程开放。选定方向后只能同侧追加，不能撤回或换边。" : "YES, NO and INVALID stay open until the deadline. Once selected, you may only add to that side."}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={() => stake("YES")} disabled={!coreOpen||!!remote&&!remote.canStake("YES")||Boolean(userVaultSide && userVaultSide !== "YES")} variant="success" className="w-full">
                {zh ? "质押 YES" : "Stake YES"}
              </Button>
              <Button onClick={() => stake("NO")} disabled={!coreOpen||!!remote&&!remote.canStake("NO")||Boolean(userVaultSide && userVaultSide !== "NO")} variant="danger" className="w-full">
                {zh ? "质押 NO" : "Stake NO"}
              </Button>
            </div>
            <Button onClick={() => stake("INVALID")} disabled={!coreOpen||!!remote&&!remote.canStake("INVALID")||Boolean(userVaultSide && userVaultSide !== "INVALID")} variant="secondary" className="w-full text-yellow-700">
              {zh ? "质押 INVALID" : "Stake INVALID"}
            </Button>
          </div>
        )}

        {(gen||formal) && activeTab === "MARKET" && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-transparent border border-border rounded-xl p-4">
              <div className="mb-4 flex items-start gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/30">
                  <Zap className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <h5 className="font-bold text-text text-sm font-display tracking-wide">
                    {zh ? "市场" : "Market"}
                  </h5>
                  <p className="text-xs text-text-muted mt-1 font-mono">
                    {gen?t("买卖gToken；双池达标后转为LP。","Trade gToken; holdings become LP at graduation."):t("连续报价YES／NO，LP资产留池做市。","YES / NO are continuously quoted while LP assets remain in the pool.")}
                  </p>
                </div>
              </div>
              <div className="flex bg-transparent border border-border rounded-lg p-1 mb-3">
                <button type="button" onClick={() => setTradeMode("BUY")} className={`flex-1 py-1.5 text-xs font-bold rounded-md font-display tracking-wider ${tradeMode === "BUY" ? "bg-success/20 text-success border border-success/50" : "text-text-muted"}`}>
                  {zh ? "买入" : "BUY"}
                </button>
                <button type="button" onClick={() => setTradeMode("SELL")} className={`flex-1 py-1.5 text-xs font-bold rounded-md font-display tracking-wider ${tradeMode === "SELL" ? "bg-danger/20 text-danger border border-danger/50" : "text-text-muted"}`}>
                  {zh ? "卖出" : "SELL"}
                </button>
              </div>
              <label className="flex justify-between text-xs font-bold text-text-muted uppercase tracking-wider mb-2 font-display">
                <span>{gen&&mode==="BUY"?(useStable?'金额（dUSDC）':t('金额（dUSDC）','Amount (dUSDC)')):t("份额","Shares")}</span>
                <span className="text-[10px] text-accent font-mono">{gen?t("手续费 1%","Fee 1%"):t("手续费 2%","Fee 2%")}</span>
              </label>
              <div className="flex items-stretch gap-2 mb-3">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                aria-label={t("交易金额或份额","Trade amount or tokens")} onChange={(event) => setAmount(Number(event.target.value))}
                className="min-w-0 w-0 flex-1 h-11 bg-transparent border border-border rounded-lg px-3 py-2 text-text text-base font-mono"
              />
              <div className={`grid ${gen?"grid-cols-1":"grid-cols-2"} gap-2 flex-1 min-w-0`}>
                {((gen?["YES"]:["YES","NO"]) as MarketSide[]).map((side) => (
                  <button
                    type="button"
                    key={side}
                    onClick={() => trade(side)}
                    disabled={!quote(side)}
                    className={`flex flex-col items-center border rounded-lg h-11 px-2 py-1 transition-all active:scale-95 disabled:opacity-50 ${
                      side === "YES"
                        ? "bg-success/10 border-success/30 hover:border-success"
                        : "bg-danger/10 border-danger/30 hover:border-danger"
                    }`}
                  >
                    <span className={`font-bold text-xs font-display tracking-wider ${sideTextColor(side)}`}>{gen?(mode==="BUY"?t("买入gToken","Buy gToken"):t("卖出gToken","Sell gToken")):side}</span>
                    <span className="text-text-muted text-[10px] font-mono mt-0.5">
                      {gen?genesisPrice(s.phase==='FAILED'?2*s.k*s.failedSupply:px.genesis):(side === "YES" ? yesPrice : noPrice).toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
              </div>
              <div className="space-y-1 text-[10px] text-text-muted mb-3 font-mono" data-testid="my-trade-holdings">
                <div className="flex justify-between gap-2"><span>{t("可用余额","Available balance")}</span><strong className="text-text">{num(useStable?stableWallets[id]:balance,6)} {useStable?'dUSDC':asset.symbol}</strong></div>
                <div className="flex justify-between gap-2"><span>{gen?t("我的gToken","My gToken"):t("我的份额","My shares")}</span><strong className="text-text">{gen?num(genesisTokens(a.g)):<>YES {formatAmount(userShares.YES)} · NO {formatAmount(userShares.NO)}</>}</strong></div>
                {!gen&&<><div className="flex justify-between gap-2"><span>{t("我的LP份额","My LP shares")}</span><strong className="text-text">{num(a.lp,4)}</strong></div><div className="flex justify-between gap-2"><span>{t("我的B份额","My B shares")}</span><strong className="text-text">{num(a.z,4)}</strong></div>{lpBValuePanel}</>}
                {gen&&<div className="flex justify-between gap-2" title={t("gToken当前全部卖出净额减剩余持仓成本；不含B权益及已实现盈亏。","Net sale value less remaining cost; excludes B rights and realized P/L.")}><span>{t("盈亏","P/L")}</span><strong className={genesisPnl>=0?"text-success":"text-danger"}>{genesisPnl>0?"+":""}{num(genesisPnl,2)} {asset.symbol}</strong></div>}
              </div>
              <div className="text-[10px] text-text-muted my-2 px-1 font-mono">
                {gen?t("按曲线积分成交；买卖都可能触发毕业。","Integrated curve pricing; buys or sells may trigger graduation."):t("两个方向均显示当前报价。","Both sides show current quotes.")}
              </div>
              <div className={`mb-3 grid ${gen?"grid-cols-1":"grid-cols-2"} gap-2`}>
                {quoteRows("YES")}
                {!gen&&quoteRows("NO")}
              </div>
              <div role="note" className="mb-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2.5 text-text">
                <div className="text-xs font-bold text-accent">{zh ? "费用说明" : "Cost details"}</div>
                <p className="mt-1 text-[10px] leading-relaxed text-text-muted font-mono">
                  {gen?(mode==="BUY"?t("买入 100 dUSDC，94.5 买 gToken，4.5 计入做市风险准备金，1 是话题创建者手续费。","Buy with 100 dUSDC: 94.5 buys gToken, 4.5 goes to the market-making risk reserve, and 1 pays the topic creator fee."):t("卖出成交金额为 100 dUSDC，94.5 到账，4.5 计入做市风险准备金，1 是话题创建者手续费。","For a gross sale of 100 dUSDC: you receive 94.5, 4.5 goes to the market-making risk reserve, and 1 pays the topic creator fee.")):(mode==="BUY"?t("买入 100 dUSDC：98 用于购买份额，0.5 给LP，0.5 计入做市风险准备金，1 给Core。","Buy with 100 dUSDC: 98 buys shares, 0.5 goes to LP, 0.5 to the market-making risk reserve, and 1 to Core."):t("卖出成交金额为 100 dUSDC：98 到账，0.5 给LP，0.5 计入做市风险准备金，1 给Core。","For a gross sale of 100 dUSDC: you receive 98, 0.5 goes to LP, 0.5 to the market-making risk reserve, and 1 to Core."))}
                </p>
                {gen&&<details className="mt-2 text-[10px] text-text-muted font-mono"><summary className="cursor-pointer">{t("准备金说明","About the risk reserve")}</summary><p className="mt-1 leading-relaxed">{t("这笔准备金进入B池，用于优先承担做市亏损。你获得对应的B代币，结算后按持有份额领取补损后的剩余准备金；若准备金耗尽，B代币无款可领。","This reserve enters B and absorbs market-making losses first. You receive corresponding B tokens and may redeem your share of the residual reserve at settlement. If the reserve is exhausted, B tokens have no payout.")}</p></details>}

              </div>


            </div>
          </div>
        )}

        {phase === "READY" && (
          <div className="border-t border-border pt-4 mt-2 space-y-3">
            <p className="p-3 rounded border border-border text-xs text-text-muted text-center font-mono uppercase tracking-widest">
              {zh ? "质押期已结束，可以结算" : "Staking has ended; finalization is available"}
            </p>
            <Button disabled={!!remote} onClick={finalize} className="w-full">
              {zh ? "结算金库" : "Finalize Vault"}
            </Button>
          </div>
        )}

        {terminal && (
          <div className="border-t border-border pt-4 mt-2 space-y-3">
            <div className="bg-transparent border border-border rounded-lg p-3 text-xs font-mono text-text-muted">
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2 text-text-muted font-display">
                {zh ? "可提取金额" : "Withdrawable"}
              </div>
              <div className="flex justify-between">
                <span>{zh ? "Vault 本金与手续费" : "Vault principal + fees"}</span>
                <strong className="text-text">{formatAmount(vaultPayout)} {asset.symbol}</strong>
              </div>
              <div className="flex justify-between mt-1">
                <span>{zh ? "其中 PM 手续费" : "Includes PM fees"}</span>
                <strong className="text-text">{formatAmount(selectedFeePayout, 4)} {asset.symbol}</strong>
              </div>
              <div className="flex justify-between mt-1">
                <span>{zh ? "市场／LP／B结算" : "Market / LP / B payout"}</span>
                <strong className="text-text">{formatAmount(marketPayout)} {asset.symbol}</strong>
              </div>
            </div>
            <Button onClick={withdrawVault} disabled={remote?.pending||vaultClaimed||s.phase!=="SETTLED"} className="w-full">
              {vaultClaimed ? (zh ? "已领取" : "Claimed") : (zh ? "领取 Vault" : "Claim Vault")}
            </Button>
            <Button onClick={redeemMarket} disabled={remote?.pending||!hasClaim} variant="secondary" className="w-full">
              {marketRedeemed ? (zh ? "已兑换" : "Redeemed") : (zh ? "领取并销毁LP／B代币" : "Claim & burn LP / B tokens")}
            </Button>
            {!remote&&<Button onClick={()=>reset()} variant="ghost" className="w-full">
              {zh ? "重新模拟" : "Reset simulation"}
            </Button>}
          </div>
        )}

   {tab==='MARKET'&&['FORMAL','WAIT_CORE'].includes(s.phase)&&Math.min(a.yes,a.no)>0&&<details className={box+' text-xs'}><summary className="cursor-pointer">{t('YES＋NO成对兑换','Redeem YES + NO pairs')}</summary><p className="my-3 text-text-muted">{t('每对兑回1 dUSDC，不收交易费。','Each pair redeems 1 dUSDC, fee-free.')}</p><input aria-label={t('成对兑换数量','Pair redemption amount')} type="number" value={pairs} onChange={e=>setPairs(Number(e.target.value))} className="w-full p-3 border border-border rounded-lg"/><Button className="w-full mt-3" disabled={!(pairs>0)||pairs>Math.min(a.yes,a.no)} onClick={()=>remote?remote.redeemPairs(pairs):act(v=>topicMarketRedeemPairs(v,id,pairs))}>{t('确认成对兑换','Redeem pairs')}</Button></details>}
        {!remote&&ticking && (
          <Button onClick={fastForward} variant="ghost" size="sm" className="w-full">
            {zh ? "时间快进10分钟" : "Advance time by 10 minutes"}
          </Button>
        )}
        <div role="status" aria-live="polite" className={`rounded-lg border p-3 text-[10px] leading-relaxed font-mono ${notice ? "border-accent/40 bg-accent/5 text-text" : "border-border text-text-muted"}`}>
          {notice || (remote?t("多人共享市场，成交与余额由服务器确认。","Shared market; trades and balances are confirmed by the server."):zh ? "这是本地机制模拟，不会发起链上交易。" : "Local demo only; no chain transactions.")}
        </div>
      </div>

      <div className="px-4 py-5 sm:p-6 md:w-2/3 bg-slate-50/40 md:bg-transparent relative flex flex-col font-mono md:rounded-r-2xl">
        <div className="hidden md:block mb-6 animate-fade-in border-b border-border pb-4">
          <h2 className="text-2xl font-bold text-text mb-3 tracking-wide font-display text-glow break-words leading-tight">
            {topic.title}
          </h2>
          <div className="mb-3 px-3 py-2 rounded-lg bg-accent/5 border border-accent/20">
            <div className="text-sm leading-6 text-text font-mono">
              {topicRules}
            </div>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="pt-1.5">
              <span className={`px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider rounded border font-mono ${phaseBadgeClass}`}>
                {phaseLabel}
              </span>
            </div>
            <div className="w-72 max-w-full shrink-0 whitespace-nowrap text-right text-3xl font-bold text-text tabular-nums font-display tracking-normal text-glow">
              {timeLeft > 0 ? `${Math.floor(timeLeft/3600)}h ${Math.floor(timeLeft/60)%60}m ${Math.floor(timeLeft)%60}s` : "—"}
            </div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4 mb-6 text-xs text-text-muted font-mono uppercase">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-success rounded-full" />
            {zh ? "系统在线" : "SYSTEM ONLINE"}
          </div>
        </div>

        <div className="space-y-3 sm:space-y-4 mb-5 sm:mb-8 animate-fade-in">
          {activeTab === "MARKET" && (gen||s.phase==='FAILED') ? <div data-testid="genesis-price" className="space-y-4"><h3 className="text-xs font-bold">{t("Genesis gToken 价格","Genesis gToken price")}</h3><strong className="text-2xl text-accent">{genesisPrice(s.phase==='FAILED'?2*s.k*s.failedSupply:px.genesis)} <span className="text-xs">{asset.symbol}／{t("枚","token")}</span></strong><GenesisPriceChart history={remote?.chart} events={s.events} supply={s.phase==='FAILED'?s.failedSupply:s.S} k={s.k} zh={zh} unit={asset.symbol}/><div className="border border-border rounded-xl p-4 space-y-3 text-xs"><div className="flex justify-between"><strong>{t("双池毕业进度","Graduation progress")}</strong><span>3.6 / 0.6 ETH</span></div>{[['R',s.R,s.rTarget],['B',s.B,s.bTarget]].map(([label,v,target])=><div key={String(label)}><div className="flex justify-between mb-1"><span>{label}</span><strong>{num(Number(v),4)} / {num(Number(target),4)} {asset.symbol}</strong></div><div className="h-2 bg-gray-100 rounded overflow-hidden"><div className={label==='R'?'h-full bg-purple-500':'h-full bg-accent'} style={{width:`${Math.min(100,Number(v)/Number(target)*100)}%`}}/></div></div>)}</div><p className="text-[10px] text-text-muted">{s.phase==='FAILED'?t("筹资未达标，未开启正式市场。请领取清算款。","Funding failed; the market did not open. Claim your refund."):t("双池达标立即毕业，后面一笔卖出也可能触发。","Both pools trigger graduation; a later sell can be the trigger.")}</p></div> : activeTab === "MARKET" && s.phase==='SETTLED' ? (
            <div className="rounded-xl border border-border p-5 space-y-3" data-testid="settled-market-result"><h3 className="text-xs text-text-muted">{t("最终结果","Final result")}</h3><strong className={`text-2xl ${sideTextColor(s.result??'INVALID')}`}>{s.result??'—'}</strong><p className="text-xs text-text-muted">{t("市场已结算，以下为每份兑付金额，不再显示交易赔率。","Settled. These are payouts per share, not trading odds.")}</p><Row label="YES" value={`${s.result==='YES'?'1':s.result==='NO'?'0':'0.5'} ${asset.symbol}`}/><Row label="NO" value={`${s.result==='NO'?'1':s.result==='YES'?'0':'0.5'} ${asset.symbol}`}/></div>
          ) : activeTab === "MARKET" ? (
            <div className="space-y-4" data-testid="formal-chart">
              {remote&&<div className="rounded-lg border border-border p-3 text-xs" data-testid="market-depth"><Row label={t("市场深度 b","Market depth b")} value={`${num(s.b,4)} ${asset.symbol} ≈ ${num(s.b*asset.price)} USD`}/><p className="mt-1 text-[10px] text-text-muted">{s.config.depthPolicy==='GRADUATION_CAPITAL'?t("按毕业启动资金确定，毕业后固定。","Set from launch capital at graduation, then fixed."):t("原有市场深度。","Legacy market depth.")}</p></div>}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5 text-text-muted font-display">
                  {zh ? "市场行情" : "Market odds"}
                </div>
                <div className="h-6 bg-transparent border border-border rounded overflow-hidden flex">
                  <div className="h-full bg-success transition-all" style={{ width: `${yesPrice * 100}%` }} />
                  <div className="h-full bg-danger transition-all" style={{ width: `${noPrice * 100}%` }} />
                </div>
                <div className="flex justify-between text-xs font-bold font-mono mt-1">
                  <span className="text-success">YES {(yesPrice * 100).toFixed(0)}%</span>
                  <span className="text-danger">NO {(noPrice * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5 text-text-muted font-display">
                  {zh ? "未结算份额" : "Outstanding shares"}
                </div>
                <div className="text-xs font-mono text-text-muted space-y-1">
                  <div>YES: <strong className="text-text">{formatAmount(marketShares.YES)} {zh ? "份" : "shares"}</strong></div>
                  <div>NO: <strong className="text-text">{formatAmount(marketShares.NO)} {zh ? "份" : "shares"}</strong></div>
                </div>
              </div>
            </div>
          ) : corePending ? <div className="text-center py-10 text-text-muted">{t('毕业后开启 Core','Core opens after graduation')}</div> : (
            <div data-testid="core-chart">
              {(["YES", "NO", "INVALID"] as VaultSide[]).map((side) => {
                const pct = side === "YES" ? yesStakePct : side === "NO" ? noStakePct : invalidStakePct;
                return (
                  <div key={side}>
                    <div className="flex justify-between text-xs mb-1.5 font-bold font-mono">
                      <span className={sideTextColor(side)}>{side} {pct.toFixed(1)}%</span>
                      <span className="text-text-muted">{formatAmount(stakes[side])} {asset.symbol}</span>
                    </div>
                    <div className="h-6 bg-transparent border border-border rounded overflow-hidden">
                      <div className={`h-full transition-all ${side === "YES" ? "bg-success" : side === "NO" ? "bg-danger" : "bg-yellow-500/90"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={` ${gen?"hidden":"grid"} grid-cols-2 gap-4 mb-6`}>
          <div className="border border-border rounded-xl p-4">
            <div className="text-[10px] text-text-muted uppercase mb-2 font-bold font-display tracking-wider">
              {activeTab === "MARKET" ? (zh ? "市场总交易量" : "Market total volume") : (zh ? "总质押本金" : "Total principal")}
            </div>
            <div className="text-sm text-text font-bold font-mono">
              {formatAmount(activeTab === "MARKET" ? totalVolume : totalStake)} {asset.symbol}
            </div>
          </div>
          <div className={`border rounded-xl p-4 ${phase === "FINALIZED" ? "border-success/30 bg-success/5" : "border-border"}`}>
            <div className="text-[10px] text-text-muted uppercase mb-2 font-bold font-display tracking-wider">
              {phase === "FINALIZED" ? (zh ? "最终结果" : "Final result") : (zh ? "当前公开领先" : "Current public leader")}
            </div>
            <div className={`text-sm font-bold font-mono ${sideTextColor(finalOutcome ?? leaderSide ?? "INVALID")}`}>
              {finalOutcome ?? leaderSide ?? (zh ? "平局" : "Tied")}
            </div>
          </div>
          <div className="border border-border rounded-xl p-4">
            <div className="text-[10px] text-text-muted uppercase mb-2 font-bold font-display tracking-wider">
              {zh ? "市场输入Core的手续费" : "Market fees contributed to Core"}
            </div>
            <div className="text-sm text-text font-bold font-mono">
              {formatAmount(vaultFees, 4)} {asset.symbol}
            </div>
          </div>
          <div className="border border-accent/30 bg-accent/5 rounded-xl p-4">
            <div className="text-[10px] text-text-muted uppercase mb-2 font-bold font-display tracking-wider">
              {zh ? "手续费 ROI（非年化）" : "Fee ROI (non-annualized)"}
            </div>
            <div className="text-sm text-accent font-bold font-mono">
              {feeRoi.toFixed(3)}%
            </div>
          </div>
        </div>

        {activeTab === "MARKET" && (
        <div className="border border-border rounded-xl p-4 text-[10px] text-text-muted font-mono mt-auto">
          <div className="flex justify-between gap-3">
            <span>{zh ? "做市风险准备金" : "Market-making risk reserve"}</span>
            <strong className="text-text">{num(terminal?s.bBudget:s.B)} {asset.symbol}</strong>
          </div>
          <div className="flex justify-between gap-3 mt-1.5">
            <span>{zh ? "LP代币 / B代币" : "LP tokens / B tokens"}</span>
            <strong className="text-text">{num(a.lp,4)} / {num(a.z,4)}</strong>
          </div>
          {terminal&&lpBValuePanel}

        </div>
        )}
        {activeTab !== "MARKET" && userVaultSide && <div className="border border-border rounded-xl p-4 text-[10px] text-text-muted font-mono mt-auto"><div className="flex justify-between gap-3"><span>{t("预计 Core 奖励","Estimated Core reward")}</span><strong className="text-text">{formatAmount(userConditionalFees[finalOutcome ?? provisionalOutcome],4)} {asset.symbol}</strong></div></div>}
   {remote&&activityPanel}
   {!remote&&<details className={box+' text-xs'} data-testid="demo-details"><summary className="cursor-pointer font-bold">{t('演示场景','Demo scenarios')}</summary><div className="mt-4 space-y-5"><div className="grid grid-cols-3 gap-3 text-center font-mono">{[['Genesis',s.TG],['Formal',s.TF],['Core',s.TC]].map(([label,v])=><div key={String(label)}>{label} {t('截止','closes')}<strong className="block mt-2">{clock(Number(v))}</strong></div>)}</div><p className="text-text-muted">{t('Formal与Core在毕业时同时开启，截止时间固定。','Formal and Core open together at graduation. Deadlines stay fixed.')}</p><details><summary className="cursor-pointer">{t('演示参数','Demo parameters')}</summary><label className="block my-3">{t('ETH固定快照','Fixed ETH snapshot')}<input aria-label="ETH snapshot" type="number" value={snapshot} onChange={e=>setSnapshot(Number(e.target.value))} className="border border-border p-2 ml-2 w-28"/></label><label>{t('正式深度','Formal depth')}<input aria-label="Formal depth" type="number" value={depth} onChange={e=>setDepth(Number(e.target.value))} className="border border-border p-2 ml-2 w-28"/></label><p className="text-text-muted mt-2">{t('仅在下次创建生效，非实时价格或生产参数。','Applies at next creation; illustrative parameters only.')}</p></details>{activityPanel}</div></details>}      </div>
    </div>
  );
};
