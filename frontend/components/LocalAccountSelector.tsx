import React, { useEffect, useState } from "react";
import { JsonRpcProvider } from "ethers";
import { config } from "../config";

/** DEV ONLY：仅展示本地 RPC 的公开账户，不保存或导入任何私钥。 */
export function LocalAccountSelector({ address, onSelect }: {
  address: string;
  onSelect: (index: number) => Promise<void>;
}) {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!config.isLocalDev) return;
    const provider = new JsonRpcProvider(config.rpcUrl);
    let active = true;
    void provider.send("eth_accounts", []).then((values: string[]) => {
      if (active) setAccounts(values.slice(0, 10));
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; provider.destroy(); };
  }, []);
  if (!config.isLocalDev) return null;
  const index = accounts.findIndex(value => value.toLowerCase() === address.toLowerCase());
  return <label className="text-sm flex items-center gap-2">
    本地测试账户
    <select aria-label="本地测试账户" disabled={busy} value={index} className="border rounded p-2"
      onChange={async e => {
        const selected = Number(e.target.value);
        if (selected < 0) return;
        setBusy(true); setError("");
        try { await onSelect(selected); } catch (err) { setError((err as Error).message); }
        finally { setBusy(false); }
      }}>
      <option value={-1} disabled>选择 Anvil 账户</option>
      {accounts.map((value, i) => <option value={i} key={value}>账户 {i} · {value.slice(0, 8)}…{value.slice(-4)}</option>)}
    </select>
    {error && <span role="alert">{error}</span>}
  </label>;
}
