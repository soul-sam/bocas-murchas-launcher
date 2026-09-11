import * as React from 'react'
import {
  Coins,
  Dices,
  ExternalLink,
  Loader2,
  Minus,
  Pickaxe,
  Swords,
  TrendingDown,
  TrendingUp,
  X
} from 'lucide-react'
import type {
  OverlayBetTarget,
  OverlayCorner,
  OverlayState,
  OverlayMyGame
} from '../../electron/preload/types'
import { cn, formatClock } from '@/lib/utils'

/**
 * A SOBREPOSIÇÃO — o painel que aparece por cima do League quando a partida
 * começa, com a pool de apostas em você e a chance de apostar em quem do
 * grupo está jogando junto.
 *
 * Ela roda numa janela própria, transparente e sem foco (ver
 * electron/main/services/lol-overlay.ts). Três consequências mandam no
 * desenho desta tela:
 *
 *   1. NADA DE TECLADO. A janela é `focusable: false` pra que clicar nela não
 *      minimize o jogo — em troca, ela nunca recebe tecla. Por isso o valor da
 *      aposta é botão (10/50/100), e não um campo pra digitar.
 *
 *   2. NADA DE REDE. Não há token nem API aqui: o retrato chega pronto por IPC
 *      da janela principal e os cliques voltam pra lá. `enviando` é local só
 *      pra travar o botão até o próximo retrato chegar.
 *
 *   3. O CLIQUE ATRAVESSA por padrão. O corpo da janela é `pointer-events:
 *      none` (globals.css) e só o que tem `data-overlay-hit` recebe mouse.
 *      É o mesmo marcador que `useClickThrough` procura pra avisar o processo
 *      main quando a janela deve, de fato, capturar o ponteiro — sem isso a
 *      sobreposição comeria os cliques do jogo inteiro.
 *
 * Ela abre aberta e encolhe sozinha depois de 25s, porque a hora de apostar é
 * o começo da partida; passado isso ela vira uma pastilha que só volta a
 * crescer se a pessoa levar o mouse até lá.
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
  const corner = useCorner()
  const pointerOnPanel = useClickThrough()
  const now = useOverlayClock()

  const [collapsed, setCollapsed] = React.useState(false)

  // O relógio da contagem reinicia toda vez que o ponteiro sai do painel: quem
  // está mexendo nas apostas não pode ver a tela fechar na mão dele.
  React.useEffect(() => {
    if (collapsed || pointerOnPanel) return
    const timer = setTimeout(() => setCollapsed(true), AUTO_COLLAPSE_MS)
    return () => clearTimeout(timer)
  }, [collapsed, pointerOnPanel])

  const atTop = corner === 'top-left' || corner === 'top-right'
  const atLeft = corner === 'top-left' || corner === 'bottom-left'

  return (
    <div
      className={cn(
        'flex h-screen w-screen flex-col p-1',
        atTop ? 'justify-start' : 'justify-end'
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
          onCollapse={() => setCollapsed(true)}
        />
      )}
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
 * Onde a janela está na tela. Vale só pra decidir de que lado o conteúdo se
 * ancora — a posição da janela em si é do processo main, que lê a mesma
 * preferência. Lido uma vez: a sobreposição nasce e morre a cada partida, e
 * trocar o canto durante uma refaz a janela (ver lol-overlay.ts).
 */
function useCorner(): OverlayCorner {
  const [corner, setCorner] = React.useState<OverlayCorner>('top-right')

  React.useEffect(() => {
    void window.bocas.settings
      .get()
      .then((settings) => setCorner(settings.lol.overlayCorner))
      .catch(() => {})
  }, [])

  return corner
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
  onCollapse
}: {
  state: OverlayState | null
  offline: boolean
  now: number
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
        <Dices className="h-4 w-4 shrink-0 text-burn" />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-foreground">
          Partida começou
        </p>
        <IconButton label="Encolher" onClick={onCollapse}>
          <Minus className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="Fechar até a próxima" onClick={() => void window.bocas.overlay.dismiss()}>
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </header>

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
          <Hint>Entre no launcher pra ver e fazer apostas.</Hint>
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
