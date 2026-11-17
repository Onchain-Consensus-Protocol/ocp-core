> 2026-10-29 测试网状态：统一股票Factory已部署到Robinhood测试网46630，地址 `0x21210a6213D7B1c6D83f393488F0aFC0913EBEd5`；网页新增显式testnet钱包入口。资产登记仍待配置，源码验证尚未成功。详见frontend/README.md和contracts/topic-market/deployments/46630.json。主网未部署。

# OCP — OnChain Consensus Protocol

OCP combines capital-based consensus with topic markets: launch a topic, trade during Genesis, and unlock market trading and Core staking at graduation.

[Website](https://ocp-protocol.org/) · [OCP Market](https://market.ocp-protocol.org/)

The public application uses virtual funds. The current contract implementation is a development candidate; it has not been publicly deployed or independently audited.

## Run the application

```sh
cd frontend
npm ci
npm run dev
```

See [frontend setup](frontend/README.md) for authentication and database configuration.

## Contracts

The contract implementation is in `contracts/topic-market/` and includes its own dependencies.

```sh
cd contracts/topic-market
forge test --offline
forge build --offline --sizes
```

See [contract setup](contracts/topic-market/README.md).
