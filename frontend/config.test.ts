import {describe,it,expect} from "vitest";
import {config} from "./config";
describe("simulation-only network configuration",()=>{it("does not expose a legacy network or deployment",()=>{expect(config.chainId).toBe(0);expect(config.rpcUrl).toBe("");expect(config.factoryAddress).toBe("");expect(config.depositTokenAddress).toBe("");expect(config.marketFactoryAddress).toBe("");expect(config.explorer).toBe("");expect(config.marketEnabled).toBe(false);});});
