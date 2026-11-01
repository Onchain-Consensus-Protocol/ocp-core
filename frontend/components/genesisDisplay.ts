/** Genesis quantities use native token units, matching on-chain 18-decimal balances. */
export const GENESIS_TOKEN_UNIT = 1;
export const genesisTokens = (shares: number) => shares * GENESIS_TOKEN_UNIT;
export const genesisShares = (tokens: number) => tokens / GENESIS_TOKEN_UNIT;
export const genesisPrice = (pricePerShare: number) => {
  const value = pricePerShare / GENESIS_TOKEN_UNIT;
  if (value === 0) return "0.00000000";
  if (Math.abs(value) < 1e-16) return value.toExponential(6);
  return value.toLocaleString("en-US", { minimumFractionDigits: 8, maximumFractionDigits: 10 });
};
