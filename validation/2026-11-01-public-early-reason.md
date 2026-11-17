# Public early-settlement proposer and reason

Pending announcement and detail display the on-chain proposer wallet as an explorer link and verified public reason text. Simulation displays its actual player label and stored reason, without inventing a wallet.

No Solidity changes: new direct-Core and Router proposal transactions append a bounded versioned UTF-8 reason envelope outside ABI data. Gas estimation and submission use the identical complete calldata. Core continues to validate/store its original reason hash. Other browsers recover the preimage from the public transaction, checking registered-market creation, Core request event/id/proposer/side/bond/hash, canonical block/transaction identity, transaction target and decoded request, and reason hash. Malformed/unavailable or historical hash-only reasons are not guessed; the wallet is still displayed and text is marked unavailable. Raw text is React escaped.

Successful lookups are cached and inflight requests shared; failure can retry. Optional public metadata reading waits at most five seconds without blocking settlement operations. No local-only reason store or external storage service is required.

Validation: 324 frontend/server tests passed, 9 external integrations skipped; TypeScript and testnet build passed. New checks cover multilingual text, malformed/tampered envelopes, direct and routed independent viewing, transaction/event/actor binding, matching estimate/send calldata and HTML escaping. No chain deployment or public-chain transaction sent.
