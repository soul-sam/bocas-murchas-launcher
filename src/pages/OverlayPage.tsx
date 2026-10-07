import * as React from 'react'
import type {
  OverlayDock,
  OverlayMode,
  OverlaySide,
  OverlayState,
  OverlayToast
} from '../../electron/preload/types'
import { EdgeTab, LogoTab } from '@/components/overlay/Tabs'
import { Panel } from '@/components/overlay/Panel'
import { SoundWheel } from '@/components/overlay/SoundWheel'
import { TOAST_TTL_MS, ToastStack } from '@/components/overlay/Toasts'
import { shortKey } from '@/components/overlay/parts'
import { cn } from '@/lib/utils'

/**
 * A SOBREPOSIÇÃO — o que aparece desenhado por cima do jogo.
 *
 * Duas peças, e elas convivem:
 *
 *   - o PAINEL DE CANTO, com as ações rápidas do servidor (microfone, roda de
 *     sons, clipe, tremer a sala) e, quando há partida, a pool de apostas em
 *     você e as partidas do grupo em que dá pra apostar;
 *   - a RODA DE SONS, no centro da tela.
 *
 * Qual delas está na tela não sai do retrato: sai do processo main, que é quem
 * recebe o atalho global e abre a janela (ver `useOverlayMode` e
 * electron/main/services/overlay.ts).
 *
 * Tudo isso roda numa janela própria, transparente e sem foco. Três
 * consequências mandam no desenho desta tela:
 *
 *   1. NADA DE TECLADO. A janela é `focusable: false` pra que clicar nela não
 *      minimize o jogo — em troca, ela nunca recebe tecla. Por isso o valor da
 *      aposta é botão (10/50/100) e não um campo pra digitar, e por isso a
 *      roda fecha no mesmo atalho que a abriu: não existe Esc aqui.
 *
 *   2. NADA DE REDE. Não há token nem API aqui: o retrato chega pronto por IPC
 *      da janela principal e os cliques voltam pra lá. Inclusive o som — esta
 *      janela não toca áudio nenhum, ela só pede. `enviando` é local só pra
 *      travar o botão até o próximo retrato chegar.
 *
 *   3. O CLIQUE ATRAVESSA por padrão. O corpo da janela é `pointer-events:
 *      none` (globals.css) e só o que tem `data-overlay-hit` recebe mouse.
 *      É o mesmo marcador que `useClickThrough` procura pra avisar o processo
 *      main quando a janela deve, de fato, capturar o ponteiro — sem isso a
 *      sobreposição, que cobre a tela inteira, comeria os cliques do jogo.
 *
 *      Vale pra roda também: o vão entre os gomos NÃO é marcado, então quem
 *      abriu a roda no meio de uma luta continua clicando no jogo. Ela não é
 *      modal, e não teria como ser — sem teclado, uma camada que engolisse
 *      tudo viraria uma armadilha.
 *
 * ## ONDE FICAM AS PEÇAS
 *
 * Esta página só ORQUESTRA: estado, modo, arrasto, ponteiro. O que se vê mora
 * em components/overlay/ — `Tabs` (a aba do jogo e a medalha), `Panel`,
 * `Toasts`, `SoundWheel` — e a linguagem visual compartilhada em `parts`.
 *
 * ## A ABA (o desenho de hoje)
 *
 * A sobreposição vive como uma ABA GRUDADA NA LATERAL da tela, e o painel
 * cresce quando o ponteiro encosta nela — o formato do Overwolf. Ela **se
 * arrasta**: pegar a aba e levar pra cima, pra baixo ou pro outro lado grava a
 * posição (ver `useDock`), porque o lugar que o HUD do jogo deixa livre muda de
 * jogo pra jogo e quase nunca é um canto exato.
 *
 * O QUE ISSO SUBSTITUIU, e por quê: antes o painel nascia inteiro num canto
 * fixo e virava uma pastilha pequena 25 segundos depois. Quem quisesse apostar
 * no meio da partida tinha que ACERTAR a pastilha com o mouse — um alvo de
 * ~120x28 que só ficava clicável depois que o processo main respondesse (ver
 * `useClickThrough`). Errar era a regra, e a aposta simplesmente não
 * acontecia. A aba é alta, fica sempre no mesmo lugar e não precisa de clique
 * nenhum pra abrir: encostou, abriu.
 */

/**
 * Carência antes de encolher quando o ponteiro sai do painel.
 *
 * Sem ela, atravessar um vão de 2px entre dois botões fecharia o painel na mão
 * de quem está clicando. É o mesmo motivo da folga (`HIT_MARGIN`) que o
 * processo main usa em volta das peças, do outro lado do problema.
 */
const COLLAPSE_GRACE_MS = 420

/** Abaixo disso o arrasto foi um clique — dedo tremido não move a aba. */
const DRAG_SLOP = 4

/**
 * Quanto tempo o painel fica aberto sozinho quando a partida começa.
 *
 * Só pra avisar que dá pra apostar. Quem for apostar já está com o mouse lá
 * quando o relógio acaba, e aí quem segura é o ponteiro.
 */
const AUTO_OPEN_MS = 10_000
/**
 * Sem retrato nenhum depois disso, a janela principal não vai responder: ou
 * ninguém está logado, ou ela travou. Dizer isso é melhor que deixar
 * "conectando" piscando a partida inteira.
 */
const OFFLINE_AFTER_MS = 5_000

/**
 * De quanto em quanto tempo os retangulos clicaveis sao medidos de novo, alem
 * de a cada pintura. Ver `useClickThrough`.
 */
const HIT_REMEASURE_MS = 150

/**
 * "Agora", de segundo em segundo, pro cronômetro da partida e pra contagem
 * até a aposta fechar.
 *
 * É um `setInterval` local, e NÃO o `useTicker` compartilhado de lib/use-now,
 * de propósito: aquele para quando `document.hidden` fica verdadeiro — a
 * otimização certa pro app, que passa a partida escondido atrás do jogo. Só
 * que esta janela É a que fica POR CIMA do jogo, sem foco, e o Chromium a
 * marca como escondida assim que outra janela a cobre (foi o que apareceu ao
 * fotografar: `visibilityState: "hidden"` com a janela na tela). Com o relógio
 * compartilhado, a contagem dos 5 minutos congelaria bem quando ela importa.
 *
 * Um timer só pra janela inteira, distribuído por prop: é o mesmo motivo pelo
 * qual o relógio do app foi centralizado — cada linha com o seu seria um
 * despertar por linha, fora de fase.
 */
function useOverlayClock(): number {
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [])

  return now
}

export function OverlayPage() {
  const { state, offline } = useOverlayState()
  const mode = useOverlayMode()
  const { dock, preview, commit } = useDock()
  const { dock: idleDock, preview: previewIdle, commit: commitIdle } = useIdleDock()
  const now = useOverlayClock()
  const { live: liveToasts, recent: recentToasts } = useToasts()
  const minimizeKey = useMinimizeKey()

  /** Arrastando a aba: a janela não pode largar o mouse no meio do caminho. */
  const [dragging, setDragging] = React.useState(false)
  const pointerOnPanel = useClickThrough(dragging)

  /** Clicou na aba: fica aberto até clicar de novo. */
  const [pinned, setPinned] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)
  /**
   * ENCOLHIDO DE PROPÓSITO — o botão de minimizar ou o clique fora.
   *
   * Segura o painel fechado mesmo com o ponteiro ainda em cima dele: quem
   * clicou em minimizar está com o mouse no painel, e sem isto o
   * `pointerOnPanel` o reabriria no mesmo quadro. Solta quando o ponteiro sai
   * — encostar na aba de novo volta a abrir.
   */
  const [held, setHeld] = React.useState(false)

  const collapse = React.useCallback(() => {
    setPinned(false)
    setHeld(true)
  }, [])

  /**
   * Qual das duas caras está na tela — ou nenhuma.
   *
   *   - `tab`  — em partida: a aba fina de sempre, que se arrasta pra onde o
   *              HUD deixa livre.
   *   - `logo` — fora de partida: a medalha meio escondida na direita. Some com
   *              o launcher em primeiro plano (ela ficaria por cima da lista de
   *              membros dele). ANTES ela também sumia sem login ou sem retrato,
   *              e quem só queria saber por que a sobreposição não aparecia não
   *              tinha onde clicar pra descobrir: agora ela fica, e o painel diz
   *              o que falta ("entre no launcher", "o launcher não respondeu").
   *              Só espera os primeiros segundos de conexão.
   *
   * A roda de sons manda as duas embora — ver o comentário do JSX.
   */
  const face: 'tab' | 'logo' | null =
    !mode.dock || mode.wheel
      ? null
      : mode.inGame
        ? 'tab'
        : !mode.appFocused && (state !== null || offline)
          ? 'logo'
          : null

  /**
   * O ponteiro manda; o alfinete e o arrasto seguram.
   *
   * A carência no fechar é o que permite atravessar o vão entre dois botões
   * sem o painel sumir na mão de quem está clicando.
   */
  React.useEffect(() => {
    if (pinned || dragging || (pointerOnPanel && !held)) {
      setExpanded(true)
      return
    }
    // Encolhido de propósito: sem carência, a pessoa pediu.
    if (held) {
      setExpanded(false)
      return
    }
    const timer = setTimeout(() => setExpanded(false), COLLAPSE_GRACE_MS)
    return () => clearTimeout(timer)
  }, [pointerOnPanel, pinned, dragging, held])

  // Já fechou e o ponteiro saiu: a próxima encostada na aba volta a abrir.
  React.useEffect(() => {
    if (held && !expanded && !pointerOnPanel) setHeld(false)
  }, [held, expanded, pointerOnPanel])

  // Abriu o painel: pede pool e partidas frescas. A janela agora vive o dia
  // inteiro, entao o pedido da montagem (useOverlayState) so acontece no boot.
  // A ponte ja tem trava contra rajada.
  React.useEffect(() => {
    if (expanded) void window.bocas.overlay.requestState().catch(() => {})
  }, [expanded])

  /**
   * CLIQUE FORA ENCOLHE. Quem vê o clique é o main (a janela é atravessável
   * fora das peças, o clique vai pro jogo); ele só vigia com o painel aberto,
   * por isso o aviso de abrir/fechar. Ver `watchOutsideClick` em
   * electron/main/services/overlay.ts.
   */
  const panelOpen = Boolean(face) && expanded
  React.useEffect(() => {
    void window.bocas.overlay.setPanelOpen(panelOpen).catch(() => {})
  }, [panelOpen])

  React.useEffect(() => window.bocas.overlay.onOutsideClick(collapse), [collapse])

  // Minimizou, ou trocou de cara (a partida começou ou acabou): o alfinete
  // não pode sobreviver. Declarado ANTES do efeito de baixo de propósito — na
  // partida que começa os dois disparam no mesmo quadro, e quem abre tem que
  // ser o último.
  React.useEffect(() => {
    setPinned(false)
  }, [mode.dock, mode.inGame])

  /**
   * TROUXE DE VOLTA? ENTÃO MOSTRA. Por alguns segundos, e depois sai da frente.
   *
   * Vale pros momentos em que a pessoa está OLHANDO pra sobreposição de
   * propósito: o atalho que a tirou do minimizado e a partida começando (que
   * é o aviso de que dá pra apostar). O boot do launcher não conta — com a
   * sobreposição sempre de pé, abrir o painel ali seria abrir na cara de quem
   * só ligou o PC. Quem decide é o main, pelo carimbo `reveal`.
   *
   * O carimbo é hora, e não contador, pra janela recém-criada saber quanto
   * falta: minimizar destrói a janela, e o atalho que a traz de volta cria
   * outra, que monta com o `reveal` já dado.
   *
   * Passados os segundos ela encolhe e a partir daí é o mouse que manda. Quem
   * já levou o ponteiro até lá não vê nada fechar na mão: o `pointerOnPanel`
   * segura sozinho, sem precisar clicar no alfinete.
   */
  React.useEffect(() => {
    if (!mode.dock || !mode.reveal) return
    const left = mode.reveal + AUTO_OPEN_MS - Date.now()
    if (left <= 0) return
    setPinned(true)
    const timer = setTimeout(() => setPinned(false), left)
    return () => clearTimeout(timer)
  }, [mode.dock, mode.reveal])

  /**
   * O ARRASTO.
   *
   * `setPointerCapture` na própria aba: sem ele, um movimento rápido deixa o
   * ponteiro fora do elemento e o arrasto morre no meio. Os ouvintes vão na
   * janela (e não na aba) porque a aba se MOVE enquanto se arrasta.
   *
   * Clique e arrasto são o mesmo gesto até andar `DRAG_SLOP` pixels — quem só
   * clicou não pode ver a aba pular meio centímetro por causa do tremor da mão.
   */
  const latestRef = React.useRef(dock)
  latestRef.current = dock
  const latestIdleRef = React.useRef(idleDock)
  latestIdleRef.current = idleDock
  /** Fora de partida o arrasto move a logo, e não a aba: memórias separadas. */
  const idle = face === 'logo'

  const startDrag = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Impede o `drag` nativo da imagem/texto de sequestrar o gesto.
      event.preventDefault()
      const startX = event.clientX
      const startY = event.clientY
      const target = event.currentTarget
      let moved = false

      try {
        target.setPointerCapture(event.pointerId)
      } catch {
        /* sem captura dá pra viver: os ouvintes são da janela */
      }

      setDragging(true)

      const onMove = (moveEvent: PointerEvent): void => {
        if (
          !moved &&
          Math.abs(moveEvent.clientX - startX) < DRAG_SLOP &&
          Math.abs(moveEvent.clientY - startY) < DRAG_SLOP
        ) {
          return
        }
        moved = true

        const offset = Math.min(
          0.94,
          Math.max(0.06, moveEvent.clientY / Math.max(1, window.innerHeight))
        )
        const side: OverlaySide =
          moveEvent.clientX < window.innerWidth / 2 ? 'left' : 'right'
        if (idle) previewIdle({ side, offset })
        else preview({ side, offset })
      }

      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        setDragging(false)

        if (moved) {
          if (idle) commitIdle(latestIdleRef.current)
          else commit(latestRef.current)
        }
        // Clique seco na aba: prende (ou solta) o painel.
        else setPinned((value) => !value)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [preview, commit, idle, previewIdle, commitIdle]
  )

  // A janela cobre a tela inteira (ver services/overlay.ts), então a posição
  // de cada peça é CSS: a aba na borda escolhida, a roda no meio.
  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/*
        A roda MANDA O PAINEL EMBORA enquanto está aberta.

        Não é só arrumação: a roda tem 624px e é centrada, o painel tem 352px e
        é colado numa borda — os dois só não se tocam a partir de ~1360px de
        largura. Em 1280x720, que ainda é resolução de jogo, o gomo da direita
        entrava por baixo do painel.

        Encolher a roda em tela estreita resolveria a colisão e criaria outra
        coisa pior: o gomo mudaria de tamanho conforme a máquina, e a memória
        de mão que faz a roda valer a pena ("o berro fica embaixo à esquerda")
        deixaria de valer. Sumir é o que toda roda de jogo faz, e a aba volta
        assim que a roda fecha.
      */}
      {face === 'tab' && (
        <EdgeTab
          state={state}
          side={dock.side}
          offset={dock.offset}
          expanded={expanded}
          pinned={pinned}
          dragging={dragging}
          onPointerDown={startDrag}
        />
      )}

      {face === 'logo' && (
        <LogoTab
          state={state}
          side={idleDock.side}
          offset={idleDock.offset}
          expanded={expanded}
          pinned={pinned}
          dragging={dragging}
          alerting={liveToasts.length > 0}
          onPointerDown={startDrag}
        />
      )}

      {face && expanded && (
        <DockedPanel
          side={face === 'logo' ? idleDock.side : dock.side}
          offset={face === 'logo' ? idleDock.offset : dock.offset}
          inset={
            face === 'logo'
              ? idleDock.side === 'left'
                ? 'left-[5.25rem]'
                : 'right-[5.25rem]'
              : undefined
          }
        >
          <Panel
            state={state}
            offline={offline}
            now={now}
            side={face === 'logo' ? idleDock.side : dock.side}
            pinned={pinned}
            minimizeKey={minimizeKey}
            recent={recentToasts}
            onCollapse={() => setPinned(false)}
            onMinimize={collapse}
          />
        </DockedPanel>
      )}

      {/* As notificações saem do lado da aba/logo e somem sozinhas. Com o
          painel aberto elas iriam pra baixo dele — lá dentro já tem a lista
          das recentes. */}
      {face && !expanded && liveToasts.length > 0 && (
        <ToastStack
          toasts={liveToasts}
          side={face === 'logo' ? idleDock.side : dock.side}
          offset={face === 'logo' ? idleDock.offset : dock.offset}
          inset={
            face === 'logo'
              ? idleDock.side === 'left'
                ? 'left-[4.25rem]'
                : 'right-[4.25rem]'
              : undefined
          }
        />
      )}

      {mode.wheel && (
        <SoundWheel sounds={state?.sounds ?? []} voice={state?.voice ?? null} />
      )}
    </div>
  )
}

/**
 * O painel ancorado na aba, sem sair da tela.
 *
 * A conta existe porque a altura do painel varia MUITO (nenhuma partida pra
 * apostar contra cinco), e uma âncora puramente em CSS
 * (`top: X%; translateY(-50%)`) deixa metade dele pra fora quando a aba está
 * perto de uma borda. Medindo a altura de verdade dá pra grudar o painel na
 * aba e, só quando não couber, empurrá-lo pra dentro.
 *
 * CRESCER NÃO PODE RECENTRAR — e isto foi medido, não deduzido. Abrir o
 * formulário de aposta deixa o painel ~60px mais alto; enquanto o painel se
 * recentrava a cada mudança de tamanho, ele subia 16px NO MESMO INSTANTE em
 * que o formulário aparecia, e o botão de valor escorregava de baixo do
 * ponteiro. O clique ia pro vão e a aposta simplesmente não acontecia — com a
 * tela toda parecendo certa depois, porque o painel estava lá, só que 16px
 * acima. É o outro lado do "grande parte das vezes não dá pra apostar".
 *
 * Então: ancora quando a aba muda de lugar (ou a janela de tamanho), e a
 * partir daí só se mexe pra não sair da tela. O painel cresce PRA BAIXO, e o
 * que já estava desenhado fica onde o olho e a mão deixaram.
 */
function DockedPanel({
  side,
  offset,
  inset,
  children
}: {
  side: OverlaySide
  offset: number
  /** Distância da borda, quando não é a da aba fina (a logo é mais larga). */
  inset?: string
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [top, setTop] = React.useState(0)
  /** O `top` de agora, legível de dentro do observer sem virar dependência. */
  const topRef = React.useRef(0)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const MARGIN = 16
    /** Nunca fora da tela, nem em cima nem embaixo. */
    const dentro = (desired: number, height: number): number => {
      const most = Math.max(MARGIN, window.innerHeight - height - MARGIN)
      return Math.min(Math.max(MARGIN, desired), most)
    }

    const ancorar = (): void => {
      const height = el.offsetHeight
      const next = dentro(offset * window.innerHeight - height / 2, height)
      topRef.current = next
      setTop(next)
    }

    ancorar()

    // Mudou de TAMANHO (não de lugar): só corrige se passou da borda.
    const observer = new ResizeObserver(() => {
      const height = el.offsetHeight
      const fixed = dentro(topRef.current, height)
      if (fixed === topRef.current) return
      topRef.current = fixed
      setTop(fixed)
    })
    observer.observe(el)
    window.addEventListener('resize', ancorar)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', ancorar)
    }
  }, [offset])

  return (
    <div
      ref={ref}
      style={{ top }}
      className={cn(
        // `w-[22rem]` e altura limitada pela tela: o painel com cinco partidas
        // pra apostar é muito mais alto que o de nenhuma.
        'absolute z-gaveta flex max-h-[calc(100vh-2rem)] w-[22rem] min-h-0 flex-col',
        // Encostado na aba (32px, 36px aberta), não na borda da tela. Já foi
        // `left-4`, da época da aba de 12px: o painel cobria a aba.
        inset ?? (side === 'left' ? 'left-11' : 'right-11')
      )}
    >
      {children}
    </div>
  )
}

// ============================================
// LIGAÇÃO COM O PROCESSO MAIN
// ============================================

/**
 * Retrato empurrado pela janela principal. Null até o primeiro chegar;
 * `offline` marca a espera que já passou do ponto (ver OFFLINE_AFTER_MS).
 *
 * A ponte que empurra o retrato mora na árvore autenticada da janela
 * principal: com ninguém logado ela nem existe, e nada chega aqui. Por isso a
 * espera precisa ter fim — do contrário a sobreposição diria "conectando" pra
 * sempre a quem só precisava fazer login.
 */
function useOverlayState(): { state: OverlayState | null; offline: boolean } {
  const [state, setState] = React.useState<OverlayState | null>(null)
  const [offline, setOffline] = React.useState(false)

  React.useEffect(() => {
    // O main guarda o último retrato: ele pinta o painel no primeiro quadro,
    // sem esperar a janela principal responder ao pedido logo abaixo.
    void window.bocas.overlay
      .state()
      .then((cached) => {
        if (cached) setState(cached)
      })
      .catch(() => {})
    const off = window.bocas.overlay.onState(setState)
    void window.bocas.overlay.requestState()
    return off
  }, [])

  React.useEffect(() => {
    if (state) return
    const timer = setTimeout(() => setOffline(true), OFFLINE_AFTER_MS)
    return () => clearTimeout(timer)
  }, [state])

  return { state, offline }
}

/**
 * ONDE A ABA MORA, e como ela se muda.
 *
 * A janela cobre a tela inteira (ver electron/main/services/overlay.ts), então
 * a posição não é posição de janela: é CSS daqui. Isso é o que torna o arrasto
 * barato — mover a aba não redimensiona nem repinta janela nenhuma, e uma
 * janela transparente que muda de tamanho PISCA por cima do jogo.
 *
 * O estado local é a verdade ENQUANTO SE ARRASTA (senão a aba andaria a
 * solavancos, no ritmo do disco), e a gravação sai no soltar. O aviso que volta
 * do main é o mesmo valor, e por isso não briga com o que está na tela.
 */
function useDock(): {
  dock: OverlayDock
  preview: (dock: OverlayDock) => void
  commit: (dock: OverlayDock) => void
} {
  const [dock, setDock] = React.useState<OverlayDock>({ side: 'right', offset: 0.38 })

  React.useEffect(() => {
    void window.bocas.settings
      .get()
      .then((settings) => setDock(settings.overlay.dock))
      .catch(() => {})
    return window.bocas.overlay.onDock(setDock)
  }, [])

  const preview = React.useCallback((next: OverlayDock) => setDock(next), [])

  const commit = React.useCallback((next: OverlayDock) => {
    setDock(next)
    void window.bocas.overlay.setDock(next).catch(() => {})
  }, [])

  return { dock, preview, commit }
}

/** Onde a logo de fora de partida mora. Mesmo arranjo do `useDock`. */
function useIdleDock(): {
  dock: OverlayDock
  preview: (dock: OverlayDock) => void
  commit: (dock: OverlayDock) => void
} {
  const [dock, setDock] = React.useState<OverlayDock>({ side: 'right', offset: 0.6 })

  React.useEffect(() => {
    void window.bocas.settings
      .get()
      .then((settings) => setDock(settings.overlay.idleDock))
      .catch(() => {})
    return window.bocas.overlay.onIdleDock(setDock)
  }, [])

  const preview = React.useCallback((next: OverlayDock) => setDock(next), [])

  const commit = React.useCallback((next: OverlayDock) => {
    setDock(next)
    void window.bocas.overlay.setIdleDock(next).catch(() => {})
  }, [])

  return { dock, preview, commit }
}

/**
 * A tecla que minimiza e traz de volta, pra dizer no botão.
 *
 * Sem ela escrita ali, minimizar seria uma porta sem maçaneta do lado de
 * fora: a sobreposição some e nada na tela conta como voltar.
 */
function useMinimizeKey(): string {
  const [key, setKey] = React.useState('')

  React.useEffect(() => {
    void window.bocas.settings
      .get()
      .then((settings) => setKey(settings.hotkeys.overlay))
      .catch(() => {})
  }, [])

  return key ? shortKey(key) : ''
}

/** Flutuando ao mesmo tempo. A quarta empurra a mais velha pra fora. */
const TOAST_MAX_LIVE = 3
/** Quantas o painel guarda na lista de recentes. */
const TOAST_MAX_RECENT = 8

/**
 * As notificações que chegaram do processo main (ver OverlayToast).
 *
 * `live` são as que flutuam agora; `recent`, as que o painel lista — quem
 * estava com a cabeça no jogo quando a notificação passou acha ela ali.
 * Tudo em memória: minimizar destrói a janela e leva a lista junto, o que é o
 * certo pra uma lista de "agora há pouco".
 */
function useToasts(): { live: OverlayToast[]; recent: OverlayToast[] } {
  const [recent, setRecent] = React.useState<OverlayToast[]>([])
  const [clock, setClock] = React.useState(() => Date.now())

  React.useEffect(() => {
    return window.bocas.overlay.onToast((toast) => {
      setRecent((prev) => [toast, ...prev].slice(0, TOAST_MAX_RECENT))
      setClock(Date.now())
    })
  }, [])

  // Um despertador só, pra hora em que a mais nova vence — e não um relógio
  // batendo à toa com nada na tela.
  const newest = recent[0]?.at ?? 0
  React.useEffect(() => {
    if (!newest) return
    const left = newest + TOAST_TTL_MS - Date.now()
    if (left <= 0) return
    const timer = setTimeout(() => setClock(Date.now()), left + 50)
    return () => clearTimeout(timer)
  }, [newest])

  const live = React.useMemo(
    () =>
      recent
        .filter((toast) => clock - toast.at < TOAST_TTL_MS)
        .slice(0, TOAST_MAX_LIVE)
        // Mais velha em cima: a nova entra embaixo, perto de onde o olho já
        // estava lendo.
        .reverse(),
    [recent, clock]
  )

  return { live, recent }
}

/**
 * O QUE está aberto agora — o painel, a roda, ou os dois.
 *
 * Vem do processo main, dono da janela e de quem recebe o atalho global. O
 * `mode()` na montagem existe porque o main manda o modo no `did-finish-load`,
 * que acontece ANTES desta árvore React montar: só o ouvinte perderia o
 * primeiro aviso, e a janela abriria desenhando a peça errada.
 */
function useOverlayMode(): OverlayMode {
  const [mode, setMode] = React.useState<OverlayMode>({
    dock: false,
    wheel: false,
    inGame: false,
    appFocused: false,
    reveal: 0
  })

  React.useEffect(() => {
    void window.bocas.overlay.mode().then(setMode).catch(() => {})
    return window.bocas.overlay.onMode(setMode)
  }, [])

  return mode
}

/**
 * Diz ao processo main quando esta janela deve capturar o mouse, e devolve se
 * o ponteiro está em cima do painel agora.
 *
 * Enquanto ela ignora o mouse, o Electron ainda ENTREGA o movimento aqui
 * (`forward: true`) — é o que permite perceber que o ponteiro entrou no
 * painel. `elementFromPoint` respeita `pointer-events`, então ele só devolve
 * algo dentro de `[data-overlay-hit]` quando o ponteiro está mesmo em cima de
 * uma área clicável; no resto da janela devolve o `<html>`, e o clique segue
 * pro jogo.
 *
 * O "está em cima" sai DAQUI, e não de um `onMouseEnter` no elemento raiz,
 * porque a raiz é `pointer-events: none`: ela só receberia evento por
 * borbulhamento do painel, o que é sutil demais pra sustentar o relógio que
 * decide quando a sobreposição encolhe. Este cálculo é o mesmo que já manda no
 * clique — uma fonte só pra "o ponteiro está no painel".
 */
function useClickThrough(force: boolean): boolean {
  const [onPanel, setOnPanel] = React.useState(false)

  /**
   * PUBLICA ONDE ESTAO OS PEDACOS CLICAVEIS, e deixa o main medir o cursor.
   *
   * Isto ja foi um `mousemove` aqui na tela, e era um impasse circular: a
   * janela atravessavel NAO recebe evento de mouse nenhum (o `forward: true`
   * nao entrega — medido no app empacotado, com o cursor parado em cima da
   * aba: zero eventos), entao a tela nunca sabia que devia pedir pra capturar
   * o mouse, e como nunca pedia, nunca passava a receber evento. Nada abria e
   * nada era clicavel.
   *
   * Quem consegue responder "onde esta o cursor" sem depender de hit-testing e
   * o processo main, por `screen.getCursorScreenPoint()`. Entao a divisao
   * agora e: a tela DESENHA e diz onde desenhou; o main mede e avisa. Ver
   * electron/main/services/overlay.ts.
   *
   * O efeito roda a cada pintura de proposito (sem lista de dependencias): o
   * painel abre, encolhe e cresce sozinho quando chega retrato novo, e cada
   * uma dessas mexe nos retangulos. Mandar so quando MUDA evita transformar
   * isso numa enxurrada de IPC.
   *
   * SO A PINTURA DESTA PAGINA NAO BASTA. Boa parte do que mexe nos retangulos
   * nao re-renderiza a OverlayPage: o `DockedPanel` crescendo (ResizeObserver
   * com estado proprio), o formulario de aposta abrindo (estado do `Bet`), a
   * logo deslizando (transicao de 200ms, medida no primeiro quadro dela). O
   * main ficava com o retangulo VELHO — o formulario desenhado, o clique caindo
   * fora da area publicada e atravessando pro jogo. Era o "nao da pra clicar".
   * Por isso tambem mede num relogio curto; com a assinatura abaixo, um relogio
   * que nao acha mudanca nao manda nada.
   */
  const ultimoRef = React.useRef('')

  const publicar = React.useCallback(() => {
    const areas = [...document.querySelectorAll('[data-overlay-hit]')]
      .map((hit) => {
        const r = hit.getBoundingClientRect()
        return {
          x: Math.round(r.left),
          y: Math.round(r.top),
          w: Math.round(r.width),
          h: Math.round(r.height)
        }
      })
      .filter((a) => a.w > 0 && a.h > 0)

    const assinatura = JSON.stringify(areas)
    if (assinatura === ultimoRef.current) return
    ultimoRef.current = assinatura
    void window.bocas.overlay.setHitAreas(areas).catch(() => {})
  }, [])

  React.useEffect(publicar)

  React.useEffect(() => {
    const timer = setInterval(publicar, HIT_REMEASURE_MS)
    return () => clearInterval(timer)
  }, [publicar])

  // O main viu o ponteiro entrar ou sair. E ele quem manda.
  React.useEffect(() => {
    return window.bocas.overlay.onPointer(setOnPanel)
  }, [])

  /**
   * Arrastando: prende o clique ligado ate soltar.
   *
   * Enquanto a aba esta sendo arrastada a janela nao pode se soltar do mouse
   * por um instante em que o cursor passe fora dos retangulos — e os
   * retangulos estao se movendo justamente por causa do arrasto.
   */
  React.useEffect(() => {
    void window.bocas.overlay.setInteractive(force).catch(() => {})
  }, [force])

  return onPanel
}
