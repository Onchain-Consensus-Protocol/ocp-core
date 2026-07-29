# OCP 部署指南

当前 Stake War 采用单一公开质押期规则。正式 Base Factory 在构造时固定唯一质押代币为 Base 原生 USDC；任何其他代币都不能创建官方 Vault。只有 Factory `owner` 可以创建命题和 Vault。

## 部署前

```bash
cd contracts
forge build
forge test
```

正式 Base 部署前还必须运行真实 USDC Fork 集成测试：

```bash
export BASE_RPC_URL="你的 Base 主网归档 RPC"
# 可选：固定区块，确保每次测试使用相同主网状态
export BASE_FORK_BLOCK="区块号"
forge test --match-contract OCPVaultBaseForkTest -vvv
```

该测试使用 Base 原生 USDC 的真实合约代码和管理接口，但所有质押、结算与黑名单操作只发生在本地 Fork，不会广播主网交易。未配置 `BASE_RPC_URL` 时测试会显示为跳过，而不是伪装成通过。

确认环境变量已经在本机配置，但不要写入 Git：

- `PRIVATE_KEY`：部署钱包私钥；
- `STAKE_TOKEN`：Factory 唯一允许的质押代币；Base 主网必须为原生 USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`；
- `OFFICIAL_LIQUIDITY_POOL`：接收 0.2% 手续费、专用于后续市场初始补贴的官方多签或资金池；
- `BASE_RPC_URL`：Base 主网 RPC；
- 区块浏览器验证所需 API Key（按 Foundry 配置命名）。

## 只部署 Factory

部署脚本部署 Factory；Factory 构造函数会同时创建一个 `OCPVaultDeployer` 和一个
`PredictionMarketDeployer`，但不会创建测试代币、市场或 Vault：

```bash
forge script script/DeployVaultFactory.s.sol:DeployVaultFactoryScript \
  --rpc-url "$BASE_RPC_URL" \
  --broadcast \
  --verify
```

部署后分别确认：

1. 部署交易成功且地址存在字节码；
2. `owner()` 等于预期部署地址；
3. `officialStakeToken()` 等于目标网络的官方 USDC；
4. `officialLiquidityPool()` 等于预期官方资金池；
5. `vaultDeployer()` 与 `marketDeployer()` 均存在字节码；
6. `getVaults()` 与 `getMarkets()` 初始均为空；
7. 区块浏览器显示 Factory 和两个部署器源码均验证成功。

Factory 部署和源码验证是两个结果，报告时必须分开记录。验证失败时应重试验证，不要重新部署同一合约。

## 创建 Vault

Factory 的 `createMarket` 参数为：

```text
stakeToken（必须等于 Factory 的 `officialStakeToken`）
resolutionTime
minStake
initialLiquidity（LMSR 流动性参数 b，6 位 USDC 单位）
title
description
```

Factory owner 必须提前授权 Factory 使用 `ceil(b × ln(2))` 加安全缓冲的
官方 USDC。创建交易会原子部署 Vault 和 Prediction Market、注入补贴并激活；
任一步失败全部回滚。

创建后核对：

- 创建交易发送者等于 Factory `owner`，其他地址调用会被拒绝；
- `resolutionTime` 是固定质押截止；
- `getVaultMeta(vault)` 的题面与含义完整；
- Vault 的质押代币和最低金额正确。
- `marketByVault(vault)` 与事件中的 market 一致；
- Market 已激活，`subsidyProvider` 与实际补贴方一致；
- 空 Vault 到期能够终局为 `INVALID`。

## 前端

前端使用：

- `VITE_FACTORY_ADDRESS`：Factory 地址；
- `VITE_DEPOSIT_TOKEN_ADDRESS`：与 Factory 固定代币一致；正式 Base 使用原生 USDC；
- `VITE_CHAIN_ID`：测试网 `84532`，正式 Base `8453`；
- `VITE_RPC_URL`：对应网络 RPC。
- `VITE_ADMIN_FACTORY_ADDRESS`：管理页专用的 V5 Factory 地址；未配置时才回退到全局 Factory；
- `VITE_ADMIN_FACTORY_CODE_HASH`：已审核 V5 Factory 的链上 runtime bytecode hash；
- `VITE_ADMIN_DEPLOYMENT_ENABLED`：只有地址、源码验证、runtime hash、部署器与官方流动性池全部核对后才设为 `true`；
- `VITE_RECOVERY_RPC_URL`：用于读取历史 receipt/区块的独立恢复 RPC。管理页不会再用大区间
  `eth_getLogs` 猜测旧交易，而是先按 sender + nonce 从 Blockscout 定位交易，再严格核对
  target、value、calldata、receipt 和 `MarketCreated`。

前端只支持当前 V5 Factory。旧 Factory、旧 Vault、未知深链和非官方 Deployer
创建的实例均不得读取为可交易市场。V5 生产预检必须同时核对：

- Factory runtime hash；
- `officialStakeToken`、`officialLiquidityPool`；
- `vaultDeployer` 与 `marketDeployer` 的链上字节码；
- Factory owner；
- Base 原生 USDC 的地址、6 位精度和符号。

创建前页面应显示 owner 的 USDC 余额、Factory allowance 和精确
`requiredSubsidy`。当前固定 `b = 1,000 USDC` 时，补贴为
`693.147183 USDC`。创建成功后必须核对规范链 receipt 中的
`MarketCreated`/`MarketActivated`，并按 latest 回读 Vault/Market 双向注册、
LMSR 不可变参数、补贴提供者、条件编码和 1.2%/1.0%/0.2% 费率。不能用
`receipt.blockNumber` 的区块末状态强求“零交易”：同一区块内后续交易可能已经合法
改变份额、余额和手续费桶；初始零状态由已审核的 Factory runtime 与原子创建事件保证。

Base 原生 USDC 使用 6 位小数：`1 USDC = 1_000_000` 最小单位。部署和创建 Vault 时，`minStake` 必须使用 6 位精度，不能使用 `1 ether`。

USDC 由 Circle 管理并采用可升级合约。Circle 暂停 USDC 或将 Vault/领取地址列入黑名单时，质押或领取会失败；OCP 合约不能绕过这些权限。交易失败会整体回滚，领取状态不会被错误标记为完成，恢复后可以重试。

```bash
cd frontend
npm install
npm run build
```

## 发布边界

- 修改或部署 Factory 不等于创建 Vault；
- 创建 Vault 必须单独获得明确授权；
- 前端发布必须在 Factory 地址、ABI 和链上合约一致后进行。

## Base 主网 V5 部署记录

- 部署交易：`0xaf7be99192cb82d86e5504c527031c3bb9495fab1c079c443767f739c71c93b4`
- Factory：`0x97B33092848a38Bb1abCAD3FEf0c72e2e3B8bBf0`
- Factory runtime hash：`0xd35a9a60cfa96671b443e0f89b4f065d926b3a191d7a6d4ab0678feaeeece319`
- VaultDeployer：`0xE4f1c071071ec001FCA10F9152d20FAa3F80239F`
- PredictionMarketDeployer：`0xDB11A103b6C1b798fe41895F8707E5442Bf0C356`
- Factory owner / officialLiquidityPool：`0x1556a9A5C01ecc4eF11e751CacC847DD36971be7`
- officialStakeToken：Base 原生 USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- 编译器：Solidity `0.8.20`，optimizer `200` runs，EVM `shanghai`
- Factory、VaultDeployer、PredictionMarketDeployer 均已在 Basescan 验证源码。
