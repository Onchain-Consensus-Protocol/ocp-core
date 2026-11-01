import type {TopicMarketState, TopicMarketAccount, TopicMarketPayout, TopicMarketTradeQuote, Outcome, Side} from '../components/topicMarketDemoModel.js';

export const PAPER_INITIAL_USD = '100000.000000';
export const PAPER_GTOKEN_SCALE = 10_000_000;
export type PaperAction =
 | {type:'CORE_EXIT'}
 | {type:'EARLY_PROPOSE';side:Side;reason:string}
 | {type:'EARLY_PROCESS'}
 | {type:'CLAIM_EARLY_BOND'}
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
export type PaperCreateInput = {
 title:string;yesRule:string;noRule:string;invalidRule:string;assetSymbol:string;
} & ({coreHours:number;coreDeadline?:never}|{coreDeadline:number;coreHours?:never});
/** Server persistence only: never serialize users or full model accounts to public clients. */
export interface StoredPaperMarket { schemaVersion:2;
 id:string;creatorId:string;title:string;yesRule:string;noRule:string;invalidRule:string;
 assetSymbol:string;assetPriceUSD:number;createdAt:number;revision:number;
 users:string[];state:TopicMarketState;
 history:{at:number;genesisPriceUSD:number;yesPrice:number|null}[];
}
export interface PaperSession {
 configured:boolean;user:null|{id:string;name:string;email:string};balanceUSD:string;initialGrantUSD:string;
}
export interface PaperPosition {
 gToken:string;yes:string;no:string;lp:string;coreSide:Outcome|null;coreStake:string;
 claimMarketUSD:string;claimCoreUSD:string;creatorFeesUSD:string;
}
export type PaperPresentation = Pick<TopicMarketState,'config'|'TG'|'TF'|'TC'|'TT'|'Q'|'k'|'S'|'M0'|'cash'|'lpFees'|'basis'|'b'|'lpSupply'|'inventory'|'liquidityClosed'|'lpBudget'|'failedSupply'> & {
 own:TopicMarketAccount|null;claim:TopicMarketPayout|null;corePayout:number;coreFees:number;genesisPnl:number;
 outstanding:[number,number];lpEstimates:{outcome:Outcome;lp:number}[];
};
export interface PaperMarket { schemaVersion:2;
 id:string;title:string;yesRule:string;noRule:string;invalidRule:string;assetSymbol:string;
 assetPriceUSD:number;createdAt:number;serverNow:number;revision:number;phase:TopicMarketState['phase'];
 genesisDeadline:number;formalDeadline:number;coreDeadline:number;topicDeadline:number;
 R:string;rTarget:string;genesisPriceUSD:string;
 yesPrice:number;noPrice:number;coreYes:string;coreNo:string;coreInvalid:string;
 coreOpenedAt:number|null;result:Outcome|null;volumeUSD:string;participants:number;
 early?:{proposerLabel?:string;bondUSD:string;requestId:number;requestedOutcome:Side|null;proposedAt:number;processAfter:number;reason:string;due:boolean;penaltyUSD:string;failedBondUSD:string;bondRefundUSD:string;exitRefundUSD:string;exitPenaltyUSD:string;effectiveCutoff:number};
 presentation?:PaperPresentation;
 events:{at:number;kind:string;actor:string;amount:string;detail:string;source?:'CORE'|'MARKET'}[];
 history:StoredPaperMarket['history'];position:PaperPosition|null;isCreator:boolean;
}
export interface PaperQuote {
 detail?:TopicMarketTradeQuote;
 revision:number;expiresAt:number;payUSD:string;receiveUSD:string;quantity:string;feeUSD:string;
 wouldGraduate:boolean;
}
export interface PaperTradeInput {
 marketId:string;requestId:string;expectedRevision:number;action:PaperAction;
 maxPayUSD?:string;minReceiveUSD?:string;
}
export interface PaperMutationResult {market:PaperMarket;balanceUSD:string;replayed?:boolean}
