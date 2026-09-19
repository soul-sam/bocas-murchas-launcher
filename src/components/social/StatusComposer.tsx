import * as React from 'react'
import EmojiPicker, { Theme, EmojiStyle } from 'emoji-picker-react'
import { Smile, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useEmojis, toPickerEmojis } from '@/lib/emoji-context'
import { StatusText } from './AwayBadge'

/**
 * O CAMPO DO RECADO.
 *
 * O recado é a única frase que a pessoa escolhe mostrar do lado do próprio
 * nome, e até aqui era um `<input>` pelado: emoji só entrava por quem soubesse
 * o atalho do sistema, e `:kekw:` aparecia cru na lista de membros.
 *
 * Três coisas, então: um seletor de emoji (o mesmo do chat, com os emojis do
 * servidor dentro), atalhos pros recados que a galera repete, e uma PRÉVIA
 * desenhada do mesmo jeito que os outros vão ver — porque `:kekw:` no campo
 * não se parece nada com o que sai na tela.
 *
 * O AFK NÃO ESCREVE AQUI. Ausência virou crachá justamente pra este campo ser
 * só do dono — ver components/social/AwayBadge e lib/afk-context.
 *
 * STICKER NÃO CABE AQUI, e não é esquecimento: sticker é imagem do tamanho de
 * uma mensagem, e o recado é uma linha de 64 caracteres ao lado de um nome de
 * 7px. O que cabe nessa linha são os emojis do servidor, que já são imagens
 * pequenas e já viajam como texto (`:nome:`).
 */

/** Recados que a galera repete. Clicar TROCA o campo — é atalho, não carimbo. */
const PRESETS = [
  '🎮 jogando',
  '💼 no trampo',
  '😴 dormindo',
  '🍜 comendo',
  '📚 estudando',
  '🎧 ouvindo som',
  '🚗 na rua',
  '🤒 doente'
] as const

export function StatusComposer({
  value,
  onChange,
  id,
  maxLength = 64
}: {
  value: string
  onChange: (next: string) => void
  id?: string
  maxLength?: number
}) {
  const { emojis } = useEmojis()
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const pickerCustomEmojis = React.useMemo(() => toPickerEmojis(emojis), [emojis])

  /**
   * Insere onde o cursor está, e não no fim.
   *
   * Quem põe o emoji no meio da frase espera que ele fique no meio da frase. O
   * `setSelectionRange` depois do `focus` é o que devolve o cursor pro lugar
   * certo — sem ele o próximo emoji cai no fim, e o primeiro parece ter sido
   * sorte.
   */
  const insert = (text: string): void => {
    const el = inputRef.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const next = (value.slice(0, start) + text + value.slice(end)).slice(0, maxLength)
    onChange(next)

    window.requestAnimationFrame(() => {
      const caret = Math.min(start + text.length, next.length)
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          ref={inputRef}
          value={value}
          maxLength={maxLength}
          placeholder="jogando, no trampo, dormindo…"
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1"
        />

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Emoji"
              className="shrink-0 rounded-brutal border-2 border-line p-1.5 text-muted-foreground transition-colors hover:border-acid/50 hover:text-foreground"
            >
              <Smile className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto overflow-hidden border-0 p-0">
            <EmojiPicker
              theme={Theme.DARK}
              emojiStyle={EmojiStyle.NATIVE}
              lazyLoadEmojis
              width={320}
              height={380}
              searchPlaceholder="Procurar emoji"
              customEmojis={pickerCustomEmojis}
              onEmojiClick={(emoji) => {
                // Emoji do servidor viaja como `:nome:` — é o que a lista lê.
                insert(emoji.isCustom ? ':' + emoji.names[0] + ':' : emoji.emoji)
              }}
            />
          </PopoverContent>
        </Popover>

        {value && (
          <button
            type="button"
            title="Limpar o recado"
            onClick={() => onChange('')}
            className="shrink-0 rounded-brutal border-2 border-line p-1.5 text-muted-foreground transition-colors hover:border-destructive/60 hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            className={cn(
              'rounded-brutal border border-line px-1.5 py-0.5 text-[11.5px] transition-colors',
              value === preset
                ? 'border-acid/60 bg-acid/10 text-acid'
                : 'text-muted-foreground hover:border-acid/40 hover:text-foreground'
            )}
          >
            {preset}
          </button>
        ))}
      </div>

      {/* A prévia é o ponto do `:nome:`: no campo ele é texto, na tela é
          imagem, e sem ver o resultado ninguém confia em digitar isso. */}
      {value.includes(':') && (
        <p className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
          <span className="shrink-0">vai aparecer assim:</span>
          <StatusText text={value} className="inline-flex items-center gap-0.5 text-foreground" />
        </p>
      )}
    </div>
  )
}
