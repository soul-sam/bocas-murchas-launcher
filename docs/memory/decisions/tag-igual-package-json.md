# Release: tag tem que bater com a versão do package.json

- **Data:** A CONFIRMAR (`git log -S "Confere versao da tag" .github/workflows/release.yml`)
- **Contexto:** o electron-updater compara a versão instalada com a do `latest.yml`, que vem do package.json.
- **Decisão:** o workflow Release falha se `v<tag>` ≠ `package.json.version`. Fluxo: `npm version X` →
  push + push --tags. Desde 2026-10-16 o build também depende do job `test` (`needs: test`).
- **Fonte:** `.github/workflows/release.yml`.
