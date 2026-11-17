import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {GenesisPriceChart} from './GenesisPriceChart';

describe('Genesis price chart',()=>{
  const render=(prices:number[])=>renderToStaticMarkup(<GenesisPriceChart source="chain" history={prices.map((price,at)=>({price,at,kind:at?'GENESIS_BUY':'START'}))} events={[]} supply={0} k={.000001} zh unit="TSLA"/>);
  it('uses actual token units and a price-relative axis for tiny prices',()=>{
    const html=render([.000000000008,.000000000009]);
    expect(html).not.toContain('×10⁻⁷');
    expect(html).toContain('TSLA／枚');
    expect(html).toContain('e-12');
    expect(html).not.toContain('{unit}');
    expect(html).not.toContain('NaN');
  });
  it('offers zoom and reset even with only two points',()=>{
    const html=render([.00008,.000089]);
    expect(html).toContain('放大价格图表');
    expect(html).toContain('缩小价格图表');
    expect(html).toContain('重置');
    expect(html).not.toContain('disabled');
  });
  it('handles flat zero history without invalid coordinates',()=>{
    expect(render([0,0])).not.toMatch(/NaN|Infinity/);
  });
});
