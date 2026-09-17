import * as React from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Coins,
  Dices,
  ExternalLink,
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
  OverlayCorner,
  OverlayMode,
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
 * O painel da PARTIDA abre aberto e encolhe sozinho depois de 25s, porque a
 * hora de apostar é o começo do jogo; passado isso ele vira uma pastilha que
 * só volta a crescer se a pessoa levar o mouse até lá. O painel chamado no
 * atalho não encolhe: quem pediu pra ver quer ver.
 */

/** Depois disso o painel encolhe sozinho — a partida é pra ser jogada. */
const AUTO_COLLAPSE_MS = 25_000
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
  const corner = useCorner()
  const pointerOnPanel = useClickThrough()
  const now = useOverlayClock()

  const [collapsed, setCollapsed] = React.useState(false)

  /**
   * Encolher sozinho vale só pro painel que apareceu SOZINHO.
   *
   * Quem apertou o atalho pra ver as ações rápidas não pode ver o painel virar
   * uma pastilha 25s depois — ele pediu pra ver. Fora de partida o painel fica
   * como está até o atalho ou o X fecharem.
   */
  const inMatch = Boolean(state?.myGame)

  React.useEffect(() => {
    if (!mode.dock) {
      // Fechou e abriu de novo: volta inteiro. Reabrir numa pastilha seria
      // castigar quem acabou de pedir pra ver.
      setCollapsed(false)
      return
    }
    if (!inMatch || collapsed || pointerOnPanel) return
    // O relógio reinicia toda vez que o ponteiro sai do painel: quem está
    // mexendo nas apostas não pode ver a tela fechar na mão dele.
    const timer = setTimeout(() => setCollapsed(true), AUTO_COLLAPSE_MS)
    return () => clearTimeout(timer)
  }, [mode.dock, inMatch, collapsed, pointerOnPanel])

  const atTop = corner === 'top-left' || corner === 'top-right'
  const atLeft = corner === 'top-left' || corner === 'bottom-left'

  // A janela cobre a tela inteira (ver services/overlay.ts), então a posição
  // de cada peça é CSS: o painel ancorado no canto escolhido, a roda no meio.
  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/*
        A roda MANDA O PAINEL EMBORA enquanto está aberta.

        Não é só arrumação: a roda tem 624px e é centrada, o painel tem 352px e
        é colado num canto — os dois só não se tocam a partir de ~1360px de
        largura. Em 1280x720, que ainda é resolução de jogo, o gomo da direita
        entrava por baixo do painel.

        Encolher a roda em tela estreita resolveria a colisão e criaria outra
        coisa pior: o gomo mudaria de tamanho conforme a máquina, e a memória
        de mão que faz a roda valer a pena ("o berro fica embaixo à esquerda")
        deixaria de valer. Sumir é o que toda roda de jogo faz, e o painel
        volta inteiro assim que a roda fecha.
      */}
      {mode.dock && !mode.wheel && (
        <div
          className={cn(
            // A altura é limitada pela tela e não fixa: o painel com cinco
            // partidas pra apostar é muito mais alto que o de nenhuma.
            'absolute flex max-h-[calc(100vh-2rem)] w-[22rem] min-h-0 flex-col',
            atTop ? 'top-4' : 'bottom-4',
            atLeft ? 'left-4' : 'right-4'
          )}
        >
          {collapsed ? (
            <CollapsedPill
              state={state}
              alignLeft={atLeft}
              onExpand={() => setCollapsed(false)}
            />
          ) : (
            <Panel
              state={state}
              offline={offline}
              now={now}
              inMatch={inMatch}
              onCollapse={() => setCollapsed(true)}
            />
          )}
        </div>
      )}

      {mode.wheel && (
        <SoundWheel sounds={state?.sounds ?? []} voice={state?.voice ?? null} />
      )}
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
 * Em que canto o PAINEL se ancora.
 *
 * A janela cobre a tela inteira (ver electron/main/services/overlay.ts), então
 * o canto não é mais posição de janela: é CSS daqui. Por isso trocar a
 * preferência não refaz nada — o main só avisa, e a próxima pintura já sai do
 * outro lado.
 */
function useCorner(): OverlayCorner {
  const [corner, setCorner] = React.useState<OverlayCorner>('top-right')

  React.useEffect(() => {
    void window.bocas.settings
      .get()
      .then((settings) => setCorner(settings.overlay.corner))
      .catch(() => {})
    // A janela não morre mais no fim da partida — ela vive enquanto houver
    // motivo, e trocar de canto nas configurações precisa aparecer na hora.
    return window.bocas.overlay.onCorner(setCorner)
  }, [])

  return corner
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
function useClickThrough(): boolean {
  const [onPanel, setOnPanel] = React.useState(false)

  React.useEffect(() => {
    let interactive = false

    const apply = (next: boolean): void => {
      if (next === interactive) return
      interactive = next
      setOnPanel(next)
      void window.bocas.overlay.setInteractive(next)
    }

    const onMove = (event: MouseEvent): void => {
      const el = document.elementFromPoint(event.clientX, event.clientY)
      apply(Boolean(el?.closest('[data-overlay-hit]')))
    }

    // O ponteiro pode sair da janela num movimento rápido demais pra cair fora
    // do painel antes: sem isso a janela ficaria capturando o mouse pra sempre.
    const onLeave = (): void => apply(false)

    window.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
      apply(false)
    }
  }, [])

  return onPanel
}

// ============================================
// PASTILHA (painel encolhido)
// ============================================

function CollapsedPill({
  state,
  alignLeft,
  onExpand
}: {
  state: OverlayState | null
  alignLeft: boolean
  onExpand: () => void
}) {
  const open = state?.targets.filter((t) => !t.myWager).length ?? 0
  const myPool = (state?.myGame?.pool.win ?? 0) + (state?.myGame?.pool.loss ?? 0)

  return (
    <button
      type="button"
      data-overlay-hit
      onMouseEnter={onExpand}
      onClick={onExpand}
      className={cn(
        'flex items-center gap-2 rounded-brutal border border-line bg-void/85 px-2.5 py-1.5',
        'text-xs text-foreground shadow-neon-1 backdrop-blur-sm transition-colors',
        'hover:border-burn/60',
        alignLeft ? 'self-start' : 'self-end'
      )}
    >
      <Dices className="h-3.5 w-3.5 text-burn" />
      {open > 0 ? (
        <span>
          {open} pra apostar
        </span>
      ) : myPool > 0 ? (
        <span>
          <span className="font-mono text-burn">{compact(myPool)}</span> em você
        </span>
      ) : (
        <span className="text-muted-foreground">apostas</span>
      )}
    </button>
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
  onCollapse
}: {
  state: OverlayState | null
  offline: boolean
  now: number
  /** Há partida em andamento: muda o título, o ícone e o botão de encolher. */
  inMatch: boolean
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
        {/* Encolher só existe em partida: é lá que o painel atrapalha a tela
            e que a pastilha tem o que resumir. */}
        {inMatch && (
          <IconButton label="Encolher" onClick={onCollapse}>
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
