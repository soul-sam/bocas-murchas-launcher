# Animação infinita nova tem que entrar na lista de pausa

- **Data:** 2026-10-18 (commit `perf(anim): pausar animações infinitas sem foco, ocioso ou em jogo`)
- **Armadilha:** animação de custom property (`frame-supreme`) ou de `background-position`
  (`name-flow`, `fx-fire`) NÃO fica só no compositor: repinta a janela a cada frame. Com a janela visível e
  parada, só elas custavam ~60 % de um núcleo no processo da GPU.
- **Decisão:** `html.motion-idle` (janela sem foco ou 60 s sem input, `lib/motion-idle.ts`) e
  `html.game-running` pausam a lista no fim de `styles/effects.css` (e as utilitárias em `globals.css`).
  Animação infinita nova: pôr no bloco de reduced-motion E nessa lista. Preferir animar `opacity`/`transform`
  (ex.: `.ov-halo` virou opacidade de um `::after`).
- **Fonte:** `docs/memory-audit-2026-10.md` (medições 4 e 8 e o "depois").
