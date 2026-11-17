import React from 'react';
import {ImageResponse} from '@vercel/og';
import {Contract, FetchRequest, JsonRpcProvider, getAddress} from 'ethers';
import type {IncomingMessage, ServerResponse} from 'node:http';
import factoryAbi from '../testnet/abi/TopicMarketStockFactory.json' with {type: 'json'};
import {CURRENT_MAINNET_FACTORY} from '../shared/mainnetDeployment.js';

const origin = 'https://market.ocp-protocol.org';
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
let provider: JsonRpcProvider | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.end();
    return;
  }
  const url = new URL(req.url ?? '/', origin);
  let market: string;
  try {
    market = getAddress(url.searchParams.get('market') ?? '');
  } catch {
    res.statusCode = 400;
    res.end('Invalid market address');
    return;
  }
  try {
    // 分享数据仅从固定主网工厂读取，防止请求参数选择任意链或合约数据源。
    if (!provider) {
      const rpc = new FetchRequest('https://rpc.mainnet.chain.robinhood.com');
      rpc.timeout = 8000;
      provider = new JsonRpcProvider(rpc, 4663, {staticNetwork: true});
    }
    const factory = new Contract(CURRENT_MAINNET_FACTORY, factoryAbi, provider);
    if (!await factory.isMarket(market)) {
      res.statusCode = 404;
      res.end('Market not found');
      return;
    }
    const record = await factory.marketRecord(market);
    const topic = String(record.topic);
    const lang = url.searchParams.get('lang') === 'zh' ? 'zh' : 'en';
    const target = origin + '/degen.html?market=' + market + '&lang=' + lang;
    const image = origin + '/api/topic-share?market=' + market + '&image=1';
    let body: string | Buffer;
    const isImage = url.searchParams.get('image') === '1';
    if (isImage) {
      const h = React.createElement;
      const card = h('div', {style: {
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: '#0d0f12', color: '#f1f5f9', padding: '56px 64px',
        borderTop: '8px solid #ff9454', fontFamily: 'sans-serif',
      }},
      h('div', {style: {display: 'flex', color: '#ff9454', fontSize: 30}}, 'OCP TOPIC MARKET'),
      h('div', {style: {display: 'flex', fontSize: 48, lineHeight: 1.3, marginTop: 62, overflow: 'hidden', height: 275, wordBreak: 'break-word'}}, Array.from(topic).slice(0, 140).join('')),
      h('div', {style: {display: 'flex', marginTop: 'auto', justifyContent: 'space-between', fontSize: 24, color: '#9ba3b1'}},
        h('span', null, 'Robinhood Mainnet'), h('span', null, 'market.ocp-protocol.org')));
      body = Buffer.from(await new ImageResponse(card, {width: 1200, height: 630}).arrayBuffer());
    } else {
      const title = escapeHtml(topic);
      body = '<!doctype html><html><head><meta charset="utf-8"><title>' + title + ' | OCP TOPIC MARKET</title>' +
        '<meta property="og:type" content="website"><meta property="og:title" content="' + title + '">' +
        '<meta property="og:description" content="OCP TOPIC MARKET · Robinhood Mainnet">' +
        '<meta property="og:url" content="' + escapeHtml(target) + '">' +
        '<meta property="og:image" content="' + escapeHtml(image) + '">' +
        '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' +
        '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + title + '">' +
        '<meta name="twitter:description" content="OCP TOPIC MARKET · Robinhood Mainnet">' +
        '<meta name="twitter:image" content="' + escapeHtml(image) + '">' +
        '</head><body><a href="' + escapeHtml(target) + '">Open topic</a>' +
        '<script>location.replace(' + JSON.stringify(target).replace(/</g, '\\u003c') + ')</script></body></html>';
    }
    res.setHeader('Content-Type', isImage ? 'image/png' : 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=3600');
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.statusCode = 503;
    res.end('Topic preview temporarily unavailable');
  }
}
