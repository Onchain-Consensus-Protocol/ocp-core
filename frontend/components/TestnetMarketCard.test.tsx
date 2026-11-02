import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {TestnetMarketCard} from './TestnetMarketCard';
import type {MarketSummary} from '../testnet/chainClient';
const base={address:'0x1111111111111111111111111111111111111111',topic:'Real chain topic',coreCutoff:2000n,R:25n,rTarget:100n,phase:0} as MarketSummary;
const render=(m:MarketSummary)=>renderToStaticMarkup(<TestnetMarketCard market={m} symbol="TSLA" phaseLabel="stage" lang="en" now={1000} onClick={()=>{}}/>);
describe('testnet cards share simulation presentation',()=>{
 it('shows actual Genesis reserve progress',()=>{const html=render(base);expect(html).toContain('Graduation progress');expect(html).toContain('25.00%');expect(html).toContain('gToken price trend');expect(html).toContain('Real chain topic');expect(html).toContain('hover:border-orange-300');});
 it('shows actual settlement outcomes instead of stale trading odds',()=>{for(const [outcome,label] of [[1,'YES'],[2,'NO'],[3,'INVALID']] as const){const html=render({...base,phase:3,outcome,priceYes:900000000000000000n});expect(html).toContain('Final result');expect(html).toContain(label);expect(html).not.toContain('90.00%');}});
 it('distinguishes failed Genesis from unavailable live data',()=>{expect(render({...base,phase:4})).toContain('Claim refunds');expect(render({...base,phase:1})).toContain('Loading market status');expect(render({...base,phase:1})).not.toContain('50.00%');});
 it('shows live odds and pending requests with the shared status component',()=>{const html=render({...base,phase:1,priceYes:600000000000000000n,earlyRequest:{requestId:1n,requestedOutcome:2,processAfter:900n}});expect(html).toContain('60.00%');expect(html).toContain('40.00%');expect(html).toContain('Early settlement');expect(html).toContain('Action needed');});
});
