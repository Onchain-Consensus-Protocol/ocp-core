import { describe, expect, it } from "vitest";
import { createTopicMarketDemo, topicMarketCreate, topicMarketBuy, topicMarketAddLP, topicMarketQuoteAddLP, topicMarketMaxAddLP,
  topicMarketExitLP, topicMarketQuoteExit, topicMarketAdvanceTime, topicMarketFinalize, topicMarketAssertLedger } from "./topicMarketDemoModel";
const formal=()=>{let s=topicMarketCreate(createTopicMarketDemo());for(let id=0;id<3;id++)s=topicMarketBuy(s,id,9000);return s;};
describe("TopicMarket locked LP: deprecated asset withdrawal and liquidity injection APIs",()=>{
 it("disables quote/add/restart in all former addition stages without changing assets",()=>{
  const f=formal();for(const s of [f,topicMarketAdvanceTime(f,f.TF),topicMarketFinalize(topicMarketAdvanceTime(f,f.TC))]){
   const before=JSON.stringify(s);expect(()=>topicMarketQuoteAddLP(s,1)).toThrow("LP_ADDITION_DISABLED");
   expect(()=>topicMarketAddLP(s,0,1)).toThrow("LP_ADDITION_DISABLED");expect(topicMarketMaxAddLP(s,0)).toBe(0);
   expect(JSON.stringify(s)).toBe(before);topicMarketAssertLedger(s);
  }
 });
 it("disables cash/outcome basket exit quotes and executions even for the entire LP balance",()=>{
  const s=formal(),before=JSON.stringify(s);for(let id=0;id<3;id++){
   expect(()=>topicMarketQuoteExit(s,s.accounts[id].lp)).toThrow("LP_ASSETS_LOCKED");
   expect(()=>topicMarketExitLP(s,id,s.accounts[id].lp)).toThrow("LP_ASSETS_LOCKED");
  }expect(JSON.stringify(s)).toBe(before);topicMarketAssertLedger(s);
 });
});
