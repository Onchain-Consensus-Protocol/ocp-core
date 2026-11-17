import type {PaperSession,PaperMarket,PaperCreateInput,PaperQuote,PaperAction,PaperTradeInput,PaperMutationResult} from './paperTypes';
import type {MarketShareSnapshot,ShareTheme} from './marketShare';
export class PaperAPIError extends Error {
 constructor(public code:string,public status:number){super(code);this.name='PaperAPIError';}
}
export function createPaperClient(getToken:()=>Promise<string|null>){
 async function request<T>(op:string,body?:unknown,id?:string,signal?:AbortSignal):Promise<T>{
  const token=await getToken();
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const url=new URL('/api/paper',window.location.origin);url.searchParams.set('op',op);if(id)url.searchParams.set('id',id);
  const response=await fetch(url,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal,
   headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body===undefined?{}:{'Content-Type':'application/json'})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  let data:unknown;try{data=await response.json();}catch{throw new PaperAPIError('SERVICE_UNAVAILABLE',response.status);}
  if(!response.ok){const value=data as {error?:string|{code?:string};code?:string};throw new PaperAPIError(value.code||(typeof value.error==='string'?value.error:value.error?.code)||'REQUEST_FAILED',response.status);}
  return data as T;
 }
 return {
  session:(signal?:AbortSignal)=>request<PaperSession>('session',undefined,undefined,signal),
  markets:(signal?:AbortSignal)=>request<{markets:PaperMarket[]}>('markets',undefined,undefined,signal),
  market:(id:string,signal?:AbortSignal)=>request<PaperMarket>('market',undefined,id,signal),
  create:(input:PaperCreateInput&{requestId:string})=>request<PaperMutationResult>('create',input),
  quote:(marketId:string,action:PaperAction,signal?:AbortSignal)=>request<PaperQuote>('quote',{marketId,action},undefined,signal),
  trade:(input:PaperTradeInput)=>request<PaperMutationResult>('trade',input),
  share:(input:{marketId:string;requestId:string;theme:ShareTheme})=>request<{url:string;snapshot:MarketShareSnapshot}>('share',input),
 };
}
