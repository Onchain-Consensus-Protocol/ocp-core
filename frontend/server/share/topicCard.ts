import React from 'react';

export interface TopicCardData {
  topic: string;
  symbol: string;
  stage: string;
  deadline: string;
  market: string;
  yesPercent?: number;
  progressPercent?: number;
  result?: string;
}

const h = React.createElement;
const colors = {text: '#f4f5f7', muted: '#939ba9', orange: '#ff9b58', pink: '#ec9aaf', green: '#72d5b1'};
const box = (style: React.CSSProperties, ...children: React.ReactNode[]) =>
  h('div', {style: {display: 'flex', ...style}}, ...children);

export function TopicCard({data, logoUrl, wordmarkUrl}: {data: TopicCardData; logoUrl: string; wordmarkUrl: string}) {
  const {topic, symbol, stage, deadline, market, yesPercent, progressPercent, result} = data;
  const shortTopic = Array.from(topic).slice(0, 130).join('') + (Array.from(topic).length > 130 ? '…' : '');
  const titleSize = Array.from(topic).length > 85 ? 38 : 49;
  const hasPrices = yesPercent !== undefined;
  return box({
    width: '100%', height: '100%', flexDirection: 'column', position: 'relative',
    background: 'linear-gradient(120deg, #191b20 0%, #0e1015 65%, #25202b 100%)',
    color: colors.text, padding: '34px 48px', fontFamily: 'sans-serif',
  },
    box({position: 'absolute', top: 0, left: 0, width: 1200, height: 5, background: 'linear-gradient(90deg, #ff9b58, #ae7ce8)'}),
    box({alignItems: 'center', justifyContent: 'space-between', height: 52},
      box({alignItems: 'center', gap: 14},
        h('img', {src: logoUrl, width: 46, height: 46, style: {borderRadius: 12}}),
        h('img', {src: wordmarkUrl, width: 104, height: 43}),
        h('span', {style: {fontSize: 19, letterSpacing: 2, color: '#c5cad3', marginLeft: 7}}, 'TOPIC MARKET')),
      box({alignItems: 'center', gap: 9, padding: '9px 15px', border: '1px solid #3d414b', borderRadius: 24, fontSize: 16, color: '#b9c0cc'},
        box({height: 7, width: 7, borderRadius: 4, background: colors.green}), 'Robinhood Mainnet')),
    box({alignItems: 'center', gap: 12, marginTop: 35},
      box({padding: '7px 14px', borderRadius: 8, background: '#303826', color: '#c2ee8d', fontSize: 20, fontWeight: 700}, symbol),
      h('span', {style: {fontSize: 17, color: colors.muted}}, stage)),
    box({fontSize: titleSize, fontWeight: 700, lineHeight: 1.18, marginTop: 18, height: 148, overflow: 'hidden', wordBreak: 'break-word'}, shortTopic),
    hasPrices
      ? box({flexDirection: 'column', border: '1px solid #363943', background: '#ffffff04', borderRadius: 18, padding: '20px 24px', marginTop: 9},
          box({justifyContent: 'space-between', alignItems: 'center'},
            box({alignItems: 'baseline', gap: 14},
              h('span', {style: {fontSize: 19, color: colors.green, fontWeight: 700}}, 'YES'),
              h('span', {style: {fontSize: 42, fontWeight: 700}}, yesPercent.toFixed(1) + '%')),
            box({alignItems: 'baseline', gap: 14},
              h('span', {style: {fontSize: 42, fontWeight: 700}}, (100 - yesPercent).toFixed(1) + '%'),
              h('span', {style: {fontSize: 19, color: colors.pink, fontWeight: 700}}, 'NO'))),
          box({height: 9, borderRadius: 6, overflow: 'hidden', marginTop: 13, background: colors.pink},
            box({height: 9, width: yesPercent + '%', background: colors.green})),
          h('span', {style: {fontSize: 13, color: colors.muted, marginTop: 10}}, 'Market price at preview · YES / NO'))
      : box({flexDirection: 'column', border: '1px solid #363943', borderRadius: 18, padding: '20px 24px', marginTop: 9, height: 148},
          h('span', {style: {fontSize: 15, color: colors.muted, letterSpacing: 1}}, result ? 'FINAL RESULT' : 'GRADUATION PROGRESS'),
          h('span', {style: {fontSize: 38, fontWeight: 700, color: colors.orange, marginTop: 10}}, result ?? (progressPercent ?? 0).toFixed(1) + '%'),
          result ? null : box({height: 7, borderRadius: 5, background: '#35303b', marginTop: 12},
            box({height: 7, width: (progressPercent ?? 0) + '%', background: colors.orange, borderRadius: 5}))),
    box({alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 22, borderTop: '1px solid #333640', fontSize: 15},
      box({flexDirection: 'column', gap: 6},
        h('span', {style: {color: colors.muted}}, 'Final deadline · ' + deadline),
        h('span', {style: {fontSize: 12, color: '#747e8e'}}, market)),
      box({alignItems: 'center', gap: 15, color: colors.orange, fontSize: 18}, 'View topic', h('svg', {width: 20, height: 20, viewBox: '0 0 24 24'}, h('path', {d: 'M5 19L19 5M5 5h14v14', stroke: colors.orange, strokeWidth: 2, fill: 'none'})))),
    h('span', {style: {position: 'absolute', bottom: 17, right: 48, fontSize: 11, color: '#747e8e'}}, 'market.ocp-protocol.org'),
  );
}
