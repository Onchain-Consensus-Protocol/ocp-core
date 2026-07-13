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
- `BASE_SEPOLIA_RPC_URL`：Base Sepolia RPC；
- 区块浏览器验证所需 API Key（按 Foundry 配置命名）。

## 只部署 Factory

部署脚本只部署 Factory，不会创建测试代币、市场或 Vault：

```bash
forge script script/DeployVaultFactory.s.sol:DeployVaultFactoryScript \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --broadcast \
  --verify
```

部署后分别确认：

1. 部署交易成功且地址存在字节码；
2. `owner()` 等于预期部署地址；
3. `officialStakeToken()` 等于目标网络的官方 USDC；
4. `getVaults()` 初始为空；
5. 区块浏览器显示源码验证成功。

Factory 部署和源码验证是两个结果，报告时必须分开记录。验证失败时应重试验证，不要重新部署同一合约。

## 创建 Vault

Factory 的 `createMarket` 参数为：

```text
stakeToken（必须等于 Factory 的 `officialStakeToken`）
resolutionTime
minStake
initialLiquidity（保留字段，当前忽略）
title
description
```

创建后核对：

- 创建交易发送者等于 Factory `owner`，其他地址调用会被拒绝；
- `resolutionTime` 是固定质押截止；
- `getVaultMeta(vault)` 的题面与含义完整；
- Vault 的质押代币和最低金额正确。

## 前端

前端使用：

- `VITE_FACTORY_ADDRESS`：Factory 地址；
- `VITE_DEPOSIT_TOKEN_ADDRESS`：与 Factory 固定代币一致；正式 Base 使用原生 USDC；
- `VITE_CHAIN_ID`：测试网 `84532`，正式 Base `8453`；
- `VITE_RPC_URL`：对应网络 RPC。

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
