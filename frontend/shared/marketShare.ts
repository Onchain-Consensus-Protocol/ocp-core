const MARKET_ORIGIN = 'https://market.ocp-protocol.org';
import type {PaperMarket} from './paperTypes.js';
export type ShareTheme='light'|'dark';
export type ShareMarket=Pick<PaperMarket,'id'|'title'|'assetSymbol'|'phase'|'result'|'R'|'B'|'rTarget'|'bTarget'|'yesPrice'|'noPrice'|'volumeUSD'|'participants'>;
export interface SharePrice {label:string;value:string;change:string|null;positive:boolean|null}
export interface SharePnl {label:string;low:number;high:number;note:string}
/** Public, explicit snapshot DTO. Never add account identifiers or raw positions here. */
export interface MarketShareSnapshot {id:string;market:ShareMarket;theme:ShareTheme;at:number;revision:number;prices:SharePrice[];priceSince:number|null;priceNote:string;pnl:SharePnl|null}
export function marketSnapshotUrl(id:string):string {return `${MARKET_ORIGIN}/api/market-share?snapshot=${encodeURIComponent(id)}`;}
export function snapshotXIntent(url:string,title:string):string {return `https://x.com/intent/tweet?${new URLSearchParams({text:`${title}\nMy trading snapshot · Virtual funds only`,url})}`;}

export function marketShareUrl(id:string):string {
 return `${MARKET_ORIGIN}/api/market-share?id=${encodeURIComponent(id)}`;
}

export function marketXIntent(id:string,title:string):string {
 const params=new URLSearchParams({text:`${title}\nTrade on OCP Market · Virtual funds only`,url:marketShareUrl(id)});
 return `https://x.com/intent/tweet?${params}`;
}
