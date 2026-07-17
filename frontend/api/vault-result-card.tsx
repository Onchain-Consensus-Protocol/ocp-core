import { ImageResponse } from "@vercel/og";
import { isAddress, loadVaultSnapshot, type VaultSnapshot } from "./_lib/vaultSnapshot";

export const config = { runtime: "edge" };

const outcomeStyle = {
  1: { label: "YES", color: "#22c55e", soft: "#052e1b" },
  2: { label: "NO", color: "#fb7185", soft: "#3f0b16" },
  3: { label: "INVALID", color: "#fbbf24", soft: "#3b2604" },
} as const;

function formatMultiplier(pool: bigint, winningStake: bigint): string {
  if (winningStake === 0n) return "—";
  const scaled = (pool * 10000n + winningStake / 2n) / winningStake;
  return `${scaled / 10000n}.${(scaled % 10000n).toString().padStart(4, "0")}×`;
}

function formatPreciseToken(raw: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fractionDigits = Math.min(decimals, 4);
  const fraction = (raw % base).toString().padStart(decimals, "0").slice(0, fractionDigits).padEnd(fractionDigits, "0");
  return `${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

function ResultCard({ snapshot, logoUrl }: { snapshot: VaultSnapshot; logoUrl: string }) {
  const outcome = outcomeStyle[snapshot.outcome as keyof typeof outcomeStyle] ?? outcomeStyle[3];
  const winningRaw = snapshot.outcome === 1
    ? snapshot.yesRaw
    : snapshot.outcome === 2
      ? snapshot.noRaw
      : snapshot.totalRaw;
  const winningPct = snapshot.outcome === 1
    ? snapshot.yesPct
    : snapshot.outcome === 2
      ? snapshot.noPct
      : "NO STRICT MAJORITY";
  const stakeMetricLabel = snapshot.outcome === 3 ? "ELIGIBLE PRINCIPAL" : "WINNING STAKE";

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", background: "#071019", color: "#f8fafc", padding: "46px 60px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", position: "absolute", width: 560, height: 560, right: -160, top: -220, borderRadius: 999, background: outcome.color, opacity: 0.16 }} />
      <div style={{ display: "flex", position: "absolute", width: 380, height: 380, left: -180, bottom: -240, borderRadius: 999, background: "#38bdf8", opacity: 0.08 }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src={logoUrl} width={46} height={46} alt="OCP" style={{ borderRadius: 12 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: 900, fontSize: 21 }}>OCP</span>
            <span style={{ color: "#94a3b8", fontSize: 12, letterSpacing: 2.4 }}>FINALIZED ONCHAIN RESULT</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#94a3b8", fontSize: 14 }}>
          <span style={{ display: "flex", width: 8, height: 8, borderRadius: 99, background: outcome.color }} />
          BASE · VERIFIED AT BLOCK {snapshot.blockNumber.toLocaleString("en-US")}
        </div>
      </div>

      <div style={{ display: "flex", fontSize: snapshot.title.length > 90 ? 29 : 35, lineHeight: 1.14, fontWeight: 800, maxWidth: 1040, marginTop: 28, marginBottom: 26 }}>
        {snapshot.title}
      </div>

      <div style={{ display: "flex", flex: 1, gap: 22 }}>
        <div style={{ display: "flex", flex: 1.35, flexDirection: "column", justifyContent: "center", padding: "22px 30px", border: `1px solid ${outcome.color}55`, borderRadius: 18, background: outcome.soft }}>
          <span style={{ display: "flex", color: "#94a3b8", fontSize: 13, fontWeight: 800, letterSpacing: 2.2 }}>FINAL OUTCOME</span>
          <span style={{ display: "flex", color: outcome.color, fontSize: outcome.label.length > 3 ? 66 : 88, lineHeight: 1, fontWeight: 950, marginTop: 8 }}>{outcome.label}</span>
          <span style={{ display: "flex", color: "#cbd5e1", fontSize: 19, fontWeight: 700, marginTop: 10 }}>{snapshot.outcome === 3 ? winningPct : `${winningPct} consensus weight`}</span>
        </div>

        <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", padding: "12px 20px", border: "1px solid #1e293b", borderRadius: 14, background: "#0f1b27" }}>
            <span style={{ display: "flex", color: "#94a3b8", fontSize: 12, fontWeight: 800, letterSpacing: 1.6 }}>SETTLEMENT POOL</span>
            <span style={{ display: "flex", color: "#f8fafc", fontSize: 28, fontWeight: 900, marginTop: 4 }}>{formatPreciseToken(snapshot.settlementPoolRaw, snapshot.tokenDecimals)} {snapshot.tokenSymbol}</span>
          </div>
          <div style={{ display: "flex", flex: 1, gap: 10 }}>
            <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", padding: "12px 18px", border: "1px solid #1e293b", borderRadius: 14, background: "#0f1b27" }}>
              <span style={{ display: "flex", color: "#94a3b8", fontSize: 11, fontWeight: 800, letterSpacing: 1.4 }}>{stakeMetricLabel}</span>
              <span style={{ display: "flex", color: "#e2e8f0", fontSize: 20, fontWeight: 850, marginTop: 5 }}>{formatPreciseToken(winningRaw, snapshot.tokenDecimals)}</span>
            </div>
            <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", padding: "12px 18px", border: "1px solid #1e293b", borderRadius: 14, background: "#0f1b27" }}>
              <span style={{ display: "flex", color: "#94a3b8", fontSize: 11, fontWeight: 800, letterSpacing: 1.4 }}>PAYOUT MULTIPLIER</span>
              <span style={{ display: "flex", color: outcome.color, fontSize: 24, fontWeight: 900, marginTop: 4 }}>{formatMultiplier(snapshot.settlementPoolRaw, winningRaw)}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 22, paddingTop: 17, borderTop: "1px solid #1e293b" }}>
        <span style={{ display: "flex", color: "#64748b", fontSize: 13, letterSpacing: 2 }}>FINALIZED · ONCHAIN · IMMUTABLE</span>
        <span style={{ display: "flex", color: outcome.color, fontSize: 14, fontWeight: 850 }}>PROOF OF COMMITMENT</span>
      </div>
    </div>
  );
}

function ErrorCard() {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#071019", color: "#f8fafc", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", fontSize: 36, fontWeight: 800 }}>OCP settlement result unavailable</div>
      <div style={{ display: "flex", marginTop: 16, color: "#94a3b8", fontSize: 20 }}>This Vault is not finalized at the requested block.</div>
    </div>
  );
}

export default async function handler(request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const url = new URL(request.url);
  const vault = url.searchParams.get("vault");
  const blockParam = url.searchParams.get("block");
  const block = blockParam ? Number(blockParam) : undefined;

  try {
    if (!isAddress(vault)) throw new Error("Invalid Vault address");
    const snapshot = await loadVaultSnapshot(vault, block);
    if (!snapshot.resolved || snapshot.outcome < 1 || snapshot.outcome > 3) {
      throw new Error("Vault is not finalized");
    }
    const logoUrl = new URL("/logo.png", url.origin).toString();
    return new ImageResponse(<ResultCard snapshot={snapshot} logoUrl={logoUrl} />, {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=86400, immutable" },
    });
  } catch {
    return new ImageResponse(<ErrorCard />, { width: 1200, height: 630, status: 400 });
  }
}
