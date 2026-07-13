import { ImageResponse } from "@vercel/og";
import { isAddress, loadVaultSnapshot, type VaultSnapshot } from "./_lib/vaultSnapshot";

export const config = { runtime: "edge" };

const colors = {
  yes: "#15803d",
  no: "#b91c1c",
  invalid: "#ca8a04",
};

function Card({ snapshot, logoUrl }: { snapshot: VaultSnapshot; logoUrl: string }) {
  const rows = [
    { label: "YES", amount: snapshot.yesAmount, pct: snapshot.yesPct, color: colors.yes },
    { label: "NO", amount: snapshot.noAmount, pct: snapshot.noPct, color: colors.no },
    { label: "INVALID", amount: snapshot.invalidAmount, pct: snapshot.invalidPct, color: colors.invalid },
  ];

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f8fafc", color: "#0f172a", padding: "52px 64px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src={logoUrl} width="48" height="48" alt="OCP" style={{ borderRadius: 12 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: 800, fontSize: 22 }}>OCP</span>
            <span style={{ color: "#64748b", fontSize: 13, letterSpacing: 2 }}>CAPITAL CONSENSUS SNAPSHOT</span>
          </div>
        </div>
        <div style={{ display: "flex", color: "#64748b", fontSize: 15 }}>BASE · BLOCK {snapshot.blockNumber.toLocaleString("en-US")}</div>
      </div>

      <div style={{ display: "flex", fontSize: snapshot.title.length > 90 ? 32 : 38, lineHeight: 1.16, fontWeight: 800, maxWidth: 1040, marginBottom: 30 }}>
        {snapshot.title}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((row) => (
          <div key={row.label} style={{ display: "flex", position: "relative", alignItems: "center", height: 70, border: "1px solid #e2e8f0", borderRadius: 12, background: "white", overflow: "hidden" }}>
            <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: row.pct, height: "100%", background: row.color, opacity: 0.12 }} />
            <div style={{ display: "flex", position: "absolute", left: 0, bottom: 0, width: row.pct, height: 6, background: row.color }} />
            <div style={{ display: "flex", position: "relative", width: 8, height: "100%", background: row.color }} />
            <div style={{ display: "flex", position: "relative", width: 180, paddingLeft: 24, color: row.color, fontSize: 22, fontWeight: 800 }}>{row.label}</div>
            <div style={{ display: "flex", position: "relative", flex: 1, color: "#334155", fontSize: 22, fontWeight: 700 }}>{row.amount} {snapshot.tokenSymbol}</div>
            <div style={{ display: "flex", position: "relative", width: 150, justifyContent: "flex-end", paddingRight: 28, color: row.color, fontSize: 27, fontWeight: 900 }}>{row.pct}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: 22, borderTop: "1px solid #e2e8f0" }}>
        <span style={{ color: "#64748b", fontSize: 15, letterSpacing: 1 }}>TOTAL STAKED</span>
        <span style={{ color: "#0f172a", fontSize: 23, fontWeight: 900 }}>{snapshot.totalAmount} {snapshot.tokenSymbol}</span>
      </div>
    </div>
  );
}

function ErrorCard() {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f8fafc", color: "#0f172a", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", fontSize: 36, fontWeight: 800 }}>OCP Vault snapshot unavailable</div>
      <div style={{ display: "flex", marginTop: 16, color: "#64748b", fontSize: 20 }}>Open the Vault to view current on-chain data.</div>
    </div>
  );
}

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const vault = url.searchParams.get("vault");
  const blockParam = url.searchParams.get("block");
  const block = blockParam ? Number(blockParam) : undefined;

  try {
    if (!isAddress(vault)) throw new Error("Invalid Vault address");
    const snapshot = await loadVaultSnapshot(vault, block);
    const logoUrl = new URL("/logo.png", url.origin).toString();
    return new ImageResponse(<Card snapshot={snapshot} logoUrl={logoUrl} />, {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new ImageResponse(<ErrorCard />, { width: 1200, height: 630, status: 400 });
  }
}
