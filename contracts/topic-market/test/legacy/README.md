# Historical fixtures

`TopicMarketFactory.sol` and `TopicMarketPriceSnapshot.sol` preserve the old
single-collateral, six-decimal USDC route for historical regression tests.
`DeployTopicMarket.s.sol` is its historical deployment recipe, not a current
production deployment entry point.

The maintained route is `src/TopicMarketStockFactory.sol`, shared creation-code
carriers in `src/deployers/`, and `script/DeployTopicMarketStock.s.sol`. The
46630-only Factory and fixed-price reader remain separate testnet profiles.

Moving these fixtures does not change any existing on-chain deployment or grant
new trading, LP withdrawal, token minting or administrative rights.
