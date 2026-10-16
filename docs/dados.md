# Inventário de dados pessoais — launcher (a partir do código, 2026-10-16)

Não é orientação jurídica. Levantado lendo código; nenhum dado real foi aberto. O grosso dos dados de
usuário (contas, mensagens, saldo da loja) mora na API (`../bocas-murchas-api`) — inventário próprio lá.

| Onde | Dado | Finalidade | Retenção | Quem acessa | Criptografado? |
|---|---|---|---|---|---|
| `userData/auth-token.bin` (desktop) | token de sessão da API | manter login | até logout (`clearToken`) | usuário do Windows | sim, `safeStorage` (DPAPI) — `electron/main/secure-store.ts` |
| `userData/mc-profile.bin` | perfil/tokens Microsoft/Xbox/Minecraft | login no Minecraft | até logout | usuário do Windows | sim, `safeStorage` |
| `localStorage` chave `bocas:token` (site/APK) | token de sessão | login no navegador | até logout/limpar site | qualquer JS na origem (XSS) | **não** — `src/lib/bridge-web.ts` |
| `userData` settings (`services/settings.ts`) | preferências, hotkeys, volumes | UX | indefinida | usuário do Windows | não (A CONFIRMAR se há dado pessoal) |
| `localStorage` (vários contexts: layout, pendências, poker, cartas) | estado de UI | UX | indefinida | origem | não (A CONFIRMAR conteúdo) |
| Logs (`updater.ts` `log(...)`, console) | versões, eventos | diagnóstico | A CONFIRMAR | usuário | não; não achei log de token/e-mail (grep `console.log(...token|email|password)` vazio) |
| Desinstalação | `deleteAppDataOnUninstall: false` | preservar login | **dados ficam após desinstalar** | — | — |

**Terceiros:** API própria (bocasmurchas.com.br), LiveKit (voz/tela — servidor A CONFIRMAR), Microsoft/Xbox
Live/Minecraft services (login), crafatar.com (skin pelo UUID), YouTube embed / i.ytimg.com (vê IP e o vídeo),
api.github.com (updates), cliente do League of Legends local (`lol-*.ts`, A CONFIRMAR o que lê).
**LLM:** nenhum uso encontrado no launcher.

**Candidatos a remoção/redução:** token web em `localStorage` (avaliar cookie httpOnly na API);
`deleteAppDataOnUninstall` (oferecer limpar tokens ao desinstalar).

## Checklist mínimo
- [ ] Banco sem acesso público — na API (A CONFIRMAR lá)
- [x] Auth: token por usuário; desktop cifrado com DPAPI
- [ ] Rate limit — na API (A CONFIRMAR)
- [ ] Backups testados — na API (A CONFIRMAR)
- [x] Links de mensagens: só http/https chegam ao `shell.openExternal` (`isSafeUrl`, com teste)
- [x] Mensagens do player do YouTube: só da origem esperada (`parsePlayerMessage`, com teste)
- [ ] CSP do site e do renderer (A CONFIRMAR) — relevante por causa do token no localStorage
- n/a Prompt injection / vazamento entre usuários via LLM — não há LLM
