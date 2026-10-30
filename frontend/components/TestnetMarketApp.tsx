import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {BrowserProvider, JsonRpcProvider, Interface, ZeroAddress, formatUnits, isAddress, parseUnits} from 'ethers';
import {ArrowLeft, RefreshCw, Share2, Search, Plus} from 'lucide-react';
import {TestnetSimulation} from './TestnetSimulation';
import {EarlyTerminationNotice} from './EarlyTerminationNotice';
import {Button} from './Button';
import {FinalDeadlineInput} from './FinalDeadlineInput';
import {StockPriceReference} from './StockPriceReference';
import {stockCategories, filterStockMarkets, referenceSymbol} from '../testnet/marketDirectory';
import {config} from '../config';
import {defaultDeadlineLocal, parseLocalDeadline} from '../shared/deadlineDate';
import {createChainClient, type MarketState,type PaymentRoute,RouterAction,type RouterRequest} from '../testnet/chainClient';
import type {Language} from '../types';
import factoryAbi from '../testnet/abi/TopicMarketStockFactory.json';
import type {ChainPriceHistory} from '../testnet/priceHistory';

const CHAIN_ID = 46630;
const field = 'block w-full border border-border rounded-lg p-3 mt-2 bg-white text-text';
const box = 'rounded-xl border border-border p-4';
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const units = (value: bigint | undefined, decimals = 18) => value === undefined ? '—' : formatUnits(value, decimals);
type Directory = Awaited<ReturnType<ReturnType<typeof createChainClient>['readDirectory']>>;
type Wallet = {provider: BrowserProvider; address: string; chainId: number};
type Quote = {key: string; quantity: bigint; cash: bigint; limit: bigint; shares?:bigint;route?:RouterRequest};

function errorText(error: unknown): string {
  const value = error as {shortMessage?: string; reason?: string; message?: string};
  return value?.reason || value?.shortMessage || value?.message || String(error);
}

/** Real testnet actions are initiated only by a user click, through the injected wallet. */
export function TestnetMarketApp({lang = 'zh'}: {lang?: Language}) {
  const zh = lang === 'zh';
  const t = (cn: string, en: string) => zh ? cn : en;
  const factoryAddress = config.marketFactoryAddress;
  const configured = isAddress(factoryAddress) && factoryAddress !== ZeroAddress
    && !!config.rpcUrl && config.chainId === CHAIN_ID;
  const reader = useMemo(() => configured
    ? createChainClient(new JsonRpcProvider(config.rpcUrl), factoryAddress) : null,
  [configured, factoryAddress]);
  const [earlyReason,setEarlyReason] = useState('');
  const [history,setHistory]=useState<ChainPriceHistory|null>(null);
  const [historyError,setHistoryError]=useState('');
  const walletEpoch=useRef(0);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [market, setMarket] = useState<MarketState | null>(null);
  const [selected, setSelected] = useState(() => {const value=new URLSearchParams(window.location.search).get('market');return value&&isAddress(value)?value:'';});
  const [stockAddress, setStockAddress] = useState('');
  const [creating, setCreating] = useState(false);
  const [category, setCategory] = useState(()=>new URLSearchParams(window.location.search).get('stock')||'all');
  const [phaseFilter,setPhaseFilter]=useState('all');
  const [proposalSide,setProposalSide]=useState<0|1>(0);
  const [tradeSide,setTradeSide]=useState<0|1>(0);
  const [payAsset,setPayAsset]=useState<'STOCK'|'STABLE'>('STOCK');
  const [paymentRoute,setPaymentRoute]=useState<PaymentRoute|null>(null);
  const [routeError,setRouteError]=useState('');
  const [stakeRouteQuote,setStakeRouteQuote]=useState<{key:string;input:bigint;minCollateral:bigint;estimated:bigint}|null>(null);
  const [sideQuotes,setSideQuotes]=useState<Partial<Record<0|1,Quote>>>({});
  const [sideErrors,setSideErrors]=useState<Partial<Record<0|1,string>>>({});
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState({topic: '', yesRule: '', noRule: '', invalidRule: ''});
  const [deadline, setDeadline] = useState(defaultDeadlineLocal);
  const [tab, setTab] = useState<'MARKET' | 'CORE'>('MARKET');
  const [mode, setMode] = useState<'BUY' | 'SELL'>('BUY');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [pollError,setPollError]=useState(false);
  const [txHash, setTxHash] = useState('');
  const [confirmedRevision,setConfirmedRevision]=useState(0);
  const chainTimeOffset=useRef(0);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const readSequence = useRef(0);
  const readIdentity=useRef('');readIdentity.current=selected+':'+(wallet?.address??'');
  const pending = useRef(false);
  const stock = directory?.stocks.find(asset => asset.address.toLowerCase() === market?.stock.toLowerCase());
  const enabledStocks = directory?.stocks.filter(asset => asset.enabled) ?? [];
  const creationStock = enabledStocks.find(asset => asset.address === stockAddress);
  const categories = stockCategories(directory?.stocks ?? []);
  const visibleMarkets = filterStockMarkets(directory?.markets ?? [], directory?.stocks ?? [], category, query).filter(m=>phaseFilter==='all'||String(m.phase)===phaseFilter);
  const categoryCount = (symbol: string) => filterStockMarkets(directory?.markets ?? [], directory?.stocks ?? [], symbol, '').length;
  function chooseCategory(symbol: string) {
    if(pending.current)return;setCategory(symbol);setQuery('');setPhaseFilter('all');chooseMarket('',symbol);
  }

  function chooseMarket(address:string,symbol=category,confirmed=false) {
    if(pending.current&&!confirmed)return;
    setSelected(address);setMarket(null);setAmount('');setSideQuotes({});setNotice('');
    const url=new URL(window.location.href);if(address)url.searchParams.set('market',address);else url.searchParams.delete('market');
    if(symbol==='all')url.searchParams.delete('stock');else url.searchParams.set('stock',symbol);
    window.history.pushState({},'',url);
  }
  useEffect(()=>{const pop=()=>{const url=new URL(window.location.href),address=url.searchParams.get('market');setSelected(address&&isAddress(address)?address:'');setCategory(url.searchParams.get('stock')||'all');setMarket(null);setSideQuotes({});setAmount('');};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  const onDetailTab=useCallback((next:'MARKET'|'PROTOCOL')=>{setTab(next==='PROTOCOL'?'CORE':'MARKET');setAmount('');setSideQuotes({});},[]);

  const refresh = useCallback(async () => {
    if (!reader || readIdentity.current!==selected+':'+(wallet?.address??'')) return;
    const sequence = ++readSequence.current;
    const [nextDirectory, nextMarket] = await Promise.all([
      reader.readDirectory(wallet?.address),
      selected ? reader.readMarket(selected, wallet?.address) : Promise.resolve(null),
    ]);
    if (sequence !== readSequence.current || readIdentity.current!==selected+':'+(wallet?.address??'')) return;
    setPollError(false);
    setDirectory(nextDirectory);
    setMarket(nextMarket);
    chainTimeOffset.current=Number(nextDirectory.timestamp)-Math.floor(Date.now()/1000);
    setNow(Number(nextDirectory.timestamp));
    setStockAddress(current => current || nextDirectory.stocks.find(asset => asset.enabled)?.address || '');
  }, [reader, selected, wallet?.address]);

  useEffect(() => {
    setMarket(null);
    void refresh().catch(error => setNotice(errorText(error)));
    return () => {readSequence.current++;};
  }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now()/1000)+chainTimeOffset.current), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // 只读刷新让其他玩家的申请自动出现；处理交易始终由玩家点击并在钱包确认。
  useEffect(()=>{
    let cancelled=false;let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      if(!document.hidden&&!pending.current){try{await refresh();}catch{if(!cancelled)setPollError(true);}}
      if(!cancelled)timer=setTimeout(()=>void poll(),15000);
    };
    timer=setTimeout(()=>void poll(),15000);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[refresh]);

  const injected = () => (window as unknown as {ethereum?: {
    request: (request: {method: string; params?: unknown[]}) => Promise<unknown>;
    on?: (event: string, listener: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  }}).ethereum;

  useEffect(() => {
    const ethereum = injected();
    const invalidate = () => {
      walletEpoch.current++;
      readSequence.current++;
      setWallet(null);
      setSideQuotes({});
      setMarket(null);
      setNotice(zh ? '钱包账户或网络已变化，请重新连接。' : 'Wallet account or network changed. Reconnect.');
    };
    ethereum?.on?.('accountsChanged', invalidate);
    ethereum?.on?.('chainChanged', invalidate);
    return () => {
      ethereum?.removeListener?.('accountsChanged', invalidate);
      ethereum?.removeListener?.('chainChanged', invalidate);
    };
  }, [zh]);

  async function connect() {
    try {
      const ethereum = injected();
      if (!ethereum) throw new Error(t('请安装支持 EVM 的钱包。', 'Install an EVM wallet.'));
      await ethereum.request({method: 'eth_requestAccounts'});
      let provider = new BrowserProvider(ethereum);
      if (Number((await provider.getNetwork()).chainId) !== CHAIN_ID) {
        try {
          await ethereum.request({method: 'wallet_switchEthereumChain', params: [{chainId: '0xb626'}]});
        } catch (error) {
          if ((error as {code?: number}).code !== 4902) throw error;
          await ethereum.request({method: 'wallet_addEthereumChain', params: [{
            chainId: '0xb626', chainName: 'Robinhood Chain Testnet',
            nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18},
            rpcUrls: [config.rpcUrl || 'https://rpc.testnet.chain.robinhood.com'],
            blockExplorerUrls: ['https://explorer.testnet.chain.robinhood.com'],
          }]});
          await ethereum.request({method: 'wallet_switchEthereumChain', params: [{chainId: '0xb626'}]});
        }
        provider = new BrowserProvider(ethereum);
      }
      const chainId = Number((await provider.getNetwork()).chainId);
      if (chainId !== CHAIN_ID) throw new Error(t('请切换到测试网 46630。', 'Switch to testnet 46630.'));
      setWallet({provider, chainId, address: await (await provider.getSigner()).getAddress()});
      setNotice('');
    } catch (error) {setNotice(errorText(error));}
  }

  async function signedClient() {
    const epoch=walletEpoch.current;
    if (!wallet || !reader) throw new Error(t('请先连接测试网钱包。', 'Connect your testnet wallet first.'));
    const network = await wallet.provider.getNetwork();
    const signer = await wallet.provider.getSigner();
    if (Number(network.chainId) !== CHAIN_ID || (await signer.getAddress()).toLowerCase() !== wallet.address.toLowerCase()) {
      throw new Error(t('钱包已变化，请重新连接。', 'Wallet changed. Reconnect.'));
    }
    if(epoch!==walletEpoch.current)throw new Error(t('钱包已变化，请重新连接。','Wallet changed. Reconnect.'));
    return reader.withSigner(signer,()=>{if(epoch!==walletEpoch.current)throw new Error(t('钱包已变化，请重新连接。','Wallet changed. Reconnect.'));});
  }

  async function transact(action: (client: Awaited<ReturnType<typeof signedClient>>) => Promise<{hash: string; wait: () => Promise<unknown>}>,onConfirmed?:(receipt:unknown)=>void) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);setTxHash('');setNotice(t('请在钱包中确认交易。', 'Confirm the transaction in your wallet.'));
    try {
      const tx = await action(await signedClient());
      setTxHash(tx.hash);setNotice(t('交易已提交，等待区块确认…', 'Submitted. Waiting for confirmation…'));
      const receipt=await tx.wait();
      setConfirmedRevision(v=>v+1);
      onConfirmed?.(receipt);

      try {
        await refresh();
        setNotice(t('交易已确认，链上状态已更新。', 'Transaction confirmed. On-chain state updated.'));
      } catch (error) {
        setNotice(t('交易已确认，但状态刷新失败，请手动刷新：', 'Transaction confirmed, but refresh failed. Refresh manually: ') + errorText(error));
      }
    } catch (error) {setNotice(errorText(error));}
    finally {pending.current = false;setBusy(false);}
  }

  useEffect(()=>{let cancelled=false;setHistory(null);setHistoryError('');if(!reader||!selected)return;void reader.readPriceHistory(selected).then(value=>{if(!cancelled)setHistory(value);}).catch(()=>{if(!cancelled)setHistoryError(t('成交历史暂不可用，可继续交易。','Activity history is unavailable; trading remains available.'));});return()=>{cancelled=true;};},[reader,selected,confirmedRevision]);

  useEffect(()=>{let cancelled=false;setPaymentRoute(null);setRouteError('');if(!reader||!selected)return;void reader.readPaymentRoute(selected,wallet?.address).then(route=>{if(!cancelled)setPaymentRoute(route);}).catch(()=>{if(!cancelled)setRouteError(t('USDG 路由读取失败，可继续使用股票交易。','USDG route unavailable. Stock trading remains available.'));});return()=>{cancelled=true;};},[reader,selected,wallet?.address,confirmedRevision]);
  const usingStable=payAsset==='STABLE';
  const payDecimals=usingStable?(paymentRoute?.stableDecimals??6):(stock?.decimals??18);
  const paySymbol=usingStable?(paymentRoute?.stableSymbol??'USDG'):(stock?.symbol??'');
  const payBalance=usingStable?paymentRoute?.stableBalance:market?.position?.balance;
  const earlyDue = !!market?.early && (market.early.due || market.early.requestId > 0n && now >= Number(market.early.processAfter));
  const genesis = market?.phase === 0;
  const genesisOpen = !!market && genesis && now < Number(market.genesisCutoff);
  const formalOpen = !!market && market.phase === 1 && now < Number(market.formalCutoff) && !market.vaultResolved && !earlyDue;
  const coreOpen = !!market && [1, 2].includes(market.phase) && now < Number(market.coreCutoff) && !market.vaultResolved && !earlyDue;
  const terminal = !!market && [3, 4].includes(market.phase);
  const quoteKey = `${selected}:${tab}:${mode}:${amount}:${market?.phase}:${wallet?.address}:${earlyDue}:${payAsset}:${Math.floor(now/20)}`;
  useEffect(() => {
    let cancelled=false;setSideQuotes({});setSideErrors({});setStakeRouteQuote(null);
    if(!reader||!market||!stock||!amount||(usingStable&&!paymentRoute))return;
    const timer=window.setTimeout(()=>{void (async()=>{
      if(tab==='CORE'){
        if(!usingStable)return;
        try{const input=parseUnits(amount,payDecimals);if(input<=0n)return;const value=await reader.quotePaymentSwap(market.address,paymentRoute!.stable,stock.address,input,'input');if(!cancelled)setStakeRouteQuote({key:quoteKey,input,minCollateral:value.amountOut*99n/100n,estimated:value.amountOut});}
        catch(error){if(!cancelled)setSideErrors({0:errorText(error)});}return;
      }
      await Promise.all(([0,...(genesis?[]:[1])] as (0|1)[]).map(async direction=>{
        try {
          const quantity=parseUnits(amount,genesis?mode==='BUY'?payDecimals:11:18);if(quantity<=0n)return;
          let cash:bigint,limit:bigint,shares:bigint|undefined,route:RouterRequest|undefined;
          const request=(action:RouterAction):RouterRequest=>({market:market.address,action,paymentAsset:paymentRoute!.stable,inputAmount:0n,quantity:0n,minCollateral:0n,businessLimit:0n,minOutput:0n,deadline:BigInt(now+600),side:direction,graduationIntent:0});
          if(genesis&&mode==='BUY'){
            if(usingStable){const swap=await reader.quotePaymentSwap(market.address,paymentRoute!.stable,stock.address,quantity,'input');const floor=swap.amountOut*995n/1000n;shares=await reader.quoteGenesisBuy(market.address,swap.amountOut);limit=(await reader.quoteGenesisBuy(market.address,floor))*995n/1000n;cash=quantity;route={...request(RouterAction.GenesisBuy),inputAmount:quantity,minCollateral:floor,businessLimit:limit};}
            else{shares=await reader.quoteGenesisBuy(market.address,quantity);cash=quantity;limit=shares*99n/100n;}
          }else if(mode==='BUY'){
            const cost=await reader.quoteFormalBuy(market.address,direction===0,quantity);
            if(usingStable){const maxStock=(cost*1005n+999n)/1000n;const swap=await reader.quotePaymentSwap(market.address,paymentRoute!.stable,stock.address,maxStock,'output');cash=swap.amountIn;limit=(cash*1005n+999n)/1000n;route={...request(RouterAction.FormalBuy),inputAmount:limit,quantity,minCollateral:maxStock,businessLimit:maxStock};}
            else{cash=cost;limit=(cash*101n+99n)/100n;}
          }else{
            const value=genesis?await reader.quoteGenesisSell(market.address,quantity,wallet?.address):await reader.quoteFormalSell(market.address,direction===0,quantity,wallet?.address);
            if(usingStable){const stockFloor=value.seller*995n/1000n;const [swap,safeSwap]=await Promise.all([reader.quotePaymentSwap(market.address,stock.address,paymentRoute!.stable,value.seller,'input'),reader.quotePaymentSwap(market.address,stock.address,paymentRoute!.stable,stockFloor,'input')]);cash=swap.amountOut;limit=safeSwap.amountOut*995n/1000n;route={...request(genesis?RouterAction.GenesisSell:RouterAction.FormalSell),quantity,businessLimit:stockFloor,minOutput:limit};}
            else{cash=value.seller;limit=cash*99n/100n;}
          }
          if(!cancelled)setSideQuotes(prev=>({...prev,[direction]:{key:quoteKey+':'+direction,quantity,cash,limit,shares,route}}));
        }catch(error){if(!cancelled)setSideErrors(prev=>({...prev,[direction]:errorText(error)}));}
      }));
    })();},250);
    return()=>{cancelled=true;window.clearTimeout(timer);};
  },[reader,market,stock,amount,tab,mode,genesis,quoteKey,wallet?.address,usingStable,paymentRoute,payDecimals]);

  let coreAmount = 0n;
  try {if (stock && amount) coreAmount = parseUnits(amount, payDecimals);} catch {/* The input remains editable. */}
  const quoteFor=(direction:0|1)=>sideQuotes[direction]?.key===quoteKey+':'+direction?sideQuotes[direction]:undefined;
  const balanceEnough=coreAmount===0n||(payBalance??0n)>=coreAmount;
  const canAct=!!wallet&&!!market&&!busy;
  const finalTimestamp = parseLocalDeadline(deadline);
  const metadataFits = Object.entries(topic).every(([key, value]) =>
    new TextEncoder().encode(value.trim()).length <= (key === 'topic' ? 512 : 2048));
  const validCreation = Number.isSafeInteger(finalTimestamp) && finalTimestamp > now + 14400
    && Object.values(topic).every(value => value.trim()) && metadataFits && !!creationStock && !creationStock.snapshotError;

  function created(receipt:unknown){const iface=new Interface(factoryAbi);for(const log of (receipt as {logs?:{topics:string[];data:string}[]})?.logs??[]){try{const parsed=iface.parseLog(log);if(parsed?.name==='MarketCreated'){setCreating(false);chooseMarket(parsed.args.market,category,true);return;}}catch{/* Only factory creation events are relevant. */}}}
  const historyPoints=history?.genesis.map(point=>({price:Number(formatUnits(point.price,18)),at:point.at-Number(market?.createdAt??0n),kind:point.kind}));
  const activity=history?.events.map((event,i)=>({id:i,at:event.at-Number(market?.createdAt??0n),kind:event.kind,amount:event.amount===undefined?undefined:Number(formatUnits(event.amount,stock?.decimals??18)),quantity:event.quantity===undefined?undefined:Number(formatUnits(event.quantity,18)),detail:event.transactionHash}));
  const displayMarket=market&&history?{...market,presentation:market.presentation?{...market.presentation,formalVolume:history.formalVolume}:undefined}:market;
  const phaseName=(phase:number|undefined)=>phase===undefined?'—':['Genesis',t('正式市场','Formal'),t('等待 Core','Awaiting Core'),t('已结算','Settled'),t('未毕业清算','Funding failed')][phase];
  const date=(value:bigint)=>new Date(Number(value)*1000).toLocaleString(zh?'zh-CN':'en-US');
  const row=(label:string,value:React.ReactNode)=><div className="flex justify-between gap-3 py-1"><span className="text-text-muted">{label}</span><strong className="text-right tabular-nums break-all min-w-0 max-w-[65%]">{value}</strong></div>;
  const small='rounded-xl border border-border px-4 py-2 text-sm font-bold disabled:opacity-40 hover:border-accent';
  async function submitSide(direction:0|1|2) {
    if(!market||!stock||pending.current)return;
    if(!wallet){await connect();return;}
    if(tab==='CORE') {
      if(!coreOpen||coreAmount<=0n||!balanceEnough)return;
      const lockedSide=market.position&&[market.position.coreYes,market.position.coreNo,market.position.coreInvalid].findIndex(v=>v>0n);
      if(lockedSide!==undefined&&lockedSide>=0&&lockedSide!==direction)return;
      if(usingStable){const q=stakeRouteQuote;if(!paymentRoute||!q||q.key!==quoteKey)return;if((paymentRoute.stableAllowance??0n)<q.input){void transact(c=>c.approveRouterAsset(market.address,paymentRoute.stable,q.input));return;}void transact(c=>c.executeRouter({market:market.address,action:RouterAction.CoreStake,paymentAsset:paymentRoute.stable,inputAmount:q.input,quantity:0n,minCollateral:q.minCollateral,businessLimit:0n,minOutput:0n,deadline:BigInt(now+600),side:direction,graduationIntent:0}));return;}
      const position=market.position;const locked=position&&[position.coreYes,position.coreNo,position.coreInvalid].findIndex(v=>v>0n);
      if(locked!==undefined&&locked>=0&&locked!==direction)return;
      if((position?.vaultAllowance??0n)<coreAmount){void transact(c=>c.approveStock(market.address,'vault',coreAmount));return;}
      void transact(c=>c.stakeCore(market.address,direction,coreAmount));return;
    }
    if(direction===2||!(genesis?genesisOpen:formalOpen))return;
    const q=quoteFor(genesis?0:direction);if(!q)return;
    const holding=genesis?market.position?.genesisShares:direction===0?market.position?.yes:market.position?.no;
    const paid=mode==='BUY'?(q.route?q.route.inputAmount:genesis?q.cash:q.limit):0n;
    if(paid>(payBalance??0n)||mode==='SELL'&&q.quantity>(holding??0n))return;
    if(q.route&&paymentRoute){if((paymentRoute.stableAllowance??0n)<paid){void transact(c=>c.approveRouterAsset(market.address,paymentRoute.stable,paid));return;}void transact(c=>c.executeRouter({...q.route!,deadline:BigInt(now+600)}));return;}
    if((market.position?.marketAllowance??0n)<paid){void transact(c=>c.approveStock(market.address,'market',paid));return;}
    const expiry=BigInt(now+600);void transact(c=>genesis?mode==='BUY'?c.genesisBuy(market.address,q.quantity,q.limit,expiry):c.genesisSell(market.address,q.quantity,q.limit,expiry):mode==='BUY'?c.formalBuy(market.address,direction===0,q.quantity,q.limit,expiry):c.formalSell(market.address,direction===0,q.quantity,q.limit,expiry));
  }
  const canSubmit=(direction:0|1|2)=>{
    if(busy||!market)return false;if(!wallet)return true;
    if(tab==='CORE'){const stakes=market.position&&[market.position.coreYes,market.position.coreNo,market.position.coreInvalid],locked=stakes?.findIndex(v=>v>0n);return coreOpen&&coreAmount>0n&&balanceEnough&&(!usingStable||stakeRouteQuote?.key===quoteKey)&&(locked===undefined||locked<0||locked===direction);}
    if(direction===2||!(genesis?genesisOpen:formalOpen))return false;
    const q=quoteFor(genesis?0:direction);if(!q)return false;
    const holding=genesis?market.position?.genesisShares:direction===0?market.position?.yes:market.position?.no;
    return mode==='BUY'?(payBalance??0n)>=(q.route?q.route.inputAmount:genesis?q.cash:q.limit):(holding??0n)>=q.quantity;
  };
  const needsSideApproval=(direction:0|1)=>{const q=quoteFor(direction);return mode==='BUY'&&q&&(q.route?paymentRoute?.stableAllowance??0n:market?.position?.marketAllowance??0n)<(q.route?q.route.inputAmount:genesis?q.cash:q.limit);};
  function claimSelected(kind:'market'|'core') {
    if(!market)return;
    if(!usingStable){void transact(c=>kind==='market'?c.claimMarket(market.address):c.claimCore(market.address));return;}
    if(!paymentRoute)return;
    void transact(async c=>{const request:RouterRequest={market:market.address,action:kind==='market'?RouterAction.ClaimMarket:RouterAction.ClaimCore,paymentAsset:paymentRoute.stable,inputAmount:0n,quantity:0n,minCollateral:0n,businessLimit:0n,minOutput:0n,deadline:BigInt(now+600),side:0,graduationIntent:0};const expected=await c.previewRouter(request);if(expected<=0n)throw new Error(t('当前没有可兑换的结算款。','No convertible payout is available.'));return c.executeRouter({...request,minOutput:expected*99n/100n});});
  }
  const tradeControls=market&&stock?<div className="space-y-4 animate-fade-in" data-testid="chain-trade-controls">
    <div className={box+' space-y-2 text-xs'} data-testid="stock-route-panel"><strong>{stock.symbol} {t('股票代币底池','stock-token pool')}</strong><label className="flex justify-between items-center gap-2">{t('支付／收款资产','Pay / receive')}<select aria-label="Payment asset" className="border border-border rounded p-2 bg-white" value={payAsset} disabled={busy} onChange={e=>{setPayAsset(e.target.value as 'STOCK'|'STABLE');setSideQuotes({});setStakeRouteQuote(null);}}><option value="STOCK">{stock.symbol}</option>{paymentRoute&&<option value="STABLE">{paymentRoute.stableSymbol}</option>}</select></label>{row(t('可用余额','Available balance'),`${units(payBalance,payDecimals)} ${paySymbol}`)}<p className="text-text-muted">{usingStable?t('通过现有池兑换，使用真实 USDG 支付和收款。','Swap through the existing pool to pay and receive USDG.'):t('使用钱包中的测试股票支付和收款。','Pay and receive test stock tokens in your wallet.')}</p>{routeError&&<p className="text-text-muted">{routeError}</p>}</div>
    {tab==='CORE'?<>
      <div className={box+' text-xs text-text-muted'}>{t('质押资本决定最终结果。选定方向后只能同侧追加；可退出全部本金，罚没10%并放弃累计手续费。','Staked capital decides the result. Add to the same side, or exit all stake with a 10% penalty and forfeit accrued fees.')}</div>
      <div className={box+' text-xs'}><strong>{t('我的质押','My stake')}</strong>{(['YES','NO','INVALID'] as const).map((label,i)=>row(label,`${units(market.position?[market.position.coreYes,market.position.coreNo,market.position.coreInvalid][i]:undefined,stock.decimals)} ${stock.symbol}`))}</div>
      <label className="block text-xs font-bold text-text-muted">{t('质押金额','Stake amount')} ({paySymbol})<input className={field} aria-label={t('Core质押金额','Core stake amount')} inputMode="decimal" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)} placeholder="0"/></label>
      {usingStable&&<p className="text-xs text-text-muted">{stakeRouteQuote?.key===quoteKey?`${t('预计质押','Estimated stake')}: ${units(stakeRouteQuote.estimated,stock.decimals)} ${stock.symbol}`:sideErrors[0]||t('输入金额读取兑换报价。','Enter an amount for a swap quote.')}</p>}
      <div className="grid grid-cols-2 gap-3">{([0,1] as const).map(i=><Button key={i} variant={i===0?'success':'danger'} disabled={!canSubmit(i)} onClick={()=>void submitSide(i)}>{!wallet?t('连接钱包','Connect wallet'):(usingStable?paymentRoute?.stableAllowance??0n:market.position?.vaultAllowance??0n)<coreAmount?t('授权','Approve'):t('质押','Stake')} {i===0?'YES':'NO'}</Button>)}</div><Button className="w-full text-yellow-700" variant="secondary" disabled={!canSubmit(2)} onClick={()=>void submitSide(2)}>{!wallet?t('连接钱包','Connect wallet'):(usingStable?paymentRoute?.stableAllowance??0n:market.position?.vaultAllowance??0n)<coreAmount?t('授权','Approve'):t('质押','Stake')} INVALID</Button>
    </>:!terminal?<div className={box+' space-y-3'}>
      <h5 className="font-bold text-sm">{t('市场','Market')}</h5><p className="text-xs text-text-muted">{genesis?t('买卖gToken；双池达标后转为LP。','Trade gToken; holdings become LP at graduation.'):t('连续报价YES／NO，LP资产留池做市。','YES / NO quotes while LP assets remain in the pool.')}</p>
      <div className="flex border border-border rounded-lg p-1">{(['BUY','SELL'] as const).map(v=><button key={v} type="button" disabled={busy} onClick={()=>{setMode(v);setAmount('');}} className={'flex-1 py-1.5 text-xs font-bold rounded-md '+(mode===v?v==='BUY'?'bg-success/20 text-success border border-success/50':'bg-danger/20 text-danger border border-danger/50':'text-text-muted')}>{v==='BUY'?t('买入','BUY'):t('卖出','SELL')}</button>)}</div>
      <label className="flex justify-between text-xs text-text-muted font-bold"><span>{genesis&&mode==='BUY'?`${t('金额','Amount')} (${paySymbol})`:genesis?t('gToken数量','gToken amount'):t('份额','Shares')}</span><span className="text-accent">{genesis?'1%':'2%'} {t('手续费','fee')}</span></label>
      {!genesis&&<label className="block text-xs font-bold text-text-muted">{t('方向','Side')}<select aria-label={t('买卖方向','Trade side')} className={field} value={tradeSide} disabled={busy} onChange={e=>setTradeSide(Number(e.target.value) as 0|1)}><option value={0}>YES</option><option value={1}>NO</option></select></label>}
      <div className="flex items-stretch gap-2"><input className="min-w-0 w-0 flex-1 h-11 bg-transparent border border-border rounded-lg px-3 py-2 font-mono" inputMode="decimal" aria-label={t('交易金额或份额','Trade amount or tokens')} value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)} placeholder="0"/><div className={'grid '+'grid-cols-1 gap-2 flex-1 min-w-0'}>{(genesis?[0]:[tradeSide]).map(value=>{const i=value as 0|1;return <button type="button" key={i} disabled={!canSubmit(i)} onClick={()=>void submitSide(i)} className={'flex flex-col items-center justify-center border rounded-lg h-11 px-2 py-1 disabled:opacity-50 '+(i===0?'bg-success/10 border-success/30 text-success':'bg-danger/10 border-danger/30 text-danger')}><span className="font-bold text-xs">{!wallet?t('连接钱包','Connect wallet'):needsSideApproval(i)?t('授权 ','Approve '):mode==='BUY'?t('买入 ','Buy '):t('卖出 ','Sell ')}{genesis?'gToken':i===0?'YES':'NO'}</span><span className="text-[10px]">{genesis?(quoteFor(i)?Number(formatUnits(quoteFor(i)!.cash,payDecimals)).toPrecision(4)+' '+paySymbol:'—'):market.presentation?.priceYes===undefined?'—':((i===0?Number(market.presentation.priceYes):1e18-Number(market.presentation.priceYes))/1e18).toFixed(2)}</span></button>})}</div></div>
      <div className="text-[10px] text-text-muted" data-testid="my-trade-holdings">{row(t('我的份额','My shares'),genesis?`${units(market.position?.genesisShares,11)} gToken`:`YES ${units(market.position?.yes)} · NO ${units(market.position?.no)}`)}{!genesis&&<>{row(t('我的LP份额','My LP shares'),units(market.position?.lp))}{row(t('我的B份额','My B shares'),units(market.position?.b))}</>}</div>
      <div className={'grid '+'grid-cols-1 gap-2 text-[10px]'}>{(genesis?[0]:[tradeSide]).map(value=>{const i=value as 0|1,q=quoteFor(i);return <div key={i} className="rounded-lg border border-border p-2.5"><strong className={i===0?'text-success':'text-danger'}>{genesis?'Genesis':i===0?'YES':'NO'}</strong>{row(mode==='BUY'?t('预计支付','Est. payment'):t('预计到账','Est. receipt'),q?`${units(q.cash,payDecimals)} ${paySymbol}`:'—')}{row(genesis&&mode==='BUY'?t('最低获得 gToken','Minimum gToken'):mode==='BUY'?t('最大支付','Max payment'):t('最低到账','Min receipt'),q?`${units(q.limit,genesis&&mode==='BUY'?11:payDecimals)} ${genesis&&mode==='BUY'?'gToken':paySymbol}`:'—')}{sideErrors[i]&&<p className="text-danger break-words">{sideErrors[i]}</p>}</div>})}</div>
      {usingStable&&!genesis&&mode==='BUY'&&<p className="text-[10px] text-text-muted">{t('按最多支付USDG兑换股票后买入；多余股票退回钱包。','Swap the maximum USDG payment, then buy shares. Unspent stock is returned to your wallet.')}</p>}
      <p className="text-[10px] text-text-muted">{t('链上报价 · 1%滑点保护。授权与成交分别在钱包确认。','On-chain quotes · 1% slippage protection. Approval and trade are separate wallet confirmations.')}</p>
    </div>:<Button className="w-full" disabled={!canAct} onClick={()=>claimSelected('market')}>{t('领取市场结算款','Claim market payout')}</Button>}
    {tab==='MARKET'&&[1,2,3].includes(market.phase)&&(market.position?.genesisShares??0n)>0n&&<div className={box+' text-xs space-y-2'}><p>{t('领取托管的LP代币到钱包；不会提走池中本金。LP/B本金仅在结算或未毕业清算后领取。','Receive escrowed LP tokens in your wallet. This does not withdraw pool capital; LP/B payouts require settlement or a failed launch.')}</p><Button variant="outline" disabled={!canAct} onClick={()=>void transact(c=>c.materializeLP(market.address))}>{t('领取 LP 代币到钱包','Receive LP tokens')}</Button></div>}
    {market.vaultResolved&&<Button className="w-full" disabled={!canAct||!market.vaultSettlementReady} onClick={()=>claimSelected('core')}>{t('领取 Core 结算款','Claim Core payout')}</Button>}
    {((market.phase===0&&now>=Number(market.genesisCutoff))||(market.phase===1&&now>=Number(market.formalCutoff)))&&<Button variant="outline" disabled={!canAct} onClick={()=>void transact(c=>c.closeExpired(market.address))}>{t('推进已截止阶段','Close expired stage')}</Button>}
    {[1,2].includes(market.phase)&&(now>=Number(market.coreCutoff)||market.vaultResolved)&&<Button variant="outline" disabled={!canAct} onClick={()=>void transact(c=>c.finalizeMarket(market.address))}>{t('执行最终结算','Finalize settlement')}</Button>}
  </div>:null;
  const hasCorePrincipal=!!market&&(market.totalStakeYes+market.totalStakeNo+market.totalStakeInvalid)>0n;
  const coreActions=market?.early&&stock?<div className="space-y-3">
    <section className={box+' text-xs space-y-3'} aria-label={t('解除质押','Unstake')} data-testid="core-unstake-panel"><h5 className="font-bold text-sm">{t('解除质押','Unstake')}</h5>{row(t('退回本金','Principal refunded'),`${units(market.early.refund,stock.decimals)} ${stock.symbol}`)}{row(t('罚没本金','Penalty'),`${units(market.early.penalty,stock.decimals)} ${stock.symbol}`)}<p>{t('全仓退出：退90%，罚没10%，放弃累计手续费。','Full exit: refund 90%, forfeit 10% and accrued fees.')}</p>{!wallet?<p className="text-text-muted">{t('请先连接钱包查看可退出本金。','Connect your wallet to view your stake.')}</p>:earlyDue?<p className="text-text-muted">{t('提前结算确认期已结束，请先处理申请，再根据处理结果继续操作。','The early settlement confirmation period has ended. Process the request before continuing.')}</p>:!coreOpen?<p className="text-text-muted">{t('当前阶段不能解除质押。','Unstaking is unavailable in this stage.')}</p>:(market.early.refund??0n)+(market.early.penalty??0n)===0n?<p className="text-text-muted">{t('当前钱包没有可解除的 Core 质押。','This wallet has no Core stake to unstake.')}</p>:null}<Button variant="outline" disabled={!canAct||!coreOpen||(market.early.refund??0n)+(market.early.penalty??0n)===0n} onClick={()=>void transact(c=>c.exitCore(market.address))}>{t('确认解除全部质押','Confirm full unstake')}</Button></section>
    <details className={box+' text-xs'}><summary className="cursor-pointer font-bold">{t('提前结算申请','Early settlement request')}</summary><div className="space-y-3 mt-3">
      {row(t('申请保证金（500U等值）','Proposal bond (500 USD equivalent)'),`${units(market.early.bond,stock.decimals)} ${stock.symbol}`)}
      {market.early.requestId>0n?<>{row(t('申请结果','Requested outcome'),market.early.requestedOutcome===1?'YES':'NO')}{row(t('确认期结束','Confirmation ends'),date(market.early.processAfter))}<Button disabled={!canAct||now<Number(market.early.processAfter)} onClick={()=>void transact(c=>c.processEarlyTermination(market.address))}>{t('执行结算检查','Check early settlement')}</Button></>:!hasCorePrincipal?<p>{t('Core 尚无质押本金，不能提交申请。','Core has no staked principal. Requests are unavailable.')}</p>:coreOpen&&now+3600<Number(market.coreCutoff)?<><label className="block">{t('申请结果','Requested outcome')}<select className={field} value={proposalSide} disabled={busy} onChange={e=>setProposalSide(Number(e.target.value) as 0|1)}><option value={0}>YES</option><option value={1}>NO</option></select></label><label className="block">{t('提前结算原因','Reason')}<input className={field} value={earlyReason} disabled={busy} onChange={e=>setEarlyReason(e.target.value)}/></label><p className="text-text-muted">{t('可申请 YES 或 NO。确认期1小时；到期未匹配（含平局或INVALID）将罚没保证金，尚未截止的操作恢复。','Request YES or NO. After 1 hour a mismatch, including a tie or INVALID, forfeits the bond; operations resume only if their original deadlines have not passed.')}</p>{(market.position?.vaultAllowance??0n)<market.early.bond?<Button disabled={!canAct} onClick={()=>void transact(c=>c.approveStock(market.address,'vault',market.early!.bond))}>{t('授权申请保证金','Approve proposal bond')}</Button>:<Button disabled={!canAct||!earlyReason.trim()||(market.position?.balance??0n)<market.early.bond} onClick={()=>void transact(c=>c.proposeEarlyTermination(market.address,proposalSide===0?1:2,earlyReason))}>{t('申请提前结算','Request early settlement')}</Button>}</>:<p>{t('当前阶段不能发起申请。','Requests are unavailable in this stage.')}</p>}
      {(market.early.bondRefund??0n)>0n&&<Button disabled={!canAct} onClick={()=>void transact(c=>c.claimEarlyBond(market.address))}>{t('领取退还保证金','Claim refunded bond')}</Button>}
    </div></details>
  </div>:null;

  return <div className="max-w-7xl mx-auto text-text" data-testid="testnet-market-app">
    <div className="flex flex-wrap justify-between items-center gap-3 mb-5"><span className="text-xs font-bold text-accent">{t('Robinhood 测试网 · 仅使用测试资产','Robinhood Testnet · Test assets only')}</span><div className="flex items-center gap-3 text-sm"><button className={small} disabled={busy} onClick={()=>void connect()}>{wallet?short(wallet.address):t('连接钱包','Connect wallet')}</button><button className={small} disabled={busy||!configured} aria-label={t('刷新','Refresh')} onClick={()=>void refresh().catch(e=>setNotice(errorText(e)))}><RefreshCw size={15}/></button></div></div>
    {!configured&&<p className={box}>{t('测试网合约尚未配置','Testnet contracts are not configured')}</p>}
    {pollError&&<p role="status" className="text-sm text-orange-500 mb-4">{t('链上状态自动更新失败，请点击刷新确认最新申请状态。','Automatic state refresh failed. Refresh to check the latest request status.')}</p>}
    {notice&&<div role="status" className="rounded-xl border border-border p-3 text-sm mb-4 break-words">{notice}{txHash&&<a className="ml-2 text-accent underline" href={config.explorer+'/tx/'+txHash} target="_blank" rel="noreferrer">{t('查看交易','View transaction')}</a>}</div>}
    {configured&&(creating?<form className={box+' max-w-xl mx-auto space-y-4 bg-white'} onSubmit={e=>{e.preventDefault();if(validCreation)void transact(c=>c.createMarket({...topic,stock:stockAddress,coreEnd:BigInt(finalTimestamp)}),created);}}><div className="flex justify-between items-center"><h2 className="text-xl font-bold">{t('发起话题','Create topic')}</h2><button className={small} type="button" disabled={busy} onClick={()=>setCreating(false)}>{t('取消','Cancel')}</button></div><label className="block text-sm">{t('股票','Stock')}<select className={field} value={stockAddress} onChange={e=>setStockAddress(e.target.value)} disabled={busy}>{enabledStocks.map(a=><option key={a.address} value={a.address}>{a.symbol}</option>)}</select></label>{(['topic','yesRule','noRule','invalidRule'] as const).map((key,i)=><label className="block text-sm" key={key}>{[t('话题内容','Market question'),'YES','NO','INVALID'][i]}<textarea required rows={2} className={field} value={topic[key]} disabled={busy} onChange={e=>setTopic({...topic,[key]:e.target.value})}/></label>)}<FinalDeadlineInput lang={lang} value={deadline} onChange={setDeadline} now={now}/><p className="text-xs text-text-muted">{t('Genesis提前2小时截止，Formal提前1小时截止。创建仅支付测试网gas。','Genesis closes 2 hours before the final cutoff; Formal 1 hour before it. Creation requires testnet gas only.')}</p><Button type="submit" className="w-full" disabled={!wallet||busy||!validCreation}>{t('在钱包中确认创建','Confirm creation in wallet')}</Button></form>:selected?<>
      <div className="flex justify-between items-center gap-3 mb-4"><button className={small+' inline-flex gap-2 items-center'} disabled={busy} onClick={()=>chooseMarket('')}><ArrowLeft size={15}/>{category==='all'?t('全部市场','All markets'):t(`返回 ${category} 话题`,`${category} topics`)}</button><button className={small+' inline-flex gap-2 items-center'} onClick={()=>void navigator.clipboard.writeText(window.location.href).then(()=>setNotice(t('话题链接已复制','Topic link copied')))}><Share2 size={15}/>{t('分享话题','Share topic')}</button></div>
      {market?.early&&market.early.requestId>0n&&!market.vaultResolved&&<EarlyTerminationNotice request={market.early} now={now} lang={lang} connected={!!wallet} busy={busy} onConnect={()=>void connect()} onProcess={()=>void transact(c=>c.processEarlyTermination(market.address))}/>}
      {market&&stock?<TestnetSimulation key={market.address} market={displayMarket!} stock={stock} lang={lang} now={now} walletAddress={wallet?.address} busy={busy} onConnect={()=>void connect()} controls={tradeControls} coreActions={coreActions} status={notice||t('链上报价与持仓 · 每笔交易需要钱包确认','On-chain quotes and holdings · Wallet confirmation required')} onTabChange={onDetailTab} history={historyPoints} activity={activity}/>:<p className="p-10 text-center text-text-muted">{t('正在读取链上市场…','Loading on-chain market…')}</p>}
      {historyError&&<p role="status" className="text-xs text-text-muted mt-3">{historyError}</p>}
      {market&&<a className="inline-block mt-4 text-xs text-accent underline" href={config.explorer+'/address/'+market.address} target="_blank" rel="noreferrer">{t('查看合约','View contract')} · {short(market.address)}</a>}
    </>:<>
      {category==='all'?<section className="rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-slate-50 p-6 sm:p-10 mb-6"><div className="text-xs tracking-widest font-bold text-accent mb-3">OCP MARKET</div><div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6"><div><h1 className="text-4xl sm:text-5xl font-bold tracking-tight">{t('围绕你关注的股票发起话题，参与交易。','Ticker. Topic. Trade.')}</h1><p className="text-sm text-text-muted mt-4">Every stock has a story. Trade &amp; Pump it.</p></div><button className={small+' bg-accent text-white inline-flex items-center gap-2'} disabled={busy} onClick={()=>setCreating(true)}><Plus size={16}/>{t('发起话题','Create topic')}</button></div></section>:<div className="flex items-center justify-between gap-4 mb-5"><h1 className="text-2xl font-bold">{category}</h1><button className={small+' bg-accent text-white'} onClick={()=>setCreating(true)}>{t('发起话题','Create topic')}</button></div>}
      {!directory?<p className="p-10 text-center text-text-muted">{t('正在读取链上市场…','Loading on-chain markets…')}</p>:<div className="grid lg:grid-cols-[176px_minmax(0,1fr)] gap-4"><aside aria-label="Stock topics" className="rounded-xl border border-border bg-white p-2 self-start flex gap-1 overflow-x-auto lg:block lg:space-y-1">{['all',...categories].map(symbol=><button key={symbol} type="button" aria-pressed={category===symbol} disabled={busy} className={'shrink-0 lg:w-full flex flex-col rounded-lg px-3 py-2.5 text-sm text-left '+(category===symbol?'bg-orange-50 text-orange-600 font-bold':'text-text-muted hover:text-text')} onClick={()=>chooseCategory(symbol)}><span className="flex w-full justify-between gap-4"><span>{symbol==='all'?t('全部话题','All topics'):symbol}</span><span className="text-[11px] text-text-muted">{categoryCount(symbol)}</span></span>{symbol!=='all'&&referenceSymbol(symbol)&&<span className="w-full"><StockPriceReference symbol={referenceSymbol(symbol)!} lang={lang} compact context="testnet"/></span>}</button>)}</aside><section className="min-w-0">{category!=='all'&&referenceSymbol(category)&&<StockPriceReference key={category} symbol={referenceSymbol(category)!} lang={lang} context="testnet"/>}<h2 className="text-xl font-bold mb-4">{category==='all'?t('全部市场','All markets'):t(`${category} 的全部话题`,`${category} topics`)}</h2><div className="flex flex-wrap gap-3 mb-5"><label className="flex flex-1 min-w-[180px] items-center gap-2 border border-border bg-white rounded-xl px-3"><Search size={16}/><input aria-label="Search markets" className="py-3 bg-transparent text-sm w-full outline-none" value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('搜索主题或股票…','Search questions or stocks…')}/></label><select className="border border-border rounded-xl p-2 bg-white" aria-label="Market phase" value={phaseFilter} onChange={e=>setPhaseFilter(e.target.value)}><option value="all">{t('全部阶段','All phases')}</option>{[0,1,2,3,4].map(i=><option value={i} key={i}>{phaseName(i)}</option>)}</select></div><div className="grid sm:grid-cols-2 gap-4">{visibleMarkets.map(item=>{const asset=directory.stocks.find(a=>a.address.toLowerCase()===item.stock.toLowerCase());return <button className="rounded-2xl border border-border bg-white p-5 text-left hover:border-accent space-y-4" disabled={busy} key={item.address} onClick={()=>chooseMarket(item.address)}><div className="flex justify-between text-xs"><strong>{asset?.symbol??short(item.stock)}</strong><span>{phaseName(item.phase)}</span></div><h3 className="text-lg font-bold">{item.topic}</h3>{item.earlyRequest&&<div className="rounded-lg border border-orange-500 bg-orange-500/10 px-3 py-2 text-sm font-bold text-orange-500">{t('提前结算申请','Early settlement request')} · {item.earlyRequest.requestedOutcome===1?'YES':'NO'} · {now>=Number(item.earlyRequest.processAfter)?t('确认期已结束 · 待处理','Confirmation ended · Action needed'):t('确认期进行中','Confirmation open')}</div>}{item.phase===0&&item.R!==undefined&&item.rTarget!==undefined?<div className="text-xs text-text-muted">{row('R',`${units(item.R,asset?.decimals)} / ${units(item.rTarget,asset?.decimals)}`)}{row('B',`${units(item.B,asset?.decimals)} / ${units(item.bTarget,asset?.decimals)}`)}</div>:item.priceYes!==undefined&&[1,2].includes(item.phase??-1)?<div className="space-y-2"><div className="h-2 border border-border rounded overflow-hidden flex"><span className="bg-success" style={{width:`${Number(item.priceYes)*100/1e18}%`}}/><span className="flex-1 bg-danger"/></div><div className="flex justify-between text-xs font-bold"><span className="text-success">YES {(Number(item.priceYes)*100/1e18).toFixed(0)}%</span><span className="text-danger">NO {(100-Number(item.priceYes)*100/1e18).toFixed(0)}%</span></div></div>:null}<p className="text-xs text-text-muted">{t('最终截止','Final deadline')} · {date(item.coreCutoff)}</p></button>})}</div>{!visibleMarkets.length&&<p className="border border-dashed border-border rounded-2xl p-10 text-center text-sm text-text-muted">{t('当前分类没有匹配的市场。','No matching markets.')}</p>}</section></div>}
    </>)}
  </div>;
}
