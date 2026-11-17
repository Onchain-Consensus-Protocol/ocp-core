export function isMainnetMarketPage(pathname: string, hostname = ''): boolean {
  return pathname === '/market.html' || pathname === '/degen.html' ||
    (pathname === '/' && hostname === 'market.ocp-protocol.org');
}

export function marketViewHref(degen:boolean,search:string,lang:string){
 const params=new URLSearchParams(search);params.set('lang',lang);
 if(degen)params.delete('view');else params.set('view','full');
 return `${degen?'/degen.html':'/market.html'}?${params}`;
}
