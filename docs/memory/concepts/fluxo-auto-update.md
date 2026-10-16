# Fluxo de auto-update

- **Data:** 2026-10-16 (descrito a partir do código)
- Tag `v*.*.*` → workflow Release (Windows) → `npm run release` → GitHub Release `soul-sam/bocas-murchas-launcher`
  com Setup.exe, .blockmap e `latest.yml`.
- O launcher instalado (`electron/main/services/updater.ts`) checa 3 s após abrir e a cada ~30 min,
  `autoDownload = true`, e chama `quitAndInstall` quando ninguém está em call/jogando.
- Consequência: **uma tag publicada chega em todo mundo sozinha**. Release é operação de alto risco
  (matriz de autonomia: só com aprovação).
- **Fonte:** `.github/workflows/release.yml` (cabeçalho), `updater.ts`.
