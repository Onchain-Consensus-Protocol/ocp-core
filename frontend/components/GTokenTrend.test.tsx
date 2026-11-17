import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {GTokenTrend} from './GTokenTrend';
const render=(prices?:number[],error=false)=>renderToStaticMarkup(<GTokenTrend prices={prices} unit="TSLA" lang="zh" error={error}/>);
describe('card gToken trend',()=>{
 it('plots real native prices and displays the last price',()=>{const html=render([0,.000001,.000002]);expect(html).toContain('polyline');expect(html).toContain('0.00000200');expect(html).toContain('TSLA');expect(html).toContain('gToken 价格趋势');});
 it('distinguishes loading, unavailable and no trades',()=>{expect(render()).toContain('读取中');expect(render(undefined,true)).toContain('暂不可用');expect(render([0])).toContain('暂无成交');expect(render()).not.toContain('polyline');});
 it('keeps flat histories finite',()=>{expect(render([0,0])).not.toMatch(/NaN|Infinity/);});
});
