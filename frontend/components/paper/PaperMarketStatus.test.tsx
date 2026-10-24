import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {PaperMarketStatus} from './PaperMarketStatus';
const base={phase:'SETTLED' as const,result:'YES' as const,R:'0',B:'0',rTarget:'1',bTarget:'1',yesPrice:.5,noPrice:.5};
describe('ended market cards',()=>{
 it('shows actual result rather than cleared-inventory odds for all outcomes',()=>{for(const result of ['YES','NO','INVALID'] as const){const text=renderToStaticMarkup(<PaperMarketStatus market={{...base,result}} lang="en"/>);expect(text).toContain('Final result');expect(text).toContain(result);expect(text).not.toContain('50.00%');}});
 it('does not invent odds for markets that never graduated',()=>{const text=renderToStaticMarkup(<PaperMarketStatus market={{...base,phase:'FAILED',result:null}} lang="zh"/>);expect(text).toContain('正式市场未开启');expect(text).not.toContain('50.00%');expect(text).not.toContain('YES');});
 it('retains live odds while a formal market is awaiting Core',()=>{const text=renderToStaticMarkup(<PaperMarketStatus market={{...base,phase:'WAIT_CORE',result:null,yesPrice:.6,noPrice:.4}} lang="en"/>);expect(text).toContain('60.00%');expect(text).toContain('40.00%');});
});
