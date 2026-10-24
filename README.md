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

The current implementation is in `contracts/topic-market/` and includes its dependencies. Older contracts and routes are retained as historical experiments.

```sh
cd contracts/topic-market
forge test --offline
forge build --offline --sizes
```

See [contract setup](contracts/topic-market/README.md).
