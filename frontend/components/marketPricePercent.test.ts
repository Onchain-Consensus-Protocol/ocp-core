import {describe,it,expect} from 'vitest';
import {marketPricePercent as fmt} from './marketPricePercent';
describe('market price percentages',()=>{
 it('preserves two decimals in normal prices',()=>{expect(fmt(.5)).toBe('50.00%');expect(fmt(.271234)).toBe('27.12%');});
 it('does not round small positive quotes to zero or near-one quotes to certainty',()=>{expect(fmt(.000085)).toBe('<0.01%');expect(fmt(.999915)).toBe('>99.99%');expect(fmt(.0001)).toBe('0.01%');expect(fmt(.9999)).toBe('99.99%');});
 it('distinguishes actual endpoints and missing values',()=>{expect(fmt(0)).toBe('0.00%');expect(fmt(1)).toBe('100.00%');expect(fmt(NaN)).toBe('—');});
});
