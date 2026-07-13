const BASE_RPC_URL = process.env.BASE_RPC_URL ?? "https://base.publicnode.com";

const SELECTOR = {
  factory: "0xc45a0155",
  stakeToken: "0x51ed6a30",
  totalStakeYes: "0x84c8eeb3",
  totalStakeNo: "0xd5e77612",
  totalStakeInvalid: "0x938a6a73",
  getVaultMeta: "0x1adeafed",
  isVault: "0x652b9b41",
  decimals: "0x313ce567",
  symbol: "0x95d89b41",
} as const;

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export interface VaultSnapshot {
  vault: string;
  blockNumber: number;
  title: string;
  tokenSymbol: string;
  tokenDecimals: number;
  yesRaw: bigint;
  noRaw: bigint;
  invalidRaw: bigint;
  totalRaw: bigint;
  yesAmount: string;
  noAmount: string;
  invalidAmount: string;
  totalAmount: string;
  yesPct: string;
  noPct: string;
  invalidPct: string;
}

export function isAddress(value: string | null): value is string {
  return Boolean(value && ADDRESS_RE.test(value));
}

function word(data: string, index: number): string {
  const clean = data.startsWith("0x") ? data.slice(2) : data;
  return clean.slice(index * 64, (index + 1) * 64);
}

function decodeUint(data: string): bigint {
  return BigInt(data || "0x0");
}

function decodeAddress(data: string): string {
  const clean = data.startsWith("0x") ? data.slice(2) : data;
  return `0x${clean.slice(-40)}`;
}

function decodeStringAt(data: string, offsetBytes: number): string {
  const clean = data.startsWith("0x") ? data.slice(2) : data;
  const offset = offsetBytes * 2;
  const length = Number(BigInt(`0x${clean.slice(offset, offset + 64) || "0"}`));
  const value = clean.slice(offset + 64, offset + 64 + length * 2);
  return new TextDecoder().decode(Uint8Array.from(value.match(/.{1,2}/g) ?? [], (byte) => parseInt(byte, 16)));
}

function decodeString(data: string): string {
  const offset = Number(BigInt(`0x${word(data, 0) || "0"}`));
  return decodeStringAt(data, offset);
}

function decodeStringPair(data: string): [string, string] {
  const firstOffset = Number(BigInt(`0x${word(data, 0) || "0"}`));
  const secondOffset = Number(BigInt(`0x${word(data, 1) || "0"}`));
  return [decodeStringAt(data, firstOffset), decodeStringAt(data, secondOffset)];
}

function encodeAddress(address: string): string {
  return address.slice(2).toLowerCase().padStart(64, "0");
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(BASE_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`Base RPC returned HTTP ${response.status}`);
  const payload = await response.json() as { result?: T; error?: { message?: string } };
  if (payload.error || payload.result === undefined) {
    throw new Error(payload.error?.message ?? `Base RPC ${method} failed`);
  }
  return payload.result;
}

async function ethCall(to: string, data: string, blockTag: string): Promise<string> {
  return rpc<string>("eth_call", [{ to, data }, blockTag]);
}

function formatToken(raw: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = (raw % base).toString().padStart(decimals, "0").slice(0, 2).padEnd(2, "0");
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${fraction}`;
}

function formatPct(raw: bigint, total: bigint): string {
  if (total === 0n) return "0.0%";
  const tenths = (raw * 1000n + total / 2n) / total;
  return `${tenths / 10n}.${tenths % 10n}%`;
}

export async function loadVaultSnapshot(vault: string, requestedBlock?: number): Promise<VaultSnapshot> {
  if (!isAddress(vault)) throw new Error("Invalid Vault address");

  const latestHex = await rpc<string>("eth_blockNumber", []);
  const latestBlock = Number(BigInt(latestHex));
  const blockNumber = requestedBlock ?? latestBlock;
  if (!Number.isSafeInteger(blockNumber) || blockNumber <= 0 || blockNumber > latestBlock) {
    throw new Error("Invalid snapshot block");
  }
  const blockTag = `0x${blockNumber.toString(16)}`;

  const factory = decodeAddress(await ethCall(vault, SELECTOR.factory, blockTag));
  if (!isAddress(factory)) throw new Error("Vault factory is invalid");

  const registered = decodeUint(await ethCall(factory, `${SELECTOR.isVault}${encodeAddress(vault)}`, blockTag)) !== 0n;
  if (!registered) throw new Error("Address is not registered by its OCP Factory");

  const [stakeTokenData, yesData, noData, invalidData, metaData] = await Promise.all([
    ethCall(vault, SELECTOR.stakeToken, blockTag),
    ethCall(vault, SELECTOR.totalStakeYes, blockTag),
    ethCall(vault, SELECTOR.totalStakeNo, blockTag),
    ethCall(vault, SELECTOR.totalStakeInvalid, blockTag),
    ethCall(factory, `${SELECTOR.getVaultMeta}${encodeAddress(vault)}`, blockTag),
  ]);

  const stakeToken = decodeAddress(stakeTokenData);
  const [decimalsData, symbolData] = await Promise.all([
    ethCall(stakeToken, SELECTOR.decimals, blockTag),
    ethCall(stakeToken, SELECTOR.symbol, blockTag),
  ]);

  const yesRaw = decodeUint(yesData);
  const noRaw = decodeUint(noData);
  const invalidRaw = decodeUint(invalidData);
  const totalRaw = yesRaw + noRaw + invalidRaw;
  const [title] = decodeStringPair(metaData);
  const tokenDecimals = Number(decodeUint(decimalsData));
  const tokenSymbol = decodeString(symbolData).slice(0, 12) || "TOKEN";

  return {
    vault,
    blockNumber,
    title: title.trim().slice(0, 180) || "OCP Consensus Vault",
    tokenSymbol,
    tokenDecimals,
    yesRaw,
    noRaw,
    invalidRaw,
    totalRaw,
    yesAmount: formatToken(yesRaw, tokenDecimals),
    noAmount: formatToken(noRaw, tokenDecimals),
    invalidAmount: formatToken(invalidRaw, tokenDecimals),
    totalAmount: formatToken(totalRaw, tokenDecimals),
    yesPct: formatPct(yesRaw, totalRaw),
    noPct: formatPct(noRaw, totalRaw),
    invalidPct: formatPct(invalidRaw, totalRaw),
  };
}
