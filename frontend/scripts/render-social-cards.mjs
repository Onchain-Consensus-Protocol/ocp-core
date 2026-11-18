import React from 'react';
import {ImageResponse} from '@vercel/og';
import {createServer} from 'vite';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({root, configFile: false, server: {middlewareMode: true, hmr: false, ws: false, watch: null}, optimizeDeps: {noDiscovery: true, include: []}, appType: 'custom'});
try {
  const {OverviewCard} = await vite.ssrLoadModule('/server/share/overviewCard.ts');
  const {loadMarketBrand} = await vite.ssrLoadModule('/server/share/marketBrand.ts');
  const brand = await loadMarketBrand('dark');
  for (const kind of ['market', 'how']) {
    const card = React.createElement(OverviewCard, {kind, ...brand});
    const image = new ImageResponse(card, {width: 1200, height: 630});
    const path = new URL('../public/og/' + kind + '-social-v3.png', import.meta.url);
    await writeFile(path, Buffer.from(await image.arrayBuffer()));
    console.log(fileURLToPath(path));
  }
} finally {
  await vite.close();
}
