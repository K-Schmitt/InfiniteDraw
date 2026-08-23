/**
 * Minimal 404 for paths under /draw that the SPA does not own. The canvas lives at exactly
 * "/" (deep-zoom permalinks travel in the URL hash, never the path), so any other path is a
 * genuine miss. MyWeb cannot cover this route: Traefik hands everything under /draw to this
 * container, and a SPA fallback answering 200 would tell crawlers every URL exists.
 */
export function notFoundPage(): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>404 · InfinityBoard</title>
<style>
  html, body { margin: 0; height: 100%; background: #f5f0e8; color: #2d2a24;
    font: 16px/1.6 'SF Mono', 'Consolas', monospace; }
  main { min-height: 100%; display: grid; place-items: center; text-align: center; padding: 2rem; }
  h1 { font-size: 5rem; margin: 0; color: #a855f7; }
  a { color: #a855f7; }
</style>
</head>
<body>
<main>
  <div>
    <h1>404</h1>
    <p>Cette page n'existe pas sur le canvas.</p>
    <p><a href="/draw">Retour au canvas</a> · <a href="/">slackliniste.com</a></p>
  </div>
</main>
</body>
</html>`;
}
