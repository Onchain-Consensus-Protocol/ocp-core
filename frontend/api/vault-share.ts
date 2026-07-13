import { isAddress, loadVaultSnapshot } from "./_lib/vaultSnapshot";

export const config = { runtime: "edge" };

const CRAWLER_USER_AGENTS = [
  "twitterbot",
  "facebookexternalhit",
  "slackbot",
  "discordbot",
  "linkedinbot",
  "telegrambot",
  "whatsapp",
  "bot",
  "crawler",
  "spider",
];

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isCrawlerRequest(request: Request): boolean {
  const userAgent = request.headers.get("user-agent")?.toLowerCase() ?? "";
  return CRAWLER_USER_AGENTS.some((crawler) => userAgent.includes(crawler));
}

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const vault = url.searchParams.get("vault");
  const market = url.searchParams.get("market");
  const blockParam = url.searchParams.get("block");
  const block = blockParam ? Number(blockParam) : undefined;

  if (!isAddress(vault) || !isAddress(market) || !Number.isSafeInteger(block) || !block) {
    return new Response("Invalid Vault share URL", { status: 400 });
  }

  const origin = url.origin;
  const vaultUrl = new URL("/explore/vault.html", origin);
  vaultUrl.searchParams.set("vault", vault);
  vaultUrl.searchParams.set("market", market);

  if (!isCrawlerRequest(request)) {
    return Response.redirect(vaultUrl.toString(), 302);
  }

  try {
    const snapshot = await loadVaultSnapshot(vault, block);
    const imageUrl = new URL("/api/vault-card", origin);
    imageUrl.searchParams.set("vault", vault);
    imageUrl.searchParams.set("block", String(snapshot.blockNumber));

    const description = `YES ${snapshot.yesPct} · NO ${snapshot.noPct} · INVALID ${snapshot.invalidPct} · ${snapshot.totalAmount} ${snapshot.tokenSymbol} staked`;
    const title = escapeHtml(snapshot.title);
    const target = escapeHtml(vaultUrl.toString());
    const snapshotUrl = escapeHtml(url.toString());
    const cardUrl = escapeHtml(imageUrl.toString());
    const cardAlt = `OCP Vault stake distribution at Base block ${snapshot.blockNumber}`;
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} | OCP</title>
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="OCP">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${snapshotUrl}">
  <meta property="og:image" content="${cardUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${cardAlt}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:url" content="${snapshotUrl}">
  <meta name="twitter:image" content="${cardUrl}">
  <meta name="twitter:image:alt" content="${cardAlt}">
  <link rel="canonical" href="${snapshotUrl}">
</head>
<body>
  <p><a href="${target}">Open this OCP Vault</a></p>
  <script>window.location.replace(${JSON.stringify(vaultUrl.toString()).replaceAll("<", "\\u003c")});</script>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Vault snapshot";
    return new Response(message, { status: 400 });
  }
}
