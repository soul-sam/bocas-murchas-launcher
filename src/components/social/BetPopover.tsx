import * as React from 'react'
import { useTicker } from '@/lib/use-now'
import { Loader2, TrendingDown, TrendingUp, Swords, Pickaxe, Users } from 'lucide-react'
import { MurchosIcon, TrophyIcon } from '@/lib/bocas-icons'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { ApiError } from '@/lib/api'
import {
  WAGER_MAX,
  WAGER_MIN,
  WAGER_PAYOUT_MULTIPLIER,
  formatCompact,
  oddText,
  type MatchPlayer,
  type SelfWagerBoard,
  GROUP_BONUS_MIN_BETTORS,
  JACKPOT_MIN_BETTORS,
  groupBonusPreview,
  isTftQueue,
  tftOddsText,
  type WagerGroupBonus,
  type WagerHouse,
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
 * (`game.open`) e o teto pessoal (`game.maxAmount`, que sobe de 50 até 5000
 * conforme a pessoa aposta). Quando várias pessoas do grupo estão na MESMA
 * partida, o board já traz a aposta do grupo em `myWager` — uma aposta só
 * vale por todos, e o formulário nem aparece pros outros.
 *
 * NA PRÓPRIA PARTIDA o formulário muda de forma, porque as regras são outras
 * (ver SELF_WAGER no servidor): não há escolha de lado — é sempre vitória —,
 * a janela é a mesma de 5 min, e o retorno é a odd da própria winrate, que
 * vem pronta em `game.self.odds`. No colega a odd é a winrate DELE, com a
 * margem da Casa, e vem em `game.odds` (desde out/2026). O board de quem está na minha
 * partida mas não é minha sessão vem com `mine` e sem `self`: ali a aposta
 * não cabe, e o texto manda a pessoa apostar na própria.
 */
export function BetPopover({
  userId,
  sessionId,
  targetName,
  side = 'left',
  align = 'center',
  contentClassName,
  children
}: {
  /** Quem está jogando. Usado pra achar a partida quando não há sessionId. */
  userId: string
  /** Partida específica (cartão de aposta, seção ao vivo). */
  sessionId?: string
  targetName?: string
  side?: 'left' | 'right' | 'top' | 'bottom'
  align?: 'start' | 'center' | 'end'
  /**
   * Classe extra no painel. Existe por causa da CAMADA: o perfil em modal
   * vive em `z-perfil`, acima de `z-dialogo` (onde o popover nasce) — sem
   * subir o painel, apostar de dentro do perfil abria o formulário ATRÁS do
   * próprio perfil.
   */
  contentClassName?: string
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

  // Estou na mesma partida desse board? Então a aposta possível é em MIM, e
  // ela vive no board da MINHA sessão — o único do grupo que traz `self`.
  // Sem isso o popover mandava "aposte na sua vitória" sem dar onde.
  const ownBoard = React.useMemo(
    () =>
      game?.mine && !game.self
        ? liveGames.find(
            (g) => g.self && (g.matchId ?? g.session.id) === (game.matchId ?? game.session.id)
          )
        : undefined,
    [liveGames, game]
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
  const tft = isTftQueue(game.session.queue)

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side={side} align={align} className={cn('w-64 p-3', contentClassName)}>
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

        <PoolBars pool={game.pool} bonus={game.groupBonus} house={game.house} tft={tft} className="mb-3" />

        {game.myWager ? (
          <p className="rounded-brutal border border-burn/40 bg-burn/[0.06] px-2 py-1.5 text-xs text-foreground">
            Você já apostou{' '}
            <span className="font-mono text-burn">{game.myWager.amount}</span> murchos em{' '}
            <span className={game.myWager.prediction === 'win' ? 'text-acid' : 'text-destructive'}>
              {game.myWager.self
                ? 'você mesmo'
                : sideLabel(game.myWager.prediction, tft)}
            </span>
            {others.length > 0 ? ' nessa partida — vale pro grupo todo.' : '.'}
          </p>
        ) : game.mine && !game.self ? (
          ownBoard?.self?.open ? (
            <>
              <p className="mb-2 rounded-brutal border border-line bg-void/60 px-2 py-1.5 text-xs text-muted-foreground">
                Vocês estão na mesma partida: aqui a aposta é na SUA vitória, e
                ela cobre o jogo inteiro.
              </p>
              <BetForm
                sessionId={ownBoard.session.id}
                coins={profile?.coins ?? 0}
                max={ownBoard.self.maxAmount}
                closesAt={ownBoard.self.closesAt}
                self={ownBoard.self}
                tft={tft}
                onPlaced={() => setOpen(false)}
              />
            </>
          ) : (
            <p className="rounded-brutal border border-line bg-void/60 px-2 py-1.5 text-xs text-muted-foreground">
              Vocês estão na mesma partida. Aposta em si mesmo fechada: ela vale
              só nos 5 primeiros minutos.
            </p>
          )
        ) : game.self ? (
          game.self.open ? (
            <BetForm
              sessionId={game.session.id}
              coins={profile?.coins ?? 0}
              max={game.self.maxAmount}
              closesAt={game.self.closesAt}
              self={game.self}
              groupBonus={game.groupBonus}
              tft={tft}
              onPlaced={() => setOpen(false)}
            />
          ) : (
            <p className="rounded-brutal border border-line bg-void/60 px-2 py-1.5 text-xs text-muted-foreground">
              Aposta em si mesmo fechada. Ela vale só nos 5 primeiros minutos —
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
            odds={game.odds}
            limits={game.limits}
            houseCapped={game.houseCapped}
            closesAt={game.closesAt}
            groupBonus={game.groupBonus}
            tft={tft}
            onPlaced={() => setOpen(false)}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}

/** O lado do palpite em texto: vitória/derrota, ou top 4/bot 4 no TFT. */
export function sideLabel(prediction: string, tft?: boolean): string {
  if (tft) return prediction === 'win' ? 'top 4' : 'bot 4'
  return prediction === 'win' ? 'vitória' : 'derrota'
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
 *
 * `bonus` é o bônus de grupo de agora. Com uma pessoa só ainda é zero, e a
 * linha vira convite — é o que faz alguém chamar o resto do grupo pra apostar.
 */
export function PoolBars({
  pool,
  bonus,
  house,
  tft,
  className
}: {
  pool: WagerPool
  bonus?: WagerGroupBonus
  /** Cofre da casa: mostra o pote acumulado que a partida pode levar. */
  house?: WagerHouse
  /** Partida de TFT: os lados são top 4 × bot 4. */
  tft?: boolean
  className?: string
}) {
  const win = Math.max(0, pool?.win ?? 0)
  const loss = Math.max(0, pool?.loss ?? 0)
  const total = win + loss
  const winPct = total > 0 ? Math.round((win / total) * 100) : 50

  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between font-mono text-[11px] uppercase tracking-widest">
        <span className="flex items-center gap-1 text-acid-text">
          <TrendingUp className="h-2.5 w-2.5" />
          {sideLabel('win', tft)} · {formatCompact(win)}
        </span>
        <span className="flex items-center gap-1 text-destructive">
          {formatCompact(loss)} · {sideLabel('loss', tft)}
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
      {bonus && bonus.bettors > 0 && (
        <p className="mt-0.5 flex items-center justify-center gap-1 font-mono text-[11px] text-burn">
          <Users className="h-2.5 w-2.5" />
          {bonus.percent > 0
            ? `bônus de grupo +${bonus.percent}% · ${bonus.bettors} apostando`
            : `${GROUP_BONUS_MIN_BETTORS}+ apostando = bônus pra quem acertar`}
        </p>
      )}
      {house && house.jackpot > 0 && (
        <p
          className="mt-0.5 flex items-center justify-center gap-1 font-mono text-[11px] text-acid-text"
          title={`O pote sai quando ${JACKPOT_MIN_BETTORS} ou mais pessoas apostam na partida e todo mundo acerta. Ele cresce com o que é perdido em aposta.`}
        >
          <TrophyIcon className="h-2.5 w-2.5" />
          pote {formatCompact(house.jackpot)}
          {' · '}
          {(bonus?.bettors ?? 0) >= JACKPOT_MIN_BETTORS
            ? 'em jogo, se todo mundo acertar'
            : `sai com ${JACKPOT_MIN_BETTORS}+ apostando`}
        </p>
      )}
    </div>
  )
}

const PRESETS = [10, 50, 100]

/**
 * Formulário da aposta: lado + valor. Compartilhado com o cartão de aposta
 * no chat, por isso não sabe nada de popover.
 *
 * `max` é o teto PESSOAL vindo do servidor (rampa de 50 até 5000, cortada
 * pela folga da banca da Casa e pelo Banco). Sem ele cai no teto do sistema —
 * o servidor recusa de qualquer jeito, mas aí a pessoa só descobre depois de
 * clicar. `limits` traz o teto de cada palpite (a odd muda quanto lucro cabe
 * na banca); `odds`, quanto cada palpite paga no colega.
 */
export function BetForm({
  sessionId,
  coins,
  max = WAGER_MAX,
  odds,
  limits,
  houseCapped,
  closesAt,
  self,
  groupBonus,
  tft,
  onPlaced,
  className
}: {
  sessionId: string
  coins: number
  /** Teto pessoal desta aposta. */
  max?: number
  /** Quanto paga cada palpite no colega. Ausente = servidor antigo (2x). */
  odds?: { win: number; loss: number }
  /** Teto por palpite. Ausente = `max` pros dois. */
  limits?: { win: number; loss: number }
  /** O teto está abaixo da rampa porque a banca da Casa não cobre mais. */
  houseCapped?: boolean
  /** ISO do fim da janela, pro contador. */
  closesAt?: string
  /**
   * Presente = é a MINHA partida. Some o seletor de lado (só vitória) e o
   * retorno passa a sair da odd em vez do 2x.
   */
  self?: SelfWagerBoard
  /** Bônus de grupo de agora, pra prévia contar com a própria aposta. */
  groupBonus?: WagerGroupBonus
  /**
   * Partida de TFT: os lados viram top 4 / bot 4 e o retorno sai da colocação
   * (até 2x), inclusive em si mesmo — a odd da winrate não vale ali.
   */
  tft?: boolean
  onPlaced?: () => void
  className?: string
}) {
  const { placeWager } = useGamification()
  // Em si mesmo não existe lado: apostar na própria derrota é dinheiro de
  // graça, e o servidor recusa. O estado fica travado em 'win'.
  const [prediction, setPrediction] = React.useState<WagerPrediction>('win')
  // Sem piso: se a banca da Casa não cobre nem o mínimo, o formulário diz isso
  // em vez de oferecer um valor que o servidor vai recusar.
  const sideMax = self ? max : (limits?.[prediction] ?? max)
  const limit = Math.max(0, Math.min(WAGER_MAX, Math.floor(sideMax)))
  const noRoom = limit < WAGER_MIN
  const presets = React.useMemo(() => PRESETS.filter((p) => p <= limit), [limit])
  const [amount, setAmount] = React.useState<number>(presets[0] ?? WAGER_MIN)
  const [custom, setCustom] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const left = useCountdown(closesAt)
  const expired = Boolean(closesAt) && left === null

  const value = custom ? Number(custom) : amount
  /** O teto ou tudo que a pessoa tem, o que for menor. */
  const maxBet = Math.min(limit, Math.floor(coins))
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

  const sideOdd = (side: WagerPrediction): number => odds?.[side] ?? WAGER_PAYOUT_MULTIPLIER
  const payout = tft
    ? value * 2
    : self
      ? Math.round(value * self.odds.multiplier)
      : Math.round(value * sideOdd(prediction))
  // Quem abre o formulário ainda não apostou: a aposta dele é mais uma pessoa.
  const bonus = groupBonusPreview(value, (groupBonus?.bettors ?? 0) + 1)

  return (
    <div className={cn('space-y-2', className)}>
      {self ? (
        <div className="rounded-brutal border border-acid-dark/60 bg-acid/[0.06] px-2 py-1.5">
          <h3 className="flex items-center justify-between font-mono text-[11px] font-normal uppercase tracking-widest">
            <span className="flex items-center gap-1 text-acid-text">
              <TrendingUp className="h-2.5 w-2.5" />
              {tft ? 'seu top 4' : 'sua vitória'}
            </span>
            <span className="text-burn">{tft ? 'até 2x' : oddText(self.odds.multiplier)}</span>
          </h3>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            {tft
              ? 'Paga pela colocação, igual pra todo mundo.'
              : self.odds.sample > 0
              ? `${self.odds.wins}/${self.odds.sample} vitórias recentes — quanto melhor você joga, menos a aposta paga.`
              : 'Sem histórico ainda: odd de moeda (com a margem da Casa) e teto menor.'}
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
            {sideLabel('win', tft)}
            {!tft && odds && <span className="ml-1 normal-case opacity-80">{oddText(odds.win)}</span>}
          </SideButton>
          <SideButton
            active={prediction === 'loss'}
            tone="destructive"
            onClick={() => setPrediction('loss')}
            icon={<TrendingDown className="h-3 w-3" />}
          >
            {sideLabel('loss', tft)}
            {!tft && odds && <span className="ml-1 normal-case opacity-80">{oddText(odds.loss)}</span>}
          </SideButton>
        </div>
      )}

      {noRoom && (
        <p className="rounded-brutal border border-line bg-void/60 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
          {houseCapped
            ? 'A banca da Casa está sem folga pra esse palpite agora: ela só aceita o lucro que consegue pagar. O fechamento de domingo reabastece.'
            : 'Quem está com empréstimo vencido no Banco da Casa não aposta até quitar.'}
        </p>
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
        {/* O teto é PESSOAL e sobe até 5000: o campo aceita os dígitos dele (era
            fixo em 3, e ninguém passava de 999), e o que passar vira o teto. */}
        <input
          type="number"
          min={WAGER_MIN}
          max={limit}
          value={custom}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, '').slice(0, String(limit).length)
            setCustom(digits && Number(digits) > limit ? String(limit) : digits)
          }}
          placeholder="outro"
          className={cn(
            'input-terminal w-16 rounded-brutal px-1 py-1 text-center text-[11.5px]',
            custom && !valid && 'border-destructive'
          )}
        />
        {maxBet >= WAGER_MIN && (
          <button
            type="button"
            title={`Tudo que dá: ${maxBet}`}
            onClick={() => setCustom(String(maxBet))}
            className={cn(
              'rounded-brutal border px-1.5 py-1 font-mono text-[11.5px] uppercase transition-colors',
              custom === String(maxBet)
                ? 'border-burn bg-burn/15 text-burn'
                : 'border-line text-muted-foreground hover:border-burn/50 hover:text-foreground'
            )}
          >
            máx
          </button>
        )}
      </div>

      <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        <span className="flex items-center gap-1">
          <MurchosIcon className="h-2.5 w-2.5 text-burn" />
          você tem {formatCompact(coins)}
        </span>
        <span
          title={
            houseCapped
              ? 'Teto da banca da Casa: ela só aceita o lucro que consegue pagar'
              : limit < WAGER_MAX
                ? `Seu teto sobe a cada aposta, até ${WAGER_MAX}`
                : undefined
          }
        >
          {WAGER_MIN}–{limit}
          {limit < WAGER_MAX && !houseCapped && <span className="text-burn"> ↑</span>}
        </span>
      </div>

      {tft && (
        <p className="text-center font-mono text-[11px] leading-snug text-muted-foreground">
          {tftOddsText(self ? 'win' : prediction)}
        </p>
      )}

      {valid && (
        <p className="text-center font-mono text-[11px] text-muted-foreground">
          {tft ? 'volta até ' : 'se ganhar volta '}
          <span className="text-acid-text">{payout}</span>
          {bonus > 0 && (
            <span
              className="text-burn"
              title="Bônus de grupo com quem já apostou mais você. Cresce se mais gente entrar, e sai do cofre da casa."
            >
              {' '}+ {bonus} do grupo
            </span>
          )}
          {self && !tft && <span className="text-muted-foreground"> · perde tudo se não ganhar</span>}
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
      {!error && custom !== '' && value > limit && !noRoom && (
        <p className="text-xs text-destructive">
          {houseCapped
            ? `A banca da Casa cobre até ${limit} nesse palpite agora.`
            : `Seu teto agora é ${limit}. Ele sobe a cada aposta, até ${WAGER_MAX}.`}
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
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <MurchosIcon className="h-3 w-3" />}
        apostar {valid ? value : '—'} em{' '}
        {self ? 'mim' : sideLabel(prediction, tft)}
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
