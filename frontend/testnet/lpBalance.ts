import type {AccountPosition} from './chainClient';
/** Graduation rights held in escrow belong to the user before ERC20 materialization. */
export function totalLPBalance(position:Pick<AccountPosition,'lp'|'genesisShares'>|undefined,phase:number):bigint|undefined {
 if(!position)return undefined;
 return position.lp+([1,2,3].includes(phase)?position.genesisShares:0n);
}
