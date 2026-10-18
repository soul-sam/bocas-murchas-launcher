# Chat guarda só 20 mensagens por canal

- **Data:** 2026-10-18 (decisão do dono, durante a auditoria de memória)
- **Decisão:** `PAGE_SIZE` = `CACHE_KEEP` = 20 em `chat-context.tsx`; o resto vem rolando pra cima.
  O ChatView pede páginas sozinho (`loadOlder({ fill: true })`) até a área ter rolagem — isso vira o piso
  do canal (`fillKeepRef`), não "leitura". Rolagem manual libera até 500 (`pagedBackRef`); voltar pro fim
  (`compactActive`), ocultar a janela ou trocar de canal devolve ao piso.
- **Armadilha evitada:** sem o piso, cada mensagem nova aparava pra 20, a tela perdia a rolagem e o
  ChatView pedia outra página — a cada mensagem.
- **Fonte:** `src/lib/chat-context.tsx`, `src/lib/chat-cache.ts` (+ teste), `src/components/social/ChatView.tsx`.
