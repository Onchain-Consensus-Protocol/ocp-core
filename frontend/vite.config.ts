import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { JsonRpcProvider, Wallet, getAddress, keccak256, toUtf8Bytes, verifyMessage } from 'ethers';

function permissionlessDevApi(env: Record<string, string>): Plugin {
  const rpcUrl = env.VITE_RPC_URL || 'http://127.0.0.1:8545';
  const chainId = Number(env.VITE_CHAIN_ID || 31337);
  const localDev = env.VITE_LOCAL_DEV === 'true' || chainId === 31337 || chainId === 31338;
  const verifierKey = env.LOCAL_X_VERIFIER_PRIVATE_KEY;
  const readBody = (req: import('node:http').IncomingMessage) => new Promise<Record<string, unknown>>((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 100_000) reject(new Error('request too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}') as Record<string, unknown>); } catch (error) { reject(error); }
    });
  });
  const send = (res: import('node:http').ServerResponse, status: number, value: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(value));
  };

  return {
    name: 'ocp-permissionless-local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST') return next();
        try {
          if (req.url === '/api/permissionless/x-attestation') {
            if (!localDev || !verifierKey) return send(res, 503, { error: 'Local X issuer is disabled' });
            const body = await readBody(req);
            const wallet = getAddress(String(body.wallet));
            const factory = getAddress(String(body.factory));
            const xHandle = String(body.xHandle || '')
              .trim()
              .replace(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i, '')
              .split(/[/?#]/, 1)[0]
              .replace(/^@/, '');
            const paramsHash = String(body.paramsHash);
            const requestId = String(body.requestId);
            const nonce = BigInt(String(body.nonce));
            const verifierEpoch = Number(body.verifierEpoch);
            const challenge = String(body.challenge);
            const challengeSignature = String(body.challengeSignature);
            if (!/^[A-Za-z0-9_]{1,15}$/.test(xHandle)) {
              throw new Error('X用户名只能包含英文字母、数字和下划线，长度为1–15个字符');
            }
            if (getAddress(verifyMessage(challenge, challengeSignature)) !== wallet) throw new Error('Wallet challenge mismatch');
            const expectedChallenge = [
              'OCP Permissionless local X verification',
              `wallet:${wallet}`,
              `factory:${factory}`,
              `paramsHash:${paramsHash}`,
              `requestId:${requestId}`,
              `nonce:${nonce}`,
            ].join('\n');
            if (challenge !== expectedChallenge) throw new Error('Challenge fields mismatch');
            const provider = new JsonRpcProvider(rpcUrl);
            const latest = await provider.getBlock('latest');
            if (!latest) throw new Error('Local chain unavailable');
            const issuedAt = BigInt(latest.timestamp);
            const expiresAt = issuedAt + 600n;
            // 本地 issuer 使用 opaque subject 模拟 X 数字 ID；生产端应由 OAuth /2/users/me 提供。
            const xUserIdHash = keccak256(toUtf8Bytes(`local-x:${xHandle.toLowerCase()}`));
            const authorization = {
              creator: wallet,
              xUserIdHash,
              paramsHash,
              requestId,
              nonce,
              issuedAt,
              expiresAt,
              verifierEpoch,
            };
            const signer = new Wallet(verifierKey);
            const signature = await signer.signTypedData(
              { name: 'OCP Permissionless', version: '1', chainId, verifyingContract: factory },
              { CreateAuthorization: [
                { name: 'creator', type: 'address' },
                { name: 'xUserIdHash', type: 'bytes32' },
                { name: 'paramsHash', type: 'bytes32' },
                { name: 'requestId', type: 'bytes32' },
                { name: 'nonce', type: 'uint256' },
                { name: 'issuedAt', type: 'uint64' },
                { name: 'expiresAt', type: 'uint64' },
                { name: 'verifierEpoch', type: 'uint32' },
              ] },
              authorization,
            );
            return send(res, 200, {
              authorization: Object.fromEntries(Object.entries(authorization).map(([key, value]) => [key, typeof value === 'bigint' ? value.toString() : value])),
              signature,
              profile: { username: xHandle, id: xUserIdHash, localSimulation: true },
            });
          }
          if (req.url === '/api/permissionless/advance-time') {
            if (!localDev) return send(res, 403, { error: 'Only available on Anvil' });
            const body = await readBody(req);
            const seconds = Math.max(1, Math.min(Number(body.seconds || 0), 3 * 86_400));
            const provider = new JsonRpcProvider(rpcUrl);
            await provider.send('evm_increaseTime', [seconds]);
            await provider.send('evm_mine', []);
            const latest = await provider.getBlock('latest');
            return send(res, 200, { timestamp: latest?.timestamp, advancedBy: seconds });
          }
          if (req.url === '/api/permissionless/fund-gas') {
            if (!localDev) return send(res, 403, { error: 'Only available on Anvil' });
            const body = await readBody(req);
            const wallet = getAddress(String(body.wallet));
            const provider = new JsonRpcProvider(rpcUrl);
            // DEV ONLY：相当于本地测试链水龙头。直接修改 Anvil 账户余额，生产链不存在此权限。
            await provider.send('anvil_setBalance', [wallet, '0x56bc75e2d63100000']); // 100 ETH
            await provider.send('evm_mine', []);
            return send(res, 200, { wallet, nativeBalance: '100000000000000000000' });
          }
          return next();
        } catch (error) {
          return send(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    server: {
      port: 5173,
      host: env.VITE_DEV_HOST || '127.0.0.1',
    },
    build: {
      rollupOptions: {
        input: ['index.html', 'explore.html', 'explore/vault.html', 'admin.html', 'how.html', 'permissionless.html'],
      },
    },
    plugins: [{name:'paper-api',configureServer(server){
      for(const key of ['DATABASE_URL','CLERK_SECRET_KEY','PAPER_ALLOWED_ORIGINS'])if(env[key])process.env[key]=env[key];
      server.middlewares.use('/api/market-share',async(req,res)=>{const {marketShareHandler}=await server.ssrLoadModule('/server/share/marketShare.ts');await marketShareHandler(req,res);});
      server.middlewares.use('/api/paper',async(req,res)=>{const {paperHandler}=await import('./server/paper/http');await paperHandler(req,res);});
    }},permissionlessDevApi(env), react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
