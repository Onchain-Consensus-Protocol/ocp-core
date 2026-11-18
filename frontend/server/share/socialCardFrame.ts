import React from 'react';

export const cardColors = {
  text: '#f4f5f7', muted: '#939ba9', orange: '#ff9b58',
  pink: '#ec9aaf', green: '#72d5b1',
};
export const cardBox = (style: React.CSSProperties, ...children: React.ReactNode[]) =>
  React.createElement('div', {style: {display: 'flex', ...style}}, ...children);

interface SocialCardFrameProps {
  logoUrl: string;
  wordmarkUrl: string;
  footer: React.ReactNode;
  action: string;
  domain: string;
  children: React.ReactNode;
}

export function SocialCardFrame({logoUrl, wordmarkUrl, footer, action, domain, children}: SocialCardFrameProps) {
  const h = React.createElement;
  return cardBox({
    width: '100%', height: '100%', flexDirection: 'column', position: 'relative',
    background: 'linear-gradient(120deg, #191b20 0%, #0e1015 65%, #25202b 100%)',
    color: cardColors.text, padding: '34px 48px', fontFamily: 'sans-serif',
  },
    cardBox({position: 'absolute', top: 0, left: 0, width: 1200, height: 5, background: 'linear-gradient(90deg, #ff9b58, #ae7ce8)'}),
    cardBox({alignItems: 'center', justifyContent: 'space-between', height: 52, flexShrink: 0},
      cardBox({alignItems: 'center', gap: 14},
        h('img', {src: logoUrl, width: 46, height: 46, style: {borderRadius: 12}}),
        h('img', {src: wordmarkUrl, width: 104, height: 43}),
        h('span', {style: {fontSize: 19, letterSpacing: 2, color: '#c5cad3', marginLeft: 7}}, 'TOPIC MARKET')),
      cardBox({alignItems: 'center', gap: 9, padding: '9px 15px', border: '1px solid #3d414b', borderRadius: 24, fontSize: 16, color: '#b9c0cc'},
        cardBox({height: 7, width: 7, borderRadius: 4, background: cardColors.green}), 'Robinhood Mainnet')),
    ...React.Children.toArray(children),
    cardBox({alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 22, borderTop: '1px solid #333640', fontSize: 15},
      footer,
      cardBox({alignItems: 'center', gap: 15, color: cardColors.orange, fontSize: 18}, action,
        h('svg', {width: 20, height: 20, viewBox: '0 0 24 24'},
          h('path', {d: 'M5 19L19 5M5 5h14v14', stroke: cardColors.orange, strokeWidth: 2, fill: 'none'})))),
    h('span', {style: {position: 'absolute', bottom: 17, right: 48, fontSize: 11, color: '#747e8e'}}, domain),
  );
}
