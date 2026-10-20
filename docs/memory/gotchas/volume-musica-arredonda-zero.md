# Volume da música baixo arredondava pra 0

`playerVolume` (src/lib/youtube.ts) aplica curva quadrática no slider. O `setVolume` do YouTube só
aceita inteiro: com `round(p² * 100)`, slider 1..7 virava 0 e 8..9 virava 1 — "abaixo de 10 não toca"
(19/10/2026).

Correção: curva vai de 1 a 100 (`round(1 + p² * 99)`); só slider 0 dá silêncio. Teste em
`youtube.test.ts`. Ao mexer na curva, manter: slider > 0 ⇒ amplitude ≥ 1.
