# Aplicação das recomendações "Akita no Flow #663" — launcher (2026-10-16)

Projeto: Electron 33+/electron-vite + React/TS, empacotado com electron-builder (NSIS, Windows x64),
auto-update por electron-updater via GitHub Releases; o mesmo código vira site (VPS) e APK (TWA).

## Verificação executada
- `npm run test:policy` → **174 testes, 174 pass, 0 fail** (25 arquivos).
- `npm run typecheck` → design tokens ok, `tsc` node e web sem erros (exit 0).
- YAML dos 3 workflows + electron-builder.yml carregado com js-yaml: ok; jobs `test` e `build|deploy <- test`.

## Testes novos / recuperados (mutação manual)
| Teste | Regra | Mutação | Resultado |
|---|---|---|---|
| `rich-text.test.ts` | só http/https vai ao `openExternal` | aceitar `file:` | falhou 1 → restaurado, 0 falhas |
| `youtube.test.ts` | postMessage só da origem do player | remover checagem de origem | falhou 1 → restaurado ok |
| `youtube.test.ts` | erro 5 não tira faixa da playlist | tratar 5 como morto | falhou 1 → restaurado ok |
| `changelog.test.ts` | instalação nova não mostra novidades | remover guarda `!lastSeen` | falhou 1 → restaurado ok |
| `participant-volume.test.ts` | ensurdecido zera volume | remover `if deafened` | falhou 1 → restaurado ok |

`participant-volume.test.ts` era vitest (não instalado) e nunca rodava: portado para `node:test`. Os 4 entraram
no `test:policy`. Código de produção restaurado (`git diff` limpo nos .ts mutados).

## Tópicos
| # | Tópico | Status | Nota / gatilho |
|---|---|---|---|
| 1 | AGENTS.md | aplicado | `AGENTS.md` (não havia CLAUDE.md) |
| 2 | Tarefa em 4 itens | aplicado | `.github/ISSUE_TEMPLATE/tarefa.md`, `pull_request_template.md` |
| 3 | Oráculo | aplicado | tabela no AGENTS.md; UI/voz/tela sem oráculo automático |
| 4 | Dry run | parcial (documentado) | ver abaixo |
| 5/6 | Testes de regra + regressão | aplicado | 5 regras com mutação; regra no AGENTS.md |
| 7 | (etapa posterior) | não agora | gatilho: suíte de UI/e2e estável |
| 9 | CI como portão | aplicado | job `test` + `needs: test` em release.yml e deploy-web.yml |
| 10 | Staging | não agora | gatilho: usuários fora do grupo/pagantes; hoje a tag vai direto pra todos |
| 11 | VISION.md | aplicado | vários A CONFIRMAR |
| 12 | Operações sensíveis | aplicado (doc + deny) | ver abaixo |
| 14, 15, 18, 20, 21, 23, 24, 28, 29 | etapa posterior | não agora | gatilho: baseline de 30 dias mostrar necessidade |
| 16/17 | Memória | aplicado | `docs/memory/` com 7 entradas |
| 19 | Autonomia | aplicado | matriz no AGENTS.md |
| 25/26 | Dados pessoais | aplicado | `docs/dados.md`; 26 (LGPD formal) quando houver usuários externos |
| 27 | Credenciais do agente | aplicado | `.claude/settings.json` deny; `.gitignore` + `.env.*` |
| 0.1 | Baseline | aplicado | `docs/baseline.md` |

## Tópico 12 — build/release/auto-update
- Tag publicada = update silencioso para todos (`autoDownload`, `quitAndInstall`). Antes desta mudança, release
  dependia só de typecheck; agora também de `test:policy`.
- **Sem code signing**: `publisherName` removido de propósito; integridade só por sha512 do latest.yml +
  conta GitHub. Recomendação: certificado (ou Azure Trusted Signing) e 2FA/branch+tag protection.
- `GH_TOKEN` = `GITHUB_TOKEN` com `contents: write` (escopo mínimo ok).
- `apk.yml` ainda passa `password`/`passphrase` (SSH_PASSPHRASE) ao scp — mesma armadilha corrigida no deploy-web
  (docs/memory/gotchas/scp-action-passphrase.md). **Corrigido em 2026-10-16** (só `key`), ainda não exercitado.
- `.claude/settings.json` nega `npm run release` ao agente.

## Dry run (tópico 4)
| Operação | Dry run? |
|---|---|
| `npm run release` | `npm run package` é o ensaio (gera instalador sem publicar) |
| deploy-web.yml (`rm -rf html-antigo`, `docker stop` na 8081) | não; tem validação prévia (`nginx -t`, arquivos-chave) — documentado, não alterado (remoto) |
| apk.yml | não — documentado |
| `java-runtime.ts`/`modpack.ts` `fs.rm` recursivo | caminhos internos ao userData; sem flag — documentado |
| `scripts/*.mjs` | geradores de ícone/splash; sobrescrevem arquivos de `build/` — baixo risco |

## Segredos
`git grep` por api_key/secret/token/password com valor literal, chaves privadas, `ghp_`, `AKIA`: **nada encontrado**.
Nenhum `.env`/keystore versionado.

## Próximos passos manuais
1. ~~Revisar e commitar.~~ PR `chore/akita-verificacao`.
2. GitHub: branch protection na `main` exigindo o job `test`; tag protection para `v*`.
3. ~~Corrigir `passphrase` no apk.yml.~~ Feito; confirmar no próximo APK.
4. Decidir sobre certificado de code signing.
5. Preencher A CONFIRMAR em VISION.md/dados.md e A PREENCHER no baseline.
6. Trabalho em andamento não tocado: `src/components/social/MusicHost.tsx`, `src/lib/watch-context.tsx`.
