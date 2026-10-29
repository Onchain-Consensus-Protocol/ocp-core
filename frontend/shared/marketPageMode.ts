/** Simulation remains the default; chain actions live behind an explicit testnet URL. */
export function isTestnetMarketPage(pathname: string, search = ''): boolean {
  return pathname === '/testnet.html' || new URLSearchParams(search).get('mode') === 'testnet';
}
