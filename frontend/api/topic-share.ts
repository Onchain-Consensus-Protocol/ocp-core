import React from 'react';
import {ImageResponse} from '@vercel/og';
import {Contract, FetchRequest, JsonRpcProvider, getAddress} from 'ethers';
import type {IncomingMessage, ServerResponse} from 'node:http';
import factoryAbi from '../testnet/abi/TopicMarketStockFactory.json' with {type: 'json'};
import {TopicCard, type TopicCardData} from '../server/share/topicCard.js';
import {loadMarketBrand} from '../server/share/marketBrand.js';
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
    const image = origin + '/api/topic-share?market=' + market + '&image=1&v=2';
    let body: string | Buffer;
    const isImage = url.searchParams.get('image') === '1';
    if (isImage) {
      const stock = await factory.marketCollateral(market);
      const token = new Contract(stock, ['function symbol() view returns (string)'], provider);
      const pool = new Contract(market, [
        'function phase() view returns (uint8)',
        'function outcome() view returns (uint8)',
        'function priceYes() view returns (uint256)',
        'function R() view returns (uint256)',
        'function rTarget() view returns (uint256)',
      ], provider);
      const [phaseValue, symbol] = await Promise.all([pool.phase(), token.symbol()]);
      const phase = Number(phaseValue);
      const cutoff = Number(record.coreCutoff);
      const now = Math.floor(Date.now() / 1000);
      let stage = ['Genesis', 'Formal market', 'Awaiting Core settlement', 'Settled', 'Graduation failed'][phase] ?? 'Market';
      if (phase === 0 && now >= Number(record.genesisCutoff)) stage = 'Genesis ended · Awaiting processing';
      if (phase === 1 && now >= Number(record.formalCutoff)) stage = 'Trading closed · Core active';
      if ((phase === 1 || phase === 2) && now >= cutoff) stage = 'Awaiting settlement';
      const data: TopicCardData = {
        topic, symbol: String(symbol), stage, market,
        deadline: new Date(cutoff * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
      };
      if (phase === 1 || phase === 2) {
        data.yesPercent = Number(await pool.priceYes()) / 1e16;
      } else if (phase === 0) {
        const [raised, target] = await Promise.all([pool.R(), pool.rTarget()]);
        data.progressPercent = target > 0n ? Math.min(100, Number(raised * 10000n / target) / 100) : 0;
      } else {
        data.result = phase === 4 ? 'Not graduated' : ['Pending', 'YES', 'NO', 'INVALID'][Number(await pool.outcome())] ?? 'Settled';
      }
      const card = React.createElement(TopicCard, {data, ...await loadMarketBrand('dark')});
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
