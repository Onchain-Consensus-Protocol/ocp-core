import {describe,it,expect} from 'vitest';
import {resolveTestnetFactory,CURRENT_TESTNET_FACTORY as current,LEGACY_TESTNET_FACTORY as legacy} from './testnetDeployment';
describe('testnet deployment selection',()=>{
 it('uses the deployed new factory when no override or an obsolete default exists',()=>{expect(resolveTestnetFactory('','')).toBe(current);expect(resolveTestnetFactory(legacy,'')).toBe(current);});
 it('preserves the legacy claim entry and the old shared market link',()=>{expect(resolveTestnetFactory(current,'?deployment=legacy')).toBe(legacy);expect(resolveTestnetFactory(current,'?market=0xBe0d01292Df5cef376A40be7433C9b5B0C398857')).toBe(legacy);});
 it('ignores arbitrary URL factory overrides and retains explicit deployment configuration',()=>{expect(resolveTestnetFactory(current,'?factory=0x0000000000000000000000000000000000000001')).toBe(current);expect(resolveTestnetFactory('0x0000000000000000000000000000000000000001','')).toBe('0x0000000000000000000000000000000000000001');});
});
