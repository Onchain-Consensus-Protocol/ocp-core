/// <reference types="vite/client" />

const mainnetLottery = "0xFd8c333e586A0d2a2Ebe1808d6879E3dd97E0e7C";
const address = import.meta.env.VITE_LOTTERY_CONTRACT?.trim() || mainnetLottery;
export const lotteryContractAddress = address && /^0x[0-9a-fA-F]{40}$/.test(address) && !/^0x0{40}$/.test(address)
  ? address.toLowerCase()
  : null;

const api = import.meta.env.VITE_LOTTERY_API_URL?.trim();
export function lotteryApiUrl(path: string) {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  if (api || local) return resolveLotteryApiUrl(api || "http://127.0.0.1:8787/", path, window.location.origin);
  const requested = new URL(path, window.location.origin);
  const endpoint = new URL("/api/lottery-keeper", window.location.origin);
  endpoint.searchParams.set("endpoint", requested.pathname.slice(1));
  const round = requested.searchParams.get("round");
  if (round !== null) endpoint.searchParams.set("round", round);
  return endpoint.href;
}

export function resolveLotteryApiUrl(api: string, path: string, origin: string) {
  try {
    const base = new URL(api, origin);
    const localHttp = base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
    if ((base.protocol !== "https:" && !localHttp) || base.username || base.password || base.search || base.hash) return null;
    base.pathname = `${base.pathname.replace(/\/+$/, "")}/`;
    return new URL(path, base).href;
  } catch {
    return null;
  }
}
