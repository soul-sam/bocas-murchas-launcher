import * as React from 'react'
import { Coins, Gift, Loader2, Search, ShoppingCart, Tag, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/ui/avatar'
import { ApiError, resolveAssetUrl } from '@/lib/api'
import { DEFAULT_NAME_COLOR } from '@/lib/api-gamification'
import { formatSeconds, printApi, type HourListing, type MarketPerson, type PrintQuota } from '@/lib/api-print'
import { useAuth } from '@/lib/auth-context'
import { useGamification } from '@/lib/gamification-context'
import { useSocket } from '@/lib/socket-context'
import { cn } from '@/lib/utils'

/**
 * MERCADO DE HORAS: quem não vai imprimir esta semana vende (a preço livre,
 * em murchos) ou doa. Hora comprada vale até o reset de sexta 18:00 — a
 * tela repete isso perto de todo botão, porque é a parte que surpreende.
 *
 * O anúncio é "mole": não trava as horas do vendedor. O que aparece à venda
 * é o que ele tem AGORA; o servidor reconfere na compra e devolve "sobrou só
 * X" se mudou.
 */

const STEP = 1800
const NOTICE_MS = 6000
const EXPIRY_NOTE = 'Vale até sexta 18:00. Hora não usada não volta e não estorna.'

/** Opções de quantidade em passos de 30 min até `max`. */
function stepOptions(max: number): number[] {
  const out: number[] = []
  for (let s = STEP; s <= max; s += STEP) out.push(s)
  return out
}

function priceFor(seconds: number, pricePerHour: number): number {
  return Math.ceil((seconds * pricePerHour) / 3600)
}

/** Maior opção que não passa de `wanted` (ou a primeira, se nenhuma). */
function clampOption(options: number[], wanted: number): number {
  const fit = options.filter((s) => s <= wanted)
  return fit.length > 0 ? fit[fit.length - 1] : options[0] ?? 0
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

type OnDone = (message: string) => void

export function HourMarket({ quota }: { quota: PrintQuota }) {
  const { token, user } = useAuth()
  const { socket } = useSocket()
  const { profile } = useGamification()
  const coins = profile?.coins ?? 0

  const [listings, setListings] = React.useState<HourListing[]>([])
  const [mine, setMine] = React.useState<HourListing | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      const view = await printApi.market(token)
      setListings(view.listings)
      setMine(view.mine)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra carregar o mercado')
    } finally {
      setLoading(false)
    }
  }, [token])

  React.useEffect(() => { void load() }, [load])
  React.useEffect(() => {
    if (!socket) return
    const onChange = () => { void load() }
    socket.on('print:market', onChange)
    return () => { socket.off('print:market', onChange) }
  }, [socket, load])

  // Aviso de sucesso some sozinho; o timer morre junto se o aviso mudar.
  React.useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  const onDone = React.useCallback<OnDone>((message) => {
    setNotice(message)
    void load()
  }, [load])

  return (
    <div className="card-gradient rounded-brutal p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="font-display text-sm uppercase tracking-wider text-foreground">
          Mercado de horas
        </span>
        <span className="text-[11.5px] text-muted-foreground">hora desta semana, vale até sexta 18:00</span>
      </div>

      <p className="mb-3 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
        <Coins className="h-3.5 w-3.5 text-acid" aria-hidden />
        você tem <span className="text-foreground">{coins.toLocaleString('pt-BR')}</span> murchos
      </p>

      {notice && (
        <p className="mb-3 rounded-brutal border border-acid-dark/60 bg-acid/10 px-3 py-1.5 text-xs text-acid-text">
          {notice}
        </p>
      )}
      {error && (
        <p className="mb-3 rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          carregando o mercado…
        </div>
      ) : (
        <div className="space-y-4">
          <MyListing mine={mine} quota={quota} onDone={onDone} />
          <Board listings={listings} myId={user?.id} coins={coins} onDone={onDone} onStale={load} />
          <Donate quota={quota} onDone={onDone} />
        </div>
      )}
    </div>
  )
}

function SectionTitle({ icon: Icon, children }: { icon: typeof Tag; children: React.ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {children}
    </p>
  )
}

// ============================================
// MEU ANÚNCIO
// ============================================

function MyListing({ mine, quota, onDone }: { mine: HourListing | null; quota: PrintQuota; onDone: OnDone }) {
  const { token } = useAuth()
  const options = stepOptions(quota.availableSeconds)

  const [editing, setEditing] = React.useState(false)
  const [seconds, setSeconds] = React.useState(0)
  const [price, setPrice] = React.useState('10')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const pricePerHour = Number(price)
  const priceValid = Number.isInteger(pricePerHour) && pricePerHour >= 1

  function openForm(): void {
    // Editar reabre o form com o que já está anunciado.
    setSeconds(clampOption(options, mine ? mine.secondsLeft : options[0] ?? 0))
    setPrice(String(mine?.pricePerHour ?? 10))
    setError(null)
    setEditing(true)
  }

  async function run(action: () => Promise<{ message: string }>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const res = await action()
      setEditing(false)
      onDone(res.message)
    } catch (err) {
      setError(errorText(err, 'Não deu pra mexer no anúncio'))
    } finally {
      setBusy(false)
    }
  }

  const form = editing && (
    options.length === 0 ? (
      <div className="space-y-2 rounded-brutal border border-line bg-void/40 p-3">
        <p className="text-xs text-muted-foreground">Você não tem 30 min sobrando pra anunciar.</p>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Fechar
        </Button>
      </div>
    ) : (
      <div className="space-y-2 rounded-brutal border border-acid-dark/60 bg-acid/5 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select
            value={seconds}
            onChange={(event) => setSeconds(Number(event.target.value))}
            className="input-terminal rounded-brutal px-2 py-1.5 text-sm"
            aria-label="Quanto vender"
            disabled={busy}
          >
            {options.map((s) => (
              <option key={s} value={s}>
                {formatSeconds(s)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              step={1}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className="input-terminal w-24 rounded-brutal px-2 py-1.5 text-sm"
              aria-label="Murchos por hora"
              disabled={busy}
            />
            <span className="text-xs text-muted-foreground">murchos por hora</span>
          </label>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {priceValid
            ? `${formatSeconds(seconds)} a ${pricePerHour}/h = ${priceFor(seconds, pricePerHour).toLocaleString('pt-BR')} murchos`
            : 'preço tem que ser um número inteiro, 1 ou mais'}
        </p>
        <p className="text-[11.5px] text-muted-foreground">
          Você continua podendo imprimir; o que vender sai da sua cota até sexta 18:00.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="btn-acid"
            disabled={busy || !priceValid || seconds <= 0}
            onClick={() => void run(() => printApi.upsertListing(token, { seconds, pricePerHour }))}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Anunciar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
            Voltar
          </Button>
          {error && <span className="text-[11.5px] text-destructive">{error}</span>}
        </div>
      </div>
    )
  )

  return (
    <section>
      <SectionTitle icon={Tag}>Meu anúncio</SectionTitle>

      {mine && !editing && (
        <div className="rounded-brutal border border-line bg-void/40 px-3 py-2">
          <div className="grid grid-cols-3 gap-3 font-mono text-xs">
            <div>
              <div className="text-sm font-bold text-foreground">{formatSeconds(mine.secondsLeft)}</div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">teto</div>
            </div>
            <div>
              <div className={cn('text-sm font-bold', mine.forSaleSeconds > 0 ? 'text-acid' : 'text-muted-foreground')}>
                {formatSeconds(mine.forSaleSeconds)}
              </div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">à venda agora</div>
            </div>
            <div>
              <div className="text-sm font-bold text-foreground">{mine.pricePerHour}/h</div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">murchos</div>
            </div>
          </div>
          {mine.forSaleSeconds === 0 && (
            <p className="mt-2 text-[11.5px] text-burn">nada à venda agora — suas peças na fila ocupam as horas</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={openForm}>
              Editar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/15"
              disabled={busy}
              onClick={() => void run(() => printApi.cancelListing(token))}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Cancelar anúncio
            </Button>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {error && <span className="text-[11.5px] text-destructive">{error}</span>}
          </div>
        </div>
      )}

      {!mine && !editing && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={openForm}>
            <Tag className="mr-1.5 h-3.5 w-3.5" />
            Vender horas
          </Button>
          <span className="text-[11.5px] text-muted-foreground">
            não vai imprimir esta semana? põe suas horas à venda
          </span>
        </div>
      )}

      {form}
    </section>
  )
}

// ============================================
// MURAL
// ============================================

function Board({
  listings,
  myId,
  coins,
  onDone,
  onStale
}: {
  listings: HourListing[]
  myId: string | undefined
  coins: number
  onDone: OnDone
  /** Recarrega a lista quando o servidor diz que o anúncio mudou (409). */
  onStale: () => Promise<void>
}) {
  return (
    <section>
      <SectionTitle icon={ShoppingCart}>À venda</SectionTitle>
      {listings.length === 0 ? (
        <p className="text-xs text-muted-foreground">Ninguém está vendendo horas esta semana.</p>
      ) : (
        <ul className="space-y-2">
          {listings.map((listing) => (
            <ListingRow
              key={listing.id}
              listing={listing}
              isMine={listing.seller.id === myId}
              coins={coins}
              onDone={onDone}
              onStale={onStale}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function ListingRow({
  listing,
  isMine,
  coins,
  onDone,
  onStale
}: {
  listing: HourListing
  isMine: boolean
  coins: number
  onDone: OnDone
  onStale: () => Promise<void>
}) {
  const { token } = useAuth()
  const options = stepOptions(listing.forSaleSeconds)
  const [picked, setPicked] = React.useState(options[0] ?? 0)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // O que está à venda muda por fora (outra compra, fila do vendedor): a
  // quantidade escolhida não pode ficar acima do que sobrou.
  const seconds = options.includes(picked) ? picked : clampOption(options, picked)
  const total = priceFor(seconds, listing.pricePerHour)
  const missing = total - coins

  async function buy(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const res = await printApi.buyHours(token, listing.id, seconds)
      onDone(res.message)
    } catch (err) {
      // 409 (sobrou só X / sem horas / já fechou) e 402 (faltam N murchos)
      // vêm com a frase pronta do servidor.
      setError(errorText(err, 'Não deu pra comprar agora'))
      if (err instanceof ApiError && err.status === 409) void onStale()
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-brutal border border-line bg-void/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Person person={listing.seller} />
        {isMine && (
          <span className="rounded-brutal border border-acid-dark/60 px-1.5 text-[11px] uppercase tracking-wider text-acid-text">
            seu
          </span>
        )}
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          à venda: <span className="text-foreground">{formatSeconds(listing.forSaleSeconds)}</span>
          {' · '}
          <span className="text-acid">{listing.pricePerHour}</span> murchos/h
        </span>
      </div>

      {!isMine &&
        (options.length === 0 ? (
          <p className="mt-2 text-[11.5px] text-muted-foreground">nada à venda agora — volta daqui a pouco</p>
        ) : (
          <div className="mt-2 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={seconds}
                onChange={(event) => setPicked(Number(event.target.value))}
                className="input-terminal rounded-brutal px-2 py-1 text-sm"
                aria-label="Quanto comprar"
                disabled={busy}
              >
                {options.map((s) => (
                  <option key={s} value={s}>
                    {formatSeconds(s)}
                  </option>
                ))}
              </select>
              <Button size="sm" className="btn-acid" disabled={busy || missing > 0} onClick={() => void buy()}>
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                )}
                Comprar por {total.toLocaleString('pt-BR')} murchos
              </Button>
              {missing > 0 && (
                <span className="text-[11.5px] text-destructive">faltam {missing.toLocaleString('pt-BR')} murchos</span>
              )}
            </div>
            <p className="text-[11.5px] text-muted-foreground">{EXPIRY_NOTE}</p>
            {error && <p className="text-[11.5px] text-destructive">{error}</p>}
          </div>
        ))}
    </li>
  )
}

function Person({ person }: { person: MarketPerson }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <UserAvatar
        src={resolveAssetUrl(person.avatar)}
        name={person.displayName}
        ringColor={person.profileColor ?? DEFAULT_NAME_COLOR}
        className="h-7 w-7 border"
      />
      <span className="truncate text-sm" style={{ color: person.profileColor ?? undefined }}>
        {person.displayName}
      </span>
    </span>
  )
}

// ============================================
// DOAR
// ============================================

function Donate({ quota, onDone }: { quota: PrintQuota; onDone: OnDone }) {
  const { token, user } = useAuth()
  const options = stepOptions(quota.availableSeconds)

  const [open, setOpen] = React.useState(false)
  const [people, setPeople] = React.useState<MarketPerson[] | null>(null)
  const [query, setQuery] = React.useState('')
  const [pickedPerson, setPickedPerson] = React.useState<MarketPerson | null>(null)
  const [picked, setPicked] = React.useState(STEP)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const seconds = options.includes(picked) ? picked : clampOption(options, picked)

  const canDonate = options.length > 0

  // A lista de quem pode receber só é buscada quando o form abre.
  React.useEffect(() => {
    if (!open || !canDonate) return
    let alive = true
    setPeople(null)
    printApi
      .marketPeople(token)
      .then((res) => { if (alive) setPeople(res.people) })
      .catch((err: unknown) => {
        if (!alive) return
        setPeople([])
        setError(errorText(err, 'Não deu pra carregar a galera'))
      })
    return () => { alive = false }
  }, [open, canDonate, token])

  const needle = query.trim().toLowerCase()
  const candidates = (people ?? [])
    .filter((p) => p.id !== user?.id)
    .filter((p) => !needle || p.displayName.toLowerCase().includes(needle))

  function close(): void {
    setOpen(false)
    setQuery('')
    setPickedPerson(null)
    setError(null)
  }

  async function send(): Promise<void> {
    if (!pickedPerson) return
    setBusy(true)
    setError(null)
    try {
      const res = await printApi.donateHours(token, { toUserId: pickedPerson.id, seconds })
      close()
      onDone(res.message)
    } catch (err) {
      setError(errorText(err, 'Não deu pra doar agora'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <SectionTitle icon={Gift}>Doar</SectionTitle>

      {!open ? (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <Gift className="mr-1.5 h-3.5 w-3.5" />
          Doar horas
        </Button>
      ) : !canDonate ? (
        <div className="space-y-2 rounded-brutal border border-line bg-void/40 p-3">
          <p className="text-xs text-muted-foreground">Você não tem 30 min sobrando pra doar.</p>
          <Button size="sm" variant="ghost" onClick={close}>
            Fechar
          </Button>
        </div>
      ) : (
        <div className="space-y-2 rounded-brutal border border-acid-dark/60 bg-acid/5 p-3">
          <label className="flex items-center gap-2 rounded-brutal border border-line bg-void px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="pra quem?"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>

          <div className="max-h-56 overflow-y-auto pr-1">
            {people === null ? (
              <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                carregando…
              </div>
            ) : candidates.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">Ninguém com esse nome.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {candidates.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setPickedPerson(p)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-brutal border px-2 py-1.5 text-left transition-colors',
                        pickedPerson?.id === p.id ? 'border-acid bg-acid/10' : 'border-transparent hover:border-line'
                      )}
                    >
                      <Person person={p} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={seconds}
              onChange={(event) => setPicked(Number(event.target.value))}
              className="input-terminal rounded-brutal px-2 py-1 text-sm"
              aria-label="Quanto doar"
              disabled={busy}
            >
              {options.map((s) => (
                <option key={s} value={s}>
                  {formatSeconds(s)}
                </option>
              ))}
            </select>
            <Button size="sm" className="btn-acid" disabled={busy || !pickedPerson} onClick={() => void send()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gift className="mr-1.5 h-3.5 w-3.5" />}
              {pickedPerson ? `Doar pra ${pickedPerson.displayName}` : 'Doar'}
            </Button>
            <Button size="sm" variant="ghost" onClick={close} disabled={busy}>
              Voltar
            </Button>
          </div>
          <p className="text-[11.5px] text-muted-foreground">
            Sai da sua cota e vale pra pessoa até sexta 18:00. Hora não usada não volta.
          </p>
          {error && <p className="text-[11.5px] text-destructive">{error}</p>}
        </div>
      )}
    </section>
  )
}
