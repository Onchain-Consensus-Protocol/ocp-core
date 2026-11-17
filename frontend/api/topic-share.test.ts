import {describe, expect, it, vi} from 'vitest';
import type {IncomingMessage, ServerResponse} from 'node:http';
const chain = vi.hoisted(() => ({isMarket: vi.fn(), marketRecord: vi.fn()}));
vi.mock('ethers', async importOriginal => ({
  ...await importOriginal<typeof import('ethers')>(),
  Contract: class {isMarket = chain.isMarket; marketRecord = chain.marketRecord;},
}));
import handler from './topic-share';
const market = '0x8402f0c5bcbb2c74747599cC563cF6B0C0Be1268';
async function request(query: string) {
  let body = '';
  const res = {statusCode: 200, setHeader: vi.fn(), end(value: string) {body = value;}};
  await handler({method: 'GET', url: '/api/topic-share?' + query} as IncomingMessage, res as unknown as ServerResponse);
  return {...res, body};
}
describe('mainnet topic previews', () => {
  it('escapes chain titles and links directly to the selected topic', async () => {
    chain.isMarket.mockResolvedValue(true);
    chain.marketRecord.mockResolvedValue({topic: '<script>alert("x")</script> 股票话题'});
    const res = await request('market=' + market + '&lang=zh');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('twitter:card');
    expect(res.body).toContain('&lt;script&gt;');
    expect(res.body).not.toContain('<script>alert');
    expect(res.body).toContain('/degen.html?market=' + market + '&amp;lang=zh');
    expect(res.body).toContain('/api/topic-share?market=' + market + '&amp;image=1');
  });
  it('rejects invalid addresses and unregistered markets', async () => {
    expect((await request('market=invalid')).statusCode).toBe(400);
    chain.isMarket.mockResolvedValue(false);
    expect((await request('market=' + market)).statusCode).toBe(404);
  });
  it('returns a retryable response when RPC fails', async () => {
    chain.isMarket.mockRejectedValue(new Error('RPC unavailable'));
    expect((await request('market=' + market)).statusCode).toBe(503);
  });
});
