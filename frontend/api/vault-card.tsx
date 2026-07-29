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
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f8fafc", color: "#0f172a", padding: "42px 54px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src={logoUrl} width="48" height="48" alt="OCP" style={{ borderRadius: 12 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: 900, fontSize: 23 }}>OCP × MARKET</span>
            <span style={{ color: "#64748b", fontSize: 12, letterSpacing: 2 }}>CAPITAL CONSENSUS · LMSR PRICING</span>
          </div>
        </div>
        <div style={{ display: "flex", color: "#64748b", fontSize: 15 }}>BASE · BLOCK {snapshot.blockNumber.toLocaleString("en-US")}</div>
      </div>

      <div style={{ display: "flex", fontSize: snapshot.title.length > 90 ? 29 : 36, lineHeight: 1.14, fontWeight: 850, maxWidth: 1080, marginBottom: 24 }}>
        {snapshot.title}
      </div>

      <div style={{ display: "flex", flex: 1, gap: 18 }}>
        <div style={{ display: "flex", flex: 1.12, flexDirection: "column", border: "1px solid #e2e8f0", borderRadius: 16, background: "white", padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ display: "flex", color: "#64748b", fontSize: 12, fontWeight: 800, letterSpacing: 1.8 }}>OCP VAULT CAPITAL</span>
            <span style={{ display: "flex", fontSize: 19, fontWeight: 900 }}>{snapshot.totalAmount} {snapshot.tokenSymbol}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {rows.map((row) => (
              <div key={row.label} style={{ display: "flex", position: "relative", alignItems: "center", height: 55, border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", overflow: "hidden" }}>
                <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: row.pct, height: "100%", background: row.color, opacity: 0.12 }} />
                <div style={{ display: "flex", position: "absolute", left: 0, bottom: 0, width: row.pct, height: 5, background: row.color }} />
                <div style={{ display: "flex", position: "relative", width: 112, paddingLeft: 16, color: row.color, fontSize: 17, fontWeight: 900 }}>{row.label}</div>
                <div style={{ display: "flex", position: "relative", flex: 1, color: "#334155", fontSize: 16, fontWeight: 700 }}>{row.amount}</div>
                <div style={{ display: "flex", position: "relative", width: 92, justifyContent: "flex-end", paddingRight: 15, color: row.color, fontSize: 20, fontWeight: 900 }}>{row.pct}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flex: 0.88, flexDirection: "column", border: "1px solid #c4b5fd", borderRadius: 16, background: "#faf8ff", padding: "18px 20px" }}>
          <span style={{ display: "flex", color: "#6d28d9", fontSize: 12, fontWeight: 850, letterSpacing: 1.8 }}>LMSR PREDICTION MARKET</span>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <div style={{ display: "flex", flex: 1, flexDirection: "column", border: "1px solid #bbf7d0", borderRadius: 12, background: "#f0fdf4", padding: "15px" }}>
              <span style={{ display: "flex", color: colors.yes, fontSize: 14, fontWeight: 850 }}>YES PRICE</span>
              <span style={{ display: "flex", color: colors.yes, fontSize: 34, fontWeight: 950, marginTop: 5 }}>{snapshot.marketYesPrice}</span>
            </div>
            <div style={{ display: "flex", flex: 1, flexDirection: "column", border: "1px solid #fecaca", borderRadius: 12, background: "#fef2f2", padding: "15px" }}>
              <span style={{ display: "flex", color: colors.no, fontSize: 14, fontWeight: 850 }}>NO PRICE</span>
              <span style={{ display: "flex", color: colors.no, fontSize: 34, fontWeight: 950, marginTop: 5 }}>{snapshot.marketNoPrice}</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 12, border: "1px solid #e9d5ff", borderRadius: 12, background: "white", padding: "13px 15px", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ display: "flex", color: "#64748b", fontSize: 13 }}>TRADING VOLUME</span>
              <span style={{ display: "flex", color: "#0f172a", fontSize: 17, fontWeight: 900 }}>{snapshot.marketVolumeAmount} {snapshot.tokenSymbol}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ display: "flex", color: "#64748b", fontSize: 13 }}>LIQUIDITY PARAMETER b</span>
              <span style={{ display: "flex", color: "#6d28d9", fontSize: 17, fontWeight: 900 }}>{snapshot.liquidityParameterAmount}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
        <span style={{ color: "#64748b", fontSize: 13, letterSpacing: 1.5 }}>ONE DEADLINE · VAULT OUTCOME SETTLES MARKET</span>
        <span style={{ color: "#6d28d9", fontSize: 14, fontWeight: 900 }}>ONCHAIN · CONTINUOUS PRICING</span>
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
  const market = url.searchParams.get("market");
  const blockParam = url.searchParams.get("block");
  const block = blockParam ? Number(blockParam) : undefined;

  try {
    if (!isAddress(vault)) throw new Error("Invalid Vault address");
    const snapshot = await loadVaultSnapshot(vault, block, market ?? undefined);
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
