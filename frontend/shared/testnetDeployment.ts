export const CURRENT_TESTNET_FACTORY='0x3A42205E931753B5e3F80dbf9536b048e7427113';
export function resolveTestnetFactory(configured:string):string {
 return configured||CURRENT_TESTNET_FACTORY;
}
