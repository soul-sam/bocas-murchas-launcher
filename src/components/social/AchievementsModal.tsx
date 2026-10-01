import * as React from 'react'
import { X, Loader2, Search, Pin, PinOff, Lock, HelpCircle, ArrowLeft } from 'lucide-react'
import { CrownIcon, MedalIcon } from '@/lib/bocas-icons'
import { UserAvatar } from '@/components/ui/avatar'
import { ApiError, resolveAssetUrl } from '@/lib/api'
import {
  gamification as api,
  DEFAULT_NAME_COLOR,
  RARITY_COLOR,
  RARITY_GLYPH,
  RARITY_LABEL,
  RARITY_STYLE,
  type AchievementBadge,
  type AchievementsBoard,
  type Rarity
} from '@/lib/api-gamification'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { useOverlays } from '@/lib/overlay-context'
import { useGamification } from '@/lib/gamification-context'
import { BadgeIcon } from '@/lib/cosmetic-icons'
import { cn } from '@/lib/utils'

/**
 * CONQUISTAS — o catálogo inteiro de badges, com a raridade que cada uma tem
 * DE VERDADE no grupo.
 *
 * A raridade de catálogo é um palpite de quem escreveu a regra; aqui ela vem
 * junto com quantas pessoas já têm, e as duas viram PONTOS na API
 * (lib/gamification/achievements.ts): peso × (2 − fatia do grupo). A soma
 * dos pontos de cada um é o placar de colecionador, na segunda aba.
 *
 * Camada própria (div fixed, clique fora fecha), NÃO Radix — igual lojinha:
 * abre de chip de badge em telas que somem, e camada modal arrancada da
 * árvore trava o <body> (ver lib/interaction-guard.ts).
 */

type Tab = 'catalog' | 'collectors'
type Filter = 'all' | 'mine' | 'missing' | 'close'
type Sort = 'rarest' | 'common' | 'recent' | 'name'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'mine', label: 'Minhas' },
  { id: 'missing', label: 'Faltando' },
  { id: 'close', label: 'Quase lá' }
]

const SORTS: { id: Sort; label: string }[] = [
  { id: 'rarest', label: 'Mais raras' },
  { id: 'common', label: 'Mais comuns' },
  { id: 'recent', label: 'Recentes' },
  { id: 'name', label: 'A–Z' }
]

/** "Quase lá" = metade do caminho andado numa badge de contagem. */
const CLOSE_RATIO = 0.5

const percent = (share: number): string => `${Math.round(share * 100)}%`

const shortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })

export function AchievementsModal() {
  const { achievementsOpen: open, achievementsFocus: focus, closeAchievements: close } = useOverlays()
  const { token, user } = useAuth()
  const { refresh: refreshProfile } = useGamification()

  const [board, setBoard] = React.useState<AchievementsBoard | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [tab, setTab] = React.useState<Tab>('catalog')
  const [filter, setFilter] = React.useState<Filter>('all')
  const [sort, setSort] = React.useState<Sort>('rarest')
  const [query, setQuery] = React.useState('')
  const [selected, setSelected] = React.useState<string | null>(null)
  // No celular não cabem lista e detalhe lado a lado: o detalhe abre NO
  // LUGAR da lista, com "voltar". Do md pra cima isto não muda nada.
  const [mobileDetail, setMobileDetail] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  // Rebusca a cada abertura: a raridade muda toda vez que alguém ganha algo.
  React.useEffect(() => {
    if (!open || !token) return
    let alive = true
    setLoading(true)
    setError(null)
    setTab('catalog')
    setFilter('all')
    setQuery('')
    setSelected(focus)
    setMobileDetail(!!focus)
    api
      .achievements(token)
      .then((next) => {
        if (!alive) return
        setBoard(next)
        // Sem foco, abre na mais rara que eu tenho — é a que dá vontade de
        // mostrar, e deixa o painel da direita com conteúdo desde o começo.
        if (!focus) {
          const best = next.badges
            .filter((b) => b.earnedAt)
            .sort((a, b) => b.points - a.points)[0]
          setSelected(best?.id ?? next.badges[0]?.id ?? null)
        }
      })
      .catch(() => alive && setError('Não deu pra abrir as conquistas agora.'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [open, token, focus])

  React.useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const visible = React.useMemo(() => {
    if (!board) return []
    const q = query.trim().toLocaleLowerCase('pt-BR')
    return board.badges
      .filter((b) => {
        if (filter === 'mine' && !b.earnedAt) return false
        if (filter === 'missing' && b.earnedAt) return false
        if (filter === 'close' && !(b.progress && b.progress.current / b.progress.target >= CLOSE_RATIO)) return false
        if (!q) return true
        return `${b.name} ${b.description}`.toLocaleLowerCase('pt-BR').includes(q)
      })
      .sort((a, b) => {
        // Ovo mascarado ("???") vai sempre pro fim: vinte linhas iguais no
        // topo de "mais raras" escondiam o catálogo de verdade.
        const secret = Number(!!a.secret) - Number(!!b.secret)
        if (secret !== 0) return secret
        switch (sort) {
          case 'rarest':
            return b.points - a.points || a.holders - b.holders || a.name.localeCompare(b.name, 'pt-BR')
          case 'common':
            return a.points - b.points || b.holders - a.holders || a.name.localeCompare(b.name, 'pt-BR')
          case 'recent':
            return (b.earnedAt ?? '').localeCompare(a.earnedAt ?? '') || b.points - a.points
          case 'name':
            return a.name.localeCompare(b.name, 'pt-BR')
        }
      })
  }, [board, filter, sort, query])

  if (!open || !user) return null

  const selectedBadge = board?.badges.find((b) => b.id === selected) ?? null
  const earnedCount = board?.badges.filter((b) => b.earnedAt).length ?? 0

  const saveShowcase = async (ids: string[]): Promise<void> => {
    if (!token || !board) return
    setSaving(true)
    setError(null)
    try {
      const res = await api.setShowcase(token, ids)
      setBoard({ ...board, showcase: res.showcase })
      void refreshProfile()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não deu pra salvar a vitrine.')
    } finally {
      setSaving(false)
    }
  }

  const togglePin = (badgeId: string): void => {
    if (!board) return
    const pinned = board.showcase.includes(badgeId)
    if (pinned) void saveShowcase(board.showcase.filter((id) => id !== badgeId))
    else if (board.showcase.length < board.showcaseSize) void saveShowcase([...board.showcase, badgeId])
  }

  return (
    <div className="fixed inset-0 z-dialogo flex items-center justify-center bg-black/70 p-3 sm:p-6" onClick={close}>
      <div
        role="dialog"
        aria-label="Conquistas"
        className="card-acid relative flex h-[90dvh] w-full max-w-5xl flex-col rounded-brutal p-4 sm:h-[85dvh] sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Fechar"
          onClick={close}
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-3 flex flex-wrap items-center gap-3 pr-8 sm:mb-4">
          <MedalIcon className="hidden h-7 w-7 text-acid sm:block" variant="regular" />
          <div className="min-w-0 flex-1">
            <h2 className="title-brutal text-2xl">Conquistas</h2>
            <p className="text-[11.5px] text-muted-foreground">
              {board
                ? `${earnedCount} de ${board.badges.length} · raridade medida em ${board.members} pessoas do grupo`
                : 'Abrindo…'}
            </p>
          </div>
          {board && (
            <div
              className="flex items-center gap-2 rounded-brutal border-2 border-acid/60 bg-acid/10 px-3 py-1.5 font-mono text-sm text-acid"
              title="Seus pontos de colecionador: a soma dos pontos das suas badges"
            >
              <CrownIcon className="h-4 w-4" />
              {board.me.points} pts
              {board.me.rank && <span className="text-[11.5px] opacity-70">#{board.me.rank}</span>}
            </div>
          )}
        </div>

        {board && <Showcase board={board} saving={saving} onUnpin={togglePin} onPick={setSelected} />}

        <div className="mb-3 flex flex-wrap items-center gap-1">
          <TabButton active={tab === 'catalog'} onClick={() => setTab('catalog')}>
            Catálogo
          </TabButton>
          <TabButton active={tab === 'collectors'} onClick={() => setTab('collectors')}>
            Colecionadores
          </TabButton>
        </div>

        {error && (
          <p className="mb-2 rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            {error}
          </p>
        )}

        {loading && !board ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> contando quem tem o quê
          </div>
        ) : board && tab === 'catalog' ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_300px]">
            <div className={cn('min-h-0 flex-col', mobileDetail ? 'hidden md:flex' : 'flex')}>
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      'rounded-brutal border px-2 py-1 text-[11.5px] transition-colors',
                      filter === f.id
                        ? 'border-acid bg-acid/10 text-acid'
                        : 'border-line text-muted-foreground hover:border-acid/50 hover:text-foreground'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  aria-label="Ordenar"
                  className="rounded-brutal border border-line bg-void px-2 py-1 text-[11.5px] text-foreground"
                >
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <label className="ml-auto flex min-w-[140px] flex-1 items-center gap-1.5 rounded-brutal border border-line bg-void px-2 py-1 sm:max-w-[200px]">
                  <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="buscar"
                    className="w-full bg-transparent text-[11.5px] text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </label>
              </div>

              <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                {visible.map((badge) => (
                  <BadgeRow
                    key={badge.id}
                    badge={badge}
                    active={badge.id === selected}
                    pinned={board.showcase.includes(badge.id)}
                    onClick={() => {
                      setSelected(badge.id)
                      setMobileDetail(true)
                    }}
                  />
                ))}
                {visible.length === 0 && (
                  <li className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                    Nada por aqui com esse filtro.
                  </li>
                )}
              </ul>
            </div>

            {selectedBadge ? (
              <BadgeDetail
                badge={selectedBadge}
                board={board}
                saving={saving}
                onTogglePin={() => togglePin(selectedBadge.id)}
                onBack={() => setMobileDetail(false)}
                className={mobileDetail ? 'flex' : 'hidden md:flex'}
              />
            ) : (
              <div className="hidden md:block" />
            )}
          </div>
        ) : board ? (
          <Collectors board={board} meId={user.id} />
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-brutal border-2 px-3 py-1.5 font-mono text-[11.5px] uppercase tracking-widest transition-colors',
        active
          ? 'border-acid bg-acid/10 text-acid'
          : 'border-line text-muted-foreground hover:border-acid/50 hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

/** O quadradinho da badge, na cor do tier REAL. */
function BadgeTile({ badge, size = 'md' }: { badge: AchievementBadge; size?: 'md' | 'lg' }) {
  const style = RARITY_STYLE[badge.tier]
  const owned = !!badge.earnedAt
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-brutal border bg-void',
        size === 'lg' ? 'h-14 w-14' : 'h-9 w-9',
        !owned && 'opacity-45'
      )}
      style={{
        borderColor: style.ring,
        background: owned ? style.wash : undefined,
        boxShadow: owned ? style.glow : undefined,
        color: RARITY_COLOR[badge.tier]
      }}
    >
      {badge.secret ? (
        <HelpCircle className={size === 'lg' ? 'h-7 w-7' : 'h-4 w-4'} />
      ) : (
        <BadgeIcon badgeId={badge.id} className={size === 'lg' ? 'h-7 w-7' : 'h-4 w-4'} />
      )}
    </span>
  )
}

function RarityTag({ rarity, className }: { rarity: Rarity; className?: string }) {
  return (
    <span className={cn('whitespace-nowrap text-[11px]', className)} style={{ color: RARITY_COLOR[rarity] }}>
      {RARITY_GLYPH[rarity]} {RARITY_LABEL[rarity]}
    </span>
  )
}

function ShareBar({ share, rarity }: { share: number; rarity: Rarity }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-surface-raised">
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.max(share > 0 ? 3 : 0, share * 100)}%`, background: RARITY_COLOR[rarity] }}
      />
    </div>
  )
}

function BadgeRow({
  badge,
  active,
  pinned,
  onClick
}: {
  badge: AchievementBadge
  active: boolean
  pinned: boolean
  onClick: () => void
}) {
  const owned = !!badge.earnedAt
  const progress = badge.progress
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-3 rounded-brutal border px-2.5 py-2 text-left transition-colors',
          active ? 'border-acid/70 bg-acid/5' : 'border-line bg-void hover:border-line-strong'
        )}
      >
        <BadgeTile badge={badge} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={cn('truncate text-[13px]', owned ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
              {badge.name}
            </span>
            {pinned && <Pin className="h-3 w-3 shrink-0 text-acid" aria-label="Na vitrine" />}
            <RarityTag rarity={badge.tier} className="ml-auto" />
          </div>
          {progress ? (
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-raised">
                <div className="h-full rounded-full bg-acid" style={{ width: `${(progress.current / progress.target) * 100}%` }} />
              </div>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {progress.current.toLocaleString('pt-BR')}/{progress.target.toLocaleString('pt-BR')}
              </span>
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <ShareBar share={badge.share} rarity={badge.tier} />
              <span className="w-10 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                {percent(badge.share)}
              </span>
            </div>
          )}
        </div>
        <span className="w-12 shrink-0 text-right font-mono text-[11.5px] text-muted-foreground" title="Pontos de colecionador">
          {badge.points}
        </span>
      </button>
    </li>
  )
}

// ---------------------------------------------------------------------------

function BadgeDetail({
  badge,
  board,
  saving,
  onTogglePin,
  onBack,
  className
}: {
  badge: AchievementBadge
  board: AchievementsBoard
  saving: boolean
  onTogglePin: () => void
  onBack: () => void
  className?: string
}) {
  const { byId } = useMembers()
  const { openProfile } = useOverlays()
  const owned = !!badge.earnedAt
  const pinned = board.showcase.includes(badge.id)
  const full = board.showcase.length >= board.showcaseSize
  const weight = board.weights[badge.rarity]
  const moved = badge.tier !== badge.rarity

  return (
    <aside className={cn('min-h-0 flex-col overflow-y-auto rounded-brutal border border-line bg-void p-3', className)}>
      <button
        type="button"
        onClick={onBack}
        className="mb-2 flex items-center gap-1 self-start text-[12px] text-muted-foreground hover:text-foreground md:hidden"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> todas as conquistas
      </button>
      <div className="flex items-start gap-3">
        <BadgeTile badge={badge} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg leading-tight text-foreground">{badge.name}</p>
          <RarityTag rarity={badge.tier} />
        </div>
      </div>

      <p className="mt-2 text-[12.5px] leading-snug text-muted-foreground">
        {badge.secret ? badge.hint ?? badge.description : badge.description}
      </p>

      {badge.progress && (
        <div className="mt-3">
          <div className="flex justify-between text-[11.5px] text-muted-foreground">
            <span>Seu progresso</span>
            <span className="font-mono">
              {badge.progress.current.toLocaleString('pt-BR')} / {badge.progress.target.toLocaleString('pt-BR')}{' '}
              {badge.progress.unit}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-raised">
            <div
              className="xp-fill h-full bg-acid"
              style={{ width: `${(badge.progress.current / badge.progress.target) * 100}%` }}
            />
          </div>
        </div>
      )}

      <h3 className="mt-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Raridade</h3>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
        <dt className="text-muted-foreground">Quem tem</dt>
        <dd className="text-right font-mono text-foreground">
          {badge.holders} de {board.members} · {percent(badge.share)}
        </dd>
        <dt className="text-muted-foreground">Catálogo</dt>
        <dd className="text-right">
          <RarityTag rarity={badge.rarity} /> <span className="font-mono text-muted-foreground">· peso {weight}</span>
        </dd>
        <dt className="text-muted-foreground">Pontos</dt>
        <dd className="text-right font-mono text-foreground" title={`${weight} × (2 − ${badge.share.toFixed(2)})`}>
          {badge.points}
        </dd>
      </dl>
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
        {moved
          ? `Nasceu ${RARITY_LABEL[badge.rarity]}, mas tanta gente já tem que hoje vale como ${RARITY_LABEL[badge.tier]}.`
          : badge.holders === 0
            ? 'Ninguém do grupo tem ainda: vale o dobro do peso pra quem abrir.'
            : 'Peso do catálogo × (2 − fatia do grupo que tem). Quanto menos gente, mais vale.'}
      </p>

      {owned && (
        <button
          type="button"
          disabled={saving || (!pinned && full)}
          onClick={onTogglePin}
          title={!pinned && full ? `A vitrine já tem ${board.showcaseSize}. Tire uma antes.` : undefined}
          className={cn(
            'mt-3 flex items-center justify-center gap-1.5 rounded-brutal border-2 px-2 py-1.5 font-mono text-[11.5px] uppercase tracking-widest transition-colors disabled:opacity-50',
            pinned
              ? 'border-line-strong text-muted-foreground hover:text-foreground'
              : 'border-acid/60 text-acid hover:bg-acid/10'
          )}
        >
          {pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          {pinned ? 'tirar da vitrine' : 'pôr na vitrine'}
        </button>
      )}

      <h3 className="mt-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {badge.holders > 0 ? 'Quem tem' : 'Ninguém ainda'}
      </h3>
      {badge.holders === 0 ? (
        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Lock className="h-3 w-3" /> A primeira pessoa a conseguir fica marcada aqui.
        </p>
      ) : (
        <ol className="mt-1 space-y-1">
          {badge.owners.map((owner, index) => {
            const member = byId[owner.userId]
            const name = member?.displayName ?? 'alguém que saiu'
            return (
              <li key={owner.userId}>
                <button
                  type="button"
                  onClick={() => member && openProfile(owner.userId)}
                  className="flex w-full items-center gap-2 rounded-brutal px-1 py-0.5 text-left hover:bg-surface-raised"
                >
                  <UserAvatar
                    src={resolveAssetUrl(member?.avatar ?? null)}
                    name={name}
                    ringColor={member?.profileColor ?? DEFAULT_NAME_COLOR}
                    frame={member?.avatarFrame}
                    className="h-6 w-6 border"
                  />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">{name}</span>
                  {index === 0 && (
                    <span className="flex items-center gap-1 rounded-brutal border border-burn/50 px-1 text-[11px] text-burn" title="Foi quem abriu essa conquista no grupo">
                      <CrownIcon className="h-2.5 w-2.5" /> 1º
                    </span>
                  )}
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{shortDate(owner.earnedAt)}</span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </aside>
  )
}

// ---------------------------------------------------------------------------

/** As três vagas da vitrine. Vaga vazia explica como encher. */
function Showcase({
  board,
  saving,
  onUnpin,
  onPick
}: {
  board: AchievementsBoard
  saving: boolean
  onUnpin: (badgeId: string) => void
  onPick: (badgeId: string) => void
}) {
  const slots = Array.from({ length: board.showcaseSize }, (_, i) => board.showcase[i] ?? null)
  const byId = new Map(board.badges.map((b) => [b.id, b]))

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-brutal border border-line bg-void px-3 py-2">
      <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Vitrine</h3>
      <div className="flex flex-1 gap-2">
        {slots.map((id, index) => {
          const badge = id ? byId.get(id) : undefined
          if (!badge) {
            return (
              <span
                key={`vazio-${index}`}
                className="flex h-9 min-w-9 items-center justify-center rounded-brutal border border-dashed border-line px-2 text-[11px] text-muted-foreground sm:px-3"
              >
                <span className="hidden sm:inline">vaga livre</span>
              </span>
            )
          }
          return (
            <span key={badge.id} className="flex items-center gap-1.5 rounded-brutal border border-line pr-1">
              <button type="button" onClick={() => onPick(badge.id)} className="flex items-center gap-2 py-0.5 pl-0.5">
                <BadgeTile badge={badge} />
                <span className="hidden text-[12px] text-foreground sm:inline">{badge.name}</span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => onUnpin(badge.id)}
                aria-label={`Tirar ${badge.name} da vitrine`}
                className="rounded-brutal p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )
        })}
      </div>
      <p className="hidden text-[11px] text-muted-foreground sm:block">
        {board.showcase.length === 0 ? 'Escolha até 3 pra ficar na frente do seu perfil.' : 'É o que aparece primeiro no seu perfil.'}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Collectors({ board, meId }: { board: AchievementsBoard; meId: string }) {
  const { byId } = useMembers()
  const { openProfile } = useOverlays()
  const top = board.collectors[0]?.points ?? 1
  const rarities: Rarity[] = ['common', 'rare', 'epic', 'legendary']

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
      <ol className="min-h-0 space-y-1 overflow-y-auto pr-1">
        {board.collectors.length === 0 && (
          <li className="px-3 py-6 text-center text-[12px] text-muted-foreground">Ninguém tem badge ainda.</li>
        )}
        {board.collectors.map((row) => {
          const member = byId[row.userId]
          const name = member?.displayName ?? 'alguém que saiu'
          const color = member?.profileColor ?? DEFAULT_NAME_COLOR
          const me = row.userId === meId
          return (
            <li key={row.userId}>
              <button
                type="button"
                onClick={() => member && openProfile(row.userId)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-brutal border px-3 py-2 text-left transition-colors',
                  me ? 'border-acid/60 bg-acid/5' : 'border-line bg-void hover:border-line-strong'
                )}
              >
                <span className="w-6 shrink-0 text-center font-mono text-[13px] text-muted-foreground">{row.rank}</span>
                <UserAvatar
                  src={resolveAssetUrl(member?.avatar ?? null)}
                  name={name}
                  ringColor={color}
                  frame={member?.avatarFrame}
                  className="h-8 w-8 border-2"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[13px] font-semibold" style={{ color }}>
                      {name}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[12px] text-foreground">{row.points} pts</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-raised">
                      <div className="h-full rounded-full bg-acid" style={{ width: `${(row.points / top) * 100}%` }} />
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {row.count} {row.count === 1 ? 'badge' : 'badges'}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ol>

      <aside className="rounded-brutal border border-line bg-void p-3 text-[12px] text-muted-foreground">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Como a conta funciona</h3>
        <p className="mt-2 leading-snug">
          Cada badge vale <span className="text-foreground">peso × (2 − fatia do grupo que tem)</span>. Se ninguém
          mais tem, vale o dobro; se todo mundo tem, só o peso.
        </p>
        <ul className="mt-2 space-y-1">
          {rarities.map((r) => (
            <li key={r} className="flex justify-between">
              <RarityTag rarity={r} />
              <span className="font-mono">
                {board.weights[r]}–{board.weights[r] * 2} pts
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 leading-snug">
          A raridade que aparece na lista é a de HOJE: badge que quase todo mundo já tem cai um degrau. Os pontos
          mudam sozinhos quando alguém ganha alguma coisa.
        </p>
      </aside>
    </div>
  )
}
