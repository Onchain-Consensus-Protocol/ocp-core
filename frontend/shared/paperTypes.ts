import type {DlpState, DlpAccount, DlpPayout, DlpTradeQuote, Outcome, Side} from '../components/dlpDemoModel.js';

export const PAPER_INITIAL_USD = '100000.000000';
export const PAPER_GTOKEN_SCALE = 10_000_000;
export type PaperAction =
 | {type:'GENESIS_BUY';budgetUSD:string}
 | {type:'GENESIS_SELL';quantity:string}
 | {type:'FORMAL_BUY';side:Side;budgetUSD:string}
 | {type:'FORMAL_BUY_SHARES';side:Side;quantity:string}
 | {type:'REDEEM_PAIRS';quantity:string}
 | {type:'FORMAL_SELL';side:Side;quantity:string}
 | {type:'CORE_STAKE';side:Outcome;budgetUSD:string}
 | {type:'CLAIM_MARKET'}
 | {type:'CLAIM_CORE'}
 | {type:'CLAIM_CREATOR_FEES'};
export interface PaperCreateInput {
 title:string;yesRule:string;noRule:string;invalidRule:string;assetSymbol:string;
 coreHours:number;
}
/** Server persistence only: never serialize users or full model accounts to public clients. */
export interface StoredPaperMarket {
 id:string;creatorId:string;title:string;yesRule:string;noRule:string;invalidRule:string;
 assetSymbol:string;assetPriceUSD:number;createdAt:number;revision:number;
 users:string[];state:DlpState;
 history:{at:number;genesisPriceUSD:number;yesPrice:number|null}[];
}
export interface PaperSession {
 configured:boolean;user:null|{id:string;name:string;email:string};balanceUSD:string;initialGrantUSD:string;
}
export interface PaperPosition {
 gToken:string;yes:string;no:string;lp:string;B:string;coreSide:Outcome|null;coreStake:string;
 claimMarketUSD:string;claimCoreUSD:string;creatorFeesUSD:string;
}
export type PaperPresentation = Pick<DlpState,'config'|'TG'|'TF'|'TC'|'TT'|'Q'|'k'|'S'|'M0'|'cash'|'lpFees'|'basis'|'b'|'lpSupply'|'inventory'|'liquidityClosed'|'lpBudget'|'bBudget'|'failedSupply'> & {
 own:DlpAccount|null;claim:DlpPayout|null;corePayout:number;coreFees:number;genesisPnl:number;
 outstanding:[number,number];lpBEstimates:{outcome:Outcome;lp:number;B:number}[];
};
export interface PaperMarket {
 id:string;title:string;yesRule:string;noRule:string;invalidRule:string;assetSymbol:string;
 assetPriceUSD:number;createdAt:number;serverNow:number;revision:number;phase:DlpState['phase'];
 genesisDeadline:number;formalDeadline:number;coreDeadline:number;topicDeadline:number;
 R:string;B:string;rTarget:string;bTarget:string;genesisPriceUSD:string;
 yesPrice:number;noPrice:number;coreYes:string;coreNo:string;coreInvalid:string;
 coreOpenedAt:number|null;result:Outcome|null;volumeUSD:string;participants:number;
 presentation?:PaperPresentation;
 events:{at:number;kind:string;actor:string;amount:string;detail:string}[];
 history:StoredPaperMarket['history'];position:PaperPosition|null;isCreator:boolean;
}
export interface PaperQuote {
 detail?:DlpTradeQuote;
 revision:number;expiresAt:number;payUSD:string;receiveUSD:string;quantity:string;feeUSD:string;
 BContributionUSD:string;wouldGraduate:boolean;
}
export interface PaperTradeInput {
 marketId:string;requestId:string;expectedRevision:number;action:PaperAction;
 maxPayUSD?:string;minReceiveUSD?:string;
}
export interface PaperMutationResult {market:PaperMarket;balanceUSD:string;replayed?:boolean}
