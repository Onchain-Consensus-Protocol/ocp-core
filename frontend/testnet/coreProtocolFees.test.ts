import {describe,it,expect} from 'vitest';
import {protocolFeeAttribution as fee} from './coreProtocolFees';
const base={total:100n,yesDistributed:60n,noDistributed:20n,invalidDistributed:80n,yesStake:10n,noStake:20n,settled:false,outcome:0};
describe('protocol fee attribution',()=>{
 it('counts only permanently unallocated fees before settlement',()=>{expect(fee(base)).toBe(20n);expect(fee({...base,yesStake:0n,noStake:0n})).toBe(20n);expect(fee({...base,total:110n,yesStake:0n,noStake:0n})).toBe(30n);});
 it('preserves final totals regardless of subsequent payment',()=>{expect(fee({...base,settled:true,outcome:1})).toBe(40n);expect(fee({...base,settled:true,outcome:2})).toBe(80n);expect(fee({...base,settled:true,outcome:3})).toBe(20n);});
 it('assigns all fees to protocol if no eligible participants remain',()=>{expect(fee({...base,settled:true,outcome:3,yesStake:0n,noStake:0n})).toBe(100n);});
 it('rejects inconsistent snapshots instead of displaying negative amounts',()=>{expect(()=>fee({...base,invalidDistributed:101n})).toThrow();});
});
