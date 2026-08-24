/**
 * 404 for paths under /draw that the SPA does not own. The canvas lives at exactly "/"
 * (deep-zoom permalinks travel in the URL hash, never the path), so any other path is a
 * genuine miss. MyWeb cannot cover this route: Traefik hands everything under /draw to this
 * container, and a SPA fallback answering 200 would tell crawlers every URL exists.
 *
 * Visual: same board vocabulary as the /draw login — grid paper, faint far-away strokes,
 * the canvas HUD, and "404" as a lone selected vector object lost in the void.
 */
export function notFoundPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>404 · InfinityBoard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap">
<style>
  html, body { margin: 0; min-height: 100%; }
  body {
    font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace; color: #3A342B;
    background-color: #F2EDE5;
    background-image: linear-gradient(rgba(90,75,50,.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(90,75,50,.06) 1px, transparent 1px);
    background-size: 32px 32px;
  }
  a { color: #CC00CC; } a:hover { color: #A300A3; }
  @keyframes ib-dash { to { stroke-dashoffset: -24; } }
  .stage { min-height: 100vh; position: relative; overflow: hidden; display: flex;
    align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; }
  .bg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .chip { background: rgba(250,247,240,.85); border: 1px solid #D8CFBE; border-radius: 6px;
    padding: 4px 10px; font-size: 11px; color: #8A8072; }
  .hud { position: absolute; top: 20px; left: 24px; display: flex; gap: 8px; }
  .zoom { position: absolute; bottom: 20px; right: 24px; color: #C0281C;
    background: rgba(250,247,240,.9); }
  .card { position: relative; width: 420px; max-width: 100%; display: flex;
    flex-direction: column; align-items: center; text-align: center; }
  .object { position: relative; padding: 26px 34px; width: 100%; box-sizing: border-box; }
  .tag { position: absolute; right: -8px; top: -4px; font-size: 10.5px; color: #8A8072;
    background: rgba(250,247,240,.9); border: 1px solid #D8CFBE; border-radius: 5px;
    padding: 2px 8px; }
  .title { font-size: 13.5px; font-weight: 700; color: #CC00CC; margin-top: 8px; }
  .lead { font-size: 12.5px; color: #6E6455; margin-top: 10px; max-width: 360px;
    text-wrap: pretty; }
  .actions { display: flex; flex-direction: column; gap: 14px; align-items: center;
    margin-top: 26px; width: 100%; }
  .cta { text-decoration: none; box-sizing: border-box; width: 100%; max-width: 340px;
    background: #CC00CC; color: #FFF; font-size: 13px; font-weight: 700; letter-spacing: .14em;
    padding: 13px 0; border-radius: 7px; display: block; text-align: center; }
  .cta:hover { background: #B000B0; color: #FFF; }
  .cta:focus-visible { outline: 2px solid #3A342B; outline-offset: 2px; }
  .alt { font-size: 11.5px; color: #8A8072; text-decoration: underline;
    text-underline-offset: 3px; }
  .alt:hover { color: #3A342B; }
</style>
</head>
<body>
<main class="stage">
  <svg class="bg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <path d="M 60 120 q 20 -26 46 -9" fill="none" stroke="#CC00CC" stroke-opacity="0.3"
      stroke-width="3" stroke-linecap="round"/>
    <path d="M 1450 780 c 12 -22 30 -22 38 -4" fill="none" stroke="#9B8F7B"
      stroke-opacity="0.35" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="1385" y="120" width="26" height="26" fill="none" stroke="#9B8F7B"
      stroke-opacity="0.3" stroke-width="2" transform="rotate(9 1398 133)"/>
    <circle cx="180" cy="760" r="3" fill="#CC00CC" fill-opacity="0.3"/>
    <path d="M 1030 260 C 1180 210, 1330 300, 1650 240" fill="none" stroke="#9B8F7B"
      stroke-opacity="0.45" stroke-width="3" stroke-dasharray="8 8"
      style="animation:ib-dash 1.6s linear infinite"/>
    <text x="1120" y="230" font-family="'JetBrains Mono',monospace" font-size="13"
      fill="#9B8F7B" fill-opacity="0.8">stroke not found</text>
  </svg>
  <div class="hud">
    <span class="chip">Tools&nbsp;&nbsp;<span style="color:#3A342B">B L R E F I</span></span>
    <span class="chip">Zoom&nbsp;&nbsp;<span style="color:#3A342B">Scroll wheel</span></span>
  </div>
  <div class="chip zoom">0.003×</div>
  <div class="card">
    <div class="object">
      <svg width="100%" viewBox="0 0 360 130" style="display:block;overflow:visible"
        aria-hidden="true">
        <rect x="8" y="10" width="344" height="110" fill="none" stroke="#CC00CC"
          stroke-opacity="0.5" stroke-width="1.5" stroke-dasharray="6 6"/>
        <text x="180" y="102" text-anchor="middle" font-family="'JetBrains Mono',monospace"
          font-weight="700" font-size="118" fill="none" stroke="#CC00CC"
          stroke-width="2.5">404</text>
        <g fill="#F2EDE5" stroke="#CC00CC" stroke-width="1.5">
          <rect x="2" y="4" width="12" height="12"/><rect x="346" y="4" width="12" height="12"/>
          <rect x="2" y="114" width="12" height="12"/><rect x="346" y="114" width="12" height="12"/>
          <rect x="174" y="4" width="12" height="12"/><rect x="174" y="114" width="12" height="12"/>
        </g>
      </svg>
      <div class="tag">vector · 1 object</div>
    </div>
    <h1 class="title">&gt; canvas not found — this board doesn't exist</h1>
    <p class="lead">You zoomed out too far. Nothing was ever drawn here — or someone erased it.</p>
    <div class="actions">
      <a class="cta" href="/draw">← BACK TO CANVAS</a>
      <a class="alt" href="/">or head to the portfolio — slackliniste.com</a>
    </div>
  </div>
</main>
</body>
</html>`;
}
