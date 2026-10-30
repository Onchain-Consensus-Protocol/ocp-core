import {FinalDeadlineInput} from '../FinalDeadlineInput';
import {defaultDeadlineLocal,parseLocalDeadline,validDeadlineTimestamp} from '../../shared/deadlineDate';
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Search,Plus,ArrowLeft,RefreshCw,LogOut,Share2} from 'lucide-react';
import {createPaperClient,PaperAPIError} from '../../shared/paperClient';
import type {PaperMarket,PaperSession,PaperCreateInput} from '../../shared/paperTypes';
import {snapshotXIntent,type MarketShareSnapshot} from '../../shared/marketShare';
import {PaperMarketStatus} from './PaperMarketStatus';
import {PaperSimulation} from './PaperSimulation';
import {STOCK_DEMO_ASSETS} from '../stockDemoRouting';
import {StockPriceReference} from '../StockPriceReference';

type Props={lang:'zh'|'en';authLoaded:boolean;signedIn:boolean;getToken:()=>Promise<string|null>;onLogin:()=>void;onLogout:()=>void;authAvailable?:boolean};
const number=(v:string|number,d=2)=>Number(v).toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
const seconds=(v:number)=>{const n=Math.max(0,Math.floor(v));return `${Math.floor(n/3600)}h ${Math.floor(n/60)%60}m ${n%60}s`;};
const button='rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:border-orange-300';
const panel='rounded-2xl border border-slate-200 bg-white p-5';
const createButton=button+' bg-orange-500 text-white border-orange-500 hover:bg-orange-600 inline-flex items-center justify-center gap-2';
const stockFromUrl=()=>{const value=new URLSearchParams(window.location.search).get('stock');return STOCK_DEMO_ASSETS.some(a=>a.symbol===value)?value!:'all';};
const initialForm:Omit<PaperCreateInput,'coreHours'|'coreDeadline'>={title:'',yesRule:'',noRule:'',invalidRule:'',assetSymbol:'TSLA'};
export function PaperMarketApp({lang,authLoaded,signedIn,getToken,onLogin,onLogout,authAvailable=true}:Props){
 const zh=lang==='zh',t=(a:string,b:string)=>zh?a:b;
 const tokenRef=useRef(getToken);tokenRef.current=getToken;
 const api=useMemo(()=>createPaperClient(()=>tokenRef.current()),[]);
 const [session,setSession]=useState<PaperSession|null>(null),[markets,setMarkets]=useState<PaperMarket[]>([]),[market,setMarket]=useState<PaperMarket|null>(null);
 const [selected,setSelected]=useState(()=>new URLSearchParams(window.location.search).get('market'));
 const [query,setQuery]=useState(''),[asset,setAsset]=useState(stockFromUrl),[phase,setPhase]=useState('all'),[creating,setCreating]=useState(false),[form,setForm]=useState(initialForm);
 const [coreDateTime,setCoreDateTime]=useState(()=>defaultDeadlineLocal());
 const [sharePending,setSharePending]=useState(false),[shared,setShared]=useState<{url:string;snapshot:MarketShareSnapshot}|null>(null);
 const shareAttempt=useRef<{marketId:string;theme:'light'|'dark';requestId:string}|null>(null);

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
 const chooseStock=(value:string)=>{if(busyRef.current)return;setAsset(value);setQuery('');setPhase('all');const url=new URL(window.location.href);url.searchParams.delete('market');if(value==='all')url.searchParams.delete('stock');else url.searchParams.set('stock',value);window.history.pushState({},'',url);setSelected(null);setMarket(null);};
 useEffect(()=>{const pop=()=>{setSelected(new URLSearchParams(window.location.search).get('market'));setAsset(stockFromUrl());setMarket(null);};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
 const now=(tick+clockOffset.current)/1000;
 const requireLogin=()=>{if(!signedIn){onLogin();return false;}return true;};
 const shareSnapshot=async()=>{
  if(!market||sharePending||pending||!requireLogin())return;
  const theme=document.documentElement.dataset.ocpTheme==='light'?'light':'dark';
  if(shareAttempt.current?.marketId!==market.id||shareAttempt.current.theme!==theme)shareAttempt.current={marketId:market.id,theme,requestId:crypto.randomUUID()};
  setSharePending(true);setError('');
  try{const result=await api.share(shareAttempt.current);if(mounted.current){setShared(result);shareAttempt.current=null;}}
  catch(e){if(mounted.current)setError(e instanceof PaperAPIError&&e.code==='SHARE_LIMIT'?t('分享过于频繁或已达快照额度，请稍后重试。','Share limit reached. Please try again later.'):errorText(e));}
  finally{if(mounted.current)setSharePending(false);}
 };
 const mutation=async(fn:()=>Promise<{market:PaperMarket;balanceUSD:string}>)=>{
  if(busyRef.current||!requireLogin())return;busyRef.current=true;mutationEpoch.current++;setPending(true);retryMutation.current=null;setError('');setNotice('');
  try{const result=await fn();if(!mounted.current)return;accept(result.market);setSession(s=>s?{...s,balanceUSD:result.balanceUSD}:s);setNotice(t('操作成功。','Done.'));return result;}
  catch(e){if(mounted.current){if(!(e instanceof PaperAPIError)||e.status>=500)retryMutation.current=fn;setError(errorText(e));}}
  finally{busyRef.current=false;if(mounted.current)setPending(false);}
 };
 const coreDeadline=parseLocalDeadline(coreDateTime);
 const validForm=Object.values(form).every(v=>Boolean(v.trim()))&&validDeadlineTimestamp(coreDeadline)&&coreDeadline>Math.floor(now)+14400;
 const create=async(e:React.FormEvent)=>{e.preventDefault();if(!validForm)return;const input={...form,coreDeadline,title:form.title.trim(),yesRule:form.yesRule.trim(),noRule:form.noRule.trim(),invalidRule:form.invalidRule.trim(),requestId:crypto.randomUUID()};const result=await mutation(()=>api.create(input));if(result){setCreating(false);choose(result.market.id);accept(result.market);}};
 const visible=markets.filter(m=>(asset==='all'||m.assetSymbol===asset)&&(phase==='all'||m.phase===phase)&&`${m.title} ${m.assetSymbol}`.toLowerCase().includes(query.toLowerCase()));
 const phaseName=(p:string)=>({GENESIS:'Genesis',FORMAL:t('正式市场','Formal'),WAIT_CORE:t('等待Core','Awaiting Core'),SETTLED:t('已结算','Settled'),FAILED:t('未毕业','Not graduated')}[p]??p);
 const loginDisabled=!authLoaded||!authAvailable||pending;
 const launch=()=>{if(requireLogin()){if(asset!=='all')setForm(f=>({...f,assetSymbol:asset}));setCreating(true);}};
 return <div className="max-w-7xl mx-auto text-slate-900">
  {shared&&<div role="dialog" aria-modal="true" aria-label={t('分享我的交易快照','Share my trading snapshot')} className="fixed inset-0 z-[100] bg-black/70 p-4 flex items-center justify-center" onClick={()=>setShared(null)}><div className="bg-white rounded-2xl border border-border p-4 sm:p-6 max-w-3xl w-full max-h-[95vh] overflow-y-auto" onClick={e=>e.stopPropagation()}><div className="flex justify-between items-center gap-3"><h2 className="font-bold">{t('分享我的交易快照','Share my trading snapshot')}</h2><button className={button} onClick={()=>setShared(null)}>{t('关闭','Close')}</button></div><p className="text-xs text-text-muted my-3">{t('卡片包含本话题的个人盈亏。任何获得链接的人都可查看或转发；不会包含邮箱、登录信息或账户余额。','This public card includes your topic P&L. Anyone with the link can view or forward it. Email, login details and wallet balance are excluded.')}</p><img src={shared.url+'&image=1'} alt={t('价格涨跌与个人盈亏快照','Price changes and personal P&L snapshot')} className="w-full rounded-xl border border-border"/><div className="mt-4 flex justify-end gap-3"><a href={shared.url+'&image=1'} target="_blank" rel="noopener noreferrer" className={button}>{t('查看图片','Open image')}</a><a href={snapshotXIntent(shared.url,shared.snapshot.market.title)} target="_blank" rel="noopener noreferrer" className={createButton}>{t('前往 X 分享','Share on X')}</a></div></div></div>}
  <div className="flex flex-wrap justify-between items-center gap-3 mb-5"><span className="text-xs font-bold text-orange-600">{t('注册即送100,000虚拟USD，参与交易游戏 · 仅使用虚拟资金','Sign up, get 100,000 virtual USD, and join the game · Virtual funds only')}</span><div className="flex items-center gap-3 text-sm">{signedIn?<><span className="font-mono font-bold">{session?number(session.balanceUSD):'…'} {t('虚拟USD','virtual USD')}</span><span className="text-xs text-slate-500">{session?.user?.name}</span><button className={button} onClick={onLogout} disabled={pending} aria-label={t('退出登录','Sign out')}><LogOut size={16}/></button></>:<button className={button} disabled={loginDisabled} onClick={onLogin}>{t('验证邮箱登录','Sign in with email')}</button>}</div></div>
  {!authAvailable&&<p className="text-sm text-slate-500 mb-4">{t('登录服务尚未配置，暂可浏览市场。','Sign-in is not configured yet. You can browse markets.')}</p>}
  {signedIn&&<p className="text-xs text-slate-500 mb-4">{t('每位用户首次登录获得100,000虚拟USD，仅发放一次，不可提现。','Each user receives 100,000 virtual USD once on first sign-in. No withdrawals.')}</p>}
  {error&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">{error}{retryMutation.current&&<button className={button+' ml-3'} disabled={pending} onClick={()=>{const retry=retryMutation.current;if(retry)void mutation(retry).then(result=>{if(result&&creating){setCreating(false);choose(result.market.id);accept(result.market);}});}}>{t('安全重试','Retry safely')}</button>}</div>}{notice&&<p role="status" className="text-sm text-green-700 mb-4">{notice}</p>}
  {creating?<form onSubmit={create} className={panel+' max-w-xl mx-auto space-y-4'}><div className="flex items-center justify-between"><h2 className="text-xl font-bold">{t('发起话题','Create topic')}</h2><button type="button" className={button} disabled={pending} onClick={()=>setCreating(false)}>{t('取消','Cancel')}</button></div>
   <label className="block text-sm">{t('股票','Stock')}<select value={form.assetSymbol} onChange={e=>setForm({...form,assetSymbol:e.target.value})} className="block border rounded-lg p-2 w-full mt-2">{STOCK_DEMO_ASSETS.map(a=><option key={a.symbol}>{a.symbol}</option>)}</select></label>
   {([['title',t('话题内容','Market question')],['yesRule','YES'],['noRule','NO'],['invalidRule','INVALID']] as const).map(([key,label])=><label key={key} className="block text-sm">{label}<textarea required rows={2} maxLength={key==='title'?300:1000} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} className="block w-full rounded-lg border p-3 mt-2"/></label>)}
   <FinalDeadlineInput lang={lang} value={coreDateTime} onChange={setCoreDateTime} now={now}/>
   <p className="text-xs text-slate-500">{t('Genesis比正式市场提前1小时截止；正式市场在最终截止前1小时关闭，Core与话题同时截止。','Genesis closes 1 hour before the formal market. The formal market closes 1 hour before the final cutoff; Core and the topic end together.')}</p><button type="submit" disabled={pending||!validForm} className={createButton+' w-full'}>{pending?t('提交中…','Submitting…'):t('发起话题','Create topic')}</button></form>
  :selected?<>{!market?<p className="p-10 text-center">{loading?t('正在加载市场…','Loading market…'):t('无法加载市场。','Unable to load market.')} <button className={button} onClick={()=>choose(null)}>{t('返回','Back')}</button></p>:<>
   <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><button className={button+' inline-flex gap-2 items-center'} onClick={()=>choose(null)} disabled={pending}><ArrowLeft size={15}/>{asset==='all'?t('全部市场','All markets'):t(`返回 ${asset} 话题`,`${asset} topics`)}</button><button type="button" onClick={()=>void shareSnapshot()} disabled={sharePending||pending} className={button+' inline-flex gap-2 items-center'}><Share2 size={15}/>{sharePending?t('生成快照…','Creating snapshot…'):t('分享到 X','Share on X')}</button></div>
   <PaperSimulation market={market} balanceUSD={session?.balanceUSD??'0'} lang={lang} signedIn={signedIn} pending={pending} now={now} getToken={getToken} onLogin={onLogin} onOrder={input=>{void mutation(()=>api.trade(input));}} onError={e=>setError(errorText(e))}/>
   </> }</>
  :<>{asset==='all'&&<section className="rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-slate-50 p-6 sm:p-10 mb-6"><div className="text-xs tracking-widest font-bold text-orange-600 mb-3">OCP MARKET</div><div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6"><div><h1 className="text-2xl leading-snug sm:text-5xl sm:leading-tight font-bold tracking-tight">{t('围绕你关注的股票发起话题，参与交易。','Ticker. Topic. Trade.')}</h1><p className="text-sm text-slate-500 mt-4">Every stock has a story. Trade &amp; Pump it.</p></div><button className={createButton} disabled={pending||!authLoaded||!authAvailable} onClick={launch}><Plus size={16}/>{t('发起话题','Create topic')}</button></div></section>}{asset!=='all'&&<div className="flex items-center justify-between gap-4 mb-5"><h1 className="text-2xl font-bold">{asset}</h1><button className={createButton} disabled={pending||!authLoaded||!authAvailable} onClick={launch}><Plus size={16}/>{t('发起话题','Create topic')}</button></div>}<div className="grid lg:grid-cols-[176px_minmax(0,1fr)] gap-4"><aside aria-label="Stock topics" className="rounded-xl border border-border bg-white p-2 self-start flex gap-1 overflow-x-auto lg:block lg:space-y-1">{['all',...STOCK_DEMO_ASSETS.map(a=>a.symbol)].map(v=><button key={v} type="button" aria-pressed={asset===v} className={'shrink-0 lg:w-full flex flex-col rounded-lg px-3 py-2.5 text-sm text-left '+(asset===v?'bg-orange-50 text-orange-600 font-bold':'text-text-muted hover:text-text')} onClick={()=>chooseStock(v)}><span className="flex w-full items-center justify-between gap-4"><span>{v==='all'?t('全部话题','All topics'):v}</span><span className="text-[11px] text-text-muted">{markets.filter(m=>v==='all'||m.assetSymbol===v).length}</span></span>{v!=='all'&&<span className="w-full"><StockPriceReference symbol={v} lang={lang} compact/></span>}</button>)}</aside><section className="min-w-0">{asset!=='all'&&<StockPriceReference key={asset} symbol={asset} lang={lang}/>}<div className="flex justify-between mb-4"><h2 className="text-xl font-bold">{asset==='all'?t('全部市场','All markets'):t(`${asset} 的全部话题`,`${asset} topics`)}</h2><RefreshCw size={16} className={loading?'animate-spin':''}/></div><div className="flex flex-wrap gap-3 mb-5"><label className="flex items-center gap-2 bg-white border rounded-xl px-3 flex-1 min-w-[180px]"><Search size={16}/><input aria-label="Search markets" value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('搜索主题或股票…','Search questions or stocks…')} className="py-3 bg-transparent text-sm w-full outline-none"/></label><select value={phase} onChange={e=>setPhase(e.target.value)} aria-label="Market phase" className="border rounded-xl p-2"><option value="all">{t('全部阶段','All phases')}</option>{['GENESIS','FORMAL','WAIT_CORE','SETTLED','FAILED'].map(v=><option key={v} value={v}>{phaseName(v)}</option>)}</select></div><div className="grid sm:grid-cols-2 gap-4">{visible.map(m=><button key={m.id} className={panel+' text-left hover:border-orange-300 space-y-4'} onClick={()=>choose(m.id)}><div className="flex justify-between text-xs"><strong>{m.assetSymbol}</strong><span>{phaseName(m.phase)}</span></div><h3 className="text-lg font-bold">{m.title}</h3><PaperMarketStatus market={m} lang={lang}/><p className="text-xs text-slate-500">{m.participants} {t('人参与','participants')} · {number(m.volumeUSD)} USD</p></button>)}</div>{!loading&&visible.length===0&&<p className="border border-dashed rounded-2xl p-10 text-center text-sm text-slate-500">{t('当前分类没有匹配的市场。','No matching markets.')}</p>}{loading&&<p className="p-8 text-sm text-slate-500">{t('正在加载共享市场…','Loading shared markets…')}</p>}</section></div></>}
 </div>;
}
