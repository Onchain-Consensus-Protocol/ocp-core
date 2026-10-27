import {readFile} from 'node:fs/promises';
import type {ShareTheme} from '../../shared/marketShare.js';

let source:Promise<{logoUrl:string;wordmark:string}>|undefined;
/** Reuse the homepage logo and its Orbitron wordmark without remote image requests. */
export async function loadMarketBrand(theme:ShareTheme='light'){
 source??=Promise.all([
  readFile(new URL('../../public/logo.png',import.meta.url)),
  readFile(new URL('../../public/ocp-wordmark.svg',import.meta.url)),
 ]).then(([logo,wordmark])=>({logoUrl:`data:${logo[0]===0x89?'image/png':'image/jpeg'};base64,${logo.toString('base64')}`,wordmark:wordmark.toString('utf8')})).catch(error=>{source=undefined;throw error;});
 const {logoUrl,wordmark}=await source;
 const themed=theme==='dark'?wordmark.replace(/#0f172a/gi,'#ffffff'):wordmark;
 return {logoUrl,wordmarkUrl:`data:image/svg+xml;base64,${Buffer.from(themed).toString('base64')}`};
}
