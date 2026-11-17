import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
import {ActivityRecords,recordsForTab} from './ActivityRecords';
import type {TopicMarketEvent} from './topicMarketDemoModel';
const wallet='0x1111111111111111111111111111111111111111',tx='0x'+'a'.repeat(64);
const events:TopicMarketEvent[]=[{id:1,at:1,kind:'GENESIS_BUY',source:'MARKET',wallet,transactionHash:tx},{id:2,at:2,kind:'CORE_STAKE',source:'CORE',wallet,transactionHash:tx},{id:3,at:3,kind:'CLAIM_CORE',source:'CORE'}];
describe('separate actual market and stake records',()=>{
 it('keeps market and Core activity in their own tabs',()=>{expect(recordsForTab(events,false).map(e=>e.id)).toEqual([1]);expect(recordsForTab(events,true).map(e=>e.id)).toEqual([2,3]);});
 it('links real actor and transaction hash without synthetic wallet labels',()=>{const html=renderToStaticMarkup(<ActivityRecords events={events} core={false} lang="zh" symbol="TSLA" names={['Fake wallet']} onchain/>);expect(html).toContain('/address/'+wallet);expect(html).toContain('/tx/'+tx);expect(html).toContain('交易哈希');expect(html).not.toContain('Fake wallet');expect(html).not.toContain('质押记录');});
 it('leaves unknown actor/hash empty rather than using demo actors',()=>{const html=renderToStaticMarkup(<ActivityRecords events={[{id:1,at:0,kind:'CORE_STAKE',source:'CORE',actor:0}]} core lang="zh" symbol="TSLA" names={['Fake wallet']} onchain/>);expect(html).toContain('钱包');expect(html).toContain('—');expect(html).not.toContain('Fake wallet');expect(html).not.toContain('/address/');});
 it('separates local simulation event kinds while retaining demo names',()=>{const rows=[{id:1,at:0,kind:'CORE_STAKE',actor:0},{id:2,at:1,kind:'FORMAL_BUY',actor:0}];expect(recordsForTab(rows,true)).toHaveLength(1);const html=renderToStaticMarkup(<ActivityRecords events={rows} core lang="en" symbol="TSLA" names={['Demo A']} onchain={false}/>);expect(html).toContain('Demo A');expect(html).not.toContain('Transaction hash');});
});
