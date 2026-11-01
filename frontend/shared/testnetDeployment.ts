export const CURRENT_TESTNET_FACTORY='0xCef7fCb7e4B3d5A273A9e5c6D84C2886cE93C3Aa';
export function resolveTestnetFactory(configured:string):string {
 return configured||CURRENT_TESTNET_FACTORY;
}
