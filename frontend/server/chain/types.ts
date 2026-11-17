import type {HistoryCheckpoint,TimestampedMarketLog} from '../../testnet/priceHistory.js';
export interface HistoryKey {chainId:number;factory:string;market:string}
export interface HistoryDescriptor {createdAt:string;k:string;stock:string;genesisCutoff:string;formalCutoff:string}
export interface IndexedHistoryRow extends HistoryKey {checkpoint:HistoryCheckpoint|null;origin:TimestampedMarketLog|null;descriptor:HistoryDescriptor|null;targetBlock:number|null;throughTimestamp:number|null;updatedAt:number;leaseUntil:number|null;lastError:string|null}
export type HistoryPatch=Partial<Pick<IndexedHistoryRow,'checkpoint'|'origin'|'descriptor'|'targetBlock'|'throughTimestamp'>>;
export interface HistoryStore {
 get(key:HistoryKey):Promise<IndexedHistoryRow|null>;
 claim(key:HistoryKey,cooldownMs?:number,leaseMs?:number):Promise<{token:string;row:IndexedHistoryRow}|null>;
 save(key:HistoryKey,token:string,patch:HistoryPatch):Promise<boolean>;
 release(key:HistoryKey,token:string,cooldownMs?:number,errorCode?:string):Promise<void>;
}
export interface SharedHistoryResponse {version:1;chainId:number;factory:string;market:string;checkpoint:HistoryCheckpoint|null;throughTimestamp:number|null;targetBlock:number|null;syncing:boolean;updatedAt:number}
