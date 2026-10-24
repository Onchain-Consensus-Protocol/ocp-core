import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
import {PaperSimulation} from './PaperSimulation';
import {createPaperMarket,projectPaperMarket,applyPaperAction} from '../../server/paper/engine';
const now=1_000_000;
const market=()=>createPaperMarket('m','creator',{title:'Shared topic',yesRule:'Yes rule',noRule:'No rule',invalidRule:'Invalid rule',assetSymbol:'TSLA',coreHours:6},now);
const render=(m=market())=>renderToStaticMarkup(<PaperSimulation market={projectPaperMarket(m,'creator',now)} balanceUSD="100000" lang="zh" signedIn pending={false} now={now/1000} getToken={async()=>null} onLogin={vi.fn()} onOrder={vi.fn()} onError={vi.fn()}/>);
describe('multiplayer reuses homepage Simulation',()=>{
 it('renders homepage controls, quote placement and chart without local-only controls',()=>{const html=render();for(const text of ['homepage-lifecycle','my-trade-holdings','genesis-price-chart','交易金额或份额','买入gToken','费用说明'])expect(html).toContain(text);for(const text of ['Demo account','时间快进10分钟','演示参数','Reset simulation'])expect(html).not.toContain(text);});
 it('renders the real server holdings after a trade, never another player account',()=>{const result=applyPaperAction(market(),'creator',100_000_000_000n,{type:'GENESIS_BUY',budgetUSD:'100'},now);const html=render(result.market);expect(html).toContain('我的gToken');expect(html).toContain('97,211,110.48');expect(html).not.toContain('账户2');});
});
