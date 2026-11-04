import {describe,it,expect} from 'vitest';
import {marketStageLabel as label} from './marketStageLabel';
describe('visible market stages',()=>{
 it('distinguishes Genesis cutoff from executed failed settlement',()=>{
  expect(label('GENESIS',99,100,200,300,true)).toBe('Genesis · 交易中');
  expect(label('GENESIS',100,100,200,300,true)).toBe('毕业失败 · 待清算');
  expect(label('FAILED',101,100,200,300,true)).toBe('毕业失败 · 可退款');
 });
 it('shows deadlines even without phase-advancement transactions',()=>{
  expect(label('FORMAL',199,100,200,300,true)).toBe('正式市场 · 交易中');
  expect(label('FORMAL',200,100,200,300,true)).toBe('交易已截止 · Core 进行中');
  expect(label('FORMAL',300,100,200,300,true)).toBe('Core 已截止 · 待结算');
  expect(label('WAIT_CORE',300,100,200,300,true)).toBe('Core 已截止 · 待结算');
 });
 it('prioritizes pending early processing and actual final states',()=>{
  expect(label('FORMAL',150,100,200,300,true,true)).toContain('提前结算');
  expect(label('SETTLED',150,100,200,300,true,true)).toBe('已结算 · 可领取');
 });
});
