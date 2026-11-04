import React,{useEffect,useState} from 'react';
import {JsonRpcProvider,formatUnits} from 'ethers';
import {config} from '../config';
import {readHolders,type HolderKind,type HolderSnapshot} from '../testnet/holders';
import type {ChainPriceHistory} from '../testnet/priceHistory';
import type {CoreHistory} from '../testnet/coreHistory';
import type {MarketSummary} from '../testnet/chainClient';
const amount=(v:bigint,decimals:number)=>{const [whole,fraction='']=formatUnits(v,decimals).split('.');return whole+'.'+fraction.padEnd(18,'0');};
export function OnchainHolders({market,history,coreHistory,kind,lang,symbol,decimals}:{market:MarketSummary;history?:ChainPriceHistory|null;coreHistory?:CoreHistory;kind:HolderKind;lang:'zh'|'en';symbol:string;decimals:number}){
 const [open,setOpen]=useState(false),[revision,retry]=useState(0);
 const [result,setResult]=useState<{key:string;value:HolderSnapshot}|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const key=`${market.address}:${kind}`,t=(zh:string,en:string)=>lang==='zh'?zh:en;
 useEffect(()=>{
  if(!open||!history||(kind==='CORE'&&!coreHistory))return;
  let cancelled=false;const provider=new JsonRpcProvider(config.rpcUrl);setLoading(true);setError('');
  void readHolders(provider,market,history,coreHistory,kind).then(value=>{if(!cancelled)setResult({key,value});}).catch(()=>{if(!cancelled)setError('unavailable');}).finally(()=>{provider.destroy();if(!cancelled)setLoading(false);});
  return()=>{cancelled=true;};
 },[open,key,history,coreHistory,revision]);
 const data=result?.key===key?result.value:undefined;
 const columns=kind==='GENESIS'?['gToken']:kind==='FORMAL'?['YES','NO','LP']:['YES','NO','INVALID'];
 return <details className="mb-4" onToggle={e=>setOpen(e.currentTarget.open)} data-testid="market-holders"><summary className="cursor-pointer font-bold text-sm">{kind==='CORE'?'Core':kind==='GENESIS'?'Genesis':'Formal'} Holders{data?` (${data.rows.length})`:''}</summary>{open&&<div className="mt-3 space-y-2 text-xs">
  {(!data||loading)&&!error&&<p role="status" className="text-text-muted">{t('正在读取持有人…','Loading holders…')}</p>}
  {error&&<p role="status" className="text-danger">{t('持有人读取失败，已有列表保留上次结果。','Holders unavailable; existing data retains its last snapshot.')} <button type="button" className="underline" onClick={()=>retry(v=>v+1)}>{t('重试','Retry')}</button></p>}
  {data&&<><div className="max-h-72 overflow-auto"><table className="w-full text-right"><thead><tr><th className="text-left py-2">{t('钱包','Wallet')}</th>{columns.map(c=><th className="px-3 py-2" key={c}>{c}{kind==='CORE'?` (${symbol})`:''}</th>)}</tr></thead><tbody>{data.rows.map(r=><tr key={r.address} className="border-t border-border"><td className="text-left py-2 pr-3"><a className="text-accent underline font-mono" title={r.address} href={`${config.explorer}/address/${r.address}`} target="_blank" rel="noreferrer">{r.address.slice(0,8)}…{r.address.slice(-6)}</a></td>{(kind==='GENESIS'?[r.g]:kind==='FORMAL'?[r.yes,r.no,r.lp]:[r.yes,r.no,r.invalid]).map((v,i)=><td className="px-3 py-2 whitespace-nowrap font-mono" key={i}>{amount(v,kind==='CORE'?decimals:18)}</td>)}</tr>)}</tbody></table>{data.rows.length===0&&<p className="py-3 text-text-muted">{t('当前没有持有人。','No current holders.')}</p>}</div><p className="text-text-muted text-[10px]">{t('截至区块','Through block')} {data.block}{kind==='FORMAL'?t(' · LP 包含托管的毕业权益',' · LP includes escrowed graduation rights'):kind==='CORE'?t(' · 不包含已退出或已领取结算款的账户',' · Excludes exited or settled claims'):''}</p></>}
 </div>}</details>;
}
