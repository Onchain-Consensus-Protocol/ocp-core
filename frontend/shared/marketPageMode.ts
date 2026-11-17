/** Simulation remains the default; chain actions live behind an explicit mainnet URL. */
export function isMainnetMarketPage(pathname: string, _search = ''): boolean {
  return pathname === '/market.html' || pathname === '/degen.html';
}

export function marketViewHref(degen:boolean,search:string,lang:string){
 const params=new URLSearchParams(search);params.set('lang',lang);
 if(degen)params.delete('view');else params.set('view','full');
 return `${degen?'/degen.html':'/market.html'}?${params}`;
}
