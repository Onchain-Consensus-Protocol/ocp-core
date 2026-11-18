import React from 'react';
import {SocialCardFrame, cardBox as box, cardColors as colors} from './socialCardFrame.js';

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

export function TopicCard({data, logoUrl, wordmarkUrl}: {data: TopicCardData; logoUrl: string; wordmarkUrl: string}) {
  const {topic, symbol, stage, deadline, market, yesPercent, progressPercent, result} = data;
  const shortTopic = Array.from(topic).slice(0, 130).join('') + (Array.from(topic).length > 130 ? '…' : '');
  const titleSize = Array.from(topic).length > 85 ? 38 : 49;
  const hasPrices = yesPercent !== undefined;
  const footer = box({flexDirection: 'column', gap: 6},
    h('span', {style: {color: colors.muted}}, 'Final deadline · ' + deadline),
    h('span', {style: {fontSize: 12, color: '#747e8e'}}, market));
  return h(SocialCardFrame, {
    logoUrl, wordmarkUrl, footer, action: 'View topic', domain: 'market.ocp-protocol.org',
    children: [
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
    ],
  });
}
