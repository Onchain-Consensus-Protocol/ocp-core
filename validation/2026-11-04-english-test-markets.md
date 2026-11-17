# English Test Markets - 2026-11-04

Network: Robinhood Testnet (46630).
Creator: `0x1556a9A5C01ecc4eF11e751CacC847DD36971be7`.
Graduation threshold: 0.0042 TSLA. Native gToken curve k = 0.000001.

All seven markets were created and verified with phase GENESIS, R = 0 and S = 0. No purchases, stakes, swaps, proposals or settlements were executed.

| Deadline | Shanghai time |
|---|---|
| Genesis trading ends | 2026-11-04 14:40:00 UTC+08:00 |
| Formal trading ends | 2026-11-04 15:40:00 UTC+08:00 |
| Core final cutoff | 2026-11-04 16:40:00 UTC+08:00 |

Total creation gas actually paid: 0.00083416673 test ETH.

## [TEST] Core Exit, Restaking and Fee History

[Open market](https://market.ocp-protocol.org/testnet.html?lang=en&market=0x38bcff2976Fd4F6Be93a605c57D9F37fF2De6638)

Market: `0x38bcff2976Fd4F6Be93a605c57D9F37fF2De6638`  
Core: `0x196a3f9b64E488B9C0a4B72DB0b02e1526384D1F`  
Adapter: `0x9cbA235531E81f3501785fCd5826483964559d49`  
Creation transaction: [0x637c8677e111469935134941e26af5135cc926bdd375b26c8c357d669d020beb](https://explorer.testnet.chain.robinhood.com/tx/0x637c8677e111469935134941e26af5135cc926bdd375b26c8c357d669d020beb)

Graduate, stake on a side, generate fees, exit and restake. Check the 10% principal penalty, forfeited accrued fees and exclusion from earlier fee periods.

## [TEST] Failed Early Settlement and Deadline Boundaries

[Open market](https://market.ocp-protocol.org/testnet.html?lang=en&market=0x421e0d1147DB6ccEa8429B20E08C16f3e43cDb88)

Market: `0x421e0d1147DB6ccEa8429B20E08C16f3e43cDb88`  
Core: `0x6250c17ba57B7ba852688846Bf0857506285Dc2B`  
Adapter: `0x8921709fEe8Bea8e75938031e2d5d7aee4d9fCd1`  
Creation transaction: [0x96f675de9b85dc44c861b24ccb6873d31ce00d1b8316915bd0e1d80fd4b9ae06](https://explorer.testnet.chain.robinhood.com/tx/0x96f675de9b85dc44c861b24ccb6873d31ce00d1b8316915bd0e1d80fd4b9ae06)

Graduate, stake and propose a result that does not have a strict Core majority when the one-hour window ends. Process it, check bond forfeiture and reopening, then test another proposal and final-cutoff boundaries.

## [TEST] INVALID - No Core Stakes

[Open market](https://market.ocp-protocol.org/testnet.html?lang=en&market=0x6497946e865646852717a5887f281479Ca869147)

Market: `0x6497946e865646852717a5887f281479Ca869147`  
Core: `0xC194B0df2e503893D8cD22B7646E52a65d994B00`  
Adapter: `0x1CbD4F8803f24168CF84805D84DD641a9e02b5e8`  
Creation transaction: [0x2c17098624764c7585751eabb9e6bad23566285aff1e68bc265a3c7f71a63170](https://explorer.testnet.chain.robinhood.com/tx/0x2c17098624764c7585751eabb9e6bad23566285aff1e68bc265a3c7f71a63170)

Graduate and trade YES/NO without staking in Core. After the final cutoff, settle and check INVALID market payouts.

## [TEST] INVALID - Equal YES and NO Stakes

[Open market](https://market.ocp-protocol.org/testnet.html?lang=en&market=0x98c311827874080a6830bF444D661fa70f289d0d)

Market: `0x98c311827874080a6830bF444D661fa70f289d0d`  
Core: `0x223Fd4bFe5082711A43855462759983c791E48ec`  
Adapter: `0x8212934617d73E45137D31fc05bd0A1DbdCC7707`  
Creation transaction: [0xa398e77f9a80a8104e2ebf907e3f44b619dd65a8e23029b356ad080060ba6c74](https://explorer.testnet.chain.robinhood.com/tx/0xa398e77f9a80a8104e2ebf907e3f44b619dd65a8e23029b356ad080060ba6c74)

Graduate. Stake equal Core principal on YES and NO. After the final cutoff, settle and check INVALID principal, fees and market payouts.

## [TEST] INVALID - No Strict Majority

[Open market](https://market.ocp-protocol.org/testnet.html?lang=en&market=0x44773B51832BaDa0DEc1D36A35C8b1C6dD0d7d6A)

Market: `0x44773B51832BaDa0DEc1D36A35C8b1C6dD0d7d6A`  
Core: `0x8A17c39503d3F65A6994A848942AC619ea8ad8B6`  
Adapter: `0x87A92abbFE974e6bA8940D835cbE501CeE8F7b25`  
Creation transaction: [0xe973dbb7ced5a891ad4da3ef4754cf6201d5e91ebfbaa376844bd8622896ea9e](https://explorer.testnet.chain.robinhood.com/tx/0xe973dbb7ced5a891ad4da3ef4754cf6201d5e91ebfbaa376844bd8622896ea9e)

Graduate. Fund YES, NO and INVALID so neither YES nor NO strictly exceeds 50% of all active Core principal. Settle after the final cutoff.

## [TEST] Multiple Wallets and Claim Order

[Open market](https://market.ocp-protocol.org/testnet.html?lang=en&market=0xd99C6685ebAaccE7a1cA8e407C84E787931AC718)

Market: `0xd99C6685ebAaccE7a1cA8e407C84E787931AC718`  
Core: `0x8C5fB3E1bB61F2F2DD86E228659c65759315Af05`  
Adapter: `0xAf74164C0662f29427034e3F9C9C2E7aE0DF604D`  
Creation transaction: [0xce71b7537304db62296bfcace2a47aefef0ba3d1e09ff6c2949dbd54694bbdb2](https://explorer.testnet.chain.robinhood.com/tx/0xce71b7537304db62296bfcace2a47aefef0ba3d1e09ff6c2949dbd54694bbdb2)

Use several wallets during Genesis and Formal, add Core stake at different times, and claim after settlement in different orders. Check each payout and total conservation.

## [TEST] USDG Swap Failure and Slippage Rollback

[Open market](https://market.ocp-protocol.org/testnet.html?lang=en&market=0x0bd2f7947385a72f2b31000717622467D268689a)

Market: `0x0bd2f7947385a72f2b31000717622467D268689a`  
Core: `0x2830F5fe8e84A96b0676246140fAF60A4CF33852`  
Adapter: `0x4D43CcE3e11555320a01b56b0d9F3344a20c9b7f`  
Creation transaction: [0xbdf78fe66ad7df55dcf88d0ece2b27c4bba9f9f316d21806103b142546449b28](https://explorer.testnet.chain.robinhood.com/tx/0xbdf78fe66ad7df55dcf88d0ece2b27c4bba9f9f316d21806103b142546449b28)

Try USDG buys, sells, stakes and claims that exceed pool depth or violate the slippage limit. Failed transactions must revert without leaving tokens in Router, Exchange or Adapter.

## Test setup and boundaries

- Graduate markets before testing Formal or Core: buy gToken until the graduation threshold is reached. No market is pre-funded.
- Core test stakes use stock-token principal. If entering through USDG, use the actual stock amount received by Core when setting ratios.
- No-stake INVALID: do not stake in Core. Equal-stake INVALID: use equal raw TSLA amounts. No-majority INVALID: an example is 40% YES, 35% NO and 25% INVALID, using three wallets.
- Early settlement failure: submit a side that does not achieve a strict majority at processing. Wait for the full confirmation window, then process it. The proposal uses the existing fixed stock bond (1.25 TSLA for this test profile). Submit early enough to leave the required full window before the final cutoff.
- Fee transfer failure and retry require fault injection with a rejecting token or recipient environment. Creating these ordinary TSLA markets does not test that path.
- Swap rollback tests require an on-chain revert to verify atomic rollback. A frontend quote rejection alone is not proof that the transaction rollback path was exercised.
- Creating these markets prepares test cases; it does not mean those cases have passed.
