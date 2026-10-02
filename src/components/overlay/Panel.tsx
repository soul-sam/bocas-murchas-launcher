import * as React from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ExternalLink,
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  Minus,
  PhoneOff,
  Pickaxe,
  PinOff,
  Scissors,
  Swords,
  Waves
} from 'lucide-react'
import { MurchosIcon, SoundboardIcon, StreakIcon } from '@/lib/bocas-icons'
import { cn, formatClock } from '@/lib/utils'
import type {
  OverlayAction,
  OverlayBetTarget,
  OverlayMyGame,
  OverlaySide,
  OverlayState,
  OverlayToast,
  OverlayVoice
} from '../../../electron/preload/types'
import { BetComposer } from './Bet'
import {
  ago,
  Chip,
  compact,
  countdown,
  Hint,
  IconButton,
  joinNames,
  LevelTag,
  Medallion,
  PoolBar,
  SectionTitle,
  XpBar
} from './parts'
import { toastLook } from './Toasts'

/**
 * O PAINEL — o que abre ao lado da aba/logo.
 *
 * De cima pra baixo, do que é SEU pro que é do grupo:
 *   1. a carta de jogador (nível, XP, murchos, sequência);
 *   2. as ações rápidas da call;
 *   3. a SUA partida, quando há uma, com a aposta em você;
 *   4. as partidas do grupo em que dá pra apostar;
 *   5. o que aconteceu agora há pouco.
 *
 * Sem teclado e sem rede (ver o cabeçalho da OverlayPage): tudo é botão e tudo
 * volta pra janela principal por `send`. O formulário de aposta — valor por
 * régua, fichas e botões — mora em `Bet.tsx`.
 */

/** A janela de aposta em mim, em ms. Espelha o SELF_WAGER do servidor (3 min). */
const SELF_WINDOW_MS = 180_000
/** A janela das apostas nos outros (5 min do início da partida). */
const TARGET_WINDOW_MS = 300_000
/** Abaixo disso o relógio da partida fica vermelho: é agora ou nunca. */
const URGENT_MS = 60_000

/** Atalho pros cliques que voltam pra janela principal. */
export function send(action: OverlayAction): void {
  void window.bocas.overlay.send(action)
}

export function Panel({
  state,
  offline,
  now,
  side,
  pinned,
  minimizeKey,
  recent,
  onCollapse,
  onMinimize
}: {
  state: OverlayState | null
  offline: boolean
  now: number
  side: OverlaySide
  /** Preso aberto pelo clique na aba — só então há o que soltar. */
  pinned: boolean
  /** O atalho que esconde a sobreposição inteira (e traz de volta), já legível. */
  minimizeKey: string
  recent: OverlayToast[]
  onCollapse: () => void
  /** Encolhe o painel de volta pra aba. A aba continua na tela. */
  onMinimize: () => void
}) {
  const ready = Boolean(state?.ready)

  return (
    <div
      data-overlay-hit
      className={cn(
        'flex max-h-full min-h-0 flex-col overflow-hidden rounded-[10px]',
        'border border-line bg-void/95 shadow-neon-2',
        side === 'left' ? 'ov-in-left' : 'ov-in-right'
      )}
    >
      <PlayerHeader state={state} pinned={pinned} onCollapse={onCollapse} onMinimize={onMinimize} />

      {state?.ready && <QuickActions voice={state.voice} />}

      <div className="ov-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {state === null ? (
          offline ? (
            <Hint>
              O launcher não respondeu. Ele precisa estar aberto e com você logado pra as apostas
              aparecerem aqui.
            </Hint>
          ) : (
            <Hint>
              Conectando com o launcher<span className="terminal-cursor" />
            </Hint>
          )
        ) : !ready ? (
          <Hint>Entre no launcher pra usar a sobreposição.</Hint>
        ) : (
          <div className="space-y-3">
            {state.myGame && (
              <MyGameCard game={state.myGame} coins={state.coins} wagerMin={state.wagerMin} now={now} />
            )}
            <TargetList state={state} now={now} />
            {recent.length > 0 && <RecentList toasts={recent} now={now} />}
          </div>
        )}
      </div>

      <Notice notice={state?.notice ?? null} />

      <footer className="flex items-center justify-between gap-2 border-t border-line bg-depth-2 px-3 py-1.5 text-[11.5px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {minimizeKey && (
            <kbd className="rounded-brutal border border-line-strong bg-surface-raised px-1.5 font-mono text-[11px] text-foreground">
              {minimizeKey}
            </kbd>
          )}
          esconde
        </span>
        <button
          type="button"
          onClick={() => send({ type: 'open-app' })}
          className="flex items-center gap-1 transition-colors hover:text-foreground"
        >
          abrir launcher
          <ExternalLink className="h-3 w-3" aria-hidden />
        </button>
      </footer>
    </div>
  )
}

// ============================================
// CARTA DE JOGADOR
// ============================================

/**
 * O topo do painel: quem você é no servidor.
 *
 * É a mesma informação que o launcher dá na barra lateral — nível, XP até o
 * próximo, murchos, sequência —, trazida pra dentro do jogo porque é ela que dá
 * sentido a apostar: o saldo que você está arriscando está à vista o tempo todo.
 *
 * Sem login (ou antes de o launcher responder) cai no cabeçalho de marca, que
 * não tem número nenhum pra inventar.
 */
function PlayerHeader({
  state,
  pinned,
  onCollapse,
  onMinimize
}: {
  state: OverlayState | null
  pinned: boolean
  onCollapse: () => void
  onMinimize: () => void
}) {
  const ready = Boolean(state?.ready)
  const level = state?.level ?? 1
  const progress = state && state.nextLevelXp > 0 ? state.levelXp / state.nextLevelXp : 0
  const missing = state ? Math.max(0, state.nextLevelXp - state.levelXp) : 0

  return (
    <header className="shrink-0 border-b border-line bg-depth-2 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <Medallion size={48} progress={ready ? progress : 0} />
          {ready && <LevelTag level={level} className="absolute -bottom-1 left-1/2 -translate-x-1/2" />}
        </div>

        <div className="min-w-0 flex-1">
          {ready ? (
            <>
              <p className="truncate text-sm font-semibold leading-tight text-foreground">
                Nível {level}
              </p>
              <XpBar progress={progress} className="mt-1.5" />
              <p className="mt-1 truncate text-[11.5px] leading-tight text-muted-foreground">
                <span className="font-mono text-foreground">{compact(missing)}</span> XP pro nível{' '}
                {level + 1}
              </p>
            </>
          ) : (
            <p className="truncate text-sm font-semibold leading-tight text-foreground">
              Bocas Murchas
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 self-start">
          {/* Soltar só existe quando está preso: fora disso o painel já
              encolhe sozinho ao tirar o mouse, e um botão que não faz nada de
              diferente do que já vai acontecer só ocupa espaço. */}
          {pinned && (
            <IconButton label="Soltar (volta a fechar sozinho)" onClick={onCollapse}>
              <PinOff className="h-3.5 w-3.5" />
            </IconButton>
          )}
          {/* Minimizar ENCOLHE pra aba, que fica na tela. Esconder tudo é só
              pelo atalho do rodapé — o botão sumir com a aba deixava a pessoa
              sem nada na tela pra clicar de volta. */}
          <IconButton label="Minimizar" onClick={onMinimize}>
            <Minus className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      {ready && state && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <Chip tone="burn">
            <MurchosIcon className="h-3 w-3" aria-hidden />
            <span className="font-mono font-semibold text-foreground">{compact(state.coins)}</span>
            murchos
          </Chip>
          {state.streak > 0 && (
            <Chip tone="neutral">
              <StreakIcon className="h-3 w-3 text-burn" aria-hidden />
              <span className="font-mono font-semibold text-foreground">{state.streak}</span>
              {state.streak === 1 ? 'dia seguido' : 'dias seguidos'}
            </Chip>
          )}
        </div>
      )}
    </header>
  )
}

// ============================================
// AÇÕES RÁPIDAS
// ============================================

/**
 * A fileira do servidor, por cima do jogo: som, microfone, clipe, cutucada.
 *
 * São ações que a pessoa faz sem tirar os olhos do jogo, e ícone numa posição
 * fixa se acha pela memória da mão — uma fileira de palavras obrigaria a ler.
 * Só a roda de sons leva rótulo: é a porta de entrada e a que mais se procura.
 *
 * Fora de call quase nada aqui funciona (o soundboard toca PRA SALA, o clipe
 * grava a call, a cutucada é do canal), então os botões somem em vez de
 * ficarem ali dando erro — e a linha de baixo diz o porquê.
 */
function QuickActions({ voice }: { voice: OverlayVoice | null }) {
  return (
    <section className="shrink-0 border-b border-line px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        {/* A roda é outra peça da MESMA janela, então abrir é só trocar o modo
            no processo main — não passa pela janela principal. */}
        <button
          type="button"
          onClick={() => void window.bocas.overlay.setMode({ wheel: true })}
          className={cn(
            'flex h-8 shrink-0 items-center gap-1.5 rounded-brutal border px-2.5 text-xs font-medium',
            'border-acid-dark/60 bg-acid/10 text-acid-text transition-colors hover:border-acid hover:bg-acid/20'
          )}
        >
          <SoundboardIcon className="h-3.5 w-3.5" aria-hidden />
          Sons
        </button>

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

      {voice ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-acid" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-foreground">{voice.channelName}</span>
            {voice.peers.length > 0 && ` · ${joinNames(voice.peers.slice(0, 4))}`}
            {voice.peers.length > 4 && ` +${voice.peers.length - 4}`}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          Fora de call — entre num canal pra soltar som.
        </p>
      )}
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
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-brutal border transition-colors',
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
// A MINHA PARTIDA
// ============================================

/** Como a galera está apostando em MIM, e onde EU aposto em mim. */
function MyGameCard({
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
    <section className="overflow-hidden rounded-[10px] border border-burn/40 bg-surface-raised/40">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Chip tone="danger" className="font-semibold">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" aria-hidden />
          ao vivo
        </Chip>
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {detail || 'Sua partida'}
        </p>
        <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
          {formatClock(elapsed)}
        </span>
      </header>

      <div className="px-3 py-2.5">
        {game.pending ? (
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            O servidor ainda não registrou sua partida — a pool aparece em instantes.
          </p>
        ) : (
          <>
            <PoolBar pool={game.pool} thick />
            <p className="mt-1.5 text-center text-[11.5px] text-muted-foreground">
              {game.bettors === 0
                ? left
                  ? `Ninguém apostou em você ainda — fecha em ${left}.`
                  : 'Ninguém apostou em você.'
                : `${game.bettors} ${game.bettors === 1 ? 'pessoa apostou' : 'pessoas apostaram'} em você`}
            </p>
            <SelfBet game={game} coins={coins} wagerMin={wagerMin} now={now} />
          </>
        )}
      </div>
    </section>
  )
}

/**
 * APOSTAR EM MIM — o "aposto que eu ganho", direto de dentro do jogo.
 *
 * Só aparece enquanto a janela está aberta. Não há escolha de lado: apostar na
 * própria derrota seria pago pra intar, e o servidor recusa. O retorno vem da
 * odd da própria winrate, já calculada lá. O formulário é o mesmo da aposta no
 * colega (ver Bet.tsx), só sem o seletor de lado.
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
  if (game.myWager) {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-brutal border border-acid-dark/60 bg-acid/10 px-2.5 py-2 text-[11.5px] leading-snug text-foreground">
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-acid" aria-hidden />
        <span>
          Você apostou <span className="font-mono font-semibold text-acid-text">{game.myWager.amount}</span>{' '}
          em você — volta{' '}
          <span className="font-mono font-semibold text-acid-text">{game.myWager.potential}</span> se
          ganhar.
        </span>
      </p>
    )
  }

  const self = game.self
  if (!self) return null
  if (!countdown(self.closesAt, now)) return null

  return (
    <div className="mt-3 border-t border-line pt-3">
      <SectionTitle>aposte em você</SectionTitle>
      <BetComposer
        mode={{ kind: 'self', multiplier: self.multiplier }}
        min={wagerMin}
        max={self.maxAmount}
        coins={coins}
        bettors={game.bettors}
        closesAt={self.closesAt}
        now={now}
        windowMs={SELF_WINDOW_MS}
        onBet={(_side, amount) =>
          send({ type: 'bet', sessionId: self.sessionId, prediction: 'win', amount })
        }
      />
    </div>
  )
}

// ============================================
// PARTIDAS DO GRUPO
// ============================================

function TargetList({ state, now }: { state: OverlayState; now: number }) {
  /** Só um formulário aberto por vez — a janela tem 352px de largura. */
  const [openId, setOpenId] = React.useState<string | null>(null)

  if (state.targets.length === 0) {
    // Com a SUA partida na tela, "nenhuma partida" é só ruído embaixo dela.
    if (state.myGame) return null
    return (
      <Hint>
        Nenhuma partida do grupo aberta pra aposta agora. A janela é de 5 minutos: quando alguém
        entrar em jogo, aparece aqui.
      </Hint>
    )
  }

  return (
    <div>
      <SectionTitle
        aside={
          <span className="font-mono text-[11px] normal-case tracking-normal">
            {state.targets.length}
          </span>
        }
      >
        apostas do grupo
      </SectionTitle>
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
    </div>
  )
}

/**
 * Uma partida do grupo. Fechada é um resumo (quem, o quê, a pool, o relógio);
 * aberta vira o formulário. O título inteiro abre e fecha — alvo grande,
 * pra mão que está no meio de uma luta.
 */
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
  const urgent = left !== null && target.closesAt - now < URGENT_MS
  /** Há formulário pra abrir: ainda não apostei e a janela está de pé. */
  const canOpen = !target.myWager && left !== null

  const header = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-brutal border border-burn/40 bg-burn/10">
        <GameIcon className="h-4 w-4 text-burn" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold leading-tight text-foreground">
          {target.displayName}
          {target.squad.length > 0 && (
            <span className="font-normal text-muted-foreground"> +{target.squad.length}</span>
          )}
        </span>
        {detail && (
          <span className="mt-0.5 block truncate text-[11.5px] leading-tight text-muted-foreground">
            {detail}
          </span>
        )}
      </span>
      {left && (
        <Chip
          tone={urgent ? 'danger' : 'burn'}
          className={cn('font-mono tabular-nums', urgent && 'animate-pulse font-semibold')}
        >
          {left}
        </Chip>
      )}
      {canOpen && (
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180'
          )}
          aria-hidden
        />
      )}
    </>
  )

  return (
    <section
      className={cn(
        'rounded-[10px] border bg-surface-raised/40 p-2.5 transition-colors',
        open ? 'border-burn/50' : 'border-line'
      )}
    >
      {canOpen ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          title={open ? 'Fechar o formulário' : 'Apostar nesta partida'}
          className="-m-1 flex w-[calc(100%+0.5rem)] items-center gap-2.5 rounded-brutal p-1 text-left transition-colors hover:bg-surface-raised/60"
        >
          {header}
        </button>
      ) : (
        <header className="flex items-center gap-2.5">{header}</header>
      )}

      {/* A explicação do grupo só aparece com o formulário aberto: fechada, o
          "+N" do título já diz que há mais gente, e a frase custa uma linha
          em cada cartão de um painel que já é alto. */}
      {open && target.squad.length > 0 && (
        <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">
          Com {joinNames(target.squad)} — uma aposta vale por todos.
        </p>
      )}

      <PoolBar pool={target.pool} className="mt-2.5" />

      {target.myWager ? (
        <p className="mt-2.5 flex items-start gap-2 rounded-brutal border border-acid-dark/60 bg-acid/10 px-2.5 py-1.5 text-[11.5px] leading-snug text-foreground">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-acid" aria-hidden />
          <span>
            Você apostou <span className="font-mono font-semibold text-burn">{target.myWager.amount}</span>{' '}
            em{' '}
            <span
              className={target.myWager.prediction === 'win' ? 'text-acid-text' : 'text-destructive'}
            >
              {target.myWager.prediction === 'win' ? 'vitória' : 'derrota'}
            </span>
            {target.squad.length > 0 ? ' — vale pro grupo todo.' : '.'}
          </span>
        </p>
      ) : !left ? (
        // A janela fechou com o painel aberto. A linha some no próximo poll;
        // até lá, dizer que fechou é melhor que um botão que dá 409.
        <p className="mt-2.5 text-[11.5px] leading-snug text-muted-foreground">
          Aposta fechada — só nos 5 primeiros minutos da partida.
        </p>
      ) : open ? (
        <BetComposer
          className="mt-2.5"
          mode={{ kind: 'target' }}
          min={wagerMin}
          max={target.maxAmount}
          coins={coins}
          bettors={target.bettors}
          pool={target.pool}
          closesAt={target.closesAt}
          now={now}
          windowMs={TARGET_WINDOW_MS}
          onBet={(prediction, amount) =>
            send({ type: 'bet', sessionId: target.sessionId, prediction, amount })
          }
        />
      ) : (
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-brutal border px-2 py-1.5',
            'border-burn/40 text-xs font-medium text-burn transition-colors hover:bg-burn/10'
          )}
        >
          <MurchosIcon className="h-3.5 w-3.5" aria-hidden />
          Apostar
        </button>
      )}
    </section>
  )
}

// ============================================
// AVISO E RECENTES
// ============================================

/** As notificações de agora há pouco, dentro do painel. */
function RecentList({ toasts, now }: { toasts: OverlayToast[]; now: number }) {
  return (
    <section>
      <SectionTitle>agora há pouco</SectionTitle>
      <ul className="space-y-2">
        {toasts.map((toast) => {
          const { icon: Icon, tone, tile } = toastLook(toast.kind)
          return (
            <li key={`${toast.at}-${toast.title}`} className="flex items-start gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-brutal border',
                  tile
                )}
              >
                <Icon className={cn('h-3 w-3', tone)} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11.5px] font-medium leading-tight text-foreground">
                  {toast.title}
                </p>
                {toast.body && (
                  <p className="truncate text-[11.5px] leading-tight text-muted-foreground">
                    {toast.body}
                  </p>
                )}
              </div>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {ago(toast.at, now)}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Quanto o aviso de "apostou"/"deu erro" fica na tela. */
const NOTICE_TTL_MS = 6_000

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

  const ok = notice.kind === 'ok'

  return (
    <p
      className={cn(
        'ov-pop flex shrink-0 items-start gap-2 border-t px-3 py-2 text-[11.5px] leading-snug',
        ok
          ? 'border-acid-dark/40 bg-acid/10 text-acid-text'
          : 'border-destructive/40 bg-destructive/10 text-destructive'
      )}
    >
      {ok ? (
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
      {notice.text}
    </p>
  )
}
