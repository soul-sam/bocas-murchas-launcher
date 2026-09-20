import * as React from 'react'

/**
 * SEGURAR O DEDO = BOTÃO DIREITO.
 *
 * O menu de pessoa (ver perfil, mandar DM, mutar, cargos) só existia no
 * `onContextMenu` — botão direito do mouse. No celular não há botão direito:
 * metade das ações sobre gente simplesmente não tinha caminho.
 *
 * Aqui o toque longo devolve o mesmo menu, com as mesmas coordenadas, pro
 * mesmo `openUserMenu`. O mouse não muda de comportamento: o handler só corre
 * pra ponteiro de toque ou caneta.
 *
 * NÃO É HOOK de propósito: a maioria dos lugares que mostram gente são listas
 * (`members.map`, `dmChannels.map`), e hook dentro de map é proibido. Como só
 * existe UM toque longo em andamento por vez — o dedo é um só, e um segundo
 * dedo cancela o primeiro por movimento —, o estado mora no módulo.
 *
 * Detalhes que decidem se isto é bom ou irritante:
 * - 450ms. Menos que isso e rolar a conversa vira menu na cara.
 * - Arrasto acima de 10px cancela: rolar é o gesto mais comum da tela e não
 *   pode abrir nada.
 * - Vibração curta ao disparar (onde existe): é o aviso de que o dedo já pode
 *   sair. Sem ela a pessoa segura mais tempo "pra garantir".
 */
const ATRASO_MS = 450
const TOLERANCIA_PX = 10

let timer = 0
let origemX = 0
let origemY = 0
let disparou = false

function cancelar(): void {
  window.clearTimeout(timer)
  timer = 0
}

export interface ToqueLongoHandlers {
  onPointerDown: (evento: React.PointerEvent) => void
  onPointerMove: (evento: React.PointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onClickCapture: (evento: React.MouseEvent) => void
}

export function toqueLongo(acao: (evento: React.MouseEvent) => void): ToqueLongoHandlers {
  return {
    onPointerDown: (evento) => {
      if (evento.pointerType === 'mouse') return
      cancelar()
      origemX = evento.clientX
      origemY = evento.clientY
      disparou = false

      const { clientX, clientY, currentTarget } = evento
      timer = window.setTimeout(() => {
        timer = 0
        disparou = true
        navigator.vibrate?.(10)
        // O menu espera um evento de mouse (posição + poder cancelar o
        // padrão). Toque não tem um, então vai este: os campos que o
        // `openUserMenu` lê, e nada além.
        acao({
          clientX,
          clientY,
          currentTarget,
          preventDefault: () => {},
          stopPropagation: () => {}
        } as unknown as React.MouseEvent)
      }, ATRASO_MS)
    },

    onPointerMove: (evento) => {
      if (!timer) return
      const longe =
        Math.abs(evento.clientX - origemX) > TOLERANCIA_PX ||
        Math.abs(evento.clientY - origemY) > TOLERANCIA_PX
      if (longe) cancelar()
    },

    onPointerUp: cancelar,
    onPointerCancel: cancelar,

    /**
     * O clique que vem DEPOIS do toque longo não pode valer: sem isto, segurar
     * o avatar de alguém abre o menu e, ao soltar, abre a conversa atrás dele.
     */
    onClickCapture: (evento) => {
      if (!disparou) return
      disparou = false
      evento.preventDefault()
      evento.stopPropagation()
    }
  }
}
