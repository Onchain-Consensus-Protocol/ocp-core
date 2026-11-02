import {describe,it,expect} from 'vitest';
import {totalLPBalance} from './lpBalance';
describe('LP ownership includes graduation escrow',()=>{
 it('preserves the exact entitlement before and after wallet materialization',()=>{const amount=120119439658759156234n;expect(totalLPBalance({lp:0n,genesisShares:amount},1)).toBe(amount);expect(totalLPBalance({lp:amount,genesisShares:0n},1)).toBe(amount);expect(totalLPBalance({lp:7n,genesisShares:amount},3)).toBe(amount+7n);});
 it('does not misclassify Genesis or failed launch shares as LP',()=>{for(const phase of [0,4])expect(totalLPBalance({lp:0n,genesisShares:100n},phase)).toBe(0n);expect(totalLPBalance(undefined,1)).toBeUndefined();});
});
