export const CURRENT_TESTNET_FACTORY='0x2b1e91Cd45eCc51C521FF4b080cf50c70c639cA8';
// Canonical deployment receipt: 0x53ad0a4a6c85a2f5aab0f037ed21f749a2f7f03c8ebcb56c61ebd5be36839dfa.
export const CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK=146795100;
export function resolveTestnetFactory(configured:string):string {
 return configured||CURRENT_TESTNET_FACTORY;
}
