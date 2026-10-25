const MARKET_ORIGIN = 'https://market.ocp-protocol.org';

export function marketShareUrl(id:string):string {
 return `${MARKET_ORIGIN}/api/market-share?id=${encodeURIComponent(id)}`;
}

export function marketXIntent(id:string,title:string):string {
 const params=new URLSearchParams({text:`${title}\nTrade on OCP Market · Virtual funds only`,url:marketShareUrl(id)});
 return `https://x.com/intent/tweet?${params}`;
}
