import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {TestnetSimulation,buildTestnetRemote,type TestnetSimulationProps} from './TestnetSimulation';
import type {MarketState,StockState} from '../testnet/chainClient';

const W=10n**18n;
function fixture():TestnetSimulationProps {
  const stock:StockState={address:'0x0000000000000000000000000000000000000001',symbol:'LIVE',decimals:6,
    enabled:true,oracle:'0x0000000000000000000000000000000000000002',router:'0x0000000000000000000000000000000000000003',k:W};
  const market:MarketState={address:'0x0000000000000000000000000000000000000004',stock:stock.address,
    creator:stock.address,adapter:stock.address,vault:stock.address,topic:'Chain topic',yesRule:'yes',noRule:'no',invalidRule:'invalid',
    createdAt:1000n,genesisCutoff:15000n,formalCutoff:18600n,coreCutoff:22200n,snapshot:0n,
    phase:1,outcome:0,R:0n,B:600000n,S:9n*W,rTarget:3600000n,bTarget:600000n,k:W,cash:1200000n,
    lpFees:10000n,lpBudgetRemaining:0n,bBudgetRemaining:0n,vaultResolved:false,vaultOutcome:0,vaultSettlementReady:false,
    totalStakeYes:3000000n,totalStakeNo:1000000n,totalStakeInvalid:2000000n,
    position:{balance:7000000n,genesisShares:2n*W,yes:3n*W,no:W,lp:W,b:4n*W,
      coreYes:0n,coreNo:1000000n,coreInvalid:0n,marketAllowance:0n,vaultAllowance:0n,routerAllowance:0n},
    presentation:{priceYes:6n*W/10n,priceNo:4n*W/10n,basisWad:10n*W,bWad:10n*W,
      inventoryYes:7n*W,inventoryNo:9n*W,totalYes:10n*W,totalNo:10n*W,totalFees:120000n,
      feeYes:11000n,feeNo:22000n,feeInvalid:33000n,genesisPrice:18n*W}};
  return {market,stock,lang:'en',now:1100,walletAddress:stock.address,busy:false,onConnect:()=>{},
    controls:<button>Real transaction</button>,coreActions:<button>Real exit</button>,status:'Confirmed block'};
}
describe('chain data adapter for the shared Simulation view',()=>{
  it('uses real stock precision for money and WAD for shares, with one actual account',()=>{
    const remote=buildTestnetRemote(fixture());const s=remote.state,a=s.accounts[0];
    expect(s.accounts).toHaveLength(1);expect(a.wallet).toBe(7);expect(a.yes).toBe(3);expect(a.z).toBe(4);
    expect(a.coreSide).toBe('NO');expect(a.coreStake).toBe(1);expect(a.coreRewards).toEqual([.011,.022,.033]);
    expect(s.core.yes).toBe(3);expect(s.core.no).toBe(1);expect(s.core.invalid).toBe(2);
    expect(s.core.feeTotal).toBe(.12);expect(remote.prices.probability).toEqual([.6,.4]);
    expect(remote.outstanding).toEqual([3,1]);expect(remote.prices.genesis).toBe(18);
    expect(remote.chain?.poolBalances).toEqual({yes:'7.0',no:'9.0',stock:'—'});
    const props=fixture();props.market.poolStockBalance=1234567n;
    expect(buildTestnetRemote(props).chain?.poolBalances?.stock).toBe('1.234567');
  });
  it('counts pending materialization as LP after graduation, preserving raw holdings',()=>{
    const props=fixture();const remote=buildTestnetRemote(props);
    expect(remote.state.accounts[0].g).toBe(0);expect(remote.state.accounts[0].lp).toBe(3);
    expect(props.market.position?.genesisShares).toBe(2n*W);
    props.market.phase=0;const genesis=buildTestnetRemote(props);
    expect(genesis.state.accounts[0].g).toBe(2);expect(genesis.state.accounts[0].lp).toBe(1);
    expect(genesis.state.core.openedAt).toBeNull();
  });
  it('keeps unknown prices, USD value, historical events and optional metrics unavailable',()=>{
    const props=fixture();delete props.market.presentation;delete props.market.position;
    const remote=buildTestnetRemote(props);
    expect(remote.balanceUSD).toBe(0);expect(remote.prices.probability).toBeNull();expect(remote.chart).toEqual([]);
    expect(remote.state.events).toEqual([]);expect(remote.lpBEstimates).toEqual([]);expect(remote.state.corePayouts).toEqual([]);
    expect(remote.chain?.readOnlyMetrics).toBe(true);expect(remote.state.accounts[0].wallet).toBe(0);
    expect(remote.prices.genesis).toBe(18); // Derived only from the real k/S state, not a fake trade.
  });
  it('preserves real history exactly and never adds a fake zero origin',()=>{
    const props=fixture();props.history=[{price:11,at:1080,kind:'GENESIS_BUY'}];
    const remote=buildTestnetRemote(props);expect(remote.chart).toEqual(props.history);expect(remote.chart).toHaveLength(1);
    expect(remote.state.events).toEqual([]);
  });
  it('maps actual cutoffs and outcomes while exposing only parent transaction controls',()=>{
    const props=fixture();props.market.phase=3;props.market.outcome=2;props.market.vaultResolved=true;props.market.vaultOutcome=2;
    props.market.early={bond:W,requestId:0n,requestedOutcome:2,processAfter:1200n,effectiveCutoff:1200n,due:false};
    props.market.presentation!.marketPayout=1234567n;
    const remote=buildTestnetRemote(props);expect(remote.state.phase).toBe('SETTLED');expect(remote.state.result).toBe('NO');
    expect(remote.state.core.result).toBe('NO');expect(remote.state.TC).toBe(200);expect(remote.state.TF).toBe(17600);
    expect(remote.preview.total).toBe(1.234567);expect(remote.chain?.controls).toBe(props.controls);
    expect(remote.chain?.coreActions).toBe(props.coreActions);expect(remote.chain?.status).toBe(props.status);
    expect(remote.quote('YES')).toBeNull();expect(remote.canStake('YES')).toBe(false);
  });
  it('renders the shared detail shell with chain controls and no paper login or demo actions',()=>{
    const props=fixture();props.walletAddress=undefined;
    const html=renderToStaticMarkup(<TestnetSimulation {...props}/>);
    expect(html).toContain('vault-shell');expect(html).toContain('OCP Core');expect(html).toContain('Real transaction');
    expect(html).not.toContain('Real exit');expect(html).not.toContain('Sign in with email');
    expect(html).toContain('Connect your wallet');expect(html).not.toContain('virtual USD');
    expect(html).not.toContain('Advance time');expect(html).not.toContain('Reset simulation');
  });
  it('shows an honest loading state for missing Genesis history and testnet targets',()=>{
    const props=fixture();props.market.phase=0;
    const html=renderToStaticMarkup(<TestnetSimulation {...props}/>);
    expect(html).toContain('On-chain price history has not loaded');expect(html).toContain('Fixed testnet targets');
    expect(html).not.toContain('Actual simulated prices');expect(html).not.toContain('3.6 / 0.6 ETH');
  });
  it('rejects unsupported phases instead of inventing a CREATE demo',()=>{
    const props=fixture();props.market.phase=99;expect(()=>buildTestnetRemote(props)).toThrow('Unsupported');
  });
});
