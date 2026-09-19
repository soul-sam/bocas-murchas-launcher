import * as React from 'react'
import { useSettings } from '@/lib/settings-context'
import { useGamification } from '@/lib/gamification-context'
import { isWeb } from '@/lib/platform'
import type { LolStatus } from '../../electron/preload/types'

/**
 * "A SOBREPOSIÇÃO NÃO APARECE" — dizer por quê, em vez de falhar calado.
 *
 * A sobreposição é uma janela por cima do jogo, e isso só funciona quando o
 * jogo deixa o Windows compor a tela ("Sem bordas"). Com o League em "Tela
 * cheia" (exclusiva), NENHUMA janela aparece por cima — nem a nossa, nem a do
 * Discord, nem a do Overwolf. A da própria Riot aparece porque quem desenha
 * ela é o jogo.
 *
 * O PROBLEMA NÃO ERA ESSE LIMITE: era o silêncio. Com o jogo em tela cheia, a
 * sobreposição abria de verdade — janela criada, visível, no topo da pilha,
 * desenhando os pixels certos (tudo conferido com o jogo rodando) — e
 * simplesmente não aparecia. Da poltrona, isso é indistinguível de "o launcher
 * quebrou", e foi assim que uma tarde inteira foi gasta procurando um defeito
 * que não existia.
 *
 * Então: uma vez por partida, se o modo for "Tela cheia" e a sobreposição
 * estiver ligada, o app conta o que está acontecendo e onde trocar. Uma vez
 * por partida, e não a cada leitura de status — o watcher publica várias vezes
 * por minuto e isso viraria uma parede de avisos.
 */
export function LolFullscreenNotice() {
  const { settings } = useSettings()
  const { pushToast } = useGamification()

  /** `phaseSince` da partida que já rendeu aviso. Uma por partida. */
  const avisadoRef = React.useRef<number | null>(null)

  const ligado = !isWeb() && settings.lol.enabled && settings.lol.overlay && settings.overlay.enabled

  React.useEffect(() => {
    if (!ligado) return

    const olhar = (status: LolStatus): void => {
      if (status.phase !== 'in-progress' || status.windowMode !== 'fullscreen') return
      if (avisadoRef.current === status.phaseSince) return
      avisadoRef.current = status.phaseSince

      pushToast({
        kind: 'info',
        title: 'A sobreposição não aparece em Tela cheia',
        // Curto e acionável: o caminho exato, porque quem está entrando numa
        // partida não vai ler um parágrafo.
        body: 'O League está em "Tela cheia". Troca pra "Sem bordas" em Esc → Vídeo → Modo de janela e ela volta a aparecer por cima do jogo.',
        ttlMs: 15_000
      })
    }

    void window.bocas.lol.status().then(olhar).catch(() => {})
    return window.bocas.lol.onStatus(olhar)
  }, [ligado, pushToast])

  return null
}
