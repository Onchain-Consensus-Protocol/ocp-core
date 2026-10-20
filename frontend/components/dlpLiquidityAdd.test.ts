import { describe, expect, it } from "vitest";
import { createDlpDemo, dlpCreate, dlpBuy, dlpAddLP, dlpQuoteAddLP, dlpMaxAddLP,
  dlpExitLP, dlpQuoteExit, dlpAdvanceTime, dlpFinalize, dlpAssertLedger } from "./dlpDemoModel";
const formal=()=>{let s=dlpCreate(createDlpDemo());for(let id=0;id<3;id++)s=dlpBuy(s,id,9000);return s;};
describe("DLP locked LP: deprecated asset withdrawal and liquidity injection APIs",()=>{
 it("disables quote/add/restart in all former addition stages without changing assets",()=>{
  const f=formal();for(const s of [f,dlpAdvanceTime(f,f.TF),dlpFinalize(dlpAdvanceTime(f,f.TC))]){
   const before=JSON.stringify(s);expect(()=>dlpQuoteAddLP(s,1)).toThrow("LP_ADDITION_DISABLED");
   expect(()=>dlpAddLP(s,0,1)).toThrow("LP_ADDITION_DISABLED");expect(dlpMaxAddLP(s,0)).toBe(0);
   expect(JSON.stringify(s)).toBe(before);dlpAssertLedger(s);
  }
 });
 it("disables cash/outcome basket exit quotes and executions even for the entire LP balance",()=>{
  const s=formal(),before=JSON.stringify(s);for(let id=0;id<3;id++){
   expect(()=>dlpQuoteExit(s,s.accounts[id].lp)).toThrow("LP_ASSETS_LOCKED");
   expect(()=>dlpExitLP(s,id,s.accounts[id].lp)).toThrow("LP_ASSETS_LOCKED");
  }expect(JSON.stringify(s)).toBe(before);dlpAssertLedger(s);
 });
});
