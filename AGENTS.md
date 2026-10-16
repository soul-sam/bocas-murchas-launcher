# AGENTS.md — bocas-murchas-launcher

Launcher desktop (Electron + electron-vite + React/TS) do grupo Bocas Murchas; o mesmo código vira site
(`web:build`) e APK (TWA/Bubblewrap). A API vive em `../bocas-murchas-api` (outro repo — não mexa daqui).
Visão: [VISION.md](VISION.md). Memória: [docs/memory/](docs/memory/). Dados pessoais: [docs/dados.md](docs/dados.md).

## Comandos (verificados em 2026-10-16, Node 24 local)
| Para quê | Comando | Observação |
|---|---|---|
| Testes de regra | `npm run test:policy` | `node --test` em `.ts` — exige Node ≥ 22.18 (type stripping). 174 testes |
| Typecheck + lint de design | `npm run typecheck` | = `lint:design` + `typecheck:node` + `typecheck:web` |
| Build desktop | `npm run build` | electron-vite |
| Build site | `npm run web:build` | |
| Dev | `npm run dev` / `npm run web:dev` | |
| Instalador local | `npm run package` | NÃO publica |
| `npm run release` | **PROIBIDO localmente** | publica Release no GitHub → auto-update de todo mundo |

Teste novo: arquivo `src/lib/<x>.test.ts` com `node:test` + `node:assert/strict` (não vitest) **e adicione
o caminho em `test:policy` no package.json** — senão ele nunca roda (ver docs/memory/gotchas).

## Regras
- Todo bug corrigido inclui um teste de regressão que falhava antes da correção.
- Rode os testes (e o typecheck) antes de declarar concluído e cole a saída.
- Não troque a abordagem combinada sem perguntar.
- Script destrutivo só roda após dry run aprovado.
- Consulte `docs/memory/` antes de mudar updater, release, deploy ou volume/voz; registre decisões/armadilhas
  ao terminar (um `.md` curto por entrada).

## Oráculo por tipo de tarefa
| Tarefa | Quem diz certo/errado |
|---|---|
| Regra pura em `src/lib` | `npm run test:policy` (teste novo + mutação manual: quebre a regra, veja falhar) |
| Tipos / IPC / preload | `npm run typecheck` |
| Cores/tokens de UI | `npm run lint:design` |
| UI/voz/tela/jogos | rodar o app (`npm run dev`) e conferir à mão — sem teste automatizado (A CONFIRMAR e2e) |
| Site | `npm run web:build` + checagem pública do workflow deploy-web |
| Release/auto-update | tag = versão do package.json (o workflow confere); nunca publicar sem aprovação |

## Matriz de autonomia
- **Livre:** ler código, editar em branch, rodar testes/typecheck/build/package local.
- **Com aprovação:** `git commit/push`, tag/release (dispara auto-update), mexer em `.github/workflows`,
  `electron-builder.yml` (publish, assinatura, NSIS), `updater.ts`, `secure-store.ts`, instalar/atualizar
  dependência, mudar contrato com a API, deploy do site/APK.
- **Proibido:** ler `.env`/segredos/keystore (`../chave-apk`), dados reais de usuários ou `userData`
  (tokens), apagar fora do projeto, rodar workflows remotos, publicar release.

## Plugins / skills / MCP
Só adicionar com problema concreto + métrica anotados (em docs/memory/decisions). Revisar a cada 30 dias e
remover o que não pagou o custo de contexto.
