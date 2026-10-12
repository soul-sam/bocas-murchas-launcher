import { cn } from '@/lib/utils'
import { useGamification } from '@/lib/gamification-context'
import { SUPREME_IDS, tintStyle } from '@/lib/api-gamification'
import { SupremeMouth } from '@/components/ui/SupremeMouth'

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
 *
 * `id2`/`glyph2` é o segundo slot (item `emojiSlot:2`): "Nome 😀 🎉".
 *
 * A Boca Suprema (`emoji:boca-suprema`) é desenhada em SVG; o glifo 👄 do
 * catálogo fica de fallback em texto puro (notificações, tooltips).
 */
export function NameEmoji({
  id,
  glyph,
  id2,
  glyph2,
  className,
  size = 'sm',
  gradient,
  animated = true
}: {
  id?: string | null
  glyph?: string | null
  id2?: string | null
  glyph2?: string | null
  className?: string
  /** sm = linha de chat/lista; md = cabeçalhos (perfil, voz). */
  size?: 'sm' | 'md'
  /** `profileGradient` do dono: pinta a Boca Suprema nas cores dele. */
  gradient?: string | null
  /** false em listas estáticas: a boca fica parada. */
  animated?: boolean
}) {
  const { cosmeticEmoji } = useGamification()
  const slots = [
    { id, glyph: glyph ?? cosmeticEmoji(id) },
    { id: id2, glyph: glyph2 ?? cosmeticEmoji(id2) }
  ].filter((s) => s.glyph)
  if (slots.length === 0) return null

  return (
    <span
      role="img"
      aria-label="emoji equipado"
      title="Emoji equipado (lojinha)"
      style={tintStyle(null, gradient)}
      className={cn(
        // inline-flex + items-center: emoji centraliza na linha do nome em vez
        // de sentar na baseline (que o deixa caído em relação ao texto).
        'inline-flex shrink-0 cursor-default select-none items-center gap-[0.25em] leading-none',
        size === 'sm' ? 'text-[13px]' : 'text-base',
        className
      )}
    >
      {slots.map((s, i) =>
        s.id === SUPREME_IDS.emoji ? (
          <SupremeMouth key={i} className="h-[1em] w-[1.6em]" animated={animated} kiss />
        ) : (
          <span key={i}>{s.glyph}</span>
        )
      )}
    </span>
  )
}
