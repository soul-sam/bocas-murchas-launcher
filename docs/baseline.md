# Baseline (2026-10-16)

Medido pelo git local. Reavaliar daqui a 30/60 dias com os mesmos comandos.

| Métrica | Valor | Como medir |
|---|---|---|
| Commits nos últimos 60 dias | 444 (de 453 no total) | `git log --since=60.days --oneline \| wc -l` |
| Commits com "fix" (60 dias) | 98 (~22%) | `git log --since=60.days -i --grep=fix --oneline \| wc -l` |
| Reincidência (arquivos tocados por fix, 60 d) | `src/components/social` 182, `electron/main/services` 29, `src/components/board` 23, `src/lib/changelog.ts` 18, `src/components/ui` 17, `electron/preload/types.ts` 12, `voice-context.tsx` 10, `api-gamification.ts` 10 | `git log --since=60.days -i --grep=fix --name-only --format=` agrupado por pasta |
| Áreas de fix repetido por assunto | loja (6 em 10/12), bilhar (5 em 10/07), tela/voz | `git log -i --grep="^fix" --format="%ad %s"` |
| Arquivos de teste / testes | 25 / 174 (todos verdes) | `npm run test:policy` |
| Cobertura de UI/voz/tela | 0 testes automatizados | — |
| Tempo de CI: Release launcher (tag `v*`) | mediana 155 s (108–188 s), 26/26 sucesso nas últimas 26 runs (08–16/10) | `gh run list --workflow release.yml --json createdAt,updatedAt,conclusion` (updatedAt − createdAt) |
| Tempo de CI: Deploy do site (push em main) | mediana 86 s (75–106 s); 29 sucesso / 4 falha nas últimas 33 (08–16/10). Falhas de 12/10 = SSH após `PasswordAuthentication no` | `gh run list --workflow deploy-web.yml --json createdAt,updatedAt,conclusion` |
| Tempo de CI: APK Android (manual) | 1 sucesso em 17/09 (~2 min); nunca rodou depois da troca para só-chave na VPS | `gh run list --workflow apk.yml --json createdAt,updatedAt,conclusion` |
| Taxa de falha de deploy do site (histórico) | 10 falhas no total, todas em 3 dias (16–17/09, 05/10, 12/10) ligadas a SSH/VPS | `gh run list --workflow deploy-web.yml --status failure` |
| Custo de API de IA | A PREENCHER | fatura do provedor ÷ tarefas no mês |
| Retrabalho de agente | A PREENCHER | contar PRs/commits "fix" que corrigem commit de agente da mesma semana |
| Nota em 30 casos | A PREENCHER | escolher 30 tarefas reais, dar nota 0–2 ao resultado do agente, repetir após mudanças |

Os tempos de CI acima são de antes do job `test` (portão de testes) entrar no deploy-web.yml e no release.yml; ele roda antes (`needs: test`) e deve somar ~30–60 s (npm ci + `test:policy` em ~1 s). Remedir depois do merge.
