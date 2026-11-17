import {describe,it,expect} from 'vitest';
import {resolveTestnetFactory,CURRENT_TESTNET_FACTORY as current} from './testnetDeployment';
describe('current testnet deployment',()=>{
 it('uses the current deployment by default',()=>expect(resolveTestnetFactory('')).toBe(current));
 it('uses only an explicit configured factory override',()=>expect(resolveTestnetFactory('0x1234')).toBe('0x1234'));
});
