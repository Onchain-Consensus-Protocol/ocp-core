import {readFile} from 'node:fs/promises';

let assets:Promise<{logoUrl:string;wordmarkUrl:string}>|undefined;
/** Reuse the homepage logo and its Orbitron wordmark without remote image requests. */
export function loadMarketBrand(){
 assets??=Promise.all([
  readFile(new URL('../../public/logo.png',import.meta.url)),
  readFile(new URL('../../public/ocp-wordmark.svg',import.meta.url)),
 ]).then(([logo,wordmark])=>({logoUrl:`data:${logo[0]===0x89?'image/png':'image/jpeg'};base64,${logo.toString('base64')}`,wordmarkUrl:`data:image/svg+xml;base64,${wordmark.toString('base64')}`})).catch(error=>{assets=undefined;throw error;});
 return assets;
}
