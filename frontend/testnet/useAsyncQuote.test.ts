import {afterEach,describe,expect,it,vi} from 'vitest';
import {createQuoteRunner,type QuoteResult} from './useAsyncQuote';
afterEach(()=>vi.useRealTimers());
describe('quote request lifetime',()=>{
  it('finishes a slow quote despite repeated refresh requests at 15 and 20 seconds',async()=>{
    vi.useFakeTimers();let finish!:(v:number)=>void;
    const load=vi.fn(()=>new Promise<number>(resolve=>{finish=resolve;}));const states:QuoteResult<number>[]=[];
    const runner=createQuoteRunner(load,v=>states.push(v));
    await vi.advanceTimersByTimeAsync(15000);runner.refresh();
    await vi.advanceTimersByTimeAsync(5000);runner.refresh();
    await vi.advanceTimersByTimeAsync(5000);finish(42);await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);expect(states.at(-1)).toMatchObject({data:42,loading:false});runner.stop();
  });
  it('keeps the previous quote while refreshing and does not extend freshness on failure',async()=>{
    vi.useFakeTimers();vi.setSystemTime(0);let fail!:(e:Error)=>void;
    const load=vi.fn().mockResolvedValueOnce(7).mockImplementationOnce(()=>new Promise((_,reject)=>{fail=reject;}));
    const states:QuoteResult<number>[]=[];const runner=createQuoteRunner<number>(load,v=>states.push(v));
    await Promise.resolve();await vi.advanceTimersByTimeAsync(30000);
    expect(states.at(-1)).toMatchObject({data:7,loading:true,expiresAt:90000});
    fail(new Error('RPC unavailable'));await Promise.resolve();
    expect(states.at(-1)).toMatchObject({data:7,loading:false,expiresAt:90000});expect(states.at(-1)?.error).toBeInstanceOf(Error);runner.stop();
  });
  it('discards both success and error from a superseded market or input',async()=>{
    vi.useFakeTimers();let finish!:(v:number)=>void,fail!:(e:Error)=>void;
    const old=vi.fn();const a=createQuoteRunner(()=>new Promise<number>(r=>{finish=r;}),old);
    a.stop();finish(1);await Promise.resolve();expect(old).toHaveBeenCalledTimes(1);
    const error=vi.fn();const b=createQuoteRunner(()=>new Promise<number>((_,r)=>{fail=r;}),error);
    b.stop();fail(new Error('stale'));await Promise.resolve();expect(error).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100000);expect(old).toHaveBeenCalledTimes(1);expect(error).toHaveBeenCalledTimes(1);
  });
});
