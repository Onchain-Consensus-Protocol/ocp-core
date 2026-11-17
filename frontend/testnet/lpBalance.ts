import type {AccountPosition} from './chainClient';
/** Graduation rights held in escrow belong to the user before ERC20 materialization. */
export function totalLPBalance(position:Pick<AccountPosition,'lp'|'genesisShares'>|undefined,phase:number):bigint|undefined {
 if(!position)return undefined;
 return position.lp+([1,2,3].includes(phase)?position.genesisShares:0n);
}

/** Current fee entitlement, including escrowed LP, before final settlement folds fees into LP NAV. */
export function lpFeeShare(position:Pick<AccountPosition,'lp'|'genesisShares'>|undefined,phase:number,fees:bigint,supply:bigint|undefined):bigint|undefined{
 const owned=totalLPBalance(position,phase);
 if(![1,2].includes(phase)||owned===undefined||supply===undefined||owned>supply)return undefined;
 if(supply===0n)return owned===0n?0n:undefined;
 return fees*owned/supply;
}
