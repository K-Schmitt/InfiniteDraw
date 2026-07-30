# Verifications futures

Checklist manuelle/e2e reportee pendant l'execution du plan v4.0
(mode rush — seuls les tests automatises indispensables tournent pendant
l'implementation). A faire avant la soutenance/rendu final.

Format: `- [ ] [Phase/Task] Description — comment verifier`

## Phase 0 — Ship Safety Net

- [ ] [Task 2] Verifier end-to-end apres build: `curl localhost:3000/` (200),
      `curl localhost:3000/some/spa` (200 SPA fallback), `/health` (200 ok)
- [ ] [Task 3, Step 5] Build l'image (`docker build -t infinityboard:local .`),
      la lancer (`docker run --rm -p 3000:3000 -e NODE_ENV=production
      infinityboard:local`), verifier `curl localhost:3000/health` ->
      `{"status":"ok"}` et `curl -o /dev/null -w "%{http_code}" localhost:3000/`
      -> `200`
- [ ] [Task 3, Step 6] Verifier l'upgrade WebSocket dans le conteneur :
      `curl -i "http://localhost:3000/socket.io/?EIO=4&transport=polling"` doit
      renvoyer `HTTP/1.1 200 OK` et un corps commencant par `0{"sid":`; puis
      ouvrir `http://localhost:3000` dans un navigateur, dessiner un trait, et
      confirmer dans DevTools -> Network -> WS qu'une connexion `websocket`
      s'ouvre (pas bloquee sur `polling`)
- [ ] [Task 4] Deploiement Coolify reel: creer l'app, variables d'env, volume
      persistant `/app/data`, verifier l'upgrade WS a travers le proxy Traefik,
      tester la collab a deux fenetres navigateur sur le domaine live
- [ ] [Task 5] Repro manuelle du bug de precedence fill a 3 zooms (1x, 1e3x,
      1e-3x) dans le navigateur

## Phase 1 — Contract UI

- [ ] [Task 6] Verifier manuellement Zen mode (Z / Escape) dans le navigateur
- [ ] [Task 7] Verifier manuellement le menu Ctrl+clic-droit (ouverture,
      selection d'outil, fermeture Echap/clic gauche/pan)

## Phase 2 — SVG Export

- [ ] [Task 10] Exporter un dessin reel en SVG et l'ouvrir dans un navigateur
      pour confirmer le rendu visuel correspond au canvas

## Phase 3 — Paint Bucket Rewrite

- [ ] [Task 17] Repro manuelle du bug "wrong shape" (F2b, deja documente dans
      NOTES.md) a plusieurs zooms apres le rewrite deux-etapes
- [ ] [Task 17] Smoke test du bucket : dessiner un rectangle, cliquer a
      l'interieur, confirmer que ca remplit et que "fill fell back to traced
      contour" n'apparait pas dans la console
- [ ] Test de charge visuel : formes imbriquees + trous a zoom extreme

## Phase 4 — Collaboration Hardening

- [ ] [Task 21] Test reconnect reel : couper le reseau d'un client pendant une
      session collab, verifier le resync complet a la reconnexion
- [ ] [Task 22] Mesures de perf reelles (INP, taille du journal) avant/apres,
      a consigner dans NOTES.md

## Phase 5 — Zoom Acceptance Suite

- [ ] Rejouer les six cas nommes manuellement dans le navigateur en plus de la
      suite automatisee, pour confirmer le rendu visuel (pas seulement les
      assertions numeriques)

## Phase 6 — Demo Legibility

- [ ] [Task 24] Verifier le permalink camera (copier/coller une URL avec hash,
      confirmer la meme vue exacte)
- [ ] [Task 26] Verification finale complete avant la soutenance : parcours
      complet de toutes les features du contrat en conditions reelles
