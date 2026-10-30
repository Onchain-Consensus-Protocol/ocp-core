import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {EarlyTerminationNotice} from './EarlyTerminationNotice';
const base={request:{requestId:1n,requestedOutcome:1,processAfter:4600n},now:1000,lang:'zh' as const,connected:true,busy:false,onConnect:()=>{},onProcess:()=>{}};
describe('public early resolution notice',()=>{
  it('shows the requested result and countdown without prematurely offering processing',()=>{
    const html=renderToStaticMarkup(<EarlyTerminationNotice {...base}/>);
    expect(html).toContain('有人申请提前终止市场');expect(html).toContain('YES');expect(html).toContain('01:00:00');
    expect(html).not.toContain('<button');expect(html).toContain('尚未截止');
  });
  it('offers permissionless processing exactly at due and explains conditional reopening',()=>{
    const html=renderToStaticMarkup(<EarlyTerminationNotice {...base} now={4600}/>);
    expect(html).toContain('等待玩家处理');expect(html).toContain('处理提前终止申请');
    expect(html).toContain('尚未截止的操作恢复');expect(html).toContain('仅支付 gas');expect(html).not.toContain('00:00:00');
  });
  it('gives disconnected players a wallet connection action and shows NO correctly',()=>{
    const html=renderToStaticMarkup(<EarlyTerminationNotice {...base} request={{...base.request,requestedOutcome:2}} now={5000} connected={false}/>);
    expect(html).toContain('NO');expect(html).toContain('连接钱包并处理');
  });
  it('hides a consumed request and disables processing during a pending transaction',()=>{
    expect(renderToStaticMarkup(<EarlyTerminationNotice {...base} request={{...base.request,requestId:0n}}/>)).toBe('');
    expect(renderToStaticMarkup(<EarlyTerminationNotice {...base} now={5000} busy/>)).toContain('disabled');
  });
});
