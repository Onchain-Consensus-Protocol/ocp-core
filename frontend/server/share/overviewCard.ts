import React from 'react';
import {SocialCardFrame, cardBox as box, cardColors as colors} from './socialCardFrame.js';

const h = React.createElement;

export function OverviewCard({kind, logoUrl, wordmarkUrl}: {kind: 'market' | 'how'; logoUrl: string; wordmarkUrl: string}) {
  const guide = kind === 'how';
  const panels = guide
    ? [
        {title: 'Genesis', text: 'Launch & graduate', color: colors.orange},
        {title: 'Market', text: 'Trade YES / NO', color: '#bd9cf1'},
        {title: 'Core', text: 'Stake & settle', color: colors.green},
      ]
    : [
        {title: 'Pick a stock', text: 'Find a story', color: colors.orange},
        {title: 'Create a topic', text: 'Start a market', color: '#bd9cf1'},
        {title: 'Trade your view', text: 'YES or NO', color: colors.green},
      ];
  return h(SocialCardFrame, {
    logoUrl, wordmarkUrl,
    footer: h('span', {style: {color: colors.muted}}, guide ? 'Capital consensus and continuous pricing.' : 'Ticker. Topic. Trade.'),
    action: guide ? 'How it works' : 'Explore markets',
    domain: guide ? 'ocp-protocol.org/how.html' : 'market.ocp-protocol.org',
    children: [
      h('span', {key: 'label', style: {fontSize: 16, letterSpacing: 2, color: colors.muted, marginTop: 36}}, guide ? 'HOW IT WORKS' : 'STOCK-BACKED TOPIC MARKETS'),
      box({flexDirection: 'column', marginTop: 16, height: 164},
        h('span', {style: {fontSize: 62, lineHeight: 1.1, fontWeight: 700}}, guide ? 'How OCP Core &' : 'OCP TOPIC'),
        h('span', {style: {fontSize: 62, lineHeight: 1.1, fontWeight: 700, color: colors.orange, marginTop: 6}}, guide ? 'OCP Market Work' : 'MARKET')),
      box({gap: 14, marginTop: 13}, ...panels.map(panel =>
        box({flexDirection: 'column', flex: 1, padding: '23px 24px', borderRadius: 18, border: '1px solid #363943', height: 116, background: '#ffffff04'},
          h('span', {style: {color: panel.color, fontSize: 25, fontWeight: 700}}, panel.title),
          h('span', {style: {color: colors.muted, fontSize: 18, marginTop: 10}}, panel.text)))),
    ],
  });
}
