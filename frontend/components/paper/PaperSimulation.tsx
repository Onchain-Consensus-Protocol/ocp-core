import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {Simulation,type RemoteSimulation} from '../Simulation';
import {createStockDemo} from '../stockDemoRouting';
import {createPaperClient} from '../../shared/paperClient';
import {PAPER_GTOKEN_SCALE,type PaperMarket,type PaperQuote,type PaperAction,type PaperTradeInput} from '../../shared/paperTypes';
import type {Side,Outcome} from '../topicMarketDemoModel';

type Input={tab:'MARKET'|'PROTOCOL';mode:'BUY'|'SELL';amount:number;useStable:boolean};
type Props={market:PaperMarket;balanceUSD:string;lang:'zh'|'en';signedIn:boolean;pending:boolean;now:number;getToken:()=>Promise<string|null>;onLogin:()=>void;onOrder:(order:PaperTradeInput)=>void;onError:(error:unknown)=>void};
const noop=()=>{};
/** 首页与多人市场共用 Simulation；这里仅把服务器的公开视图、报价和订单接入它。 */
export function PaperSimulation({market:m,balanceUSD,lang,signedIn,pending,now,getToken,onLogin,onOrder,onError}:Props){
 const [input,setInput]=useState<Input>({tab:'MARKET',mode:'BUY',amount:10,useStable:true});
 const [quotes,setQuotes]=useState<Record<string,{quote:PaperQuote;action:PaperAction}>>({});
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{const timer=window.setInterval(()=>setRefresh(v=>v+1),8000);return()=>window.clearInterval(timer);},[]);
 const api=useMemo(()=>createPaperClient(getToken),[getToken]);
 const onInput=useCallback((next:Input)=>setInput(prev=>JSON.stringify(prev)===JSON.stringify(next)?prev:next),[]);
 const gen=m.phase==='GENESIS',p=m.presentation;
 const actions=useMemo(()=>{
  const result:Record<string,PaperAction>={};
  if(!(input.amount>0)||!Number.isFinite(input.amount))return result;
  const amount=String(input.amount),budgetUSD=(input.amount*(input.useStable?1:m.assetPriceUSD)).toFixed(6);
  if(input.tab==='PROTOCOL'){for(const side of ['YES','NO','INVALID'] as Outcome[])if((!m.position?.coreSide||m.position.coreSide===side)&&Number(budgetUSD)/m.assetPriceUSD>=.01)result[side]={type:'CORE_STAKE',side,budgetUSD};}
  else if(gen){if(input.mode==='SELL'&&input.amount>Number(m.position?.gToken??0))return result;result.G=input.mode==='BUY'?{type:'GENESIS_BUY',budgetUSD}:{type:'GENESIS_SELL',quantity:amount};}
  else for(const side of ['YES','NO'] as Side[])if(input.mode==='BUY'||input.amount<=Number(side==='YES'?m.position?.yes??0:m.position?.no??0))result[side]=input.mode==='BUY'?{type:'FORMAL_BUY_SHARES',side,quantity:amount}:{type:'FORMAL_SELL',side,quantity:amount};
  return result;
 },[input,gen,m.assetPriceUSD,m.position?.gToken,m.position?.yes,m.position?.no,m.position?.coreSide]);
 useEffect(()=>{
  setQuotes({});if(!signedIn||pending)return;
  if(input.tab==='PROTOCOL'?(m.coreOpenedAt===null||now>=m.coreDeadline):gen?now>=m.genesisDeadline:m.phase!=='FORMAL'||now>=m.formalDeadline)return;
  const controller=new AbortController();const timer=window.setTimeout(()=>{
   void Promise.all(Object.entries(actions).map(async([key,action])=>{
    try{const q=await api.quote(m.id,action,controller.signal);if(!controller.signal.aborted)setQuotes(prev=>({...prev,[key]:{quote:q,action}}));}
    catch(e){if(!controller.signal.aborted)onError(e);}
   }));
  },250);
  return()=>{window.clearTimeout(timer);controller.abort();};
 },[api,m.id,m.revision,m.phase,actions,signedIn,pending,refresh]);
 if(!p)return <p>{lang==='zh'?'正在加载市场…':'Loading market…'}</p>;
 const state=createStockDemo(m.assetPriceUSD);
 Object.assign(state,p,{phase:m.phase,now:Math.max(0,now-m.createdAt),R:Number(m.R),B:Number(m.B),rTarget:Number(m.rTarget),bTarget:Number(m.bTarget),result:m.result,formalVolume:Number(m.volumeUSD)/m.assetPriceUSD});
 state.accounts=[{...state.accounts[0],...(p.own??{}),wallet:Number(balanceUSD)/m.assetPriceUSD}];
 state.core={...state.core,openedAt:m.coreOpenedAt===null?null:m.coreOpenedAt-m.createdAt,yes:Number(m.coreYes),no:Number(m.coreNo),invalid:Number(m.coreInvalid),feeTotal:p.coreFees};
 state.corePayouts=[p.corePayout];
 state.events=m.events.map((e,id)=>({id,at:e.at-m.createdAt,kind:e.kind,amount:Number(e.amount),detail:e.detail}));
 const send=(key:string)=>{
  if(!signedIn){onLogin();return;}
  const entry=quotes[key],q=entry?.quote,action=entry?.action;if(pending||!q||!action||JSON.stringify(action)!==JSON.stringify(actions[key])||q.revision!==m.revision||q.expiresAt<=now)return;
  onOrder({marketId:m.id,requestId:crypto.randomUUID(),expectedRevision:q.revision,action,
   ...(Number(q.payUSD)>0?{maxPayUSD:(Number(q.payUSD)*1.01).toFixed(6)}:{}),
   ...(Number(q.receiveUSD)>0?{minReceiveUSD:(Number(q.receiveUSD)*.99).toFixed(6)}:{})});
 };
 const claim=(type:'CLAIM_MARKET'|'CLAIM_CORE')=>onOrder({marketId:m.id,requestId:crypto.randomUUID(),expectedRevision:m.revision,action:{type}});
 const remote:RemoteSimulation={input,state,assetSymbol:m.assetSymbol,balanceUSD:Number(balanceUSD),topic:{title:m.title,YES:m.yesRule,NO:m.noRule,INVALID:m.invalidRule},pending,
  prices:{genesis:Number(m.genesisPriceUSD)*PAPER_GTOKEN_SCALE/m.assetPriceUSD,probability:gen||m.phase==='FAILED'?null:[m.yesPrice,m.noPrice]},
  preview:p.claim??{outcomes:0,lp:0,B:0,failed:0,total:0},genesisPnl:p.genesisPnl,lpBEstimates:p.lpBEstimates,outstanding:p.outstanding,
  chart:m.history.map(v=>({price:v.genesisPriceUSD*PAPER_GTOKEN_SCALE/m.assetPriceUSD,at:v.at-m.createdAt,kind:'TRADE'})),onInput,
  quote:side=>{const key=gen&&input.tab==='MARKET'?'G':side,entry=quotes[key],q=entry?.quote;return q&&JSON.stringify(entry.action)===JSON.stringify(actions[key])&&q.revision===m.revision&&q.expiresAt>now?q.detail??null:null;},
  trade:side=>send(gen?'G':side),stake:side=>send(side),canStake:side=>!!quotes[side]&&JSON.stringify(quotes[side].action)===JSON.stringify(actions[side])&&quotes[side].quote.expiresAt>now&&Number(quotes[side].quote.payUSD)<=Number(balanceUSD),claimMarket:()=>claim('CLAIM_MARKET'),claimCore:()=>claim('CLAIM_CORE'),
  redeemPairs:amount=>onOrder({marketId:m.id,requestId:crypto.randomUUID(),expectedRevision:m.revision,action:{type:'REDEEM_PAIRS',quantity:String(amount)}})};
 return <Simulation key={m.id} lang={lang} balance={Number(balanceUSD)} setBalance={noop} isWalletConnected={signedIn} connectWallet={onLogin} remote={remote}/>;
}
