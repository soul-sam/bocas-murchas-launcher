import * as React from 'react'
import { X, Coins, Loader2, Check, ShoppingBag, Tag, Sparkles, Frame, Smile, Volume2, Play } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { ApiError, resolveAssetUrl } from '@/lib/api'
import {
  cosmeticSound,
  cosmeticEmoji,
  formatCompact,
  RARITY_COLOR,
  RARITY_GLYPH,
  RARITY_LABEL,
  RARITY_STYLE,
  type CosmeticType,
  type Rarity,
  type ShopItem,
  DEFAULT_NAME_COLOR
} from '@/lib/api-gamification'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { useOverlays } from '@/lib/overlay-context'
import { useGamification } from '@/lib/gamification-context'
import { useSettings } from '@/lib/settings-context'
import { playJoinSound } from '@/lib/ui-sounds'
import { cn } from '@/lib/utils'
import { NameEffect } from './NameEffect'
import { NameEmoji } from './NameEmoji'
import { TitleTag } from '@/lib/cosmetic-icons'

/**
 * LOJINHA — gastar murchos em título, efeito de nome, moldura de avatar,
 * emoji do lado do nome (`Nome · 😎 · Título`) e som de entrar/sair da call.
 *
 * Camada própria (div fixed + clique fora fecha), NÃO Radix Dialog: ela mora
 * em GlobalOverlays mas quem abre pode estar numa tela que some, e camada
 * modal arrancada da árvore trava o <body> — ver lib/interaction-guard.ts.
 *
 * A prévia do topo mostra MEU nome/avatar com o item em que o mouse está,
 * caindo no que está equipado quando o mouse sai. É assim que a pessoa decide
 * se o rainbow fica bom com a cor dela antes de gastar.
 */

const TABS: { type: CosmeticType; label: string; Icon: typeof Tag }[] = [
  { type: 'title', label: 'Títulos', Icon: Tag },
  { type: 'nameEffect', label: 'Efeitos', Icon: Sparkles },
  { type: 'avatarFrame', label: 'Molduras', Icon: Frame },
  { type: 'emoji', label: 'Emojis', Icon: Smile },
  { type: 'joinSound', label: 'Sons', Icon: Volume2 }
]

const RARITY_ORDER: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3 }

export function ShopModal() {
  const { shopOpen: open, closeShop: close } = useOverlays()
  const { user } = useAuth()
  const { byId } = useMembers()
  const { shop, loadShop, buy, equip, profile, catalog } = useGamification()
  const { settings } = useSettings()

  const [tab, setTab] = React.useState<CosmeticType>('title')
  const [hovered, setHovered] = React.useState<ShopItem | null>(null)
  const [confirming, setConfirming] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  // Rebusca ao abrir: preço e saldo podem ter mudado desde o login.
  React.useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setConfirming(null)
    void loadShop().finally(() => setLoading(false))
  }, [open, loadShop])

  React.useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open || !user) return null

  const me = byId[user.id] ?? user
  const color = me.profileColor ?? DEFAULT_NAME_COLOR
  // Som toca no volume do slider "entrar/sair da call", que é o que a galera
  // vai ouvir de verdade. Slider em zero: a prévia toca baixinho mesmo assim,
  // senão a prateleira parece quebrada.
  const previewVolume = settings.soundEnabled && settings.voiceCueVolume > 0 ? settings.voiceCueVolume : 0.4
  const coins = profile?.coins ?? shop?.coins ?? 0

  const items = (shop?.items ?? [])
    .filter((item) => item.type === tab)
    .sort((a, b) => (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0) || a.price - b.price)

  // Prévia: item sob o mouse ganha do equipado, mas só no slot dele.
  const previewTitle =
    hovered?.type === 'title' ? hovered.name : titleName(shop?.items, me.title)
  // O id, e nao so o nome: e dele que sai o icone do titulo.
  const previewTitleId = hovered?.type === 'title' ? hovered.id : me.title
  const previewEffect = hovered?.type === 'nameEffect' ? hovered.id : me.nameEffect
  const previewFrame = hovered?.type === 'avatarFrame' ? hovered.id : me.avatarFrame
  const previewEmoji =
    hovered?.type === 'emoji' ? cosmeticEmoji(hovered) : cosmeticEmoji(catalog[me.emoji ?? ''])

  const handleBuy = async (item: ShopItem): Promise<void> => {
    setBusy(item.id)
    setError(null)
    try {
      await buy(item.id)
      setConfirming(null)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 402
            ? 'Murchos insuficientes. Vai jogar mais.'
            : err.status === 409
              ? 'Você já tem esse.'
              : err.message
          : 'Não deu pra comprar agora.'
      )
    } finally {
      setBusy(null)
    }
  }

  const handleEquip = async (item: ShopItem, unequip: boolean): Promise<void> => {
    setBusy(item.id)
    setError(null)
    try {
      await equip(item.type, unequip ? null : item.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra equipar agora.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={close}
    >
      <div
        className="card-acid relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-brutal p-5"
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

        <div className="mb-4 flex items-center gap-3">
          <ShoppingBag className="h-7 w-7 text-burn drop-shadow-[0_0_8px_rgba(242,183,5,0.6)]" />
          <div className="min-w-0 flex-1">
            <h2 className="title-brutal text-2xl">Lojinha</h2>
            <p className="text-[11.5px] text-muted-foreground">
              enfeite pro seu nome, pago em murchos
            </p>
          </div>
          <div
            className="flex items-center gap-1.5 rounded-brutal border-2 border-burn/60 bg-burn/10 px-3 py-1.5 font-mono text-sm text-burn"
            title="Seu saldo"
          >
            <Coins className="h-4 w-4" />
            {formatCompact(coins)}
            <span className="text-[11.5px] opacity-70">murchos</span>
          </div>
        </div>

        {/* Prévia: eu, com o que está sob o mouse. */}
        <div className="mb-4 flex items-center gap-3 rounded-brutal border border-line bg-void px-3 py-2">
          <UserAvatar
            src={resolveAssetUrl(me.avatar)}
            name={me.displayName}
            ringColor={color}
            frame={previewFrame}
            className="h-11 w-11 border-2"
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-1.5 font-display text-base leading-tight" style={{ color }}>
              <NameEffect effect={previewEffect} className="truncate">
                {me.displayName}
              </NameEffect>
              <NameEmoji glyph={previewEmoji} size="md" />
              {previewTitle && (
                <TitleTag
                  titleId={previewTitleId}
                  name={previewTitle}
                  tooltip={hovered?.type === 'title' ? `prévia: ${previewTitle}` : undefined}
                />
              )}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {hovered ? `prévia: ${hovered.name}` : 'é assim que a galera te vê'}
            </p>
          </div>
        </div>

        <div className="mb-3 flex gap-1">
          {TABS.map(({ type, label, Icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setTab(type)
                setConfirming(null)
                setError(null)
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-brutal border-2 px-3 py-1.5 font-mono text-[11.5px] uppercase tracking-widest transition-colors',
                tab === type
                  ? 'border-acid bg-acid/10 text-acid'
                  : 'border-line text-muted-foreground hover:border-acid/50 hover:text-foreground'
              )}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>

        {error && (
          <p className="mb-2 rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto pr-1" onMouseLeave={() => setHovered(null)}>
          {loading && !shop ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nada nessa prateleira ainda.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {items.map((item) => (
                <ItemTile
                  key={item.id}
                  item={item}
                  me={{ name: me.displayName, avatar: resolveAssetUrl(me.avatar), color }}
                  coins={coins}
                  busy={busy === item.id}
                  confirming={confirming === item.id}
                  onHover={() => setHovered(item)}
                  onAskBuy={() => setConfirming(item.id)}
                  onCancel={() => setConfirming(null)}
                  onBuy={() => void handleBuy(item)}
                  onEquip={() => void handleEquip(item, false)}
                  onUnequip={() => void handleEquip(item, true)}
                  onPreview={
                    item.type === 'joinSound'
                      ? (phase) => playJoinSound(cosmeticSound(item), phase, previewVolume)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Texto do título equipado a partir do catálogo (o user guarda só o id). */
function titleName(items: ShopItem[] | undefined, id: string | null | undefined): string | null {
  if (!id) return null
  const found = items?.find((item) => item.id === id)
  if (found) return found.name
  return id.replace(/^title:/, '').replace(/[-_]+/g, ' ')
}

function ItemTile({
  item,
  me,
  coins,
  busy,
  confirming,
  onHover,
  onAskBuy,
  onCancel,
  onBuy,
  onEquip,
  onUnequip,
  onPreview
}: {
  item: ShopItem
  me: { name: string; avatar?: string; color: string }
  coins: number
  busy: boolean
  confirming: boolean
  onHover: () => void
  onAskBuy: () => void
  onCancel: () => void
  onBuy: () => void
  onEquip: () => void
  onUnequip: () => void
  /** Só nos sons: toca o par entrar/sair pra ouvir antes de comprar. */
  onPreview?: (phase: 'join' | 'leave') => void
}) {
  const tier = (item.rarity as Rarity) ?? 'common'
  const rarity = RARITY_COLOR[tier] ?? RARITY_COLOR.common
  const style = RARITY_STYLE[tier] ?? RARITY_STYLE.common
  const affordable = coins >= item.price

  return (
    <div
      onMouseEnter={onHover}
      /* A borda tingida e o halo VEM DA RARIDADE, e o halo so existe do epico
         pra cima: se todo card brilhasse, nenhum se destacaria. Equipado troca
         pra borda verde porque ai o que importa e o estado, nao o tier. */
      className={cn(
        'flex flex-col gap-2.5 rounded-brutal border bg-void/60 p-3 transition-colors',
        item.equipped ? 'border-acid' : 'hover:border-border'
      )}
      style={
        !item.equipped
          ? { borderColor: style.ring, boxShadow: style.glow === 'none' ? undefined : style.glow }
          : undefined
      }
    >
      {/* Amostra do item, do jeito que vai aparecer. */}
      <div className="flex h-12 items-center justify-center rounded-brutal bg-void px-2">
        {item.type === 'title' && (
          <TitleTag
            titleId={item.id}
            name={item.name}
            tooltip={item.description || item.name}
            className="px-1.5 text-[11.5px] leading-5"
          />
        )}
        {item.type === 'nameEffect' && (
          <span className="truncate font-display text-base" style={{ color: me.color }}>
            <NameEffect effect={item.id}>{me.name}</NameEffect>
          </span>
        )}
        {item.type === 'avatarFrame' && (
          <UserAvatar src={me.avatar} name={me.name} frame={item.id} className="h-9 w-9 border-2" />
        )}
        {item.type === 'emoji' && (
          <span className="flex items-center gap-1.5 truncate font-display text-sm" style={{ color: me.color }}>
            <span className="truncate">{me.name}</span>
            <NameEmoji glyph={cosmeticEmoji(item)} className="text-2xl" />
          </span>
        )}
        {item.type === 'joinSound' && onPreview && (
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPreview('join')}
              title="Ouvir: entrou"
              className="flex items-center gap-1 rounded-brutal border border-line px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-acid/60 hover:text-acid"
            >
              <Play className="h-3 w-3" />
              entrou
            </button>
            <button
              type="button"
              onClick={() => onPreview('leave')}
              title="Ouvir: saiu"
              className="flex items-center gap-1 rounded-brutal border border-line px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-acid/60 hover:text-acid"
            >
              <Play className="h-3 w-3" />
              saiu
            </button>
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        {/* Nome e PRECO na mesma linha. O preco e a informacao de decisao da
            lojinha e vivia escondido dentro do botao, em 10px caixa-alta
            espacada. Alinhado a direita em todos os cards, da pra comparar a
            coluna inteira de cima a baixo sem reler card por card. */}
        <div className="flex items-baseline justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1 truncate text-sm font-semibold text-foreground">
            <span className="truncate">{item.name}</span>
            {item.equipped && <Check className="h-3 w-3 shrink-0 text-acid" aria-label="equipado" />}
          </p>
          <span className="shrink-0 font-mono text-base font-bold tabular-nums text-foreground">
            {item.price.toLocaleString('pt-BR')}
          </span>
        </div>

        {/* O GLIFO faz o trabalho que a cor sozinha nao faz: quem nao distingue
            roxo de ambar continua lendo o tier. */}
        <span
          className="flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: rarity, borderColor: style.ring, background: style.wash }}
        >
          <span aria-hidden>{RARITY_GLYPH[tier]}</span>
          {RARITY_LABEL[item.rarity] ?? item.rarity}
        </span>

        {item.description && (
          <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
            {item.description}
          </p>
        )}
      </div>

      <div className="mt-auto">
        {item.owned ? (
          <button
            type="button"
            disabled={busy}
            onClick={item.equipped ? onUnequip : onEquip}
            className={cn(
              'flex w-full items-center justify-center gap-1.5 rounded-brutal border px-2 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50',
              item.equipped
                ? 'border-acid bg-acid/15 text-acid hover:bg-destructive/15 hover:text-destructive hover:border-destructive/60'
                : 'border-acid-dark text-acid hover:bg-acid/15'
            )}
            title={item.equipped ? 'Clique pra tirar' : 'Equipar'}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : item.equipped ? <Check className="h-3 w-3" /> : null}
            {item.equipped ? 'Equipado' : 'Equipar'}
          </button>
        ) : confirming ? (
          <div className="flex gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={onBuy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-brutal bg-acid px-2 py-1.5 text-xs font-bold text-void shadow-[0_0_16px_rgb(var(--neon-rgb)/0.25)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Coins className="h-3 w-3" />}
              Confirmar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="rounded-brutal border border-border px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              Não
            </button>
          </div>
        ) : (
          // O botao diz o VERBO, nao o numero: o preco ja esta no topo do card.
          // E fica em contorno, nao preenchido — uma grade de vinte botoes
          // verdes solidos nao tem hierarquia nenhuma. O preenchimento aparece
          // so no passo de confirmar, que por construcao e um de cada vez.
          <button
            type="button"
            disabled={!affordable || busy}
            onClick={onAskBuy}
            title={
              affordable
                ? `Comprar por ${item.price.toLocaleString('pt-BR')} murchos`
                : `Faltam ${(item.price - coins).toLocaleString('pt-BR')} murchos`
            }
            className={cn(
              'flex w-full items-center justify-center gap-1.5 rounded-brutal border px-2 py-1.5 text-xs font-semibold transition-colors',
              affordable
                ? 'border-acid-dark text-acid hover:bg-acid/15'
                : 'cursor-not-allowed border-border text-muted-foreground opacity-60'
            )}
          >
            <Coins className="h-3 w-3" />
            {affordable ? 'Comprar' : 'Sem saldo'}
          </button>
        )}
      </div>
    </div>
  )
}
