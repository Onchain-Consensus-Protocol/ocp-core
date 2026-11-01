export const CURRENT_TESTNET_FACTORY='0x31647Df2eEaB14673F0fAF90B72dF77AAE3C66e5';
export function resolveTestnetFactory(configured:string):string {
 return configured||CURRENT_TESTNET_FACTORY;
}
