import * as React from 'react'
import { Sticker as StickerIcon, Settings2 } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { Hint } from '@/components/ui/tooltip'
import { resolveAssetUrl } from '@/lib/api'
import { useEmojis, type Sticker, type StickerPack } from '@/lib/emoji-context'

/**
 * Picker de stickers do compositor.
 *
 * Clicar num sticker MANDA na hora, sem passar pelo campo de texto: sticker e
 * uma mensagem inteira (type 'sticker'), nao um pedaco de texto como o emoji.
 * E o que o Discord e o WhatsApp fazem, e evita inventar um "preview de
 * sticker pendente" no compositor so pra ter um botao de enviar a mais.
 */
export function StickerPicker({
  onPick,
  onManage,
  disabled
}: {
  onPick: (sticker: Sticker) => void | Promise<void>
  /** Abre o gerenciador de emojis/stickers (fecha o picker antes). */
  onManage: () => void
  disabled?: boolean
}) {
  const { packs } = useEmojis()
  const [open, setOpen] = React.useState(false)
  const [activeId, setActiveId] = React.useState<string | null>(null)

  // Pack ativo: o escolhido, ou o primeiro que existir. Cai pro primeiro
  // tambem quando o escolhido e apagado enquanto o picker esta aberto.
  const active: StickerPack | undefined = React.useMemo(() => {
    return packs.find((p) => p.id === activeId) ?? packs[0]
  }, [packs, activeId])

  const pick = (sticker: Sticker): void => {
    setOpen(false)
    void onPick(sticker)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Sticker"
          disabled={disabled}
          className="shrink-0 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <StickerIcon className="h-4 w-4" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[320px] p-0">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <span className="text-[11.5px] text-muted-foreground">
            Stickers
          </span>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onManage()
            }}
            className="ml-auto flex items-center gap-1 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            <Settings2 className="h-3 w-3" />
            gerenciar
          </button>
        </div>

        {packs.length === 0 || !active ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            Nenhum sticker ainda.
            <br />
            Clica em <span className="text-acid-text">gerenciar</span> pra criar o primeiro pack.
          </p>
        ) : (
          <>
            {/* Abas dos packs: a capa (primeiro sticker) vira o icone da aba.
                Rolagem horizontal porque 30 packs nao cabem em 320px. */}
            <div className="flex gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
              {packs.map((pack) => {
                const cover = resolveAssetUrl(pack.coverUrl)
                const isActive = pack.id === active.id
                return (
                  <Hint key={pack.id} label={pack.name} description={pack.description}>
                  <button
                    type="button"
                    onClick={() => setActiveId(pack.id)}
                    className={cn(
                      'flex h-8 shrink-0 items-center gap-1.5 rounded-brutal border px-1.5 transition-colors',
                      isActive
                        ? 'border-acid bg-acid/15 text-acid'
                        : 'border-transparent text-muted-foreground hover:border-line hover:text-foreground'
                    )}
                  >
                    {cover ? (
                      <img
                        src={cover}
                        alt=""
                        loading="lazy"
                        draggable={false}
                        className="h-6 w-6 object-contain"
                      />
                    ) : (
                      <span className="font-display text-sm uppercase">{pack.name.slice(0, 1)}</span>
                    )}
                    {isActive && (
                      <span className="max-w-[90px] truncate text-[11.5px]">
                        {pack.name}
                      </span>
                    )}
                  </button>
                  </Hint>
                )
              })}
            </div>

            <div className="max-h-[280px] overflow-y-auto p-2">
              {active.stickers.length === 0 ? (
                <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                  Pack vazio. Sobe uns stickers em <span className="text-acid-text">gerenciar</span>.
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-1">
                  {active.stickers.map((sticker) => (
                    <button
                      key={sticker.id}
                      type="button"
                      title={sticker.name}
                      onClick={() => pick(sticker)}
                      className="flex aspect-square items-center justify-center rounded-brutal border border-transparent p-1 transition-all hover:border-acid/50 hover:bg-void-light/60 hover:scale-105"
                    >
                      <img
                        src={resolveAssetUrl(sticker.url)}
                        alt={sticker.name}
                        loading="lazy"
                        draggable={false}
                        className="h-full w-full object-contain"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
