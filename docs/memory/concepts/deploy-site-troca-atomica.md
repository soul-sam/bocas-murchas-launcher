# Deploy do site: troca em duas etapas com validação antes

- **Data:** 2026-10 (A CONFIRMAR)
- Push na main → deploy-web.yml: build → tar.gz → VPS → extrai em `html-novo`, confere arquivos-chave,
  roda `nginx -t` num container descartável, só então troca `html` ↔ `html-antigo`. `./app` (APK) nunca
  é apagado.
- Checagem final pela URL pública (não 127.0.0.1): `assetlinks.json` precisa vir como application/json.
- Rollback manual: `html-antigo` fica na VPS até o próximo deploy (A CONFIRMAR procedimento).
- **Fonte:** `.github/workflows/deploy-web.yml`.
