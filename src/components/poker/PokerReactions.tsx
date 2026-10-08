import * as React from 'react'
import EmojiPicker, { EmojiStyle, Theme, type EmojiClickData } from 'emoji-picker-react'
import { Eye, Film, Loader2, Search, Smile, Sparkles, Sticker as StickerIcon, Volume2, VolumeX } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Hint } from '@/components/ui/tooltip'
import { THEME_LABEL } from '../../../electron/preload/types'
import { resolveAssetUrl } from '@/lib/api'
import type { PokerReaction, ReactionInput, TableView, Watcher } from '@/lib/api-poker'
import { gifs as gifsApi, isProviderOff, type Gif } from '@/lib/api-gifs'
import { useAuth } from '@/lib/auth-context'
import { useEmojis } from '@/lib/emoji-context'
import { useMembers } from '@/lib/members-context'
import { reactionLifeMs, usePoker } from '@/lib/poker-context'
import { useSettings } from '@/lib/settings-context'
import { useSoundboard } from '@/lib/soundboard-context'
import { cn } from '@/lib/utils'
import './poker.css'

/**
 * REAÇÕES NA MESA — o que deixa a mesa com cara de mesa de bar: emoji,
 * emote do servidor, figurinha, GIF e os sons do soundboard tocados pra quem
 * está na mesa (sentado ou assistindo).
 *
 *   ReactionPanel   o painel com as abas (abre no botão da mesa ou clicando
 *                   no avatar de alguém, aí a reação VOA até a pessoa)
 *   ReactionLayer   as bolhas por cima da mesa, cada uma no lugar de quem
 *                   mandou (ou voando até o alvo)
 *   Plateia         quem está assistindo, no canto de cima; as reações de
 *                   quem não tem lugar saem do avatar dela ali
 *
 * Emoji aqui é CONTEÚDO (a pessoa escolheu mandar), não ícone de interface —
 * os ícones do painel continuam de traço.
 */

/** O emoji rápido: o que se diz numa mesa. */
const QUICK_EMOJIS = [
  '😂', '💀', '🔥', '👏', '😱', '🤡', '😎', '🤑',
  '💸', '🍀', '😭', '🤯', '🫡', '🙏', '😤', '🥶',
  '🤔', '👀', '🍿', '🐟', '🦈', '👑', '🍅', '🌹',
  '💩', '🧂', '⏰', '🥱', '🫠', '🎉', '❤️', '👍'
]

type Tab = 'emoji' | 'emote' | 'sticker' | 'sound' | 'gif'

// ---------------------------------------------------------------------------
// O painel
// ---------------------------------------------------------------------------

export interface ReactionTarget {
  seat: number
  name: string
}

/**
 * O botão de reagir da mesa e o painel. Abre também "de fora" (`target` +
 * `open`): clicar no avatar de alguém abre o painel mirando nele.
 */
export function ReactionButton({
  table,
  target,
  onTargetChange,
  open,
  onOpenChange,
  compact
}: {
  table: TableView
  target: ReactionTarget | null
  onTargetChange: (t: ReactionTarget | null) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  compact?: boolean
}) {
  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) onTargetChange(null)
      }}
    >
      <PopoverTrigger asChild>
        <Hint label="Reagir" description="Emoji, emote, figurinha, GIF e os sons do servidor — pra mesa inteira." side="left">
          <button
            type="button"
            aria-label="Reagir"
            className={cn('poker-reagir alvo-dedo', open && 'poker-reagir--aberto', compact && 'poker-reagir--compacto')}
          >
            <Smile className={compact ? 'h-5 w-5' : 'h-[22px] w-[22px]'} aria-hidden />
          </button>
        </Hint>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        collisionPadding={10}
        className="w-[360px] max-w-[calc(100vw-20px)] p-0"
        // O foco não pula pra dentro: quem joga com F/C/A continua jogando.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <ReactionPanel table={table} target={target} onTarget={onTargetChange} />
      </PopoverContent>
    </Popover>
  )
}

function ReactionPanel({
  table,
  target,
  onTarget
}: {
  table: TableView
  target: ReactionTarget | null
  onTarget: (t: ReactionTarget | null) => void
}) {
  const { react, reactionSoundsMuted, setReactionSoundsMuted } = usePoker()
  const { emojis, packs } = useEmojis()
  const { sounds } = useSoundboard()
  const [tab, setTab] = React.useState<Tab>('emoji')
  const [error, setError] = React.useState<string | null>(null)
  const [sending, setSending] = React.useState(false)

  React.useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 3_000)
    return () => clearTimeout(t)
  }, [error])

  const send = async (input: Omit<ReactionInput, 'to'>): Promise<void> => {
    if (sending) return
    setSending(true)
    const ack = await react(table.id, { ...input, to: target?.seat ?? null })
    setSending(false)
    if (!ack.ok && !ack.throttled) setError(ack.error ?? 'Não deu pra reagir.')
  }

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; show: boolean }> = [
    { id: 'emoji', label: 'Emojis', icon: <Smile className="h-3.5 w-3.5" aria-hidden />, show: true },
    { id: 'emote', label: 'Emotes', icon: <Sparkles className="h-3.5 w-3.5" aria-hidden />, show: emojis.length > 0 },
    { id: 'sticker', label: 'Figurinhas', icon: <StickerIcon className="h-3.5 w-3.5" aria-hidden />, show: packs.some((p) => p.stickers.length > 0) },
    { id: 'sound', label: 'Sons', icon: <Volume2 className="h-3.5 w-3.5" aria-hidden />, show: sounds.length > 0 },
    { id: 'gif', label: 'GIFs', icon: <Film className="h-3.5 w-3.5" aria-hidden />, show: true }
  ]

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-line px-1.5 py-1.5">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={cn('poker-reacao-aba', tab === t.id && 'poker-reacao-aba--ativa')}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
      </div>

      <TargetRow table={table} target={target} onTarget={onTarget} />

      <div className="h-[268px] min-h-0 overflow-hidden">
        {tab === 'emoji' && <EmojiTab onPick={(emoji) => void send({ kind: 'emoji', value: emoji })} />}
        {tab === 'emote' && <EmoteTab onPick={(name) => void send({ kind: 'emote', value: name })} />}
        {tab === 'sticker' && <StickerTab onPick={(id) => void send({ kind: 'sticker', value: id })} />}
        {tab === 'sound' && <SoundTab onPick={(id) => void send({ kind: 'sound', value: id })} />}
        {tab === 'gif' && <GifTab onPick={(url) => void send({ kind: 'gif', value: url })} />}
      </div>

      <div className="flex items-center gap-2 border-t border-line px-3 py-1.5">
        {error ? (
          <p role="alert" className="min-w-0 flex-1 truncate text-[11.5px] text-destructive">
            {error}
          </p>
        ) : (
          <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {target ? `Clique pra arremessar em ${target.name}.` : 'Todo mundo na mesa vê (e ouve).'}
          </p>
        )}
        <button
          type="button"
          onClick={() => setReactionSoundsMuted(!reactionSoundsMuted)}
          aria-pressed={reactionSoundsMuted}
          className={cn(
            'flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition-colors',
            reactionSoundsMuted
              ? 'border-destructive/50 text-destructive'
              : 'border-line text-muted-foreground hover:text-foreground'
          )}
          title={reactionSoundsMuted ? 'Os sons da mesa estão calados aqui' : 'Calar os sons da mesa (só pra você)'}
        >
          {reactionSoundsMuted ? <VolumeX className="h-3 w-3" aria-hidden /> : <Volume2 className="h-3 w-3" aria-hidden />}
          {reactionSoundsMuted ? 'mudo' : 'som'}
        </button>
      </div>
    </div>
  )
}

/**
 * Pra quem vai a reação: a mesa toda (aparece em cima de mim) ou alguém
 * sentado — aí ela VOA de mim até a pessoa (o tomate, a rosa). O avatar na
 * mesa continua abrindo o perfil, como no resto do app; mirar é aqui.
 */
function TargetRow({
  table,
  target,
  onTarget
}: {
  table: TableView
  target: ReactionTarget | null
  onTarget: (t: ReactionTarget | null) => void
}) {
  const { byId } = useMembers()
  const others = table.seats.filter((s): s is NonNullable<typeof s> => !!s && s.index !== table.mySeat)
  if (others.length === 0) return null
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
      <span className="mr-0.5 shrink-0 text-[11px] text-muted-foreground">Pra</span>
      <button
        type="button"
        onClick={() => onTarget(null)}
        aria-pressed={!target}
        className={cn('poker-reacao-alvo !pl-2', !target && 'poker-reacao-alvo--ativo')}
      >
        a mesa toda
      </button>
      {others.map((s) => {
        const member = byId[s.userId]
        const first = s.displayName.split(/\s+/)[0]
        const on = target?.seat === s.index
        return (
          <button
            key={s.index}
            type="button"
            onClick={() => onTarget(on ? null : { seat: s.index, name: first })}
            aria-pressed={on}
            aria-label={`Mirar em ${s.displayName}`}
            className={cn('poker-reacao-alvo', on && 'poker-reacao-alvo--ativo')}
          >
            <UserAvatar
              src={resolveAssetUrl(member?.avatar ?? s.avatar)}
              name={s.displayName}
              frame={null}
              className="poker-avatar"
              style={{ width: 18, height: 18 }}
            />
            {first}
          </button>
        )
      })}
    </div>
  )
}

function EmojiTab({ onPick }: { onPick: (emoji: string) => void }) {
  const { settings } = useSettings()
  const { emojis } = useEmojis()
  const [all, setAll] = React.useState(false)
  if (all) {
    return (
      <div className="flex h-full flex-col">
        <button type="button" onClick={() => setAll(false)} className="px-3 py-1 text-left text-[11.5px] text-muted-foreground hover:text-foreground">
          ← os rápidos
        </button>
        <div className="min-h-0 flex-1">
          <EmojiPicker
            width="100%"
            height={238}
            theme={THEME_LABEL[settings.theme]?.light ? Theme.LIGHT : Theme.DARK}
            emojiStyle={EmojiStyle.NATIVE}
            lazyLoadEmojis
            skinTonesDisabled
            previewConfig={{ showPreview: false }}
            searchPlaceHolder="Buscar emoji"
            // Os do servidor têm aba própria; aqui só os de verdade.
            customEmojis={[]}
            onEmojiClick={(data: EmojiClickData) => {
              if (!data.isCustom) onPick(data.emoji)
            }}
          />
        </div>
      </div>
    )
  }
  return (
    <div className="scroll-stable h-full overflow-y-auto p-2">
      <div className="grid grid-cols-8 gap-1">
        {QUICK_EMOJIS.map((e) => (
          <button key={e} type="button" onClick={() => onPick(e)} className="poker-reacao-emoji" aria-label={`Mandar ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setAll(true)}
        className="mt-2 w-full rounded-md border border-line py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:border-acid/50 hover:text-foreground"
      >
        Todos os emojis{emojis.length > 0 ? ' (os emotes do servidor estão na aba Emotes)' : ''}
      </button>
    </div>
  )
}

function EmoteTab({ onPick }: { onPick: (name: string) => void }) {
  const { emojis } = useEmojis()
  const [q, setQ] = React.useState('')
  const list = q.trim() ? emojis.filter((e) => e.name.includes(q.trim().toLowerCase().replace(/:/g, ''))) : emojis
  return (
    <div className="flex h-full flex-col">
      <SearchBox value={q} onChange={setQ} placeholder="Buscar emote" />
      <div className="scroll-stable min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {list.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Nenhum emote com esse nome.</p>
        ) : (
          <div className="grid grid-cols-6 gap-1">
            {list.map((e) => (
              <button key={e.id} type="button" onClick={() => onPick(e.name)} className="poker-reacao-emote" title={`:${e.name}:`}>
                <img src={resolveAssetUrl(e.url)} alt={`:${e.name}:`} loading="lazy" draggable={false} className="h-9 w-9 object-contain" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StickerTab({ onPick }: { onPick: (id: string) => void }) {
  const { packs } = useEmojis()
  const withStickers = packs.filter((p) => p.stickers.length > 0)
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const active = withStickers.find((p) => p.id === activeId) ?? withStickers[0]
  if (!active) return <p className="py-10 text-center text-xs text-muted-foreground">Nenhuma figurinha ainda.</p>
  return (
    <div className="flex h-full flex-col">
      {withStickers.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto px-2 pt-2">
          {withStickers.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveId(p.id)}
              className={cn('poker-reacao-pacote', p.id === active.id && 'poker-reacao-pacote--ativo')}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      <div className="scroll-stable min-h-0 flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-4 gap-1.5">
          {active.stickers.map((s) => (
            <button key={s.id} type="button" onClick={() => onPick(s.id)} className="poker-reacao-figurinha" title={s.name}>
              <img src={resolveAssetUrl(s.url)} alt={s.name} loading="lazy" draggable={false} className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function SoundTab({ onPick }: { onPick: (id: string) => void }) {
  const { sounds, byCategory, preview } = useSoundboard()
  const categories = Object.keys(byCategory).sort((a, b) => (a === 'geral' ? -1 : b === 'geral' ? 1 : a.localeCompare(b)))
  const [cat, setCat] = React.useState<string | null>(null)
  const [q, setQ] = React.useState('')
  const base = cat ? byCategory[cat] ?? [] : sounds
  const list = q.trim() ? base.filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase())) : base
  return (
    <div className="flex h-full flex-col">
      <SearchBox value={q} onChange={setQ} placeholder="Buscar som" />
      {categories.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto px-2 pb-1.5">
          <button type="button" onClick={() => setCat(null)} className={cn('poker-reacao-pacote', cat === null && 'poker-reacao-pacote--ativo')}>
            todos
          </button>
          {categories.map((c) => (
            <button key={c} type="button" onClick={() => setCat(c)} className={cn('poker-reacao-pacote', cat === c && 'poker-reacao-pacote--ativo')}>
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="scroll-stable min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {list.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Nenhum som aqui.</p>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            {list.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s.id)}
                onContextMenu={(e) => {
                  // Botão direito: ouvir antes, só pra mim.
                  e.preventDefault()
                  preview(s)
                }}
                className="poker-reacao-som"
                title={`${s.name} — botão direito ouve só pra você`}
              >
                <span className="text-base leading-none">{s.emoji}</span>
                <span className="min-w-0 flex-1 truncate text-left">{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function GifTab({ onPick }: { onPick: (url: string) => void }) {
  const { token } = useAuth()
  const [q, setQ] = React.useState('')
  const [list, setList] = React.useState<Gif[] | null>(null)
  const [off, setOff] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    if (!token) return
    let alive = true
    const term = q.trim()
    const timer = setTimeout(
      () => {
        setFailed(false)
        ;(term ? gifsApi.search(token, term) : gifsApi.trending(token))
          .then((page) => alive && setList(page.gifs))
          .catch((error: unknown) => {
            if (!alive) return
            if (isProviderOff(error)) setOff(true)
            else setFailed(true)
          })
      },
      term ? 350 : 0
    )
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [q, token])

  if (off) return <p className="px-4 py-10 text-center text-xs text-muted-foreground">A busca de GIF está desligada neste servidor.</p>

  return (
    <div className="flex h-full flex-col">
      <SearchBox value={q} onChange={setQ} placeholder="Buscar GIF no Giphy" />
      <div className="scroll-stable min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {failed ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Não deu pra buscar agora.</p>
        ) : list === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Nada com esse nome.</p>
        ) : (
          <div className="columns-3 gap-1">
            {list.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onPick(g.previewUrl)}
                className="poker-reacao-gif mb-1 block w-full"
                title={g.description || 'GIF'}
              >
                <img src={g.previewUrl} alt={g.description || 'GIF'} loading="lazy" draggable={false} className="block w-full rounded" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="mx-2 my-2 flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-void/60 px-2 py-1 focus-within:border-acid/50">
      <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
      />
    </label>
  )
}

// ---------------------------------------------------------------------------
// A camada das bolhas
// ---------------------------------------------------------------------------

/** Onde, na área da mesa (em %), fica cada lugar e a plateia. */
export interface ReactionGeometry {
  seatPos: (seat: number) => [number, number] | null
  /** Onde nasce a reação de quem assiste (o avatar na plateia). */
  watcherPos: (userId: string) => [number, number]
}

export function ReactionLayer({ reactions, geometry }: { reactions: PokerReaction[]; geometry: ReactionGeometry }) {
  if (reactions.length === 0) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-[16]" aria-live="polite">
      {reactions.map((r) => (
        <ReactionBubble key={r.id} reaction={r} geometry={geometry} />
      ))}
    </div>
  )
}

function ReactionBubble({ reaction: r, geometry }: { reaction: PokerReaction; geometry: ReactionGeometry }) {
  const origin = (r.from.seat !== null ? geometry.seatPos(r.from.seat) : null) ?? geometry.watcherPos(r.from.userId)
  const target = r.to !== null && r.to !== r.from.seat && r.kind !== 'sound' ? geometry.seatPos(r.to) : null
  const at = target ?? origin
  const spectator = r.from.seat === null
  const style = {
    left: `${at[0]}%`,
    top: `${at[1]}%`,
    ['--de-x' as string]: origin[0] - at[0],
    ['--de-y' as string]: origin[1] - at[1],
    ['--vida' as string]: `${reactionLifeMs(r)}ms`
  } as React.CSSProperties

  const label = `${r.from.displayName.split(/\s+/)[0]}${target ? ' arremessou' : ''}`

  return (
    <div className={cn('poker-reacao', target && 'poker-reacao--voa', spectator && !target && 'poker-reacao--plateia')} style={style}>
      <div className="poker-reacao-arco">
        <div className={cn('poker-reacao-corpo', target ? 'poker-reacao-corpo--chega' : 'poker-reacao-corpo--sobe')}>
          <ReactionContent reaction={r} />
          {(spectator || target) && <span className="poker-reacao-quem">{label}</span>}
        </div>
      </div>
    </div>
  )
}

function ReactionContent({ reaction: r }: { reaction: PokerReaction }) {
  switch (r.kind) {
    case 'emoji':
      return <span className="poker-reacao-emoji-grande" role="img" aria-label={`${r.from.displayName}: ${r.emoji}`}>{r.emoji}</span>
    case 'emote':
      return r.emote ? (
        <img src={resolveAssetUrl(r.emote.url)} alt={`:${r.emote.name}:`} draggable={false} className="h-14 w-14 object-contain drop-shadow-[0_4px_10px_rgb(0_0_0/0.6)]" />
      ) : null
    case 'sticker':
      return r.sticker ? (
        <img src={resolveAssetUrl(r.sticker.url)} alt={r.sticker.name} draggable={false} className="h-28 w-28 object-contain drop-shadow-[0_6px_16px_rgb(0_0_0/0.6)]" />
      ) : null
    case 'gif':
      return r.gif ? (
        <img src={r.gif.url} alt="GIF" draggable={false} className="max-h-32 max-w-[176px] rounded-lg border-2 border-void shadow-[0_8px_24px_rgb(0_0_0/0.6)]" />
      ) : null
    case 'sound':
      return r.sound ? (
        <span className="poker-reacao-som-bolha">
          <span className="poker-equalizador" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="text-sm leading-none">{r.sound.emoji}</span>
          <span className="max-w-[140px] truncate">{r.sound.name}</span>
        </span>
      ) : null
  }
}

// ---------------------------------------------------------------------------
// A plateia
// ---------------------------------------------------------------------------

/** Quantos avatares aparecem antes do "+N". */
export const PLATEIA_VISIBLE = 5

export function Plateia({ watchers, compact }: { watchers: Watcher[]; compact?: boolean }) {
  const { byId } = useMembers()
  const [open, setOpen] = React.useState(false)
  if (watchers.length === 0) return null
  const shown = watchers.slice(0, PLATEIA_VISIBLE)
  const rest = watchers.length - shown.length
  const size = compact ? 24 : 28
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="poker-plateia" aria-label={`${watchers.length} assistindo`}>
          <span className="flex items-center gap-1 pl-1 pr-1.5 text-[11.5px] text-muted-foreground">
            <Eye className="h-3.5 w-3.5" aria-hidden />
            <span className="font-mono text-foreground">{watchers.length}</span>
            {!compact && <span>assistindo</span>}
          </span>
          <span className="flex flex-row-reverse">
            {[...shown].reverse().map((w) => {
              const member = byId[w.userId]
              return (
                // Sem `userId`: no botão, o clique abre a lista (o perfil abre lá dentro).
                <UserAvatar
                  key={w.userId}
                  src={resolveAssetUrl(member?.avatar ?? w.avatar)}
                  name={w.displayName}
                  frame={null}
                  className="poker-avatar -ml-2 border-2 border-void first:ml-0"
                  style={{ width: size, height: size }}
                />
              )
            })}
          </span>
          {rest > 0 && <span className="ml-1 font-mono text-[11.5px] text-muted-foreground">+{rest}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-60 p-0">
        <p className="border-b border-line px-3 py-2 text-xs font-semibold text-foreground">Na plateia</p>
        <ul className="scroll-stable max-h-64 overflow-y-auto py-1">
          {watchers.map((w) => {
            const member = byId[w.userId]
            return (
              <li key={w.userId} className="flex items-center gap-2 px-3 py-1.5 text-xs text-foreground">
                <UserAvatar
                  userId={w.userId}
                  src={resolveAssetUrl(member?.avatar ?? w.avatar)}
                  name={w.displayName}
                  className="poker-avatar"
                  style={{ width: 24, height: 24 }}
                />
                <span className="truncate">{member?.displayName ?? w.displayName}</span>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
