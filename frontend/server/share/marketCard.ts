import type {PaperMarket} from '../../shared/paperTypes.js';
export type ShareMarket=Pick<PaperMarket,'id'|'title'|'assetSymbol'|'phase'|'result'|'R'|'B'|'rTarget'|'bTarget'|'yesPrice'|'noPrice'|'volumeUSD'|'participants'>;
import React from "react";
const phases = { GENESIS: "Genesis", FORMAL: "Market open", WAIT_CORE: "Awaiting Core", SETTLED: "Settled", FAILED: "Not graduated" };
const percent = (n) => `${Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0)).toFixed(1)}%`;
const progress = (n, total) => percent(Number(total) > 0 ? Number(n) / Number(total) * 100 : 0);
function marketCardFacts(m:ShareMarket) {
  if (m.phase === "SETTLED") return [{ label: "FINAL RESULT", value: m.result ?? "Pending", color: "#ea580c" }];
  if (m.phase === "FAILED") return [{ label: "GENESIS ENDED", value: "Not graduated \xB7 Refunds available", color: "#64748b" }];
  if (m.phase === "GENESIS") return [{ label: "R TARGET", value: progress(m.R, m.rTarget), color: "#ea580c" }, { label: "B TARGET", value: progress(m.B, m.bTarget), color: "#7c3aed" }];
  return [{ label: "YES", value: percent(m.yesPrice * 100), color: "#15803d" }, { label: "NO", value: percent(m.noPrice * 100), color: "#b91c1c" }];
}
function marketDescription(m:ShareMarket) {
  return `${m.assetSymbol} \xB7 ${phases[m.phase] ?? m.phase} \xB7 ${marketCardFacts(m).map((x) => `${x.label}: ${x.value}`).join(" \xB7 ")} \xB7 Virtual funds only`;
}
function MarketCard({ market: m, logoUrl, wordmarkUrl }:{market:ShareMarket;logoUrl:string;wordmarkUrl:string}) {
  const title = Array.from(m.title);
  const displayTitle = title.length > 125 ? title.slice(0, 124).join("") + "\u2026" : m.title;
  return /* @__PURE__ */ React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f8fafc", color: "#0f172a", padding: "42px 52px", fontFamily: "sans-serif", borderTop: "8px solid #f97316" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14 } }, /* @__PURE__ */ React.createElement("img", { src: logoUrl, width: 54, height: 54, alt: "OCP", style: { borderRadius: 10 } }), /* @__PURE__ */ React.createElement("img", { src: wordmarkUrl, width: 112, height: 48, alt: "OCP" }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 25, marginLeft: 6 } }, "Ticker. Topic. Trade.")), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 21, color: "#ea580c", background: "#fff7ed", padding: "10px 20px", borderRadius: 28 } }, m.assetSymbol, " \xB7 ", phases[m.phase] ?? m.phase)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", fontSize: title.length > 80 ? 36 : 44, fontWeight: 700, lineHeight: 1.25, marginTop: 34, height: 174, overflow: "hidden", wordBreak: "break-word" } }, displayTitle), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 20, marginTop: 16 } }, marketCardFacts(m).map((f) => /* @__PURE__ */ React.createElement("div", { key: f.label, style: { display: "flex", flexDirection: "column", flex: 1, background: "white", border: "1px solid #e2e8f0", borderRadius: 18, padding: "20px 24px", height: 120 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 16, color: "#64748b", letterSpacing: 1 } }, f.label), /* @__PURE__ */ React.createElement("span", { style: { fontSize: m.phase === "FAILED" ? 29 : 42, fontWeight: 700, color: f.color, marginTop: 10 } }, f.value)))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 18, color: "#64748b", marginTop: 22 } }, /* @__PURE__ */ React.createElement("span", null, m.participants, " players \xB7 ", Number(m.volumeUSD).toLocaleString("en-US", { maximumFractionDigits: 0 }), " virtual USD traded"), /* @__PURE__ */ React.createElement("span", null, "Snapshot \xB7 Virtual funds only")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: 18, borderTop: "1px solid #e2e8f0" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 20, color: "#ea580c", fontWeight: 700 } }, "OCP Market"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 19 } }, "market.ocp-protocol.org")));
}
export {
  MarketCard,
  marketCardFacts,
  marketDescription
};
