import { cn } from '@/lib/utils'
import { Hint } from '@/components/ui/tooltip'
import { RARITY_COLOR, type Rarity } from '@/lib/api-gamification'
import {
  AWARD_GLYPH,
  BADGE_GLYPH,
  GENERIC_AWARD,
  GENERIC_BADGE,
  Glyph
} from '@/lib/cosmetic-glyphs'
import { titleRarity } from '@/lib/api-gamification'

/**
 * ÍCONES DOS COSMÉTICOS — badges e prêmios do recap (títulos são só texto).
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
    <Hint label={name} description={description}>
      <span
        aria-label={name}
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-brutal border bg-void',
          className
        )}
        style={{ borderColor: `${color}66`, color }}
      >
        <BadgeIcon badgeId={badgeId} className="h-3.5 w-3.5" />
      </span>
    </Hint>
  )
}

/**
 * Etiqueta do título equipado — só texto, na cor da raridade.
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
  // A cor é a da RARIDADE do título (comum cinza, raro azul, épico roxo,
  // lendário dourado) — antes era tudo âmbar, e um título comum parecia tão
  // importante quanto o lendário.
  const color = RARITY_COLOR[titleRarity(titleId)]
  return (
    // A etiqueta é a da v1.1.3 (só texto, cor pela raridade); o que entra aqui
    // é a dica em volta. `tooltip === name` acontece na lojinha, num item sem
    // descrição: repetir o nome em cima do nome não é dica, é eco.
    <Hint label={name} description={tooltip === name ? undefined : tooltip}>
      <span
        className={cn(
          'flex shrink-0 cursor-default items-center rounded-brutal border px-1',
          // font-sans explícito: a etiqueta fica dentro de nomes em Anton
          // (prévia da lojinha) e não pode herdar a display — é Inter sempre.
          'font-sans text-[11px] leading-4',
          className
        )}
        style={{ color, borderColor: `${color}66` }}
      >
        <span className="truncate">{name}</span>
      </span>
    </Hint>
  )
}
