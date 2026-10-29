import {describe,it,expect} from 'vitest';
import {Interface,ZeroAddress,getAddress,type Provider} from 'ethers';
import {quoteExchange,readExchangeAssets,TESTNET_V3_QUOTER} from './exchangeQuote';

const EXCHANGE='0x1111111111111111111111111111111111111111';
const STOCK='0x2222222222222222222222222222222222222222';
const STABLE='0x3333333333333333333333333333333333333333';
const ROUTER='0x4444444444444444444444444444444444444444';
const FACTORY='0x5555555555555555555555555555555555555555';
const POOL='0x6666666666666666666666666666666666666666';
const OTHER='0x7777777777777777777777777777777777777777';
const Q96=1n<<96n;
const BLOCK_HASH=`0x${'aa'.repeat(32)}`;
const ABI=new Interface([
  'function stock() view returns(address)','function stable() view returns(address)',
  'function dexRouter() view returns(address)','function fee() view returns(uint24)',
  'function factory() view returns(address)','function factoryV3() view returns(address)',
  'function getPool(address,address,uint24) view returns(address)',
  'function feeAmountTickSpacing(uint24) view returns(int24)',
  'function token0() view returns(address)','function token1() view returns(address)',
  'function tickSpacing() view returns(int24)','function liquidity() view returns(uint128)',
  'function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)',
  'function decimals() view returns(uint8)','function symbol() view returns(string)',
  'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)',
  'function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)',
]);
interface Options {
  chain?:bigint;wrongQuoter?:boolean;wrongPoolFactory?:boolean;reverseMismatch?:boolean;
  missingPool?:boolean;wrongTokens?:boolean;wrongSpacing?:boolean;locked?:boolean;
  zeroQuote?:boolean;priceLimit?:boolean;reorgAfterQuote?:boolean;router02?:boolean;
}
function fixture(options:Options={}){
  const calls:{to:string;name:string;args:unknown[];blockTag:unknown}[]=[];
  const codeBlocks:unknown[]=[];
  let quoted=false;
  const provider={
    async getNetwork(){return {chainId:options.chain??46630n};},
    async getBlock(){return {number:100,hash:quoted&&options.reorgAfterQuote?`0x${'bb'.repeat(32)}`:BLOCK_HASH,timestamp:2000};},
    async getCode(_address:string,blockTag:unknown){codeBlocks.push(blockTag);return '0x01';},
    async call(tx:{to:string;data:string;blockTag:unknown}){
      const parsed=ABI.parseTransaction({data:tx.data})!;
      const to=getAddress(tx.to),name=parsed.name,args=[...parsed.args];
      calls.push({to,name,args,blockTag:tx.blockTag});
      let values:unknown[];
      if(to===getAddress(EXCHANGE)){
        values=name==='stock'?[STOCK]:name==='stable'?[STABLE]:name==='dexRouter'?[ROUTER]:[3000];
      }else if(to===getAddress(ROUTER)){
        if(options.router02&&name==='factory')throw new Error('unknown factory selector');
        values=[FACTORY];
      }else if(to===getAddress(FACTORY)){
        values=name==='getPool'?[options.missingPool?ZeroAddress:
          options.reverseMismatch&&getAddress(String(args[0]))===getAddress(STABLE)?OTHER:POOL]:[60];
      }else if(to===getAddress(POOL)){
        if(name==='factory')values=[options.wrongPoolFactory?OTHER:FACTORY];
        else if(name==='token0')values=[options.wrongTokens?OTHER:STOCK];
        else if(name==='token1')values=[STABLE];
        else if(name==='fee')values=[3000];
        else if(name==='tickSpacing')values=[options.wrongSpacing?10:60];
        else if(name==='liquidity')values=[1000000000000000000n];
        else values=[Q96,0,0,1,1,0,!options.locked];
      }else if(to===getAddress(STOCK)||to===getAddress(STABLE)){
        values=name==='decimals'?[to===getAddress(STOCK)?18:6]:[to===getAddress(STOCK)?'TSLA':'USDG'];
      }else if(to===getAddress(TESTNET_V3_QUOTER)){
        if(name==='factory')values=[options.wrongQuoter?OTHER:FACTORY];
        else {
          quoted=true;
          const params=parsed.args[0];
          // Deliberately arbitrary raw-unit fixture values, not a frontend price formula.
          const amount=BigInt(params[2]);
          const result=options.zeroQuote?0n:name==='quoteExactInputSingle'?amount*3n:(amount+2n)/3n;
          values=[result,options.priceLimit?4295128740n:Q96,2,120000];
        }
      }else throw new Error('unexpected contract');
      return ABI.encodeFunctionResult(parsed.fragment,values);
    },
  } as unknown as Provider;
  return {provider,calls,codeBlocks};
}

describe('registered exchange route validation',()=>{
  it('uses the adapter route and checks matching quoter/pool factory, tokens and reverse registration at one block',async()=>{
    const {provider,calls,codeBlocks}=fixture();
    const result=await readExchangeAssets(provider,EXCHANGE);
    expect(result).toMatchObject({stock:STOCK,stable:STABLE,stockDecimals:18,stableDecimals:6,
      stockSymbol:'TSLA',stableSymbol:'USDG',pool:POOL,factory:FACTORY,fee:3000,blockNumber:100,blockHash:BLOCK_HASH});
    const registryCalls=calls.filter(call=>call.to===FACTORY&&call.name==='getPool');
    expect(registryCalls).toHaveLength(2);
    expect(registryCalls[0].args.slice(0,2)).toEqual([STOCK,STABLE]);
    expect(registryCalls[1].args.slice(0,2)).toEqual([STABLE,STOCK]);
    expect(calls.every(call=>call.blockTag===100)).toBe(true);
    expect(codeBlocks.every(block=>block===100)).toBe(true);
  });
  it('supports an actual Router02 factoryV3 selector without changing the registered route',async()=>{
    const {provider,calls}=fixture({router02:true});
    expect((await readExchangeAssets(provider,EXCHANGE)).factory).toBe(FACTORY);
    expect(calls.some(call=>call.name==='factoryV3'&&call.to===ROUTER)).toBe(true);
  });
  it.each([
    [{wrongQuoter:true},'EXCHANGE_QUOTER_FACTORY'],
    [{wrongPoolFactory:true},'EXCHANGE_POOL_IDENTITY'],
    [{reverseMismatch:true},'EXCHANGE_POOL_REVERSE'],
    [{missingPool:true},'EXCHANGE_ZERO_ADDRESS'],
    [{wrongTokens:true},'EXCHANGE_POOL_TOKENS'],
    [{wrongSpacing:true},'EXCHANGE_POOL_SPACING'],
    [{locked:true},'EXCHANGE_POOL_NOT_READY'],
  ] as const)('rejects inconsistent route %j before making a quote',async(options,error)=>{
    const {provider,calls}=fixture(options);
    await expect(quoteExchange(provider,EXCHANGE,STABLE,STOCK,100n,'input')).rejects.toThrow(error);
    expect(calls.some(call=>call.name.startsWith('quoteExact'))).toBe(false);
  });
});

describe('read-only QuoterV2 exact input/output',()=>{
  it.each([[STABLE,STOCK],[STOCK,STABLE]])('quotes exact input in both token directions %s -> %s',async(input,output)=>{
    const {provider,calls}=fixture();const amount=(1n<<100n)+7n;
    const result=await quoteExchange(provider,EXCHANGE,input,output,amount,'input');
    expect(result.amountIn).toBe(amount);expect(result.amountOut).toBe(amount*3n);
    const quote=calls.find(call=>call.name==='quoteExactInputSingle')!;
    expect((quote.args[0] as unknown[]).slice(0,2)).toEqual([input,output]);
    expect(quote.blockTag).toBe(100);
  });
  it.each([[STABLE,STOCK],[STOCK,STABLE]])('quotes required input for exact output %s -> %s',async(input,output)=>{
    const {provider}=fixture();
    const result=await quoteExchange(provider,EXCHANGE,input,output,100n,'output');
    expect(result.amountOut).toBe(100n);expect(result.amountIn).toBe(34n);
    expect(result.blockNumber).toBe(100);
  });
  it('requires neither an account, allowance, signer nor a transaction submission',async()=>{
    const {provider}=fixture();
    expect((await quoteExchange(provider,EXCHANGE,STABLE,STOCK,100n,'input')).amountOut).toBe(300n);
  });
  it('rejects wrong chain, invalid amounts and unsupported assets',async()=>{
    await expect(quoteExchange(fixture({chain:4663n}).provider,EXCHANGE,STABLE,STOCK,1n,'input')).rejects.toThrow('WRONG_CHAIN');
    for(const amount of [0n,-1n,1n<<255n]){
      await expect(quoteExchange(fixture().provider,EXCHANGE,STABLE,STOCK,amount,'input')).rejects.toThrow('EXCHANGE_AMOUNT');
    }
    await expect(quoteExchange(fixture().provider,EXCHANGE,OTHER,STOCK,1n,'input')).rejects.toThrow('UNSUPPORTED_ASSET');
  });
  it('does not turn no output or a partial price-limit fill into an executable quote',async()=>{
    await expect(quoteExchange(fixture({zeroQuote:true}).provider,EXCHANGE,STABLE,STOCK,100n,'input')).rejects.toThrow('NO_LIQUIDITY');
    await expect(quoteExchange(fixture({priceLimit:true}).provider,EXCHANGE,STABLE,STOCK,100n,'input')).rejects.toThrow('PRICE_LIMIT');
  });
  it('rejects a reorg between pinned reads and the quote response',async()=>{
    await expect(quoteExchange(fixture({reorgAfterQuote:true}).provider,EXCHANGE,STABLE,STOCK,100n,'input')).rejects.toThrow('BLOCK_REORG');
  });
});
