import * as React from 'react'
import { useTicker } from '@/lib/use-now'
import { Coins, Loader2, TrendingDown, TrendingUp, Swords, Pickaxe } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { ApiError } from '@/lib/api'
import {
  WAGER_MAX,
  WAGER_MIN,
  formatCompact,
  type MatchPlayer,
  type SelfWagerBoard,
  type WagerPool,
  type WagerPrediction
} from '@/lib/api-gamification'
import { useGamification } from '@/lib/gamification-context'
import { queueLabel } from '@/lib/activity-context'
import { cn } from '@/lib/utils'

/**
 * Apostar murchos na partida de alguém.
 *
 * Popover NÃO modal de propósito: ele abre de dentro da lista de membros e
 * do cartão de perfil, e a pessoa pode ficar offline (ou a partida acabar)
 * com ele aberto. Camada modal arrancada da árvore trava o <body> — ver
 * lib/interaction-guard.ts.
 *
 * A partida vem de `liveGames` (poll do /wagers/live). Se a pessoa está em
 * jogo mas o servidor ainda não registrou a sessão, o gatilho fica
 * desabilitado com o motivo no tooltip — em vez de abrir um formulário que
 * vai falhar.
 *
 * Duas travas vêm do servidor e são só espelhadas aqui: a janela de 5 min
 * (`game.open`) e o teto pessoal (`game.maxAmount`, que sobe de 50 até 500
 * conforme a pessoa aposta). Quando várias pessoas do grupo estão na MESMA
 * partida, o board já traz a aposta do grupo em `myWager` — uma aposta só
 * vale por todos, e o formulário nem aparece pros outros.
 *
 * NA PRÓPRIA PARTIDA o formulário muda de forma, porque as regras são outras
 * (ver SELF_WAGER no servidor): não há escolha de lado — é sempre vitória —,
 * a janela é de 3 min e não 5, e o retorno não é 2x fixo, é a odd da própria
 * winrate, que vem pronta em `game.self.odds`. O board de quem está na minha
 * partida mas não é minha sessão vem com `mine` e sem `self`: ali a aposta
 * não cabe, e o texto manda a pessoa apostar na própria.
 */
export function BetPopover({
  userId,
  sessionId,
  targetName,
  side = 'left',
  align = 'center',
  children
}: {
  /** Quem está jogando. Usado pra achar a partida quando não há sessionId. */
  userId: string
  /** Partida específica (cartão de aposta, seção ao vivo). */
  sessionId?: string
  targetName?: string
  side?: 'left' | 'right' | 'top' | 'bottom'
  align?: 'start' | 'center' | 'end'
  /** O gatilho — um <button>. */
  children: React.ReactElement
}) {
  const { liveGames, refreshLiveGames, profile } = useGamification()
  const [open, setOpen] = React.useState(false)

  const game = React.useMemo(
    () =>
      liveGames.find((g) =>
        sessionId ? g.session.id === sessionId : g.session.userId === userId
      ),
    [liveGames, sessionId, userId]
  )

  // Abrir rebusca: a pool pode ter mudado desde o último poll de 30s.
  React.useEffect(() => {
    if (open) void refreshLiveGames()
  }, [open, refreshLiveGames])

  if (!game) {
    return React.cloneElement(children, {
      disabled: true,
      title: 'Partida ainda não registrada no servidor — tenta de novo em instantes'
    } as Record<string, unknown>)
  }

  const name = targetName ?? game.session.user?.displayName ?? 'essa pessoa'
  const GameIcon = game.session.game === 'minecraft' ? Pickaxe : Swords
  const detail = [game.session.champion, queueLabel(game.session.queue ?? undefined)]
    .filter(Boolean)
    .join(' · ')
  const others = (game.players ?? []).filter((p) => p.userId !== game.session.userId)

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-64 p-3">
        <header className="mb-2 flex items-start gap-2">
          <GameIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-burn" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm leading-tight text-foreground">
              Apostar em {name}
            </p>
            {detail && (
              <p className="truncate text-[11px] text-muted-foreground">
                {detail}
              </p>
            )}
          </div>
        </header>

        <SquadNote players={others} className="mb-2" />

        <PoolBars pool={game.pool} className="mb-3" />

        {game.myWager ? (
          <p className="rounded-brutal border border-burn/40 bg-burn/[0.06] px-2 py-1.5 text-xs text-foreground">
            Você já apostou{' '}
            <span className="font-mono text-burn">{game.myWager.amount}</span> murchos em{' '}
            <span className={game.myWager.prediction === 'win' ? 'text-acid' : 'text-destructive'}>
              {game.myWager.self
                ? 'você mesmo'
                : game.myWager.prediction === 'win'
                  ? 'vitória'
                  : 'derrota'}
            </span>
            {others.length > 0 ? ' nessa partida — vale pro grupo todo.' : '.'}
          </p>
        ) : game.mine && !game.self ? (
          <p className="rounded-brutal border border-line bg-void/60 px-2 py-1.5 text-xs text-muted-foreground">
            Vocês estão na mesma partida. Aposte na SUA vitória — é uma aposta
            só e ela cobre o jogo inteiro.
          </p>
        ) : game.self ? (
          game.self.open ? (
            <BetForm
              sessionId={game.session.id}
              coins={profile?.coins ?? 0}
              max={game.self.maxAmount}
              closesAt={game.self.closesAt}
              self={game.self}
              onPlaced={() => setOpen(false)}
            />
          ) : (
            <p className="rounded-brutal border border-line bg-void/60 px-2 py-1.5 text-xs text-muted-foreground">
              Aposta em si mesmo fechada. Ela vale só nos 3 primeiros minutos —
              depois disso você já sabe demais.
            </p>
          )
        ) : !game.open ? (
          <p className="rounded-brutal border border-line bg-void/60 px-2 py-1.5 text-xs text-muted-foreground">
            Aposta fechada. Só dá nos 5 primeiros minutos da partida.
          </p>
        ) : (
          <BetForm
            sessionId={game.session.id}
            coins={profile?.coins ?? 0}
            max={game.maxAmount}
            closesAt={game.closesAt}
            onPlaced={() => setOpen(false)}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * "Fulano e Beltrano também estão nessa partida." Aparece só quando mais de
 * uma pessoa do grupo está no mesmo jogo — pra deixar claro que a aposta é
 * uma só e cobre todo mundo.
 */
function SquadNote({ players, className }: { players: MatchPlayer[]; className?: string }) {
  if (players.length === 0) return null
  const names = players.map((p) => p.displayName)
  const who =
    names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : names[0]

  return (
    <p
      className={cn(
        'rounded-brutal border border-line bg-void/60 px-2 py-1.5 text-[11px] text-muted-foreground',
        className
      )}
    >
      {who} {names.length > 1 ? 'estão' : 'está'} na mesma partida. Uma aposta só, vale por todos.
    </p>
  )
}

/** mm:ss até `iso`, ou null se já passou. */
function useCountdown(iso?: string): string | null {
  const now = useTicker(1000, Boolean(iso))

  if (!iso) return null
  const left = new Date(iso).getTime() - now
  if (!Number.isFinite(left) || left <= 0) return null
  const total = Math.floor(left / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Barras de vitória × derrota da pool. Proporcionais ao total apostado de
 * cada lado; pool vazia mostra os dois lados iguais e apagados.
 */
export function PoolBars({ pool, className }: { pool: WagerPool; className?: string }) {
  const win = Math.max(0, pool?.win ?? 0)
  const loss = Math.max(0, pool?.loss ?? 0)
  const total = win + loss
  const winPct = total > 0 ? Math.round((win / total) * 100) : 50

  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between font-mono text-[11px] uppercase tracking-widest">
        <span className="flex items-center gap-1 text-acid-text">
          <TrendingUp className="h-2.5 w-2.5" />
          vitória · {formatCompact(win)}
        </span>
        <span className="flex items-center gap-1 text-destructive">
          {formatCompact(loss)} · derrota
          <TrendingDown className="h-2.5 w-2.5" />
        </span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-brutal bg-surface-raised">
        <div
          className={cn('h-full transition-[width] duration-500', total > 0 ? 'bg-acid' : 'bg-acid/30')}
          style={{ width: `${winPct}%` }}
        />
        <div
          className={cn('h-full transition-[width] duration-500', total > 0 ? 'bg-destructive' : 'bg-destructive/30')}
          style={{ width: `${100 - winPct}%` }}
        />
      </div>
      <p className="mt-1 text-center font-mono text-[11px] text-muted-foreground">
        {total > 0 ? `pool ${formatCompact(total)} murchos` : 'ninguém apostou ainda'}
      </p>
    </div>
  )
}

const PRESETS = [10, 50, 100]

/**
 * Formulário da aposta: lado + valor. Compartilhado com o cartão de aposta
 * no chat, por isso não sabe nada de popover.
 *
 * `max` é o teto PESSOAL vindo do servidor (rampa de 50 até 500). Sem ele
 * cai no teto do sistema — o servidor recusa de qualquer jeito, mas aí a
 * pessoa só descobre depois de clicar.
 */
export function BetForm({
  sessionId,
  coins,
  max = WAGER_MAX,
  closesAt,
  self,
  onPlaced,
  className
}: {
  sessionId: string
  coins: number
  /** Teto pessoal desta aposta. */
  max?: number
  /** ISO do fim da janela, pro contador. */
  closesAt?: string
  /**
   * Presente = é a MINHA partida. Some o seletor de lado (só vitória) e o
   * retorno passa a sair da odd em vez do 2x.
   */
  self?: SelfWagerBoard
  onPlaced?: () => void
  className?: string
}) {
  const { placeWager } = useGamification()
  const limit = Math.min(WAGER_MAX, Math.max(WAGER_MIN, Math.floor(max)))
  const presets = React.useMemo(() => PRESETS.filter((p) => p <= limit), [limit])
  // Em si mesmo não existe lado: apostar na própria derrota é dinheiro de
  // graça, e o servidor recusa. O estado fica travado em 'win'.
  const [prediction, setPrediction] = React.useState<WagerPrediction>('win')
  const [amount, setAmount] = React.useState<number>(presets[0] ?? WAGER_MIN)
  const [custom, setCustom] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const left = useCountdown(closesAt)
  const expired = Boolean(closesAt) && left === null

  const value = custom ? Number(custom) : amount
  const valid = Number.isInteger(value) && value >= WAGER_MIN && value <= limit
  const affordable = value <= coins
  const canSubmit = valid && affordable && !busy && !expired

  const submit = async (): Promise<void> => {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await placeWager(sessionId, prediction, value)
      onPlaced?.()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 402 ? 'Murchos insuficientes.' : err.message)
      } else {
        setError('Não deu pra apostar agora.')
      }
    } finally {
      setBusy(false)
    }
  }

  const payout = self ? Math.round(value * self.odds.multiplier) : value * 2

  return (
    <div className={cn('space-y-2', className)}>
      {self ? (
        <div className="rounded-brutal border border-acid-dark/60 bg-acid/[0.06] px-2 py-1.5">
          <p className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest">
            <span className="flex items-center gap-1 text-acid-text">
              <TrendingUp className="h-2.5 w-2.5" />
              sua vitória
            </span>
            <span className="text-burn">{self.odds.multiplier.toFixed(2)}x</span>
          </p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            {self.odds.sample > 0
              ? `${self.odds.wins}/${self.odds.sample} vitórias recentes — quanto melhor você joga, menos a aposta paga.`
              : 'Sem histórico ainda: paga o dobro, com teto menor.'}
          </p>
        </div>
      ) : (
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
      )}

      <div className="flex items-center gap-1">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => {
              setAmount(preset)
              setCustom('')
            }}
            className={cn(
              'flex-1 rounded-brutal border px-1 py-1 font-mono text-[11.5px] transition-colors',
              !custom && amount === preset
                ? 'border-burn bg-burn/15 text-burn'
                : 'border-line text-muted-foreground hover:border-burn/50 hover:text-foreground'
            )}
          >
            {preset}
          </button>
        ))}
        <input
          type="number"
          min={WAGER_MIN}
          max={limit}
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
          placeholder="outro"
          className={cn(
            'input-terminal w-14 rounded-brutal px-1 py-1 text-center text-[11.5px]',
            custom && !valid && 'border-destructive'
          )}
        />
      </div>

      <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        <span className="flex items-center gap-1">
          <Coins className="h-2.5 w-2.5 text-burn" />
          você tem {formatCompact(coins)}
        </span>
        <span title={limit < WAGER_MAX ? 'Seu teto sobe a cada aposta, até 500' : undefined}>
          {WAGER_MIN}–{limit}
          {limit < WAGER_MAX && <span className="text-burn"> ↑</span>}
        </span>
      </div>

      {valid && (
        <p className="text-center font-mono text-[11px] text-muted-foreground">
          se ganhar volta <span className="text-acid-text">{payout}</span>
          {self && <span className="text-muted-foreground"> · perde tudo se não ganhar</span>}
        </p>
      )}

      {closesAt && (
        <p className="text-center text-[11px] text-muted-foreground">
          {left ? (
            <>
              fecha em <span className="font-mono text-burn">{left}</span>
            </>
          ) : (
            'janela de aposta fechada'
          )}
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
      {!error && valid && !affordable && (
        <p className="text-xs text-destructive">Não tem murchos pra isso.</p>
      )}
      {!error && custom !== '' && value > limit && (
        <p className="text-xs text-destructive">
          Seu teto agora é {limit}. Ele sobe a cada aposta, até {WAGER_MAX}.
        </p>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={!canSubmit}
        className={cn(
          'flex w-full items-center justify-center gap-1.5 rounded-brutal border-2 px-2 py-1.5',
          'font-mono text-[11.5px] uppercase tracking-widest transition-colors',
          prediction === 'win'
            ? 'border-acid-dark bg-acid/15 text-acid hover:bg-acid/25'
            : 'border-destructive/60 bg-destructive/15 text-destructive hover:bg-destructive/25',
          'disabled:cursor-not-allowed disabled:opacity-40'
        )}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Coins className="h-3 w-3" />}
        apostar {valid ? value : '—'} em{' '}
        {self ? 'mim' : prediction === 'win' ? 'vitória' : 'derrota'}
      </button>
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
        'flex items-center justify-center gap-1 rounded-brutal border px-2 py-1.5 font-mono text-[11.5px] uppercase tracking-widest transition-colors',
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
