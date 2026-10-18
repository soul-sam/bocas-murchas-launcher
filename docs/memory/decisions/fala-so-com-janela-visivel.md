# Quem fala: anel só com o launcher visível; música não abaixa mais

- **Data:** 2026-10-18 (decisões do dono, auditoria de memória, fase 3)
- **Decisão:** `participants[].isSpeaking` só é atualizado com a janela visível; minimizado/bandeja fica
  `false` e a troca de quem fala não re-renderiza nada. O sinal real segue em
  `voice.subscribeSpeaking`/`getSpeaking` (sem estado React) — hoje só o AFK usa, porque falar conta como
  presença com a janela oculta. Ao voltar pra tela, a lista é refeita (`visibilitychange`).
- **Também:** a música não abaixa mais quando alguém fala; `music.duck`/`duckLevel` saíram (valor salvo
  antigo é ignorado em `normalizeMusic`).
- **Cuidado:** consumidor novo que precise saber quem fala com a janela oculta usa a assinatura, não a lista.
- **Fonte:** `src/lib/voice-context.tsx`, `src/lib/afk-context.tsx`, `docs/memory-audit-2026-10.md` (fase 3).
