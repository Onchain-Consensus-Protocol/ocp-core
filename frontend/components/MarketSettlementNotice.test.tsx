import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {MarketSettlementNotice} from './MarketSettlementNotice';
const render=(failed:boolean,connected=true)=>renderToStaticMarkup(<MarketSettlementNotice failed={failed} lang="zh" connected={connected} busy={false} onConnect={()=>{}} onProcess={()=>{}}/>);
describe('top settlement notice',()=>{
 it('shows exactly one relevant action',()=>{const failure=render(true),final=render(false);expect(failure).toContain('执行未毕业清算');expect(failure).not.toContain('执行最终结算');expect(final).toContain('执行最终结算');expect(final).not.toContain('执行未毕业清算');expect(final.match(/<button/g)).toHaveLength(1);});
 it('offers connection for any visitor before processing',()=>{expect(render(true,false)).toContain('连接钱包');expect(render(true,false)).not.toContain('disabled=');});
});
