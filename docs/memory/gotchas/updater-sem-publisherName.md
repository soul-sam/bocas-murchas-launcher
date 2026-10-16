# Auto-update recusado em silêncio com `publisherName` sem certificado

- **Data:** anterior a 2026-10 (A CONFIRMAR data exata via `git log -S publisherName electron-builder.yml`)
- **Contexto:** instalador NSIS sem certificado de code signing.
- **Armadilha:** com `win.publisherName` setado, o electron-updater confere a assinatura Authenticode do
  instalador baixado; sem assinatura a conferência nunca bate e o update é baixado mas NÃO aplicado, sem erro.
- **Decisão:** `publisherName` removido. Ao comprar certificado, voltar a linha com o nome EXATO do titular.
- **Risco aceito:** updates não são verificados por assinatura — a integridade depende só do GitHub Release
  (sha512 no latest.yml) e da conta `soul-sam`. Ver docs/akita-aplicacao.md tópico 12.
- **Fonte:** `electron-builder.yml` (bloco `win:`).
