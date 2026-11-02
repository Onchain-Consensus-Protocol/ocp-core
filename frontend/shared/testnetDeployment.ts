export const CURRENT_TESTNET_FACTORY='0x2b1e91Cd45eCc51C521FF4b080cf50c70c639cA8';
export function resolveTestnetFactory(configured:string):string {
 return configured||CURRENT_TESTNET_FACTORY;
}
