/** Robinhood Chain collateral candidates, identified by address rather than token symbol. */
export const cryptoAssets = [
  { symbol: 'CASHCAT', address: '0x020bfC650A365f8BB26819deAAbF3E21291018b4', wethPool: '0xd42A491087a15E5afd51FEb3606066Cc152d2b09' },
  { symbol: 'AI', address: '0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18', wethPool: '0xc4a21f9d6485FC5893DD4A491B320a83DAF4Da1D' },
  { symbol: 'HMM', address: '0x7FE995a80075dF3Dc8Ae11A9b82c7FE4202CD87f', wethPool: '0x2b0D0183d017c58B924401cA8AC362f6E01F0E9e' },
  { symbol: 'PONS', address: '0x39dBED3a2bd333467115dE45665cC57F813C4571', wethPool: '0x10CC6BD38112cAc182db90B6a71d8Bb5939526bA' },
  { symbol: 'STONKBROKER', address: '0xe934e36A439C94017B64a3FecE66AF12099aBF50', wethPool: '0x9cd74d5980A4BF60408B9bA2B0F6a3d368EBf594' },
] as const;
