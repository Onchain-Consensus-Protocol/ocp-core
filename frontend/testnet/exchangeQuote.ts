import {Contract, ZeroAddress, getAddress, type Provider} from 'ethers';

/** Existing QuoterV2, independently verified on chain 46630; its factory is checked on every quote. */
export const TESTNET_V3_QUOTER='0x126f1c1F29A0f49c5D33e0139a5Da1FE25590dB1';
const CHAIN_ID=46630n;
const MAX_AMOUNT=(1n<<255n)-1n;
const MIN_SQRT_RATIO=4295128739n;
const MAX_SQRT_RATIO=1461446703485210103287273052203988822378723970342n;

const EXCHANGE_ABI=[
  'function stock() view returns(address)','function stable() view returns(address)',
  'function dexRouter() view returns(address)','function fee() view returns(uint24)',
];
const ROUTER_ABI=['function factory() view returns(address)','function factoryV3() view returns(address)'];
const FACTORY_ABI=[
  'function getPool(address,address,uint24) view returns(address)',
  'function feeAmountTickSpacing(uint24) view returns(int24)',
];
const POOL_ABI=[
  'function factory() view returns(address)','function token0() view returns(address)',
  'function token1() view returns(address)','function fee() view returns(uint24)',
  'function tickSpacing() view returns(int24)','function liquidity() view returns(uint128)',
  'function slot0() view returns(uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)',
];
const TOKEN_ABI=['function decimals() view returns(uint8)','function symbol() view returns(string)'];
const QUOTER_ABI=[
  'function factory() view returns(address)',
  'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
  'function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96) params) returns(uint256 amountIn,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
];

export interface ExchangeAssets {
  exchange:string;stock:string;stable:string;stockDecimals:number;stableDecimals:number;
  stockSymbol:string;stableSymbol:string;dexRouter:string;factory:string;pool:string;fee:number;
  tickSpacing:number;liquidity:bigint;sqrtPriceX96:bigint;tick:number;quoter:string;
  blockNumber:number;blockHash:string;
}
export interface ExchangeQuote {
  amountIn:bigint;amountOut:bigint;blockNumber:number;blockHash:string;
  pool:string;factory:string;exchange:string;fee:number;
}

function address(value:string):string {
  const result=getAddress(value);
  if(result===ZeroAddress)throw new Error('EXCHANGE_ZERO_ADDRESS');
  return result;
}
async function code(provider:Provider,target:string,blockTag:number){
  if(await provider.getCode(target,blockTag)==='0x')throw new Error('EXCHANGE_NO_CODE');
}

/** Caller supplies the exchange read from the market's registered AssetRouter; no arbitrary price or route fallback. */
export async function readExchangeAssets(provider:Provider,exchangeAddress:string,_account?:string):Promise<ExchangeAssets> {
  const [network,head]=await Promise.all([provider.getNetwork(),provider.getBlock('latest')]);
  if(network.chainId!==CHAIN_ID)throw new Error('EXCHANGE_WRONG_CHAIN');
  if(!head?.hash)throw new Error('EXCHANGE_BLOCK_UNAVAILABLE');
  const blockTag=head.number;
  const overrides={blockTag};
  const exchange=address(exchangeAddress);
  await code(provider,exchange,blockTag);
  const adapter=new Contract(exchange,EXCHANGE_ABI,provider);
  const [stockRaw,stableRaw,routerRaw,feeRaw]=await Promise.all([
    adapter.stock(overrides),adapter.stable(overrides),adapter.dexRouter(overrides),adapter.fee(overrides),
  ]);
  const stock=address(stockRaw),stable=address(stableRaw),dexRouter=address(routerRaw);
  const fee=Number(feeRaw);
  if(stock===stable || !Number.isInteger(fee) || fee<=0 || fee>=1_000_000)throw new Error('EXCHANGE_PAIR');
  const quoter=address(TESTNET_V3_QUOTER);
  await Promise.all([stock,stable,dexRouter,quoter].map(value=>code(provider,value,blockTag)));
  const router=new Contract(dexRouter,ROUTER_ABI,provider);
  let factoryRaw:string;
  try {factoryRaw=await router.factory(overrides);}
  catch {factoryRaw=await router.factoryV3(overrides);}
  const factory=address(factoryRaw);
  await code(provider,factory,blockTag);
  const registry=new Contract(factory,FACTORY_ABI,provider);
  const quoteContract=new Contract(quoter,QUOTER_ABI,provider);
  const [poolRaw,reverseRaw,quoterFactoryRaw,spacingRaw]=await Promise.all([
    registry.getPool(stock,stable,fee,overrides),registry.getPool(stable,stock,fee,overrides),
    quoteContract.factory(overrides),registry.feeAmountTickSpacing(fee,overrides),
  ]);
  if(address(quoterFactoryRaw)!==factory)throw new Error('EXCHANGE_QUOTER_FACTORY');
  const pool=address(poolRaw);
  if(address(reverseRaw)!==pool)throw new Error('EXCHANGE_POOL_REVERSE');
  await code(provider,pool,blockTag);
  const poolContract=new Contract(pool,POOL_ABI,provider);
  const stockContract=new Contract(stock,TOKEN_ABI,provider),stableContract=new Contract(stable,TOKEN_ABI,provider);
  const [poolFactory,t0,t1,poolFee,poolSpacing,liquidity,slot0,stockDecimalsRaw,stableDecimalsRaw,stockSymbol,stableSymbol]=await Promise.all([
    poolContract.factory(overrides),poolContract.token0(overrides),poolContract.token1(overrides),
    poolContract.fee(overrides),poolContract.tickSpacing(overrides),poolContract.liquidity(overrides),
    poolContract.slot0(overrides),stockContract.decimals(overrides),stableContract.decimals(overrides),
    stockContract.symbol(overrides).catch(()=>stock),stableContract.symbol(overrides).catch(()=>stable),
  ]);
  const token0=address(t0),token1=address(t1);
  if(address(poolFactory)!==factory || BigInt(poolFee)!==BigInt(fee))throw new Error('EXCHANGE_POOL_IDENTITY');
  if(!((token0===stock && token1===stable)||(token0===stable && token1===stock)))throw new Error('EXCHANGE_POOL_TOKENS');
  const tickSpacing=Number(poolSpacing);
  if(tickSpacing<=0 || tickSpacing!==Number(spacingRaw))throw new Error('EXCHANGE_POOL_SPACING');
  const sqrtPriceX96=BigInt(slot0[0]);
  if(sqrtPriceX96<=MIN_SQRT_RATIO || sqrtPriceX96>=MAX_SQRT_RATIO || !slot0[6])throw new Error('EXCHANGE_POOL_NOT_READY');
  const stockDecimals=Number(stockDecimalsRaw),stableDecimals=Number(stableDecimalsRaw);
  if(!Number.isInteger(stockDecimals)||stockDecimals<0||stockDecimals>255
    ||!Number.isInteger(stableDecimals)||stableDecimals<0||stableDecimals>255)throw new Error('EXCHANGE_TOKEN_DECIMALS');
  const current=await provider.getBlock(blockTag);
  if(current?.hash!==head.hash)throw new Error('EXCHANGE_BLOCK_REORG');
  return {exchange,stock,stable,stockDecimals,stableDecimals,stockSymbol,stableSymbol,dexRouter,factory,pool,fee,
    tickSpacing,liquidity:BigInt(liquidity),sqrtPriceX96,tick:Number(slot0[1]),quoter,blockNumber:blockTag,blockHash:head.hash};
}

/** QuoterV2 eth_call: exact V3 fees, ticks and integer rounding; does not request signatures or broadcast. */
export async function quoteExchange(
  provider:Provider,exchange:string,input:string,output:string,amount:bigint,exact:'input'|'output',
):Promise<ExchangeQuote> {
  if(typeof amount!=='bigint'||amount<=0n||amount>MAX_AMOUNT)throw new Error('EXCHANGE_AMOUNT');
  if(exact!=='input'&&exact!=='output')throw new Error('EXCHANGE_QUOTE_MODE');
  const assets=await readExchangeAssets(provider,exchange);
  const tokenIn=address(input),tokenOut=address(output);
  if(!((tokenIn===assets.stock&&tokenOut===assets.stable)
    ||(tokenIn===assets.stable&&tokenOut===assets.stock)))throw new Error('EXCHANGE_UNSUPPORTED_ASSET');
  const quoter=new Contract(assets.quoter,QUOTER_ABI,provider);
  const result=exact==='input'
    ?await quoter.quoteExactInputSingle.staticCall([tokenIn,tokenOut,amount,assets.fee,0n],{blockTag:assets.blockNumber})
    :await quoter.quoteExactOutputSingle.staticCall([tokenIn,tokenOut,amount,assets.fee,0n],{blockTag:assets.blockNumber});
  const quoted=BigInt(result[0]),sqrtPriceAfter=BigInt(result[1]);
  if(quoted<=0n)throw new Error('EXCHANGE_NO_LIQUIDITY');
  // A quote reaching the implicit pool price limit may consume only part of exact-input funds.
  // The deployed adapter requires all input to be spent, so never present that partial swap as executable.
  if(sqrtPriceAfter<=MIN_SQRT_RATIO+1n || sqrtPriceAfter>=MAX_SQRT_RATIO-1n)throw new Error('EXCHANGE_PRICE_LIMIT');
  const block=await provider.getBlock(assets.blockNumber);
  if(block?.hash!==assets.blockHash)throw new Error('EXCHANGE_BLOCK_REORG');
  return {amountIn:exact==='input'?amount:quoted,amountOut:exact==='input'?quoted:amount,
    blockNumber:assets.blockNumber,blockHash:assets.blockHash,pool:assets.pool,factory:assets.factory,
    exchange:assets.exchange,fee:assets.fee};
}
