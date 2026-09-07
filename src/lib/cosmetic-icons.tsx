import { cn } from '@/lib/utils'
import { cosmeticKey, RARITY_COLOR, type Rarity } from '@/lib/api-gamification'
import {
  AWARD_GLYPH,
  BADGE_GLYPH,
  GENERIC_AWARD,
  GENERIC_BADGE,
  GENERIC_TITLE,
  Glyph,
  TITLE_GLYPH_SM
} from '@/lib/cosmetic-glyphs'

/**
 * ÍCONES DOS COSMÉTICOS — badges, títulos e prêmios do recap.
 *
 * O servidor guarda um emoji em cada badge/prêmio (`icon: '🩸'`), e por um
 * tempo a tela desenhava esse emoji direto. Aqui a gente ignora o emoji e
 * desenha ícone de verdade, escolhido por ID.
 *
 * POR QUE ÍCONE E NÃO EMOJI:
 *
 *  - emoji é desenhado pela FONTE DO SISTEMA. O mesmo 🫵 aparece diferente em
 *    cada Windows, e alguns simplesmente não existem em fonte mais velha —
 *    viram quadradinho vazio na tela de quem não tem. Ícone é SVG nosso, sai
 *    igual em toda máquina;
 *  - emoji não obedece `currentColor`. Numa parede de badges, cada um chega
 *    com a paleta que o Google escolheu, e nada casa com a cor do perfil nem
 *    com a raridade;
 *  - emoji não tem tamanho previsível: `text-sm` dá alturas diferentes por
 *    emoji, e é por isso que a fileira de badges saía torta.
 *
 * O EMOJI DO SERVIDOR CONTINUA LÁ, de propósito: é o fallback de quem tem
 * launcher antigo, e é o que aparece em notificação do sistema (onde não dá
 * pra desenhar SVG). Quem manda na tela é este arquivo.
 *
 * ID DESCONHECIDO cai num ícone genérico — badge nova criada direto no banco
 * aparece com cara de badge, não com um buraco.
 *
 * A ARTE mora em `cosmetic-glyphs.tsx` e é nossa — antes cada badge pegava o
 * ícone mais parecido da lucide, e dava pra ver: "Cutucador" e "Cutucador da
 * Semana" eram o mesmo raio, "MVP" e "Campeão de XP" eram a mesma taça. Aqui
 * ficou só o mapa id→arte e os componentes que a tela usa.
 *
 * TÍTULO USA A ARTE `_SM`: a etiqueta desenha o ícone a 10px, e nesse tamanho
 * a versão detalhada virava borrão.
 */


// ============================================
// COMPONENTES
// ============================================

export function BadgeIcon({
  badgeId,
  className
}: {
  badgeId: string | null | undefined
  className?: string
}) {
  const art = (badgeId ? BADGE_GLYPH[badgeId] : null) ?? GENERIC_BADGE
  return <Glyph art={art} className={className ?? 'h-3.5 w-3.5'} />
}

/** Aceita o id completo (`title:dj`) ou só a chave (`dj`). */
export function TitleIcon({
  titleId,
  className
}: {
  titleId: string | null | undefined
  className?: string
}) {
  const key = cosmeticKey(titleId)
  const art = (key ? TITLE_GLYPH_SM[key] : null) ?? GENERIC_TITLE
  return <Glyph art={art} strokeWidth={2.5} className={className ?? 'h-2.5 w-2.5'} />
}

export function AwardIcon({
  awardKey,
  className
}: {
  awardKey: string | null | undefined
  className?: string
}) {
  const art = (awardKey ? AWARD_GLYPH[awardKey] : null) ?? GENERIC_AWARD
  return <Glyph art={art} className={className ?? 'h-4 w-4'} />
}

/**
 * Quadradinho de badge com a borda e a cor da raridade.
 *
 * Existe pra que a fileira de badges saia idêntica no cartão de perfil, no
 * ranking e no recap. Eram três blocos de JSX quase iguais, e cada um tinha
 * ficado com um tamanho de ícone diferente.
 */
export function BadgeChip({
  badgeId,
  name,
  description,
  rarity,
  className
}: {
  badgeId: string
  name: string
  description?: string
  rarity?: Rarity | string
  className?: string
}) {
  const color = RARITY_COLOR[rarity as Rarity] ?? RARITY_COLOR.common

  return (
    <span
      title={description ? `${name} — ${description}` : name}
      aria-label={name}
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-brutal border bg-void',
        className
      )}
      style={{ borderColor: `${color}66`, color }}
    >
      <BadgeIcon badgeId={badgeId} className="h-3.5 w-3.5" />
    </span>
  )
}

/**
 * Etiqueta do título equipado, com o ícone dele.
 *
 * Um componente só porque o título aparece em cinco telas (perfil, autor da
 * mensagem, lista de membros, ranking, lojinha) e "o mesmo título com aparência
 * diferente em cada lugar" é o tipo de coisa que ninguém reporta como bug mas
 * todo mundo percebe.
 */
export function TitleTag({
  titleId,
  name,
  className,
  tooltip = 'Título equipado (lojinha)'
}: {
  titleId: string | null | undefined
  name: string
  className?: string
  /**
   * Some lugares usam a etiqueta como AMOSTRA (a prateleira da lojinha, o
   * seletor no editor de perfil), e ali "título equipado" seria mentira.
   */
  tooltip?: string
}) {
  return (
    <span
      title={tooltip}
      className={cn(
        'flex shrink-0 cursor-default items-center gap-1 rounded-brutal border border-burn/40 px-1',
        'text-[11px] leading-4 text-burn',
        className
      )}
    >
      <TitleIcon titleId={titleId} className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  )
}
