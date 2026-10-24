import {createTopicMarketDemo,topicMarketAccounting,topicMarketAssertLedger,type TopicMarketState,type TopicMarketConfig} from './topicMarketDemoModel.js';
export const STOCK_DEMO_ASSETS=[
 {symbol:'TSLA',name:'特斯拉',en:'Tesla',price:250},
 {symbol:'NVDA',name:'英伟达',en:'NVIDIA',price:150},
 {symbol:'AAPL',name:'苹果',en:'Apple',price:200},
 {symbol:'SPACEX',name:'SpaceX',en:'SpaceX',price:100},
 {symbol:'GOOG',name:'谷歌',en:'Google',price:180},
] as const;
export function createStockDemo(price:number,Q=2000,b=150,deadlines:Pick<TopicMarketConfig,"TC">={}) {
 if(!Number.isFinite(price)||price<=0)throw new Error('PRICE');
 const s=createTopicMarketDemo({Q:Q/price,k:1/price,b:b/price,...deadlines,creatorAccount:-1,protocolAccount:-1});
 s.accounts.forEach(a=>a.wallet=5000/price);
 s.initialCapital=15000/price;
 topicMarketAssertLedger(s);return s;
}
// 固定演示汇率的外部兑换商，不接真实DEX；兑换增减单独调整外部净入账基准。
// 先在副本完成全部业务及检查，再返回双钱包，任何异常不提交部分状态。
export function routeStockDemo(state:TopicMarketState,stable:number[],id:number,price:number,useStable:boolean,fn:(s:TopicMarketState)=>TopicMarketState){
 if(!Number.isFinite(price)||price<=0||!Number.isInteger(id)||id<0||id>=state.accounts.length||stable.length!==state.accounts.length||stable.some(x=>!Number.isFinite(x)||x<0))throw new Error('ROUTE');
 if(!useStable)return {state:fn(state),stable:[...stable],deltaStable:0};
 const working=structuredClone(state),credit=stable[id]/price;
 working.accounts[id].wallet+=credit;working.initialCapital=(state.initialCapital??30000)+credit;
 const priorWallet=working.accounts[id].wallet;
 const next=fn(working),delta=next.accounts[id].wallet-priorWallet;
 const cash=stable[id]+delta*price;
 if(!Number.isFinite(cash)||cash < -1e-7)throw new Error('BALANCE');
 next.accounts[id].wallet=state.accounts[id].wallet;
 next.initialCapital=(state.initialCapital??30000)-delta;
 topicMarketAssertLedger(next);
 const wallets=[...stable];wallets[id]=Math.max(0,cash);
 // C池和稳定币钱包在同一固定演示汇率下的总资产守恒。
 const before=topicMarketAccounting(state).total*price+stable.reduce((a,b)=>a+b,0);
 const after=topicMarketAccounting(next).total*price+wallets.reduce((a,b)=>a+b,0);
 if(Math.abs(before-after)>1e-5)throw new Error('ROUTE_LEDGER');
 return {state:next,stable:wallets,deltaStable:delta*price};
}
