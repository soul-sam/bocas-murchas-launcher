import * as React from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Coins,
  Dices,
  ExternalLink,
  GripVertical,
  Headphones,
  HeadphoneOff,
  Loader2,
  Mic,
  MicOff,
  Minus,
  Music,
  PhoneOff,
  Pickaxe,
  Scissors,
  Swords,
  TrendingDown,
  TrendingUp,
  Waves,
  X,
  Zap
} from 'lucide-react'
import type {
  OverlayAction,
  OverlayBetTarget,
  OverlayDock,
  OverlayMode,
  OverlaySide,
  OverlayState,
  OverlayMyGame,
  OverlaySound,
  OverlayVoice
} from '../../electron/preload/types'
import { cn, formatClock } from '@/lib/utils'

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
 * ## A ABA (o desenho de hoje)
 *
 * A sobreposição vive como uma ABA FINA GRUDADA NA LATERAL da tela, e o painel
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
/** Quanto tempo o aviso de "apostou"/"deu erro" fica na tela. */
const NOTICE_TTL_MS = 6_000
/**
 * Sem retrato nenhum depois disso, a janela principal não vai responder: ou
 * ninguém está logado, ou ela travou. Dizer isso é melhor que deixar
 * "conectando" piscando a partida inteira.
 */
const OFFLINE_AFTER_MS = 5_000
/**
 * Valores de aposta oferecidos. Sem campo de digitar: ver o cabeçalho. Os que
 * passam do teto pessoal daquela partida (`maxAmount`, que sobe de 50 até 500
 * conforme a pessoa aposta) são retirados em vez de aparecerem pra dar erro.
 */
const PRESETS = [10, 50, 100] as const
/**
 * Passos do seletor da aposta EM MIM. Sem teclado (ver o cabecalho), entao o
 * valor livre vem de clique: os dois passos cobrem 10..500 sem virar maratona
 * de cliques — 500 e quatro toques no +100 mais um no +10 a partir do minimo.
 */
const SELF_STEPS = [10, 100] as const

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
  const now = useOverlayClock()

  /** Arrastando a aba: a janela não pode largar o mouse no meio do caminho. */
  const [dragging, setDragging] = React.useState(false)
  const pointerOnPanel = useClickThrough(dragging)

  /** Clicou na aba: fica aberto até clicar de novo. */
  const [pinned, setPinned] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)

  const inMatch = Boolean(state?.myGame)

  /**
   * O ponteiro manda; o alfinete e o arrasto seguram.
   *
   * A carência no fechar é o que permite atravessar o vão entre dois botões
   * sem o painel sumir na mão de quem está clicando.
   */
  React.useEffect(() => {
    if (pointerOnPanel || pinned || dragging) {
      setExpanded(true)
      return
    }
    const timer = setTimeout(() => setExpanded(false), COLLAPSE_GRACE_MS)
    return () => clearTimeout(timer)
  }, [pointerOnPanel, pinned, dragging])

  /**
   * ABRIU? ENTÃO MOSTRA. Por alguns segundos, e depois sai da frente.
   *
   * Vale pra QUALQUER motivo de a sobreposição existir — o atalho global e a
   * partida começando. Isto já dependeu de haver partida registrada
   * (`inMatch`), e essa era a versão errada da regra por dois motivos: quem
   * aperta o atalho apertou pra VER alguma coisa, e não pra caçar uma aba de
   * 10px com o mouse; e numa partida personalizada não há aposta registrada,
   * então `inMatch` é falso e não aparecia nada — a sobreposição "não abria".
   *
   * Passados os segundos ela encolhe e a partir daí é o mouse que manda. Quem
   * já levou o ponteiro até lá não vê nada fechar na mão: o `pointerOnPanel`
   * segura sozinho, sem precisar clicar no alfinete.
   */
  React.useEffect(() => {
    if (!mode.dock) return
    setPinned(true)
    const timer = setTimeout(() => setPinned(false), AUTO_OPEN_MS)
    return () => clearTimeout(timer)
  }, [mode.dock])

  // Fechou a sobreposição: o alfinete não pode sobreviver pra próxima abertura.
  React.useEffect(() => {
    if (!mode.dock) setPinned(false)
  }, [mode.dock])

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
        preview({ side, offset })
      }

      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        setDragging(false)

        if (moved) commit(latestRef.current)
        // Clique seco na aba: prende (ou solta) o painel.
        else setPinned((value) => !value)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [preview, commit]
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
      {mode.dock && !mode.wheel && (
        <>
          <EdgeTab
            state={state}
            side={dock.side}
            offset={dock.offset}
            expanded={expanded}
            pinned={pinned}
            dragging={dragging}
            onPointerDown={startDrag}
          />

          {expanded && (
            <DockedPanel side={dock.side} offset={dock.offset}>
              <Panel
                state={state}
                offline={offline}
                now={now}
                inMatch={inMatch}
                pinned={pinned}
                onCollapse={() => setPinned(false)}
              />
            </DockedPanel>
          )}
        </>
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
  children
}: {
  side: OverlaySide
  offset: number
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
        'absolute z-20 flex max-h-[calc(100vh-2rem)] w-[22rem] min-h-0 flex-col',
        // Encostado na aba (que tem 12px), não na borda da tela.
        side === 'left' ? 'left-4' : 'right-4'
      )}
    >
      {children}
    </div>
  )
}

/** Atalho pros cliques que voltam pra janela principal. */
function send(action: OverlayAction): void {
  void window.bocas.overlay.send(action)
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

/**
 * O QUE está aberto agora — o painel, a roda, ou os dois.
 *
 * Vem do processo main, dono da janela e de quem recebe o atalho global. O
 * `mode()` na montagem existe porque o main manda o modo no `did-finish-load`,
 * que acontece ANTES desta árvore React montar: só o ouvinte perderia o
 * primeiro aviso, e a janela abriria desenhando a peça errada.
 */
function useOverlayMode(): OverlayMode {
  const [mode, setMode] = React.useState<OverlayMode>({ dock: false, wheel: false })

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
   */
  const ultimoRef = React.useRef('')

  React.useEffect(() => {
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
  })

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

// ============================================
// A ABA LATERAL
// ============================================

/**
 * A aba grudada na borda — o único pedaço que fica na tela o tempo todo.
 *
 * Ela é ALTA e FINA de propósito: 10px de largura não atrapalham o jogo, e
 * 88px de altura fazem dela um alvo que se acerta sem olhar. Mirar era
 * exatamente o problema da pastilha que ela substituiu (ver o cabeçalho).
 *
 * Encostar abre (quem cuida disso é `useClickThrough` + o `expanded` da tela).
 * Clicar PRENDE aberta, porque quem vai preencher uma aposta não quer que o
 * painel dependa de manter o mouse parado. Arrastar muda de lugar.
 */
function EdgeTab({
  state,
  side,
  offset,
  expanded,
  pinned,
  dragging,
  onPointerDown
}: {
  state: OverlayState | null
  side: OverlaySide
  offset: number
  expanded: boolean
  pinned: boolean
  dragging: boolean
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
}) {
  const open = state?.targets.filter((t) => !t.myWager).length ?? 0

  return (
    <div
      data-overlay-hit
      onPointerDown={onPointerDown}
      title="Arraste pra mudar de lugar · clique pra prender aberto"
      style={{ top: `${offset * 100}%` }}
      className={cn(
        'absolute z-10 flex -translate-y-1/2 cursor-grab flex-col items-center justify-center gap-1',
        'border-line bg-void/85 shadow-neon-1 backdrop-blur-sm transition-[width,background-color,border-color]',
        dragging && 'cursor-grabbing',
        // Colada na borda: o canto de fora é reto e o de dentro arredondado,
        // que é o que faz ela parecer presa à tela em vez de flutuando.
        side === 'left'
          ? 'left-0 rounded-r-brutal border-y border-r'
          : 'right-0 rounded-l-brutal border-y border-l',
        expanded ? 'h-24 w-3 border-burn/70 bg-burn/20' : 'h-20 w-2.5',
        pinned && 'border-acid/70 bg-acid/20'
      )}
    >
      {/* O ponto só aparece quando há aposta esperando: uma aba que pisca sem
          motivo vira ruído e a pessoa aprende a ignorar. */}
      {open > 0 && (
        <span
          aria-label={`${open} pra apostar`}
          className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-burn"
        />
      )}
      <GripVertical
        className={cn(
          'h-3 w-3 shrink-0',
          pinned ? 'text-acid' : expanded ? 'text-burn' : 'text-muted-foreground'
        )}
        aria-hidden
      />
    </div>
  )
}

// ============================================
// PAINEL
// ============================================

function Panel({
  state,
  offline,
  now,
  inMatch,
  pinned,
  onCollapse
}: {
  state: OverlayState | null
  offline: boolean
  now: number
  /** Há partida em andamento: muda o título e o ícone. */
  inMatch: boolean
  /** Preso aberto pelo clique na aba — só então há o que soltar. */
  pinned: boolean
  onCollapse: () => void
}) {
  return (
    <div
      data-overlay-hit
      className={cn(
        'flex max-h-full min-h-0 flex-col overflow-hidden rounded-brutal',
        'border border-line bg-void/90 shadow-neon-2 backdrop-blur-sm'
      )}
    >
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        {inMatch ? (
          <Dices className="h-4 w-4 shrink-0 text-burn" />
        ) : (
          <Zap className="h-4 w-4 shrink-0 text-acid" />
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-foreground">
          {inMatch ? 'Partida começou' : 'Bocas Murchas'}
        </p>
        {/* Soltar só existe quando está preso: fora disso o painel já
            encolhe sozinho ao tirar o mouse, e um botão que não faz nada de
            diferente do que já vai acontecer só ocupa espaço. */}
        {pinned && (
          <IconButton label="Soltar (volta a fechar sozinho)" onClick={onCollapse}>
            <Minus className="h-3.5 w-3.5" />
          </IconButton>
        )}
        <IconButton label="Fechar" onClick={() => void window.bocas.overlay.dismiss()}>
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </header>

      {state?.ready && <QuickActions voice={state.voice} />}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        {state === null ? (
          offline ? (
            <Hint>
              O launcher não respondeu. Ele precisa estar aberto e com você
              logado pra as apostas aparecerem aqui.
            </Hint>
          ) : (
            <Hint>
              Conectando com o launcher<span className="terminal-cursor" />
            </Hint>
          )
        ) : !state.ready ? (
          <Hint>Entre no launcher pra usar a sobreposição.</Hint>
        ) : (
          <>
            {state.myGame && (
              <MyGameBlock
                game={state.myGame}
                coins={state.coins}
                wagerMin={state.wagerMin}
                now={now}
              />
            )}
            <TargetList state={state} now={now} />
          </>
        )}
      </div>

      <Notice notice={state?.notice ?? null} />

      <footer className="flex items-center justify-between gap-2 border-t border-line px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Coins className="h-3 w-3 text-burn" />
          <span className="font-mono text-foreground">{compact(state?.coins ?? 0)}</span> murchos
        </span>
        <button
          type="button"
          onClick={() => void window.bocas.overlay.send({ type: 'open-app' })}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          abrir launcher
          <ExternalLink className="h-3 w-3" />
        </button>
      </footer>
    </div>
  )
}

/** Como a galera está apostando em MIM. Só leitura: ninguém aposta em si. */
function MyGameBlock({
  game,
  coins,
  wagerMin,
  now
}: {
  game: OverlayMyGame
  coins: number
  wagerMin: number
  now: number
}) {
  const elapsed = Math.max(0, Math.round((now - game.since) / 1000))
  const detail = [game.champion, game.queue].filter(Boolean).join(' · ')
  const left = countdown(game.closesAt, now)

  return (
    <section className="mb-3 rounded-brutal border border-line bg-surface-raised/40 px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-foreground">
          {detail || 'Sua partida'}
        </p>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {formatClock(elapsed)}
        </span>
      </div>

      {game.pending ? (
        <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">
          O servidor ainda não registrou sua partida — a pool aparece em
          instantes.
        </p>
      ) : (
        <>
          <PoolBars pool={game.pool} className="mt-2" />
          <p className="mt-1 text-center text-[11.5px] text-muted-foreground">
            {game.bettors === 0
              ? left
                ? `ninguém apostou em você ainda — fecha em ${left}`
                : 'ninguém apostou em você'
              : `${game.bettors} ${game.bettors === 1 ? 'pessoa apostou' : 'pessoas apostaram'} em você`}
          </p>
          <SelfBet game={game} coins={coins} wagerMin={wagerMin} now={now} />
        </>
      )}
    </section>
  )
}

/**
 * APOSTAR EM MIM — o "aposto que eu ganho", direto de dentro do jogo.
 *
 * So aparece nos 3 primeiros minutos (janela mais curta que a dos outros:
 * quem esta jogando le o placar na hora). Nao ha escolha de lado — apostar na
 * propria derrota seria pago pra intar, e o servidor recusa — e o retorno vem
 * da odd da propria winrate, ja calculada la.
 *
 * O valor e por CLIQUE, nao por campo: esta janela e `focusable: false` e
 * nunca recebe tecla. Os passos de 10 e 100 cobrem o intervalo inteiro.
 */
function SelfBet({
  game,
  coins,
  wagerMin,
  now
}: {
  game: OverlayMyGame
  coins: number
  wagerMin: number
  now: number
}) {
  const self = game.self
  const teto = Math.min(self?.maxAmount ?? 0, coins)
  const [amount, setAmount] = React.useState(wagerMin)
  const [sending, setSending] = React.useState(false)

  // O teto so chega junto com o primeiro retrato do servidor; quando ele
  // encolhe (saldo caiu), o valor escolhido nao pode ficar acima dele.
  React.useEffect(() => {
    setAmount((v) => Math.max(wagerMin, Math.min(v, Math.max(wagerMin, teto))))
  }, [teto, wagerMin])

  if (game.myWager) {
    return (
      <p className="mt-2 rounded-brutal border border-acid-dark/60 bg-acid/[0.06] px-2 py-1.5 text-center text-[11.5px] text-foreground">
        você apostou <span className="font-mono text-acid">{game.myWager.amount}</span> em
        você — volta <span className="font-mono text-acid">{game.myWager.potential}</span> se
        ganhar
      </p>
    )
  }

  if (!self) return null
  const left = countdown(self.closesAt, now)
  if (!left) return null

  const podeMais = teto >= wagerMin
  const passo = (delta: number): void =>
    setAmount((v) => Math.max(wagerMin, Math.min(teto, v + delta)))

  const apostar = (): void => {
    if (sending || !podeMais) return
    setSending(true)
    void window.bocas.overlay.send({
      type: 'bet',
      sessionId: self.sessionId,
      prediction: 'win',
      amount
    })
  }

  return (
    <div className="mt-2 border-t border-line pt-2" data-overlay-hit>
      <h3 className="mb-1.5 flex items-center justify-between font-mono text-[11px] font-normal uppercase tracking-widest">
        <span className="text-acid-text">apostar em mim</span>
        <span className="text-burn">{self.multiplier.toFixed(2)}x</span>
      </h3>

      {!podeMais ? (
        <p className="text-[11.5px] text-destructive">
          Você não tem murchos pra apostar em você.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-1">
            {[...SELF_STEPS].reverse().map((s) => (
              <StepButton key={`-${s}`} onClick={() => passo(-s)} disabled={amount <= wagerMin}>
                −{s}
              </StepButton>
            ))}
            <span className="flex-1 text-center font-mono text-sm text-foreground">{amount}</span>
            {SELF_STEPS.map((s) => (
              <StepButton key={`+${s}`} onClick={() => passo(s)} disabled={amount >= teto}>
                +{s}
              </StepButton>
            ))}
          </div>

          <p className="mt-1 text-center font-mono text-[11px] text-muted-foreground">
            se ganhar volta{' '}
            <span className="text-acid-text">{Math.round(amount * self.multiplier)}</span> · fecha
            em {left}
          </p>

          <button
            type="button"
            disabled={sending}
            onClick={apostar}
            className={cn(
              'mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-brutal border px-2 py-1',
              'border-acid-dark font-mono text-xs uppercase tracking-widest text-acid transition-colors',
              'hover:bg-acid/20 disabled:cursor-not-allowed disabled:opacity-40'
            )}
          >
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Dices className="h-3 w-3" />}
            apostar {amount}
          </button>
        </>
      )}
    </div>
  )
}

/** Passo do seletor de valor. Quadradinho: a janela tem 360px. */
function StepButton({
  onClick,
  disabled,
  children
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-brutal border border-line px-1.5 py-1 font-mono text-[11px] text-muted-foreground',
        'transition-colors hover:border-acid-dark hover:text-acid',
        'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-line disabled:hover:text-muted-foreground'
      )}
    >
      {children}
    </button>
  )
}

function TargetList({ state, now }: { state: OverlayState; now: number }) {
  /** Só um formulário aberto por vez — a janela tem 360px de largura. */
  const [openId, setOpenId] = React.useState<string | null>(null)

  if (state.targets.length === 0) {
    return (
      <Hint>
        Nenhuma partida do grupo aberta pra aposta agora. A janela é de 5
        minutos: quando alguém entrar em jogo, aparece aqui.
      </Hint>
    )
  }

  return (
    <div className="space-y-2">
      {state.targets.map((target) => (
        <TargetRow
          key={target.matchId}
          target={target}
          coins={state.coins}
          wagerMin={state.wagerMin}
          now={now}
          open={openId === target.matchId}
          onToggle={() => setOpenId((prev) => (prev === target.matchId ? null : target.matchId))}
        />
      ))}
    </div>
  )
}

function TargetRow({
  target,
  coins,
  wagerMin,
  now,
  open,
  onToggle
}: {
  target: OverlayBetTarget
  coins: number
  wagerMin: number
  now: number
  open: boolean
  onToggle: () => void
}) {
  const detail = [target.champion, target.queue].filter(Boolean).join(' · ')
  const GameIcon = target.game === 'minecraft' ? Pickaxe : Swords
  const left = countdown(target.closesAt, now)

  return (
    <section className="rounded-brutal border border-line bg-surface-raised/40 px-2.5 py-2">
      <header className="flex items-start gap-2">
        <GameIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-burn" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium leading-tight text-foreground">
            {target.displayName}
            {target.squad.length > 0 && (
              <span className="text-muted-foreground"> +{target.squad.length}</span>
            )}
          </p>
          {detail && <p className="truncate text-[11.5px] text-muted-foreground">{detail}</p>}
        </div>
        {left && (
          <span className="shrink-0 font-mono text-[11px] text-burn" title="fecha em">
            {left}
          </span>
        )}
      </header>

      {target.squad.length > 0 && (
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          Com {joinNames(target.squad)} — uma aposta vale por todos.
        </p>
      )}

      <PoolBars pool={target.pool} className="mt-2" />

      {target.myWager ? (
        <p className="mt-2 text-[11.5px] leading-snug text-foreground">
          Você apostou <span className="font-mono text-burn">{target.myWager.amount}</span> em{' '}
          <span
            className={target.myWager.prediction === 'win' ? 'text-acid-text' : 'text-destructive'}
          >
            {target.myWager.prediction === 'win' ? 'vitória' : 'derrota'}
          </span>
          {target.squad.length > 0 ? ' nessa partida — vale pro grupo todo.' : '.'}
        </p>
      ) : !left ? (
        // A janela fechou com o painel aberto. A linha some no próximo poll;
        // até lá, dizer que fechou é melhor que um botão que dá 409.
        <p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">
          Aposta fechada — só nos 5 primeiros minutos da partida.
        </p>
      ) : open ? (
        <BetButtons
          sessionId={target.sessionId}
          coins={coins}
          wagerMin={wagerMin}
          maxAmount={target.maxAmount}
        />
      ) : (
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'mt-2 flex w-full items-center justify-center gap-1.5 rounded-brutal',
            'border border-line px-2 py-1 text-xs text-muted-foreground transition-colors',
            'hover:border-burn/60 hover:text-foreground'
          )}
        >
          <Coins className="h-3 w-3" />
          apostar
        </button>
      )}
    </section>
  )
}

/**
 * Lado + valor em dois toques, sem estado de "confirmar": escolher o valor JÁ
 * é a aposta. Um passo a menos importa aqui — cada segundo desta tela é um
 * segundo em que a pessoa não está olhando pro jogo.
 */
function BetButtons({
  sessionId,
  coins,
  wagerMin,
  maxAmount
}: {
  sessionId: string
  coins: number
  wagerMin: number
  /** Teto pessoal desta partida, vindo do servidor. */
  maxAmount: number
}) {
  const [prediction, setPrediction] = React.useState<'win' | 'loss'>('win')
  const [sending, setSending] = React.useState(false)

  const bet = (amount: number): void => {
    if (sending) return
    setSending(true)
    void window.bocas.overlay.send({ type: 'bet', sessionId, prediction, amount })
    // Não há resposta pra esperar: o resultado volta como aviso no próximo
    // retrato, e a linha inteira é substituída quando a aposta entra. O botão
    // fica travado até lá pra não sair aposta em dobro num clique nervoso.
  }

  const amounts = PRESETS.filter((value) => value >= wagerMin && value <= maxAmount)

  return (
    <div className="mt-2 space-y-1.5">
      <div className="grid grid-cols-2 gap-1">
        <SideButton
          active={prediction === 'win'}
          tone="acid"
          onClick={() => setPrediction('win')}
          icon={<TrendingUp className="h-3 w-3" />}
        >
          vitória
        </SideButton>
        <SideButton
          active={prediction === 'loss'}
          tone="destructive"
          onClick={() => setPrediction('loss')}
          icon={<TrendingDown className="h-3 w-3" />}
        >
          derrota
        </SideButton>
      </div>

      <div className="flex items-center gap-1">
        {amounts.map((amount) => (
          <button
            key={amount}
            type="button"
            disabled={sending || amount > coins}
            onClick={() => bet(amount)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded-brutal border px-1 py-1',
              'font-mono text-xs transition-colors',
              prediction === 'win'
                ? 'border-acid-dark text-acid hover:bg-acid/20'
                : 'border-destructive/60 text-destructive hover:bg-destructive/20',
              'disabled:cursor-not-allowed disabled:border-line disabled:text-muted-foreground disabled:hover:bg-transparent'
            )}
          >
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : amount}
          </button>
        ))}
      </div>

      {coins < wagerMin && (
        <p className="text-[11.5px] text-destructive">
          Você não tem murchos pra apostar.
        </p>
      )}
    </div>
  )
}

/** Aviso curto depois de apostar. Some sozinho — a tela é do jogo, não dele. */
function Notice({ notice }: { notice: OverlayState['notice'] }) {
  const [visible, setVisible] = React.useState(false)

  // Depende SÓ do carimbo de hora, não do objeto. O retrato inteiro é
  // reserializado a cada empurrão, então o `notice` é sempre um objeto novo:
  // depender dele faria um aviso velho renascer toda vez que o saldo ou uma
  // pool mudasse. Pelo `at`, dois avisos seguidos reiniciam a contagem e o
  // mesmo aviso não a reinicia nunca.
  const at = notice?.at ?? 0
  React.useEffect(() => {
    if (!at) return
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), NOTICE_TTL_MS)
    return () => clearTimeout(timer)
  }, [at])

  if (!notice || !visible) return null

  return (
    <p
      className={cn(
        'border-t px-3 py-1.5 text-[11.5px] leading-snug',
        notice.kind === 'ok'
          ? 'border-acid-dark/40 bg-acid/10 text-acid-text'
          : 'border-destructive/40 bg-destructive/10 text-destructive'
      )}
    >
      {notice.text}
    </p>
  )
}

// ============================================
// PEÇAS
// ============================================

/**
 * Barras de vitória × derrota.
 *
 * É uma segunda cópia da que existe em components/social/BetPopover.tsx, e de
 * propósito: aquele arquivo importa os contextos de auth, gamificação e
 * presença: puxá-lo pra cá arrastaria a árvore inteira do app pra dentro de
 * uma janela que não tem nenhum desses providers de pé.
 */
function PoolBars({ pool, className }: { pool: { win: number; loss: number }; className?: string }) {
  const win = Math.max(0, pool?.win ?? 0)
  const loss = Math.max(0, pool?.loss ?? 0)
  const total = win + loss
  const winPct = total > 0 ? Math.round((win / total) * 100) : 50

  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1 text-acid-text">
          <TrendingUp className="h-2.5 w-2.5" />
          <span className="font-mono">{compact(win)}</span>
        </span>
        <span className="flex items-center gap-1 text-destructive">
          <span className="font-mono">{compact(loss)}</span>
          <TrendingDown className="h-2.5 w-2.5" />
        </span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-brutal bg-surface-raised">
        <div
          className={cn('h-full transition-[width] duration-500', total > 0 ? 'bg-acid' : 'bg-acid/30')}
          style={{ width: `${winPct}%` }}
        />
        <div
          className={cn(
            'h-full transition-[width] duration-500',
            total > 0 ? 'bg-destructive' : 'bg-destructive/30'
          )}
          style={{ width: `${100 - winPct}%` }}
        />
      </div>
    </div>
  )
}

function SideButton({
  active,
  tone,
  onClick,
  icon,
  children
}: {
  active: boolean
  tone: 'acid' | 'destructive'
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1 rounded-brutal border px-2 py-1 text-xs transition-colors',
        active
          ? tone === 'acid'
            ? 'border-acid bg-acid/15 text-acid'
            : 'border-destructive bg-destructive/15 text-destructive'
          : 'border-line text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function IconButton({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
    >
      {children}
    </button>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="py-1 text-[11.5px] leading-snug text-muted-foreground">{children}</p>
}

/**
 * "2:41" até a janela de aposta fechar; null quando já fechou (ou quando o
 * servidor ainda não disse quando fecha). O `now` vem do relógio único da
 * janela — ver useOverlayClock.
 */
function countdown(closesAt: number, now: number): string | null {
  if (!closesAt) return null
  const left = Math.round((closesAt - now) / 1000)
  return left > 0 ? formatClock(left) : null
}

/** ["Ana", "Bia", "Cris"] -> "Ana, Bia e Cris". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
}

/** 1200 -> 1,2k. Cópia enxuta do formatCompact de lib/api-gamification — ver PoolBars. */
function compact(value: number): string {
  if (value < 1000) return String(Math.round(value))
  return `${(value / 1000).toFixed(1).replace(/\.0$/, '').replace('.', ',')}k`
}

// ============================================
// AÇÕES RÁPIDAS
// ============================================

/**
 * A fileira do servidor, por cima do jogo: som, microfone, clipe, cutucada.
 *
 * Tudo aqui é BOTÃO DE ÍCONE, sem texto. Não é economia de espaço: é que estas
 * são as ações que a pessoa faz sem tirar os olhos do jogo, e ícone numa
 * posição fixa se acha pela memória da mão — uma fileira de palavras obrigaria
 * a ler. O `title` conta o que é pra quem parar em cima.
 *
 * Fora de call quase nada aqui funciona (o soundboard toca PRA SALA, o clipe
 * grava a call, a cutucada é do canal), então os botões somem em vez de
 * ficarem ali dando erro — e a linha de baixo diz o porquê.
 */
function QuickActions({ voice }: { voice: OverlayVoice | null }) {
  return (
    <section className="shrink-0 border-b border-line px-3 py-2">
      <div className="flex items-center gap-1">
        {/* A roda é outra peça da MESMA janela, então abrir é só trocar o modo
            no processo main — não passa pela janela principal. */}
        <ActionButton
          label="Roda de sons"
          onClick={() => void window.bocas.overlay.setMode({ wheel: true })}
        >
          <Music className="h-3.5 w-3.5" />
        </ActionButton>

        {voice && (
          <>
            <ActionButton
              label={voice.micEnabled ? 'Fechar o microfone' : 'Abrir o microfone'}
              alert={!voice.micEnabled}
              onClick={() => send({ type: 'mic' })}
            >
              {voice.micEnabled ? (
                <Mic className="h-3.5 w-3.5" />
              ) : (
                <MicOff className="h-3.5 w-3.5" />
              )}
            </ActionButton>

            <ActionButton
              label={voice.deafened ? 'Voltar a ouvir' : 'Ensurdecer'}
              alert={voice.deafened}
              onClick={() => send({ type: 'deafen' })}
            >
              {voice.deafened ? (
                <HeadphoneOff className="h-3.5 w-3.5" />
              ) : (
                <Headphones className="h-3.5 w-3.5" />
              )}
            </ActionButton>

            <ActionButton
              label="Salvar os últimos segundos (confirma no launcher)"
              onClick={() => send({ type: 'clip' })}
            >
              <Scissors className="h-3.5 w-3.5" />
            </ActionButton>

            <ActionButton label="Tremer a tela da sala" onClick={() => send({ type: 'nudge' })}>
              <Waves className="h-3.5 w-3.5" />
            </ActionButton>

            {/* Sair da call fica separado do resto, no canto: é o único aqui
                que não dá pra desfazer com o mesmo clique. */}
            <span className="flex-1" />
            <ActionButton label="Sair da call" danger onClick={() => send({ type: 'leave-voice' })}>
              <PhoneOff className="h-3.5 w-3.5" />
            </ActionButton>
          </>
        )}
      </div>

      <p className="mt-1.5 truncate text-[11.5px] text-muted-foreground">
        {voice
          ? `${voice.channelName} · ${voice.peers.length} ${
              voice.peers.length === 1 ? 'pessoa' : 'pessoas'
            }`
          : 'Fora de call — entre num canal pra soltar som.'}
      </p>
    </section>
  )
}

function ActionButton({
  label,
  alert,
  danger,
  onClick,
  children
}: {
  label: string
  /** Estado que a pessoa precisa NOTAR: microfone fechado, ouvido tampado. */
  alert?: boolean
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-brutal border transition-colors',
        alert
          ? 'border-destructive/60 bg-destructive/15 text-destructive'
          : danger
            ? 'border-line text-muted-foreground hover:border-destructive/60 hover:text-destructive'
            : 'border-line text-muted-foreground hover:border-acid-dark hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

// ============================================
// RODA DE SONS
// ============================================

/** Gomos por volta. Mais que isso e nem um anel maior separa os nomes. */
const WHEEL_SLOTS = 12
/** Largura de um gomo, em px. Espelha o `w-[7rem]` lá embaixo. */
const SLOT_WIDTH = 112
/**
 * Raio do anel, em px.
 *
 * O aperto NÃO é o perímetro, é o topo e a base da roda: lá os gomos ficam
 * lado a lado, e o que os separa é só a distância HORIZONTAL entre eles. Pro
 * gomo do topo e o vizinho, ela vale `R·cos(90° − 360°/N)` — com 12 gomos, um
 * quinto a menos que o vão calculado pelo perímetro.
 *
 * A 196px isso dava 98px de vão pra gomos de 112px, e eles se montavam uns por
 * cima dos outros no topo e na base (o de cima aparecia com o nome cortado
 * pelo vizinho, porque quem é desenhado depois pinta por cima). 252 dá 126px —
 * 14 de folga. A roda inteira fica em 624px, que cabe deitada até em 720p.
 */
const WHEEL_RADIUS = 252
/** Meia-largura de um gomo, pra caixa da roda caber ele inteiro. */
const SLOT_HALF = SLOT_WIDTH / 2 + 4
const WHEEL_BOX = (WHEEL_RADIUS + SLOT_HALF) * 2

/**
 * "Control+Shift+1" -> "Ctrl+Shift+1".
 *
 * Cópia enxuta do `formatAccelerator` de components/social/HotkeyRecorder —
 * ver PoolBars pro motivo de não importar de lá. Aqui, além disso, sai SEM os
 * espaços que ele põe em volta do "+": o gomo tem 7rem, e "Ctrl + Shift + 1"
 * não cabe em nenhuma delas.
 */
function shortKey(accelerator: string): string {
  return accelerator.replace('Control', 'Ctrl').replace('Super', 'Win').replace('Return', 'Enter')
}

/**
 * A RODA — os sons do servidor em volta de um miolo, no meio da tela.
 *
 * Por que roda e não grade: a grade do launcher é pra ESCOLHER som (tem busca,
 * categoria, edição). Esta é pra ACERTAR som com o jogo rodando, e o que
 * importa aí é a distância do ponteiro até o alvo. Numa roda todo gomo fica à
 * mesma distância do centro da tela, sempre no mesmo ângulo — dá pra decorar
 * "o berro fica embaixo à esquerda" e parar de ler.
 *
 * Ela FECHA ao escolher, de propósito: é um gesto, não um painel. Quem quer
 * dois sons seguidos aperta o atalho de novo, que é o mesmo dedo. E, sem
 * teclado nesta janela (ver o cabeçalho do arquivo), o atalho é também a única
 * saída — por isso nada aqui pode prender o ponteiro.
 *
 * O vão entre os gomos NÃO tem `data-overlay-hit`: o clique que erra o gomo
 * vai pro jogo, como sempre.
 */
function SoundWheel({ sounds, voice }: { sounds: OverlaySound[]; voice: OverlayVoice | null }) {
  const [page, setPage] = React.useState(0)
  const [hovered, setHovered] = React.useState<OverlaySound | null>(null)

  const pages = Math.max(1, Math.ceil(sounds.length / WHEEL_SLOTS))
  // A lista pode ENCOLHER com a roda aberta (alguém apagou um som lá no
  // launcher) e deixar a página atual sem existir.
  const current = Math.min(page, pages - 1)
  const slice = sounds.slice(current * WHEEL_SLOTS, current * WHEEL_SLOTS + WHEEL_SLOTS)

  /**
   * Fora de call o som não sai: o soundboard toca PRA SALA, e sala é a call.
   * O gomo fica apagado e sem clique em vez de mandar um pedido que só voltaria
   * como erro numa janela que está atrás do jogo.
   */
  const canPlay = Boolean(voice)

  const pick = (sound: OverlaySound): void => {
    send({ type: 'sound', soundId: sound.id })
    void window.bocas.overlay.setMode({ wheel: false })
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative" style={{ width: WHEEL_BOX, height: WHEEL_BOX }}>
        {/* Clarão atrás da roda: num jogo claro os gomos sumiriam no fundo.
            Sem `data-overlay-hit` — o mouse atravessa ele inteiro. */}
        <div className="absolute inset-[8%] rounded-full bg-void/70 blur-2xl" />

        <div
          data-overlay-hit
          className={cn(
            'absolute left-1/2 top-1/2 flex h-36 w-36 -translate-x-1/2 -translate-y-1/2',
            'flex-col items-center justify-center gap-1.5 rounded-full border border-line',
            'bg-void/90 px-4 text-center shadow-neon-2 backdrop-blur-sm'
          )}
        >
          <Music className="h-4 w-4 shrink-0 text-acid" />

          <p
            className={cn(
              'w-full truncate text-[11.5px] leading-snug',
              hovered && canPlay ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {sounds.length === 0
              ? 'ninguém subiu som'
              : !canPlay
                ? 'entre numa call'
                : (hovered?.name ?? 'escolha um som')}
          </p>

          {pages > 1 && (
            <div className="flex items-center gap-1.5">
              <IconButton
                label="Sons anteriores"
                onClick={() => setPage((prev) => (prev - 1 + pages) % pages)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </IconButton>
              <span className="font-mono text-[11px] text-muted-foreground">
                {current + 1}/{pages}
              </span>
              <IconButton
                label="Próximos sons"
                onClick={() => setPage((prev) => (prev + 1) % pages)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          )}
        </div>

        {slice.map((sound, index) => {
          // O -90° põe o primeiro gomo no TOPO; daí em diante, sentido
          // horário. Dividir por `slice.length` (e não por WHEEL_SLOTS) faz a
          // última página, com 3 sons, virar um triângulo bem distribuído em
          // vez de três gomos amontoados num quarto da roda.
          const angle = (index / slice.length) * Math.PI * 2 - Math.PI / 2
          const x = Math.cos(angle) * WHEEL_RADIUS
          const y = Math.sin(angle) * WHEEL_RADIUS

          return (
            <button
              key={sound.id}
              type="button"
              data-overlay-hit
              disabled={!canPlay}
              title={canPlay ? `Tocar "${sound.name}" pra sala` : 'Entre num canal de voz'}
              onMouseEnter={() => setHovered(sound)}
              onMouseLeave={() =>
                setHovered((prev) => (prev?.id === sound.id ? null : prev))
              }
              onClick={() => pick(sound)}
              style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}
              className={cn(
                'absolute flex w-[7rem] -translate-x-1/2 -translate-y-1/2 flex-col',
                'items-center gap-0.5 rounded-brutal border border-line bg-void/90',
                'px-2 py-1.5 shadow-neon-1 backdrop-blur-sm transition-colors',
                canPlay
                  ? 'hover:border-acid hover:bg-surface-raised'
                  : 'cursor-not-allowed opacity-50'
              )}
            >
              <span className="text-xl leading-none">{sound.emoji}</span>
              <span className="w-full truncate text-[11.5px] leading-tight text-foreground">
                {sound.name}
              </span>
              {sound.hotkey && (
                <span className="w-full truncate font-mono text-[11px] text-muted-foreground">
                  {shortKey(sound.hotkey)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
