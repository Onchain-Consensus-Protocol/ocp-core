import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Simulation } from "./Simulation";
const render = (lang: "zh"|"en") => renderToStaticMarkup(React.createElement(Simulation, {
  lang, isWalletConnected: true, balance: 10000, setBalance: vi.fn(), connectWallet: vi.fn(),
}));
describe("market launch entry",()=>{
 it("collects a topic and all three outcome definitions before entering the demo",()=>{const html=render("zh");expect(html).toContain("launch-market-card");expect(html).toContain("话题内容");for(const side of ["YES","NO","INVALID"])expect(html).toContain(side);expect(html.match(/<textarea/g)).toHaveLength(4);expect(html).toContain("disabled");expect(html).not.toContain("homepage-lifecycle");});
 it("labels the local simulation and fixed deadlines",()=>{const html=render("zh");expect(html).toContain("不会发起链上交易");expect(html).toContain("Core 3小时截止");expect(html).toContain("发射市场，开始模拟");});
 it("supports the English launch form",()=>{expect(render("en")).toContain("Launch market and start demo");});
});
