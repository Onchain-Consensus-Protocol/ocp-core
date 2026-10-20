/** 仅调整Genesis代币面额：1个内部计算份额 = 1,000万枚展示代币。
 * 买卖数量双向换算，报价与持仓使用同一面额，现金和权益比例不变。
 */
export const GENESIS_TOKEN_UNIT = 10_000_000;
export const genesisTokens = (shares: number) => shares * GENESIS_TOKEN_UNIT;
export const genesisShares = (tokens: number) => tokens / GENESIS_TOKEN_UNIT;
export const genesisPrice = (pricePerShare: number) => {
  const value = pricePerShare / GENESIS_TOKEN_UNIT;
  if (value === 0) return "0.00000000";
  if (Math.abs(value) < 1e-16) return value.toExponential(6);
  return value.toLocaleString("en-US", { minimumFractionDigits: 8, maximumFractionDigits: 10 });
};
