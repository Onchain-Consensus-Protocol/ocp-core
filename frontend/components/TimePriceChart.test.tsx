import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {TimePriceChart,chartWindow,stepPoints} from './TimePriceChart';
describe('time-based market chart',()=>{
 it('holds each genuine price constant until the next trade, including quiet tail',()=>{expect(stepPoints([{at:10,yes:.5,no:.5},{at:40,yes:.6,no:.4}],20,60)).toEqual([{at:20,yes:.5,no:.5},{at:40,yes:.6,no:.4},{at:60,yes:.6,no:.4}]);});
 it('clamps zoom/pan windows to available data',()=>{expect(chartWindow(-50,50,0,200)).toEqual({start:0,end:100});expect(chartWindow(180,280,0,200)).toEqual({start:100,end:200});});
 it('renders the two complementary series with right-edge labels and time controls',()=>{const html=renderToStaticMarkup(<TimePriceChart points={[{at:1000,yes:.35,no:.65},{at:2000,yes:.4,no:.6}]} probability unit="TSLA" lang="en"/>);expect(html.match(/<path /g)).toHaveLength(2);expect(html).toContain('40.00%');expect(html).toContain('60.00%');expect(html).toContain('ALL');expect(html).not.toMatch(/NaN|Infinity/);});
 it('does not invent a quote when history is unavailable',()=>{const html=renderToStaticMarkup(<TimePriceChart points={[]} probability unit="TSLA" lang="en"/>);expect(html).toContain('Waiting for verified price history');expect(html).not.toContain('50.00%');});
});
