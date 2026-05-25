# Sons do Launcher

Coloque aqui os 6 arquivos esperados pelo hook `useSound()`. O launcher procura por nome exato; se um arquivo não existir, simplesmente não toca (sem erro).

## Arquivos esperados

| Nome             | Quando toca                          | Característica desejada                       |
| ---------------- | ------------------------------------ | --------------------------------------------- |
| `click.mp3`      | Botão clicado                        | Curto (~50ms), seco, blip 8-bit               |
| `hover.mp3`      | Hover em botão de ação primária      | Muito sutil, ~30ms, tick de pad arcade        |
| `success.mp3`    | Login OK, install done, update done  | Power-up 8-bit ascendente, ~400ms             |
| `error.mp3`      | Login falha, install erro            | Buzz descendente / "game over" curto          |
| `launch.mp3`     | Botão "Jogar" — antes do MC abrir    | Whoosh + power-up, dramático, ~600ms          |
| `notify.mp3`     | Alguém entra/sai do server           | Ping sintético, distintivo mas discreto       |

## Onde baixar (CC0 / public domain)

**Pixabay Sound Effects** (https://pixabay.com/sound-effects/) — todos free pra uso comercial sem atribuição:

- Buscar: `8-bit click`, `retro click`, `pixel button` → escolher curto
- Buscar: `8-bit hover`, `arcade tick`
- Buscar: `power up 8 bit`, `level up retro`, `coin pickup`
- Buscar: `8-bit fail`, `game over short`, `error chiptune`
- Buscar: `8-bit launch`, `space shooter laser`, `power up dramatic`
- Buscar: `notification 8 bit`, `arcade alert`, `retro ping`

**Freesound.org** (https://freesound.org/) — também tem CC0, mas exige conta pra baixar.

## Formato

- `.mp3` preferido (suporte universal, tamanho pequeno)
- `.ogg` também funciona se preferir
- Cada arquivo idealmente < 100KB; o launcher carrega tudo no boot

## Como testar

1. Coloque os 6 arquivos aqui
2. Rode `npm run dev`
3. Abra o launcher e clique em coisas — os sons devem disparar
4. Pra mutar: Settings → "Sons" → desligar
