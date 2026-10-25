import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Search,Plus,ArrowLeft,RefreshCw,LogOut,Share2} from 'lucide-react';
import {createPaperClient,PaperAPIError} from '../../shared/paperClient';
import type {PaperMarket,PaperSession,PaperCreateInput} from '../../shared/paperTypes';
import {marketXIntent} from '../../shared/marketShare';
import {PaperMarketStatus} from './PaperMarketStatus';
import {PaperSimulation} from './PaperSimulation';
import {STOCK_DEMO_ASSETS} from '../stockDemoRouting';

type Props={lang:'zh'|'en';authLoaded:boolean;signedIn:boolean;getToken:()=>Promise<string|null>;onLogin:()=>void;onLogout:()=>void;authAvailable?:boolean};
const number=(v:string|number,d=2)=>Number(v).toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
const seconds=(v:number)=>{const n=Math.max(0,Math.floor(v));return `${Math.floor(n/3600)}h ${Math.floor(n/60)%60}m ${n%60}s`;};
const button='rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:border-orange-300';
const panel='rounded-2xl border border-slate-200 bg-white p-5';
const initialForm:PaperCreateInput={title:'',yesRule:'',noRule:'',invalidRule:'',assetSymbol:'TSLA',coreHours:6};
export function PaperMarketApp({lang,authLoaded,signedIn,getToken,onLogin,onLogout,authAvailable=true}:Props){
 const zh=lang==='zh',t=(a:string,b:string)=>zh?a:b;
 const tokenRef=useRef(getToken);tokenRef.current=getToken;
 const api=useMemo(()=>createPaperClient(()=>tokenRef.current()),[]);
 const [session,setSession]=useState<PaperSession|null>(null),[markets,setMarkets]=useState<PaperMarket[]>([]),[market,setMarket]=useState<PaperMarket|null>(null);
 const [selected,setSelected]=useState(()=>new URLSearchParams(window.location.search).get('market'));
 const [query,setQuery]=useState(''),[asset,setAsset]=useState('all'),[phase,setPhase]=useState('all'),[creating,setCreating]=useState(false),[form,setForm]=useState(initialForm);

 const [pending,setPending]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const retryMutation=useRef<null|(()=>Promise<{market:PaperMarket;balanceUSD:string}>)>(null);
 const mutationEpoch=useRef(0),busyRef=useRef(false),[tick,setTick]=useState(Date.now());
 const clockOffset=useRef(0),mounted=useRef(true);
 const accept=useCallback((m:PaperMarket)=>{clockOffset.current=m.serverNow*1000-Date.now();setMarket(prev=>!prev||prev.id!==m.id||m.revision>=prev.revision?m:prev);},[]);
 const errorText=(e:unknown)=>{
  const code=e instanceof PaperAPIError?e.code:e instanceof Error?e.message:'REQUEST_FAILED';
  const labels:Record<string,[string,string]>={SLIPPAGE:['报价已变化，请按新报价重试。','Price changed. Try the latest quote.'],USD_AMOUNT:['请输入有效金额，最多6位小数。','Enter a valid amount with up to 6 decimals.'],EMAIL_REQUIRED:['请先完成主邮箱验证，再重新登录。','Verify your primary email, then sign in again.'],TIME:['最终截止必须晚于创建后4小时。','Final cutoff must be more than 4 hours after creation.'],UNAUTHORIZED:['请先验证邮箱登录。','Verify your email to sign in.'],AUTH_REQUIRED:['请先验证邮箱登录。','Verify your email to sign in.'],INSUFFICIENT_BALANCE:['虚拟USD余额不足。','Insufficient virtual USD.'],BALANCE:['虚拟USD余额不足。','Insufficient virtual USD.'],HOLDINGS:['持仓不足。','Insufficient holdings.'],STALE_QUOTE:['市场已变化，请等待新报价。','The market changed. Wait for a fresh quote.'],REVISION_CONFLICT:['市场已变化，请重新报价。','The market changed. Refresh your quote.'],QUOTE_EXPIRED:['报价已过期，请重新报价。','Quote expired. Request a new quote.'],CORE_CLOSED:['Core尚未开启或已截止。','Core is not open or has closed.'],SIDE_LOCKED:['Core方向已锁定，只能同侧追加。','Core side is locked; add only to that side.'],CONFIG:['请检查截止顺序和时间间隔。','Check deadline order and spacing.'],CLAIM:['当前没有可领取权益。','No payout available.'],SERVICE_UNAVAILABLE:['服务暂不可用，请稍后重试。','Service unavailable. Try again shortly.'],NOT_CONFIGURED:['多人模拟正在配置中。','Multiplayer simulation is being configured.']};
  return labels[code]?.[zh?0:1]??t('操作未完成，请刷新后重试。','Action did not complete. Refresh and try again.');
 };
 useEffect(()=>{mounted.current=true;const timer=window.setInterval(()=>setTick(Date.now()),1000);return()=>{mounted.current=false;window.clearInterval(timer);};},[]);
 useEffect(()=>{
  if(!authLoaded)return;let stopped=false,inflight=false;const controller=new AbortController();
  const load=async()=>{if(inflight||busyRef.current)return;inflight=true;const epoch=mutationEpoch.current;try{
   const [s,list,detail]=await Promise.all([api.session(controller.signal),api.markets(controller.signal),selected?api.market(selected,controller.signal):Promise.resolve(null)]);
   if(stopped||epoch!==mutationEpoch.current)return;setSession(s);setMarkets(list.markets);if(detail)accept(detail);setLoading(false);
  }catch(e){if(!stopped){setError(errorText(e));setLoading(false);}}finally{inflight=false;}};
  setSession(null);setLoading(true);void load();const timer=window.setInterval(load,3000);
  return()=>{stopped=true;controller.abort();window.clearInterval(timer);};
 },[api,authLoaded,signedIn,selected,accept,lang]);
 const choose=(id:string|null)=>{if(busyRef.current)return;setSelected(id);setMarket(null);setError('');setNotice('');const url=new URL(window.location.href);if(id)url.searchParams.set('market',id);else url.searchParams.delete('market');window.history.pushState({},'',url);};
 useEffect(()=>{const pop=()=>{setSelected(new URLSearchParams(window.location.search).get('market'));setMarket(null);};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
 const now=(tick+clockOffset.current)/1000;
 const requireLogin=()=>{if(!signedIn){onLogin();return false;}return true;};
 const mutation=async(fn:()=>Promise<{market:PaperMarket;balanceUSD:string}>)=>{
  if(busyRef.current||!requireLogin())return;busyRef.current=true;mutationEpoch.current++;setPending(true);retryMutation.current=null;setError('');setNotice('');
  try{const result=await fn();if(!mounted.current)return;accept(result.market);setSession(s=>s?{...s,balanceUSD:result.balanceUSD}:s);setNotice(t('操作成功。','Done.'));return result;}
  catch(e){if(mounted.current){if(!(e instanceof PaperAPIError)||e.status>=500)retryMutation.current=fn;setError(errorText(e));}}
  finally{busyRef.current=false;if(mounted.current)setPending(false);}
 };
 const validForm=Object.values(form).every(v=>typeof v==='number'?Number.isFinite(v):Boolean(v.trim()))&&form.coreHours>4&&Number.isSafeInteger(form.coreHours*3600);
 const create=async(e:React.FormEvent)=>{e.preventDefault();if(!validForm)return;const input={...form,title:form.title.trim(),yesRule:form.yesRule.trim(),noRule:form.noRule.trim(),invalidRule:form.invalidRule.trim(),requestId:crypto.randomUUID()};const result=await mutation(()=>api.create(input));if(result){setCreating(false);choose(result.market.id);accept(result.market);}};
 const visible=markets.filter(m=>(asset==='all'||m.assetSymbol===asset)&&(phase==='all'||m.phase===phase)&&`${m.title} ${m.assetSymbol}`.toLowerCase().includes(query.toLowerCase()));
 const phaseName=(p:string)=>({GENESIS:'Genesis',FORMAL:t('正式市场','Formal'),WAIT_CORE:t('等待Core','Awaiting Core'),SETTLED:t('已结算','Settled'),FAILED:t('未毕业','Not graduated')}[p]??p);
 const loginDisabled=!authLoaded||!authAvailable||pending;
 return <div className="max-w-7xl mx-auto text-slate-900">
  <div className="flex flex-wrap justify-between items-center gap-3 mb-5"><span className="text-xs font-bold text-orange-600">{t('注册即送100,000虚拟USD，参与交易游戏 · 仅使用虚拟资金','Sign up, get 100,000 virtual USD, and join the game · Virtual funds only')}</span><div className="flex items-center gap-3 text-sm">{signedIn?<><span className="font-mono font-bold">{session?number(session.balanceUSD):'…'} {t('虚拟USD','virtual USD')}</span><span className="text-xs text-slate-500">{session?.user?.name}</span><button className={button} onClick={onLogout} disabled={pending} aria-label={t('退出登录','Sign out')}><LogOut size={16}/></button></>:<button className={button} disabled={loginDisabled} onClick={onLogin}>{t('验证邮箱登录','Sign in with email')}</button>}</div></div>
  {!authAvailable&&<p className="text-sm text-slate-500 mb-4">{t('登录服务尚未配置，暂可浏览市场。','Sign-in is not configured yet. You can browse markets.')}</p>}
  {signedIn&&<p className="text-xs text-slate-500 mb-4">{t('每位用户首次登录获得100,000虚拟USD，仅发放一次，不可提现。','Each user receives 100,000 virtual USD once on first sign-in. No withdrawals.')}</p>}
  {error&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">{error}{retryMutation.current&&<button className={button+' ml-3'} disabled={pending} onClick={()=>{const retry=retryMutation.current;if(retry)void mutation(retry).then(result=>{if(result&&creating){setCreating(false);choose(result.market.id);accept(result.market);}});}}>{t('安全重试','Retry safely')}</button>}</div>}{notice&&<p role="status" className="text-sm text-green-700 mb-4">{notice}</p>}
  {creating?<form onSubmit={create} className={panel+' max-w-xl mx-auto space-y-4'}><div className="flex items-center justify-between"><h2 className="text-xl font-bold">{t('发射市场','Launch a market')}</h2><button type="button" className={button} disabled={pending} onClick={()=>setCreating(false)}>{t('取消','Cancel')}</button></div>
   <label className="block text-sm">{t('股票','Stock')}<select value={form.assetSymbol} onChange={e=>setForm({...form,assetSymbol:e.target.value})} className="block border rounded-lg p-2 w-full mt-2">{STOCK_DEMO_ASSETS.map(a=><option key={a.symbol}>{a.symbol}</option>)}</select></label>
   {([['title',t('话题内容','Market question')],['yesRule','YES'],['noRule','NO'],['invalidRule','INVALID']] as const).map(([key,label])=><label key={key} className="block text-sm">{label}<textarea required rows={2} maxLength={key==='title'?300:1000} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} className="block w-full rounded-lg border p-3 mt-2"/></label>)}
   <label className="block text-sm">{t('最终截止（Core，小时后）','Final cutoff (Core, hours)')}<input required type="number" step="0.5" min="4.5" value={form.coreHours} onChange={e=>setForm({...form,coreHours:Number(e.target.value)})} className="block w-full rounded-lg border p-2 mt-2"/></label>
   <p className="text-xs text-slate-500">{t('Genesis固定3小时；正式市场在最终截止前1小时关闭，Core在最终截止时结算。','Genesis lasts 3 hours. The formal market closes 1 hour before the final cutoff; Core settles at the final cutoff.')}</p><button type="submit" disabled={pending||!validForm} className={button+' bg-orange-500 text-white w-full'}>{pending?t('提交中…','Submitting…'):t('发射市场','Launch a market')}</button></form>
  :selected?<>{!market?<p className="p-10 text-center">{loading?t('正在加载市场…','Loading market…'):t('无法加载市场。','Unable to load market.')} <button className={button} onClick={()=>choose(null)}>{t('返回','Back')}</button></p>:<>
   <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><button className={button+' inline-flex gap-2 items-center'} onClick={()=>choose(null)} disabled={pending}><ArrowLeft size={15}/>{t('全部市场','All markets')}</button><a href={marketXIntent(market.id,market.title)} target="_blank" rel="noopener noreferrer" className={button+' inline-flex gap-2 items-center'}><Share2 size={15}/>{t('分享到 X','Share on X')}</a></div>
   <PaperSimulation market={market} balanceUSD={session?.balanceUSD??'0'} lang={lang} signedIn={signedIn} pending={pending} now={now} getToken={getToken} onLogin={onLogin} onOrder={input=>{void mutation(()=>api.trade(input));}} onError={e=>setError(errorText(e))}/>
   </> }</>
  :<><section className="rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-slate-50 p-6 sm:p-10 mb-6"><div className="text-xs tracking-widest font-bold text-orange-600 mb-3">OCP MARKET</div><div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6"><div><h1 className="text-4xl sm:text-5xl font-bold tracking-tight">{t('围绕你关注的股票发起话题，参与交易。','Ticker. Topic. Trade.')}</h1><p className="text-sm text-slate-500 mt-4">Every stock has a story. Trade &amp; Pump it.</p></div><button className={button+' bg-slate-900 text-white inline-flex items-center gap-2'} disabled={pending||!authLoaded||!authAvailable} onClick={()=>{if(requireLogin())setCreating(true);}}><Plus size={16}/>{t('创建市场','Create market')}</button></div></section><div className="grid lg:grid-cols-4 gap-6"><aside className={panel+' space-y-2'}>{['all',...STOCK_DEMO_ASSETS.map(a=>a.symbol)].map(v=><button key={v} className={'block w-full text-left rounded-xl px-3 py-3 text-sm '+(asset===v?'bg-orange-50 text-orange-600 font-bold':'')} onClick={()=>setAsset(v)}>{v==='all'?t('全部股票','All stocks'):v} <span className="float-right">{markets.filter(m=>v==='all'||m.assetSymbol===v).length}</span></button>)}</aside><section className="lg:col-span-3"><div className="flex justify-between mb-4"><h2 className="text-xl font-bold">{t('全部市场','All markets')}</h2><RefreshCw size={16} className={loading?'animate-spin':''}/></div><div className="flex gap-3 mb-5"><label className="flex items-center gap-2 bg-white border rounded-xl px-3 flex-1"><Search size={16}/><input aria-label="Search markets" value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('搜索主题或股票…','Search questions or stocks…')} className="py-3 bg-transparent text-sm w-full outline-none"/></label><select value={phase} onChange={e=>setPhase(e.target.value)} aria-label="Market phase" className="border rounded-xl p-2"><option value="all">{t('全部阶段','All phases')}</option>{['GENESIS','FORMAL','WAIT_CORE','SETTLED','FAILED'].map(v=><option key={v} value={v}>{phaseName(v)}</option>)}</select></div><div className="grid sm:grid-cols-2 gap-4">{visible.map(m=><button key={m.id} className={panel+' text-left hover:border-orange-300 space-y-4'} onClick={()=>choose(m.id)}><div className="flex justify-between text-xs"><strong>{m.assetSymbol}</strong><span>{phaseName(m.phase)}</span></div><h3 className="text-lg font-bold">{m.title}</h3><PaperMarketStatus market={m} lang={lang}/><p className="text-xs text-slate-500">{m.participants} {t('人参与','participants')} · {number(m.volumeUSD)} USD</p></button>)}</div>{!loading&&visible.length===0&&<p className="border border-dashed rounded-2xl p-10 text-center text-sm text-slate-500">{t('当前分类没有匹配的市场。','No matching markets.')}</p>}{loading&&<p className="p-8 text-sm text-slate-500">{t('正在加载共享市场…','Loading shared markets…')}</p>}</section></div></>}
 </div>;
}
