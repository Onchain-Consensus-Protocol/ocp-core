import {Contract, ZeroAddress, getAddress, solidityPacked, type Provider} from 'ethers';

/** Existing QuoterV2, independently verified on chain 4663; its factory is checked on every quote. */
export const MAINNET_V3_QUOTER='0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7';
const CHAIN_ID=4663n;
const MAX_AMOUNT=(1n<<255n)-1n;
const MIN_SQRT_RATIO=4295128739n;
const MAX_SQRT_RATIO=1461446703485210103287273052203988822378723970342n;

const EXCHANGE_ABI=[
  'function stock() view returns(address)','function stable() view returns(address)',
  'function dexRouter() view returns(address)','function fee() view returns(uint24)',
  'function bridge() view returns(address)','function stableFee() view returns(uint24)',
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
const TOKEN_ABI=['function decimals() view returns(uint8)','function symbol() view returns(string)','function balanceOf(address) view returns(uint256)'];
const QUOTER_ABI=[
  'function factory() view returns(address)',
  'function quoteExactInput(bytes path,uint256 amountIn) returns(uint256,uint160[],uint32[],uint256)',
  'function quoteExactOutput(bytes path,uint256 amountOut) returns(uint256,uint160[],uint32[],uint256)',
  'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
  'function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96) params) returns(uint256 amountIn,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
];

export interface ExchangeAssets {
  exchange:string;stock:string;stable:string;stockDecimals:number;stableDecimals:number;
  stockSymbol:string;stableSymbol:string;dexRouter:string;factory:string;pool:string;fee:number;
  tickSpacing:number;liquidity:bigint;sqrtPriceX96:bigint;tick:number;quoter:string;
  bridge?:{token:string;fee:number;pool:string;sqrtPriceX96:bigint};
  blockNumber:number;blockHash:string;
}
export interface ExchangeQuote {
  amountIn:bigint;amountOut:bigint;priceImpactBps:number;blockNumber:number;blockHash:string;
  pool:string;factory:string;exchange:string;fee:number;
}

/** Compare executable output to the pre-trade spot quote, excluding the V3 fee. Raw units cancel. */
export function exchangePriceImpactBps(input:string,output:string,amountIn:bigint,amountOut:bigint,sqrtPriceX96:bigint,fee:number):number {
 const square=sqrtPriceX96*sqrtPriceX96,Q192=1n<<192n;
 const zeroForOne=BigInt(input)<BigInt(output);
 const numerator=amountIn*BigInt(1_000_000-fee)*(zeroForOne?square:Q192);
 const denominator=1_000_000n*(zeroForOne?Q192:square);
 if(numerator<=0n)return 0;
 const received=amountOut*denominator;
 return received>=numerator?0:Number((numerator-received)*10000n/numerator);
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
  const quoter=address(MAINNET_V3_QUOTER);
  await Promise.all([stock,stable,dexRouter,quoter].map(value=>code(provider,value,blockTag)));
  const router=new Contract(dexRouter,ROUTER_ABI,provider);
  let factoryRaw:string;
  try {factoryRaw=await router.factory(overrides);}
  catch {factoryRaw=await router.factoryV3(overrides);}
  const factory=address(factoryRaw);
  await code(provider,factory,blockTag);
  const registry=new Contract(factory,FACTORY_ABI,provider);
  const quoteContract=new Contract(quoter,QUOTER_ABI,provider);
  // 旧适配器只有单池报价。只有明确暴露 bridge 的适配器使用双池路径。
  let bridgeToken=ZeroAddress;
  try {bridgeToken=await adapter.bridge(overrides);}
  catch(error){if(!['CALL_EXCEPTION','BAD_DATA'].includes((error as {code?:string})?.code??''))throw error;}
  const hasBridge=bridgeToken!==ZeroAddress;
  if(hasBridge){
    bridgeToken=address(bridgeToken);
    if(bridgeToken===stock||bridgeToken===stable)throw new Error('EXCHANGE_PAIR');
    await code(provider,bridgeToken,blockTag);
  }
  async function readPool(a:string,b:string,poolFee:number) {
    if(!Number.isInteger(poolFee)||poolFee<=0||poolFee>=1_000_000)throw new Error('EXCHANGE_PAIR');
    const [poolRaw,reverseRaw,spacingRaw]=await Promise.all([
      registry.getPool(a,b,poolFee,overrides),registry.getPool(b,a,poolFee,overrides),
      registry.feeAmountTickSpacing(poolFee,overrides),
    ]);
    const pool=address(poolRaw);
    if(address(reverseRaw)!==pool)throw new Error('EXCHANGE_POOL_REVERSE');
    await code(provider,pool,blockTag);
    const contract=new Contract(pool,POOL_ABI,provider);
    const [poolFactory,t0,t1,actualFee,poolSpacing,liquidity,slot0]=await Promise.all([
      contract.factory(overrides),contract.token0(overrides),contract.token1(overrides),
      contract.fee(overrides),contract.tickSpacing(overrides),contract.liquidity(overrides),contract.slot0(overrides),
    ]);
    if(address(poolFactory)!==factory||Number(actualFee)!==poolFee)throw new Error('EXCHANGE_POOL_IDENTITY');
    const token0=address(t0),token1=address(t1);
    if(!((token0===a&&token1===b)||(token0===b&&token1===a)))throw new Error('EXCHANGE_POOL_TOKENS');
    const tickSpacing=Number(poolSpacing),sqrtPriceX96=BigInt(slot0[0]);
    if(tickSpacing<=0||tickSpacing!==Number(spacingRaw))throw new Error('EXCHANGE_POOL_SPACING');
    if(sqrtPriceX96<=MIN_SQRT_RATIO||sqrtPriceX96>=MAX_SQRT_RATIO||!slot0[6])throw new Error('EXCHANGE_POOL_NOT_READY');
    return {pool,tickSpacing,sqrtPriceX96,tick:Number(slot0[1]),liquidity:BigInt(liquidity)};
  }
  const stockContract=new Contract(stock,TOKEN_ABI,provider),stableContract=new Contract(stable,TOKEN_ABI,provider);
  const [quoterFactoryRaw,primary,bridge,stockDecimalsRaw,stableDecimalsRaw,stockSymbol,stableSymbol]=await Promise.all([
    quoteContract.factory(overrides),readPool(stock,hasBridge?bridgeToken:stable,fee),
    hasBridge ? (async()=>{
      const stableFee=Number(await adapter.stableFee(overrides));
      const pool=await readPool(bridgeToken,stable,stableFee);
      return {token:bridgeToken,fee:stableFee,pool:pool.pool,sqrtPriceX96:pool.sqrtPriceX96};
    })() : undefined,
    stockContract.decimals(overrides),stableContract.decimals(overrides),
    stockContract.symbol(overrides).catch(()=>stock),stableContract.symbol(overrides).catch(()=>stable),
  ]);
  if(address(quoterFactoryRaw)!==factory)throw new Error('EXCHANGE_QUOTER_FACTORY');
  const stockDecimals=Number(stockDecimalsRaw),stableDecimals=Number(stableDecimalsRaw);
  if(!Number.isInteger(stockDecimals)||stockDecimals<0||stockDecimals>255
    ||!Number.isInteger(stableDecimals)||stableDecimals<0||stableDecimals>255)throw new Error('EXCHANGE_TOKEN_DECIMALS');
  const current=await provider.getBlock(blockTag);
  if(current?.hash!==head.hash)throw new Error('EXCHANGE_BLOCK_REORG');
  return {exchange,stock,stable,stockDecimals,stableDecimals,stockSymbol,stableSymbol,dexRouter,factory,fee,
    ...primary,bridge,quoter,blockNumber:blockTag,blockHash:head.hash};
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
  if(exact==='output'){
    const available=await new Contract(tokenOut,TOKEN_ABI,provider).balanceOf(tokenOut===assets.stable && assets.bridge ? assets.bridge.pool : assets.pool,{blockTag:assets.blockNumber});
    if(amount>BigInt(available))throw new Error('EXCHANGE_OUTPUT_BALANCE');
  }
  const quoter=new Contract(assets.quoter,QUOTER_ABI,provider);
  const bridge=assets.bridge;
  let result;
  try {
    if(bridge){
      // QuoterV2 的 exactOutput 路径从输出币反向编码。
      const first=exact==='input'?tokenIn:tokenOut, last=exact==='input'?tokenOut:tokenIn;
      const [firstFee,lastFee]=first===assets.stock?[assets.fee,bridge.fee]:[bridge.fee,assets.fee];
      const path=solidityPacked(['address','uint24','address','uint24','address'],[first,firstFee,bridge.token,lastFee,last]);
      result=await (exact==='input'?quoter.quoteExactInput:quoter.quoteExactOutput).staticCall(path,amount,{blockTag:assets.blockNumber});
    }else{
      result=exact==='input'
        ?await quoter.quoteExactInputSingle.staticCall([tokenIn,tokenOut,amount,assets.fee,0n],{blockTag:assets.blockNumber})
        :await quoter.quoteExactOutputSingle.staticCall([tokenIn,tokenOut,amount,assets.fee,0n],{blockTag:assets.blockNumber});
    }
  }catch(error){if((error as {code?:string})?.code==='CALL_EXCEPTION')throw new Error('EXCHANGE_QUOTE_REVERTED');throw error;}
  const quoted=BigInt(result[0]);
  if(quoted<=0n)throw new Error('EXCHANGE_NO_LIQUIDITY');
  const prices=bridge?Array.from(result[1] as bigint[]):[BigInt(result[1])];
  if(prices.length!==(bridge?2:1)||prices.some(price=>price<=MIN_SQRT_RATIO+1n||price>=MAX_SQRT_RATIO-1n))
    throw new Error('EXCHANGE_PRICE_LIMIT');
  const amountIn=exact==='input'?amount:quoted, amountOut=exact==='input'?quoted:amount;
  let priceImpactBps;
  if(bridge){
    const ratio=(from:string,to:string,sqrt:bigint,fee:number)=>{
      const square=sqrt*sqrt,q192=1n<<192n;
      return BigInt(from)<BigInt(to)?[square*BigInt(1_000_000-fee),q192*1_000_000n]:[q192*BigInt(1_000_000-fee),square*1_000_000n];
    };
    const fromStock=tokenIn===assets.stock;
    const [firstN,firstD]=ratio(tokenIn,bridge.token,fromStock?assets.sqrtPriceX96:bridge.sqrtPriceX96,fromStock?assets.fee:bridge.fee);
    const [lastN,lastD]=ratio(bridge.token,tokenOut,fromStock?bridge.sqrtPriceX96:assets.sqrtPriceX96,fromStock?bridge.fee:assets.fee);
    const expected=amountIn*firstN*lastN, actual=amountOut*firstD*lastD;
    priceImpactBps=actual>=expected?0:Number((expected-actual)*10000n/expected);
  }else{
    priceImpactBps=exchangePriceImpactBps(tokenIn,tokenOut,amountIn,amountOut,assets.sqrtPriceX96,assets.fee);
  }
  const block=await provider.getBlock(assets.blockNumber);
  if(block?.hash!==assets.blockHash)throw new Error('EXCHANGE_BLOCK_REORG');
  return {amountIn,amountOut,priceImpactBps,
    blockNumber:assets.blockNumber,blockHash:assets.blockHash,pool:assets.pool,factory:assets.factory,
    exchange:assets.exchange,fee:assets.fee};
}
