# Teste que não está no `test:policy` nunca roda

- **Data:** 2026-10-16
- **Contexto:** `src/lib/participant-volume.test.ts` foi escrito com vitest, que não está instalado, e não
  estava listado em `test:policy` — nunca rodou.
- **Armadilha:** o script lista arquivos um a um; não há glob. Arquivo `.test.ts` novo fica de fora sem aviso.
- **Decisão:** portado para `node:test`; ele e changelog/rich-text/youtube adicionados ao `test:policy`.
  Rodar em Node ≥ 22.18 (type stripping) — por isso o job `test` do CI usa Node 24.
- **Fonte:** package.json, sessão Akita 2026-10-16.
