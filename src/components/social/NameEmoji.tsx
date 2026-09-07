import { cn } from '@/lib/utils'
import { useGamification } from '@/lib/gamification-context'

/**
 * Emoji equipado do lado do nome (lojinha, aba "Emojis").
 *
 * Ordem combinada em todo canto que mostra alguém: `Nome · emoji · Título`.
 * O user guarda só o id do cosmético (`emoji:oculos`); o glifo vem do catálogo
 * da loja via contexto. Sem catálogo ainda (ou id desconhecido) não renderiza
 * nada — quem chama não precisa condicionar.
 *
 * `glyph` serve pra prévia na própria loja, quando o item ainda não está
 * equipado e não faz sentido passar pelo catálogo.
 */
export function NameEmoji({
  id,
  glyph,
  className,
  size = 'sm'
}: {
  id?: string | null
  glyph?: string | null
  className?: string
  /** sm = linha de chat/lista; md = cabeçalhos (perfil, voz). */
  size?: 'sm' | 'md'
}) {
  const { cosmeticEmoji } = useGamification()
  const emoji = glyph ?? cosmeticEmoji(id)
  if (!emoji) return null

  return (
    <span
      role="img"
      aria-label="emoji equipado"
      title="Emoji equipado (lojinha)"
      className={cn(
        'inline-block shrink-0 cursor-default select-none leading-none',
        size === 'sm' ? 'text-[13px]' : 'text-base',
        className
      )}
    >
      {emoji}
    </span>
  )
}
