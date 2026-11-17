# Test 7: real-pool swap rollback on a local fork

Fork: Robinhood Testnet (46630), block 148265762, hash `0x4fe9fa97aba3421a73dd29273d01d9a02faed761d476833870301969e3f04eb6`.
Execution: local Anvil only at http://127.0.0.1:18545. No public-chain transactions were sent. No wallet private key was read.

The older audit block was unavailable from the public RPC due to pruned historical state, so the successful run used a newer pinned fork. Existing deployed Factory, Router, Exchange, stock, stablecoin, QuoterV2 and V3 pool were used. Markets needed for individual paths were created on the fork only. Local impersonation and native-gas funding were used; no token balances, token code or pool storage were patched.

All seven cases passed. Six cases use a real local V3 swap by a second account to move pool price after an initially executable quote. The seventh deliberately sets an invalid business limit after a valid exchange to verify rollback across both contracts.

| Case | Failure reason | Failed receipt | State snapshot | Fresh-quote retry | Gas used |
|---|---|---:|---|---:|---:|
| Genesis USDG buy | Too little received | 0 (reverted) | Unchanged | 1 (success) | 339959 |
| Formal USDG buy | Too little received | 0 (reverted) | Unchanged | 1 (success) | 340109 |
| Core USDG stake | Too little received | 0 (reverted) | Unchanged | 1 (success) | 351581 |
| Formal USDG sell | Too little received | 0 (reverted) | Unchanged | 1 (success) | 677043 |
| Market USDG claim | Too little received | 0 (reverted) | Unchanged | 1 (success) | 435490 |
| Core USDG claim | Too little received | 0 (reverted) | Unchanged | 1 (success) | 484481 |
| Formal buy business failure after swap | SLIPPAGE | 0 (reverted) | Unchanged | 1 (success) | 493980 |

## Assertions

- The quote was executable with router.execute.staticCall before pool manipulation.
- For stale-price cases, the new pool quote was below the original minimum. The actual failure was a mined local transaction, not just an estimation failure or UI rejection.
- Failed receipts have status 0 and no logs. They ran out neither of gas nor of wallet funds.
- Sampled state before and after failure was identical: both tokens for user, manipulator, Market, Core, Adapter, early module, Router, Exchange, V3 pool and DEX router; relevant allowances; Market cash/fees/supply/liability buckets; Core principal/fee indices/liability buckets; user gToken/YES/NO/wallet LP and LP total supply; pool slot0 and liquidity.
- User ETH changed only by the failed receipt gas fee. The separate approval transaction, where needed, was already successful before the failure baseline; its allowance remains valid after rollback.
- A fresh quote succeeded after each failed transaction. In particular, LP and Core claims were not consumed by the reverted USDG conversion. Router, Exchange, Adapter and early module balances were zero after successful retry.

## Local transaction evidence

These transaction hashes exist only in the local test fork; do not search for them in the public explorer. Each case was isolated with EVM snapshot/revert.

### Genesis USDG buy

Local market: `0x3E37a1e4450c67bee35542d980e98699C23cd835`.
Failed local transaction: `0x3d638400f1637c94ad29e0d7ffbb1414e0ed3c2f362c2d77f6647ea88195d23e`.
Retry local transaction: `0xcc4e26f028479a8feffdf7f00822d691251398319f2b5ccf6c86f0c8bec89050`.
Before/after sampled state hash: `0x6d6af7f9be3f91e9afc6d16b413a2a5db359aeae56d5c5b66dee3d029bbda205`.
Failed gas fee: 3.174877101E-8 local ETH.
Original executable output quote: 0.000629582790160723 TSLA.
Output quote after independent pool trade: 0.000512050578741941 TSLA.
Independent local pool trade: `0xd33425c9d16acc2c8268a05b7612bd1830cb940e72d4b50eeac76b038ee2b7f1`.

### Formal USDG buy

Local market: `0x3E37a1e4450c67bee35542d980e98699C23cd835`.
Failed local transaction: `0xd66090880fdcc1fdd4f869a4c9db2d914d79e379097a3d59f66040a0dfa04c5e`.
Retry local transaction: `0x28f1ef5c8ca28c2b57f85a7782e13191f46bf6f361151b0efb367cfb328aaf7f`.
Before/after sampled state hash: `0x3225e6cbe1630f1e3ea5570343bc3858302f5b0f26c0fb4527cf7d49aaf72bc6`.
Failed gas fee: 9.550940938E-9 local ETH.
Original executable output quote: 0.000546558868149198 TSLA.
Output quote after independent pool trade: 0.000444519522998285 TSLA.
Independent local pool trade: `0x3840bc1638cba788b3c859f8ba7bb863c8c37ea59b386fe31786dd608e67ebbd`.

### Core USDG stake

Local market: `0x3E37a1e4450c67bee35542d980e98699C23cd835`.
Failed local transaction: `0xc71931b17abf6dffef119f9bea2fc0dfda515efe348b45eb0de73be2c8af6f96`.
Retry local transaction: `0x5a9239abfe78c88f6dc9c64b4e6535078348c08b638b6b2c03f203a49906a6e7`.
Before/after sampled state hash: `0x6d6d7d4d16e782706c2772270f7dc100b986009d5fe88d2fdace7e548d1350b4`.
Failed gas fee: 2.969804707E-9 local ETH.
Original executable output quote: 0.000629582790160723 TSLA.
Output quote after independent pool trade: 0.000512050578741941 TSLA.
Independent local pool trade: `0x0673fcd92b77c85019f5821dc7923330ddc8bcd48ab776ee9871e2f9fb3c8bfa`.

### Formal USDG sell

Local market: `0x3E37a1e4450c67bee35542d980e98699C23cd835`.
Failed local transaction: `0x63c41a62d57133a6ee411e89d97c9d9ec0e9d5b590547ea141420cab17f798cc`.
Retry local transaction: `0xc8a83fdcecc21ce65258f1d31a7fecd98d6534dae912d947f448b8b2d5711d02`.
Before/after sampled state hash: `0x77126f7421d81a6eb6792905c88fee456553252c81aa40f8f274e282bb1d2b9d`.
Failed gas fee: 1.507097718E-9 local ETH.
Original executable output quote: 0.004185 USDG.
Output quote after independent pool trade: 0.003548 USDG.
Independent local pool trade: `0x52683c8cf9549922a7848122fb93060392d2b14db5a9f11eb67f02b8314d27a8`.

### Market USDG claim

Local market: `0x3E37a1e4450c67bee35542d980e98699C23cd835`.
Failed local transaction: `0x744ae57528cb87338c0aa027acf8f28e616d1178a079b01151478b9fc96e7391`.
Retry local transaction: `0x7dab5b8420dd63d39ed5d8eb292a13b0d73a76e68d45c6fe6983eb4516c7a153`.
Before/after sampled state hash: `0x483e0614452377eea99a07c97c163c0f6d3f75e81cc7c2b4421c9055b73a3d9c`.
Failed gas fee: 2.9264928E-10 local ETH.
Original executable output quote: 0.066649 USDG.
Output quote after independent pool trade: 0.056529 USDG.
Independent local pool trade: `0xc8a51b391029cfa8a005b304466e1f18704d20b9b1226671164c4aab5d6c5f3e`.

### Core USDG claim

Local market: `0x3E37a1e4450c67bee35542d980e98699C23cd835`.
Failed local transaction: `0xd30824558e3688a40fd2a63687b0ebeaf9e387e169984caf8cee05eb93a0ac97`.
Retry local transaction: `0x710365b7598522c7f5d8c6d65b3ccb0e99a5548e638bf0dfcd09110b5395fa57`.
Before/after sampled state hash: `0x06d1c445f08a0ad3379da40729d376dc760453614f00af0ef27b996bc224b4bf`.
Failed gas fee: 7.6547998E-11 local ETH.
Original executable output quote: 0.015744 USDG.
Output quote after independent pool trade: 0.013347 USDG.
Independent local pool trade: `0x0b1a872a16719d7180952371dcc910d334cf3a826845a88db0c7d3c3dce5169a`.

### Formal buy business failure after swap

Local market: `0x3E37a1e4450c67bee35542d980e98699C23cd835`.
Failed local transaction: `0x89a403b4488c8900ec759fa351e50a77c2f87bb366d5dce8ecc32a327a6709cc`.
Retry local transaction: `0x194cb7dd6605c85ac570c6742875a79c6c52f49df1c5a06e52bc96707b9dc74b`.
Before/after sampled state hash: `0x7f8a60dac2511f50948a18347226b7128693c028c840b41836208deac3c6c172`.
Failed gas fee: 3.606054E-11 local ETH.
Original executable output quote: 0.000546558868149198 TSLA.

## Limits

This is contract-level integration testing against deployed code and a real pool on a local fork. It is not a browser-wallet automation test, a public-chain failed transaction test, or a claim that every EVM storage slot was sampled. EVM atomicity plus failed receipts, sampled state equality and successful retries support the tested rollback paths. The intentionally invalid business-limit case is fault injection, unlike the six price-movement cases.
