import React, {useCallback, useState, type ReactNode} from 'react';
import {formatUnits} from 'ethers';
import {Simulation, type RemoteSimulation} from './Simulation';
import type {TopicMarketState, TopicMarketPhase, Outcome, TopicMarketAccount} from './topicMarketDemoModel';
import type {MarketState, StockState} from '../testnet/chainClient';
import type {Language} from '../types';
import type {TopicMarketEvent} from './topicMarketDemoModel';

export interface TestnetSimulationProps {
  market:MarketState;stock:StockState;lang:Language;now:number;walletAddress?:string;busy:boolean;
  onConnect:()=>void;controls:ReactNode;coreActions:ReactNode;status:string;
  onTabChange?:(tab:'MARKET'|'PROTOCOL')=>void;
  /** Confirmed chain history only. Prices are collateral per gToken. */
  history?:{price:number;at:number;kind:string}[];
  activity?:TopicMarketEvent[];
  coreActivity?:TopicMarketEvent[];
}
const emptyInput:RemoteSimulation['input']={tab:'MARKET',mode:'BUY',amount:0,useStable:false};
const noop=()=>{};
const phaseNames:Record<number,TopicMarketPhase>={0:'GENESIS',1:'FORMAL',2:'WAIT_CORE',3:'SETTLED',4:'FAILED'};
const outcome=(value:number):Outcome|null=>value===1?'YES':value===2?'NO':value===3?'INVALID':null;
// Display conversion only. Signatures, quotes and transactions stay bigint in the parent controller.
const amount=(value:bigint|undefined,decimals:number)=>value===undefined?0:Number(formatUnits(value,decimals));

/** Adapt reads for the shared view; never seed a demo account, infer USD value, or execute a model trade. */
const fixed18=(value:string)=>{if(value==='—')return value;const [whole,fraction='']=value.split('.');return whole+'.'+fraction.padEnd(18,'0').slice(0,18);};
export function buildTestnetRemote(
  props:TestnetSimulationProps,input:RemoteSimulation['input']=emptyInput,onInput:RemoteSimulation['onInput']=noop,
):RemoteSimulation {
  const {market:m,stock}=props,p=m.presentation,position=m.position;
  const money=(value:bigint|undefined)=>amount(value,stock.decimals);
  const wad=(value:bigint|undefined)=>amount(value,18);
  const phase=phaseNames[m.phase];
  if(!phase)throw new Error('Unsupported on-chain market phase');
  const created=Number(m.createdAt),relative=(epoch:bigint)=>Number(epoch)-created;
  const graduated=m.phase===1||m.phase===2||m.phase===3;
  const coreSide=position?.coreYes? 'YES':position?.coreNo?'NO':position?.coreInvalid?'INVALID':null;
  const account:TopicMarketAccount={
    name:props.walletAddress??'',wallet:money(position?.balance),
    g:graduated?0:wad(position?.genesisShares),
    // Pending Genesis shares become escrowed LP rights at graduation, not extra gTokens.
    lp:graduated?wad((position?.lp??0n)+(position?.genesisShares??0n)):wad(position?.lp),
    yes:wad(position?.yes),no:wad(position?.no),coreSide,
    coreStake:money((position?.coreYes??0n)+(position?.coreNo??0n)+(position?.coreInvalid??0n)),
    coreRewards:[money(p?.feeYes),money(p?.feeNo),money(p?.feeInvalid)],
    // Unread bookkeeping flags/cost bases are not presented as wallet history.
    claimed:false,coreClaimed:false,paid:0,received:0,
  };
  const result=outcome(m.outcome),coreResult=m.vaultResolved?outcome(m.vaultOutcome):null;
  const yesStake=money(m.totalStakeYes),noStake=money(m.totalStakeNo),invalidStake=money(m.totalStakeInvalid);
  const state:TopicMarketState={
    phase,now:Math.max(0,props.now-created),TG:relative(m.genesisCutoff),TF:relative(m.formalCutoff),
    TC:relative(m.early?.effectiveCutoff??m.coreCutoff),TT:relative(m.coreCutoff),Q:money(m.snapshot),k:wad(m.k),
    rTarget:money(m.rTarget),R:money(m.phase===4?m.failedRInitial:m.R),S:wad(m.S),
    M0:wad(p?.basisWad),redeemedPairs:0,collateral:0,cash:money(m.cash),lpFees:money(m.lpFees),
    lpFeesEarned:0,formalVolume:money(p?.formalVolume),creatorFees:0,protocolFees:0,
    basis:wad(p?.basisWad),b:wad(p?.bWad),lpSupply:wad(m.lpSupply),inventory:[wad(p?.inventoryYes),wad(p?.inventoryNo)],
    liquidityClosed:false,restartLiquidity:null,accounts:[account],
    core:{
      // The view needs an opened/not-opened marker, not an invented historical opening timestamp.
      openedAt:graduated?0:null,yes:yesStake,no:noStake,invalid:invalidStake,cash:yesStake+noStake+invalidStake,
      fees:money(p?.totalFees),feeTotal:money(p?.totalFees),officialRewards:[0,0,0],result:coreResult,
    },
    result,lpBudget:money(m.lpBudgetRemaining),outcomeBudget:0,
    lpClaimSupply:0,lpBudgetInitial:0,failedSupply:wad(m.failedSupply),failedBudgetInitial:money(m.failedRInitial),
    failedBudget:0,coreBudget:0,coreOfficialBudget:0,payouts:null,corePayouts:p?.corePayout===undefined?[]:[money(p.corePayout)],
    events:[...(props.activity??[]),...(props.coreActivity??[])],config:{creatorAccount:-1,protocolAccount:-1,depthPolicy:'GRADUATION_CAPITAL'},
  };
  const genesisPrice=m.phase===4&&props.history?.length?props.history[props.history.length-1].price:p?.genesisPrice===undefined
    ?wad(2n*m.k*(m.failedSupply??m.S)/10n**18n) // Same current-state derivative as the contract; no fabricated history.
    :wad(p.genesisPrice);
  const poolFunds=m.phase===0?m.R:[1,2].includes(m.phase)?m.cash:m.phase===4?m.failedRRemaining:m.collateralCash===undefined?undefined:m.collateralCash+m.lpBudgetRemaining;
  const probability=p?.priceYes===undefined||p.priceNo===undefined?null:[wad(p.priceYes),wad(p.priceNo)] as [number,number];
  return {
    input,state,assetSymbol:stock.symbol,balanceUSD:0,
    topic:{title:m.topic,YES:m.yesRule,NO:m.noRule,INVALID:m.invalidRule},pending:props.busy,
    prices:{genesis:genesisPrice,probability},
    preview:{outcomes:0,lp:0,failed:0,total:money(p?.marketPayout)},
    genesisPnl:0,lpEstimates:[],
    outstanding:[wad(p===undefined?undefined:p.totalYes-p.inventoryYes),wad(p===undefined?undefined:p.totalNo-p.inventoryNo)],
    chart:props.history??[],onInput,
    // Parent-supplied controls are the sole write surface; the display adapter has no transaction callbacks.
    quote:()=>null,trade:noop,stake:noop,canStake:()=>false,claimMarket:noop,claimCore:noop,redeemPairs:noop,
    chain:{lpTotalSupply:m.lpSupply===undefined?'—':fixed18(formatUnits(m.lpSupply,18)),outstandingShares:{yes:p?fixed18(formatUnits(p.totalYes-p.inventoryYes,18)):'—',no:p?fixed18(formatUnits(p.totalNo-p.inventoryNo,18)):'—'},contractAddresses:{market:m.address,core:m.vault},poolBalances:{yes:p?fixed18(formatUnits(p.inventoryYes,18)):'—',no:p?fixed18(formatUnits(p.inventoryNo,18)):'—',stock:poolFunds===undefined?'—':fixed18(formatUnits(poolFunds,stock.decimals)),totalStock:m.poolStockBalance===undefined?'—':fixed18(formatUnits(m.poolStockBalance,stock.decimals)),lpFees:fixed18(formatUnits(m.lpFees,stock.decimals))},controls:props.controls,coreActions:props.coreActions,status:props.status,stockSymbol:stock.symbol,
      readOnlyMetrics:true,volumeAvailable:p?.formalVolume!==undefined,onTabChange:props.onTabChange},
  };
}

export function TestnetSimulation(props:TestnetSimulationProps){
  const [input,setInput]=useState<RemoteSimulation['input']>(emptyInput);
  const onInput=useCallback<RemoteSimulation['onInput']>(next=>setInput(previous=>
    previous.tab===next.tab&&previous.mode===next.mode&&previous.amount===next.amount&&previous.useStable===next.useStable?previous:next),[]);
  const remote=buildTestnetRemote(props,input,onInput);
  return <Simulation key={`${props.market.address}:${props.walletAddress??'read-only'}`} lang={props.lang}
    balance={remote.state.accounts[0].wallet} setBalance={noop} isWalletConnected={!!props.walletAddress}
    connectWallet={props.onConnect} remote={remote}/>;
}
