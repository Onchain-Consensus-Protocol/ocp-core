import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {BrowserProvider, JsonRpcProvider, ZeroAddress, formatUnits, isAddress, parseUnits} from 'ethers';
import {ArrowLeftRight, LayoutDashboard, ShieldAlert, Search, Plus} from 'lucide-react';
import {Button} from './Button';
import {FinalDeadlineInput} from './FinalDeadlineInput';
import {StockPriceReference} from './StockPriceReference';
import {stockCategories, filterStockMarkets, referenceSymbol} from '../testnet/marketDirectory';
import {config} from '../config';
import {defaultDeadlineLocal, parseLocalDeadline} from '../shared/deadlineDate';
import {createChainClient, type MarketState} from '../testnet/chainClient';
import type {Language} from '../types';

const CHAIN_ID = 46630;
const field = 'block w-full border border-border rounded-lg p-3 mt-2 bg-white text-text';
const box = 'rounded-xl border border-border p-4';
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const units = (value: bigint | undefined, decimals = 18) => value === undefined ? '—' : formatUnits(value, decimals);
type Directory = Awaited<ReturnType<ReturnType<typeof createChainClient>['readDirectory']>>;
type Wallet = {provider: BrowserProvider; address: string; chainId: number};
type Quote = {key: string; quantity: bigint; cash: bigint; limit: bigint};

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
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [market, setMarket] = useState<MarketState | null>(null);
  const [selected, setSelected] = useState('');
  const [stockAddress, setStockAddress] = useState('');
  const [creating, setCreating] = useState(false);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState({topic: '', yesRule: '', noRule: '', invalidRule: ''});
  const [deadline, setDeadline] = useState(defaultDeadlineLocal);
  const [tab, setTab] = useState<'MARKET' | 'CORE'>('MARKET');
  const [mode, setMode] = useState<'BUY' | 'SELL'>('BUY');
  const [side, setSide] = useState<0 | 1 | 2>(0);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [txHash, setTxHash] = useState('');
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const readSequence = useRef(0);
  const pending = useRef(false);
  const stock = directory?.stocks.find(asset => asset.address.toLowerCase() === market?.stock.toLowerCase());
  const enabledStocks = directory?.stocks.filter(asset => asset.enabled) ?? [];
  const creationStock = enabledStocks.find(asset => asset.address === stockAddress);
  const categories = stockCategories(directory?.stocks ?? []);
  const visibleMarkets = filterStockMarkets(directory?.markets ?? [], directory?.stocks ?? [], category, query);
  const categoryCount = (symbol: string) => filterStockMarkets(directory?.markets ?? [], directory?.stocks ?? [], symbol, '').length;
  function chooseCategory(symbol: string) {
    setCategory(symbol);setSelected('');setMarket(null);setAmount('');setQuote(null);setNotice('');
  }

  const refresh = useCallback(async () => {
    if (!reader) return;
    const sequence = ++readSequence.current;
    const [nextDirectory, nextMarket] = await Promise.all([
      reader.readDirectory(wallet?.address),
      selected ? reader.readMarket(selected, wallet?.address) : Promise.resolve(null),
    ]);
    if (sequence !== readSequence.current) return;
    setDirectory(nextDirectory);
    setMarket(nextMarket);
    setNow(Number(nextDirectory.timestamp));
    setStockAddress(current => current || nextDirectory.stocks.find(asset => asset.enabled)?.address || '');
  }, [reader, selected, wallet?.address]);

  useEffect(() => {
    setMarket(null);
    void refresh().catch(error => setNotice(errorText(error)));
    return () => {readSequence.current++;};
  }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const injected = () => (window as unknown as {ethereum?: {
    request: (request: {method: string; params?: unknown[]}) => Promise<unknown>;
    on?: (event: string, listener: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  }}).ethereum;

  useEffect(() => {
    const ethereum = injected();
    const invalidate = () => {
      setWallet(null);
      setQuote(null);
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
    if (!wallet || !reader) throw new Error(t('请先连接测试网钱包。', 'Connect your testnet wallet first.'));
    const network = await wallet.provider.getNetwork();
    const signer = await wallet.provider.getSigner();
    if (Number(network.chainId) !== CHAIN_ID || (await signer.getAddress()).toLowerCase() !== wallet.address.toLowerCase()) {
      throw new Error(t('钱包已变化，请重新连接。', 'Wallet changed. Reconnect.'));
    }
    return reader.withSigner(signer);
  }

  async function transact(action: (client: Awaited<ReturnType<typeof signedClient>>) => Promise<{hash: string; wait: () => Promise<unknown>}>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);setTxHash('');setNotice(t('请在钱包中确认交易。', 'Confirm the transaction in your wallet.'));
    try {
      const tx = await action(await signedClient());
      setTxHash(tx.hash);setNotice(t('交易已提交，等待区块确认…', 'Submitted. Waiting for confirmation…'));
      await tx.wait();
      setQuote(null);
      try {
        await refresh();
        setNotice(t('交易已确认，链上状态已更新。', 'Transaction confirmed. On-chain state updated.'));
      } catch (error) {
        setNotice(t('交易已确认，但状态刷新失败，请手动刷新：', 'Transaction confirmed, but refresh failed. Refresh manually: ') + errorText(error));
      }
    } catch (error) {setNotice(errorText(error));}
    finally {pending.current = false;setBusy(false);}
  }

  const earlyDue = !!market?.early && (market.early.due || market.early.requestId > 0n && now >= Number(market.early.processAfter));
  const genesis = market?.phase === 0;
  const genesisOpen = !!market && genesis && now < Number(market.genesisCutoff);
  const formalOpen = !!market && market.phase === 1 && now < Number(market.formalCutoff) && !market.vaultResolved && !earlyDue;
  const coreOpen = !!market && [1, 2].includes(market.phase) && now < Number(market.coreCutoff) && !market.vaultResolved && !earlyDue;
  const terminal = !!market && [3, 4].includes(market.phase);
  const quoteKey = `${selected}:${tab}:${mode}:${side}:${amount}:${market?.phase}:${wallet?.address}`;
  useEffect(() => {
    let cancelled = false;
    setQuote(null);setQuoteError('');
    if (!reader || !market || !stock || !amount || tab !== 'MARKET') return;
    const timer = window.setTimeout(async () => {
      try {
        // Genesis uses the existing display denomination: 10 million gTokens per internal share.
        const quantity = parseUnits(amount, genesis ? mode === 'BUY' ? stock.decimals : 11 : 18);
        if (quantity <= 0n) return;
        let cash: bigint;let limit: bigint;
        if (genesis && mode === 'BUY') {
          const minted = await reader.quoteGenesisBuy(market.address, quantity);
          cash = quantity;limit = minted * 99n / 100n;
        } else if (mode === 'BUY') {
          cash = await reader.quoteFormalBuy(market.address, side === 0, quantity);
          limit = (cash * 101n + 99n) / 100n;
        } else {
          const result = genesis ? await reader.quoteGenesisSell(market.address, quantity, wallet?.address)
            : await reader.quoteFormalSell(market.address, side === 0, quantity, wallet?.address);
          cash = result.seller;limit = cash * 99n / 100n;
        }
        if (!cancelled) setQuote({key: quoteKey, quantity, cash, limit});
      } catch (error) {if (!cancelled) setQuoteError(errorText(error));}
    }, 250);
    return () => {cancelled = true;window.clearTimeout(timer);};
  }, [reader, market, stock, amount, tab, mode, side, genesis, quoteKey, wallet?.address]);

  let coreAmount = 0n;
  try {if (stock && amount) coreAmount = parseUnits(amount, stock.decimals);} catch {/* The input remains editable. */}
  const currentQuote = quote?.key === quoteKey ? quote : null;
  const required = tab === 'CORE' ? coreAmount : mode === 'BUY' && currentQuote
    ? genesis ? currentQuote.cash : currentQuote.limit : 0n;
  const allowance = tab === 'CORE' ? market?.position?.vaultAllowance : market?.position?.marketAllowance;
  const needsApproval = required > 0n && (allowance ?? 0n) < required;
  const balanceEnough = required === 0n || (market?.position?.balance ?? 0n) >= required;
  const sellHolding = genesis ? market?.position?.genesisShares : side === 0 ? market?.position?.yes : market?.position?.no;
  const sellEnough = mode !== 'SELL' || !currentQuote || (sellHolding ?? 0n) >= currentQuote.quantity;
  const canAct = !!wallet && !!market && !busy;
  const tradeOpen = tab === 'CORE' ? coreOpen : genesis ? genesisOpen : formalOpen;
  const tradeValid = tab === 'CORE' ? coreAmount > 0n : !!currentQuote;
  const finalTimestamp = parseLocalDeadline(deadline);
  const metadataFits = Object.entries(topic).every(([key, value]) =>
    new TextEncoder().encode(value.trim()).length <= (key === 'topic' ? 512 : 2048));
  const validCreation = Number.isSafeInteger(finalTimestamp) && finalTimestamp > now + 14400
    && Object.values(topic).every(value => value.trim()) && metadataFits && !!creationStock && !creationStock.snapshotError;

  function trade() {
    if (!market || !tradeOpen || !tradeValid || needsApproval || !balanceEnough || !sellEnough) return;
    const address = market.address;
    const expiry = BigInt(now + 600);
    if (tab === 'CORE') {void transact(client => client.stakeCore(address, side, coreAmount));return;}
    if (!currentQuote) return;
    void transact(client => genesis
      ? mode === 'BUY' ? client.genesisBuy(address, currentQuote.quantity, currentQuote.limit, expiry)
        : client.genesisSell(address, currentQuote.quantity, currentQuote.limit, expiry)
      : mode === 'BUY' ? client.formalBuy(address, side === 0, currentQuote.quantity, currentQuote.limit, expiry)
        : client.formalSell(address, side === 0, currentQuote.quantity, currentQuote.limit, expiry));
  }

  const phaseLabel = market ? ['Genesis', 'Formal', t('等待 Core', 'Awaiting Core'), t('已结算', 'Settled'), t('未毕业清算', 'Funding failed')][market.phase] : '';
  const date = (value: bigint) => new Date(Number(value) * 1000).toLocaleString(zh ? 'zh-CN' : 'en-US');
  const row = (label: string, value: React.ReactNode) => <div className="flex justify-between gap-3 py-1"><span className="text-text-muted">{label}</span><strong className="text-right break-all tabular-nums">{value}</strong></div>;

  return <div className="max-w-6xl mx-auto space-y-4 text-text" data-testid="testnet-market-app">
    <div className="flex flex-wrap justify-between items-center gap-3 border border-border rounded-xl p-4 bg-white/80">
      <div><strong className="font-display">Market · Robinhood Chain Testnet</strong><p className="text-xs text-text-muted mt-1">{t('测试网 46630 · 钱包签名后执行真实测试网交易', 'Testnet 46630 · Wallet signatures submit real testnet transactions')}</p></div>
      <div className="flex gap-2"><Button disabled={busy} onClick={() => void connect()}>{wallet ? short(wallet.address) : t('连接测试网钱包', 'Connect testnet wallet')}</Button><Button disabled={busy || !configured} variant="outline" onClick={() => void refresh().catch(error => setNotice(errorText(error)))}>{t('刷新', 'Refresh')}</Button></div>
    </div>
    {!configured && <div className={`${box} bg-white/80`} role="status"><h2 className="font-bold">{t('测试网合约尚未配置', 'Testnet contracts are not configured')}</h2><p className="text-sm text-text-muted mt-2">{t('尚未部署或未设置统一工厂地址，当前没有可交易市场。', 'The shared factory has not been deployed or configured. No markets are available for trading.')}</p><p className="text-xs mt-2 font-mono">VITE_TOPIC_MARKET_FACTORY · Robinhood Chain Testnet 46630</p></div>}
    {notice && <div className={`${box} text-sm break-words`} role="status">{notice}{txHash && <a className="block mt-2 text-accent underline" target="_blank" rel="noreferrer" href={`https://explorer.testnet.chain.robinhood.com/tx/${txHash}`}>{t('查看交易', 'View transaction')} · {short(txHash)}</a>}</div>}
    {configured && <>
      <section className="rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-slate-50 p-6 sm:p-10 mb-6">
        <div className="text-xs tracking-widest font-bold text-orange-600 mb-3">OCP MARKET</div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6"><div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">{category === 'all' ? t('围绕你关注的股票发起话题，参与交易。', 'Ticker. Topic. Trade.') : category}</h1>
          <p className="text-sm text-slate-500 mt-4">Every stock has a story. Trade &amp; Pump it.</p>
        </div><Button disabled={busy || (!creating && (!directory || !enabledStocks.length))} onClick={() => {setCreating(value => !value);setNotice('');}}><Plus size={16} className="mr-2"/>{creating ? t('返回市场', 'Back to markets') : t('发起话题', 'Create topic')}</Button></div>
      </section>
      {!directory && <p className="text-sm text-text-muted">{t('正在读取测试网工厂…', 'Reading the testnet factory…')}</p>}
      {creating ? <form className="max-w-xl mx-auto bg-white/80 border border-border rounded-2xl p-6 sm:p-8 space-y-4" onSubmit={event => {
        event.preventDefault();if (!validCreation) return;
        void transact(client => client.createMarket({stock: stockAddress, ...Object.fromEntries(Object.entries(topic).map(([key, value]) => [key, value.trim()])) as typeof topic, coreEnd: BigInt(finalTimestamp)}));
      }}>
        <h2 className="text-xl font-display font-bold">{t('0本金发射你的市场', 'Launch your market with zero principal')}</h2>
        <label className="block text-sm">{t('底池股票代币', 'Pool stock token')}<select className={field} value={stockAddress} onChange={event => setStockAddress(event.target.value)}>{enabledStocks.map(asset => <option key={asset.address} value={asset.address}>{asset.symbol} · {short(asset.address)}</option>)}</select></label>
        {directory?.fixedTestTargets && creationStock?.fixedRTarget !== undefined && <p className="text-xs text-text-muted">{t('固定测试毕业门槛', 'Fixed test graduation targets')}: R {units(creationStock.fixedRTarget,18)} TSLA / B {units(creationStock.fixedBTarget,18)} TSLA</p>}
        {creationStock?.snapshotError && <p role="alert" className="text-xs text-danger">{t('该股票价格快照暂不可用，暂不能创建市场。请刷新或联系资产配置管理员。', 'This stock price snapshot is unavailable. Refresh or contact the asset administrator before creating a market.')}</p>}
        <label className="block text-sm">{t('话题内容', 'Market question')}<textarea className={field} required rows={2} maxLength={300} value={topic.topic} onChange={event => setTopic(value => ({...value, topic: event.target.value}))}/></label>
        {(['yesRule', 'noRule', 'invalidRule'] as const).map((key, i) => <label key={key} className="block text-sm">{['YES', 'NO', 'INVALID'][i]} {t('判定条件', 'resolution criteria')}<textarea className={field} required rows={2} maxLength={1000} value={topic[key]} onChange={event => setTopic(value => ({...value, [key]: event.target.value}))}/></label>)}
        {!metadataFits && <p className="text-xs text-danger" role="alert">{t('话题最多512字节，每条判定条件最多2048字节，请缩短文本。', 'Use at most 512 bytes for the question and 2048 bytes per resolution rule.')}</p>}
        <FinalDeadlineInput lang={lang} value={deadline} onChange={setDeadline} now={now}/>
        <p className="text-xs text-text-muted">{t('最终截止须晚于4小时。Genesis提前2小时截止，Formal提前1小时截止。创建只需支付测试网 gas。', 'Final deadline must be more than 4 hours away. Genesis ends 2 hours earlier; Formal ends 1 hour earlier. Creation requires testnet gas only.')}</p>
        <Button type="submit" className="w-full" disabled={!wallet || busy || !validCreation}>{t('在钱包中确认创建', 'Confirm creation in wallet')}</Button>
      </form> : <>
        <div className="grid lg:grid-cols-[176px_minmax(0,1fr)] gap-4">
          <aside aria-label={t('股票分类', 'Stock topics')} className="rounded-xl border border-border bg-white p-2 self-start">
            <div className="flex gap-1 overflow-x-auto lg:block lg:space-y-1">{['all', ...categories].map(symbol => <button key={symbol} type="button" aria-pressed={category === symbol} className={'shrink-0 lg:w-full flex flex-col rounded-lg px-3 py-2.5 text-sm text-left ' + (category === symbol ? 'bg-orange-50 text-orange-600 font-bold' : 'text-text-muted hover:text-text')} onClick={() => chooseCategory(symbol)}>
              <span className="flex w-full items-center justify-between gap-4"><span>{symbol === 'all' ? t('全部话题', 'All topics') : symbol}</span><span className="text-[11px] text-text-muted">{categoryCount(symbol)}</span></span>
              {symbol !== 'all' && referenceSymbol(symbol) && <span className="w-full"><StockPriceReference symbol={referenceSymbol(symbol)!} lang={lang} compact context="testnet"/></span>}
            </button>)}</div>
            <p className="hidden lg:block text-[10px] text-text-muted px-3 mt-3 mb-1">{t('主网参考行情 · DEX Screener', 'Mainnet reference · DEX Screener')}</p>
          </aside>
          <section className="min-w-0">
            {category !== 'all' && referenceSymbol(category) && <StockPriceReference key={category} symbol={referenceSymbol(category)!} lang={lang} context="testnet"/>}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><h2 className="text-xl font-bold">{category === 'all' ? t('全部市场', 'All markets') : t(`${category} 的全部话题`, `${category} topics`)}</h2>
              <label className="flex items-center gap-2 bg-white border border-border rounded-xl px-3"><Search size={16}/><input aria-label={t('搜索市场', 'Search markets')} value={query} onChange={event => setQuery(event.target.value)} placeholder={t('搜索主题或股票…', 'Search questions or stocks…')} className="py-3 bg-transparent text-sm w-full outline-none"/></label>
            </div>
        <div className="grid sm:grid-cols-2 gap-4">{visibleMarkets.map(item => {
          const asset = directory.stocks.find(value => value.address.toLowerCase() === item.stock.toLowerCase());
          return <button key={item.address} disabled={busy} onClick={() => {setSelected(item.address);setAmount('');setQuote(null);setNotice('');}} className={`${box} bg-white/80 text-left hover:border-accent ${selected === item.address ? 'border-accent' : ''}`}><div className="text-xs font-mono text-text-muted">{asset?.symbol ?? short(item.stock)} · {short(item.address)}</div><strong className="block my-2 break-words">{item.topic}</strong><span className="text-xs text-text-muted">{t('最终截止', 'Final deadline')} · {date(item.coreCutoff)}</span></button>;
        })}</div>
        {directory && !visibleMarkets.length && <p className="border border-dashed border-border rounded-2xl p-10 text-center text-sm text-text-muted">{t('当前分类没有匹配的测试网市场。', 'No matching testnet markets in this category.')}</p>}
        {market && stock && <div className="vault-shell bg-white/80 border border-border rounded-2xl shadow-sm flex flex-col md:flex-row overflow-hidden">
          <div className="p-4 sm:p-6 md:w-1/3 border-b md:border-b-0 md:border-r border-border space-y-4">
            <h3 className="text-lg font-display font-bold flex items-center gap-2">{tab === 'CORE' ? <ShieldAlert className="w-5 h-5 text-accent"/> : <ArrowLeftRight className="w-5 h-5 text-purple-600"/>}{tab === 'CORE' ? 'OCP Core' : t('交易', 'Trade')}</h3>
            <div className="flex p-1 border border-border rounded-lg">{(['CORE', 'MARKET'] as const).map(value => <button key={value} disabled={busy} onClick={() => {setTab(value);setSide(0);setAmount('');}} className={`flex-1 py-2 text-xs font-bold rounded-md ${tab === value ? 'border border-accent text-text' : 'text-text-muted'}`}>{value === 'CORE' ? 'OCP Core' : t('市场', 'Market')}</button>)}</div>
            <div className={`${box} text-xs space-y-2`}><strong>{stock.symbol} {t('股票代币底池', 'stock-token pool')}</strong>{row(t('可用余额', 'Available balance'), `${units(market.position?.balance, stock.decimals)} ${stock.symbol}`)}<p className="text-text-muted">{t('直接使用该股票支付和收款。', 'Pay and receive this stock token directly.')}</p></div>
            {!terminal && <>
              {tab === 'MARKET' && <div className="flex gap-2">{(['BUY', 'SELL'] as const).map(value => <Button key={value} className="flex-1" disabled={busy} variant={mode === value ? 'primary' : 'ghost'} onClick={() => {setMode(value);setAmount('');}}>{value === 'BUY' ? t('买入', 'Buy') : t('卖出', 'Sell')}</Button>)}</div>}
              {(!genesis || tab === 'CORE') && <label className="block text-xs">{t('方向', 'Side')}<select className={field} value={side} disabled={busy} onChange={event => setSide(Number(event.target.value) as 0 | 1 | 2)}>{(tab === 'CORE' ? ['YES', 'NO', 'INVALID'] : ['YES', 'NO']).map((value, i) => <option key={value} value={i}>{value}</option>)}</select></label>}
              <label className="block text-xs">{tab === 'CORE' || genesis && mode === 'BUY' ? `${t('支付数量', 'Payment amount')} (${stock.symbol})` : genesis ? t('卖出 gToken 数量', 'gTokens to sell') : t('YES／NO 份额数量', 'YES / NO share amount')}<input className={field} inputMode="decimal" value={amount} disabled={busy} onChange={event => setAmount(event.target.value)} placeholder="0"/></label>
              {tab === 'MARKET' && <div className={`${box} text-xs`} aria-live="polite">{currentQuote ? <>{row(mode === 'BUY' ? t('预计支付', 'Estimated payment') : t('预计到账', 'Estimated receipt'), `${units(currentQuote.cash, stock.decimals)} ${stock.symbol}`)}{row(genesis && mode === 'BUY' ? t('最低获得 gToken（1%滑点）', 'Minimum gTokens (1% slippage)') : mode === 'BUY' ? t('最大支付（1%滑点）', 'Maximum payment (1% slippage)') : t('最低到账（1%滑点）', 'Minimum receipt (1% slippage)'), `${units(currentQuote.limit, genesis && mode === 'BUY' ? 11 : stock.decimals)} ${genesis && mode === 'BUY' ? 'gToken' : stock.symbol}`)}</> : quoteError || t('输入数量查看链上报价。', 'Enter an amount for an on-chain quote.')}</div>}
              {tab === 'CORE' && <p className="text-xs text-text-muted">{t('方向选择后只能同侧追加，资金锁定至结算。', 'Once selected, add only to the same side. Funds remain locked until settlement.')}</p>}
              {!tradeOpen && <p className="text-xs text-text-muted">{t('当前阶段已截止或尚未开启，请刷新状态。', 'This stage is closed or has not opened. Refresh the state.')}</p>}
              {!balanceEnough && <p className="text-xs text-danger">{t('股票余额不足。', 'Insufficient stock balance.')}</p>}
              {!sellEnough && <p className="text-xs text-danger">{t('持仓不足。', 'Insufficient holdings.')}</p>}
              {required > 0n && <Button className="w-full" disabled={!canAct || !tradeOpen || !needsApproval || !balanceEnough} onClick={() => void transact(client => client.approveStock(market.address, tab === 'CORE' ? 'vault' : 'market', required))}>{needsApproval ? t('1. 授权本次金额', '1. Approve this amount') : t('授权已足够', 'Approval sufficient')}</Button>}
              <Button className="w-full" disabled={!canAct || !tradeOpen || !tradeValid || needsApproval || !balanceEnough || !sellEnough} onClick={trade}>{t('在钱包中确认交易', 'Confirm trade in wallet')}</Button>
              {genesis && <p className="text-xs text-text-muted">{t('触发毕业后 gToken 转为 LP 权益，持仓价值可能低于成本。', 'Graduation converts gTokens into LP rights; their value may be below cost.')}</p>}
            </>}
            {terminal && <Button className="w-full" disabled={!canAct} onClick={() => void transact(client => client.claimMarket(market.address))}>{t('领取市场结算款', 'Claim market payout')}</Button>}
            {market.early && <div className={`${box} text-xs space-y-3`}>
              <strong>{t('Core 退出与提前终止', 'Core exit and early resolution')}</strong>
              {coreOpen && market.early.refund !== undefined && market.early.penalty !== undefined && market.early.refund + market.early.penalty > 0n && <>
                {row(t('退出退回本金', 'Exit refund'), `${units(market.early.refund,stock.decimals)} ${stock.symbol}`)}
                {row(t('留池罚没本金', 'Principal retained as penalty'), `${units(market.early.penalty,stock.decimals)} ${stock.symbol}`)}
                <p>{t('退出放弃累计手续费；罚没资金在终局按规则分配。', 'Exit forfeits accrued fees. Retained funds are distributed at settlement.')}</p>
                <Button disabled={!canAct} variant="outline" onClick={() => void transact(client => client.exitCore(market.address))}>{t('退出全部 Core 质押', 'Exit all Core stake')}</Button>
              </>}
              {row(t('固定申请保证金（创建时500U等值）', 'Fixed proposal bond (500 USD at creation)'), `${units(market.early.bond,stock.decimals)} ${stock.symbol}`)}
              {market.early.requestId > 0n ? <>
                {row(t('申请结果', 'Requested outcome'), ['—','YES','NO'][market.early.requestedOutcome])}
                {row(t('窗口结束', 'Window ends'), date(market.early.processAfter))}
                <Button disabled={!canAct || now < Number(market.early.processAfter)} onClick={() => void transact(client => client.processEarlyTermination(market.address))}>{t('处理提前终止申请', 'Process early request')}</Button>
              </> : coreOpen && now + 3600 < Number(market.coreCutoff) && market.early.bond > 0n && <>
                <label className="block">{t('提前终止原因', 'Reason for early resolution')}<input className={field} value={earlyReason} onChange={event=>setEarlyReason(event.target.value)} disabled={busy}/></label>
                <p>{t('上方选择 YES 或 NO。窗口1小时；结果匹配退保证金，否则罚没并继续交易。原因仅在链上保存哈希。', 'Select YES or NO above. The window is 1 hour. A match refunds the bond; otherwise it is forfeited and trading resumes. Only the reason hash is stored onchain.')}</p>
                {(market.position?.vaultAllowance ?? 0n) < market.early.bond ? <Button disabled={!canAct} onClick={() => void transact(client => client.approveStock(market.address,'vault',market.early!.bond))}>{t('授权申请保证金', 'Approve proposal bond')}</Button> : <Button disabled={!canAct || side === 2 || !earlyReason.trim() || (market.position?.balance ?? 0n) < market.early.bond} onClick={() => void transact(client => client.proposeEarlyTermination(market.address, side === 0 ? 1 : 2, earlyReason))}>{t('提交提前终止申请', 'Propose early resolution')}</Button>}
              </>}
              {(market.early.bondRefund ?? 0n)>0n && <Button disabled={!canAct} onClick={() => void transact(client => client.claimEarlyBond(market.address))}>{t('领取退还的保证金', 'Claim refunded bond')}</Button>}
            </div>}
            {market.vaultResolved && <Button className="w-full" disabled={!canAct || !market.vaultSettlementReady} onClick={() => void transact(client => client.claimCore(market.address))}>{t('领取 Core 结算款', 'Claim Core payout')}</Button>}
          </div>
          <div className="p-4 sm:p-6 md:w-2/3 space-y-5">
            <div className="flex items-start justify-between gap-3"><h2 className="text-xl font-display font-bold break-words">{market.topic}</h2><span className="shrink-0 px-2 py-1 text-xs rounded-full border border-accent/50 text-accent bg-accent/10">{phaseLabel}</span></div>
            <div className="space-y-2 text-xs">{(['yesRule', 'noRule', 'invalidRule'] as const).map((key, i) => <p key={key} className="whitespace-pre-wrap break-words"><strong>{['YES', 'NO', 'INVALID'][i]}: </strong>{market[key]}</p>)}</div>
            <div className={`${box} text-xs`}>{row('Genesis', date(market.genesisCutoff))}{row('Formal', date(market.formalCutoff))}{row(t('Core／最终截止', 'Core / final deadline'), date(market.early?.effectiveCutoff ?? market.coreCutoff))}</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className={`${box} text-xs`}><h3 className="font-bold mb-2 flex items-center gap-2"><LayoutDashboard className="w-4 h-4"/>{t('我的持仓', 'My holdings')}</h3>{row('gToken', units(market.position?.genesisShares, 11))}{row('YES', units(market.position?.yes))}{row('NO', units(market.position?.no))}{row('LP', units(market.position?.lp))}{row('B', units(market.position?.b))}</div>
              <div className={`${box} text-xs`}><h3 className="font-bold mb-2">{t('我的 Core 质押', 'My Core stake')} ({stock.symbol})</h3>{row('YES', units(market.position?.coreYes, stock.decimals))}{row('NO', units(market.position?.coreNo, stock.decimals))}{row('INVALID', units(market.position?.coreInvalid, stock.decimals))}<p className="text-text-muted mt-2">{t('最终结果', 'Final result')}: {market.vaultResolved ? ['—', 'YES', 'NO', 'INVALID'][market.vaultOutcome] : t('尚未结算', 'Pending')}</p></div>
            </div>
            <div className={`${box} text-xs`}>{row(t('Genesis 曲线资金 R', 'Genesis curve funds R'), `${units(market.R, stock.decimals)} ${stock.symbol}`)}{row(t('风险资金 B', 'Risk funds B'), `${units(market.B, stock.decimals)} ${stock.symbol}`)}<p className="text-text-muted mt-2">{t('链上状态来自统一工厂；资产停用只阻止新建市场。', 'State is read from the shared factory. Disabling an asset only prevents new markets.')}</p></div>
            <div className="flex flex-wrap gap-2">
              {market.phase === 0 && now >= Number(market.genesisCutoff) || market.phase === 1 && now >= Number(market.formalCutoff) ? <Button disabled={!canAct} variant="outline" onClick={() => void transact(client => client.closeExpired(market.address))}>{t('推进已截止阶段', 'Close expired stage')}</Button> : null}
              {[1, 2].includes(market.phase) && (now >= Number(market.coreCutoff) || market.vaultResolved) && <Button disabled={!canAct} variant="outline" onClick={() => void transact(client => client.finalizeMarket(market.address))}>{t('执行最终结算', 'Finalize settlement')}</Button>}
              <a className="text-xs text-accent underline self-center" href={`https://explorer.testnet.chain.robinhood.com/address/${market.address}`} target="_blank" rel="noreferrer">{t('查看合约', 'View contract')} · {short(market.address)}</a>
            </div>
          </div>
        </div>}
          </section>
        </div>
      </>}
      <p className="text-xs text-text-muted font-mono break-all">Factory {factoryAddress}{directory ? ` · ${t('区块', 'Block')} ${directory.blockNumber}` : ''}</p>
    </>}
  </div>;
}
