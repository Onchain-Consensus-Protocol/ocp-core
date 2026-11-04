/** Simulation remains the default; chain actions live behind an explicit testnet URL. */
export function isTestnetMarketPage(pathname: string, search = ''): boolean {
  return (pathname === '/testnet.html' || pathname === '/degen.html') || new URLSearchParams(search).get('mode') === 'testnet';
}

export function marketViewHref(degen:boolean,search:string,lang:string){
 const params=new URLSearchParams(search);params.set('lang',lang);
 return `${degen?'/degen.html':'/testnet.html'}?${params}`;
}
