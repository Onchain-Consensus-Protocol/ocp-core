import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {DegenMarketView} from './DegenMarketView';
import type {MarketState,StockState} from '../testnet/chainClient';
const market={address:'0x1111111111111111111111111111111111111111',phase:1,outcome:0,topic:'Question',genesisCutoff:1000n,formalCutoff:2000n,coreCutoff:3000n,k:1000000000000n,S:1n,R:1n,rTarget:10n,totalStakeYes:0n,totalStakeNo:0n,totalStakeInvalid:0n,yesRule:'yes',noRule:'no',invalidRule:'invalid'} as MarketState;
const stock={symbol:'TSLA',decimals:18} as StockState;
const render=(m=market)=>renderToStaticMarkup(<DegenMarketView market={m} stock={stock} history={null} lang="en" now={1500} tab="MARKET" onTab={()=>{}} controls={<button>Actual controller</button>} coreActions={null} details={<p>Fee details</p>} busy={false}/>);
describe('independent Degen view',()=>{
 it('uses the supplied real transaction controller and folds secondary data',()=>{const html=render();expect(html).toContain('Actual controller');expect(html).toContain('Detailed data');expect(html).toContain('Fee details');expect(html).not.toContain('Fee ROI');expect(html).toContain('Waiting for verified price history');});
 it('keeps final outcome separate from historical trading odds',()=>{const html=render({...market,phase:3,outcome:2});expect(html).toContain('Final result');expect(html).toContain('NO');expect(html).toContain('retains historical trading prices');});
});
