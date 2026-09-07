import {
  Award,
  Bird,
  Clover,
  Coins,
  Crown,
  Dices,
  Droplet,
  Flame,
  Footprints,
  Handshake,
  Headphones,
  Megaphone,
  MessagesSquare,
  Mic,
  Moon,
  Radio,
  Shield,
  Skull,
  Star,
  Tag,
  TrendingDown,
  Trophy,
  Utensils,
  Zap,
  type LucideIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { cosmeticKey, RARITY_COLOR, type Rarity } from '@/lib/api-gamification'

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
 */

// ============================================
// BADGES (ids de lib/gamification/rules.ts na API)
// ============================================

const BADGE_ICON: Record<string, LucideIcon> = {
  'primeiro-sangue': Droplet,
  pentakill: Skull,
  'streak-7': Flame,
  'streak-30': Moon,
  coruja: Bird,
  dj: Headphones,
  cutucador: Zap,
  'tagarela-1000': MessagesSquare,
  maratonista: Footprints,
  apostador: Dices,
  sortudo: Clover,
  falido: TrendingDown,
  fivestack: Handshake,
  // Semanais, concedidas pelo recap de domingo.
  'mvp-da-semana': Trophy,
  'feeder-da-semana': Utensils,
  'boca-de-ouro': Megaphone,
  'dj-da-semana': Radio,
  'cutucador-da-semana': Zap
}

// ============================================
// TÍTULOS (ids `title:*` da lojinha)
// ============================================

const TITLE_ICON: Record<string, LucideIcon> = {
  feeder: Skull,
  suporte: Shield,
  'boca-de-ouro': Megaphone,
  dj: Headphones,
  cutucador: Zap,
  coruja: Bird,
  lenda: Crown
}

// ============================================
// PRÊMIOS DO RECAP (keys de modules/recap.ts na API)
// ============================================

const AWARD_ICON: Record<string, LucideIcon> = {
  mais_falou: Megaphone,
  mais_call: Mic,
  mvp_lol: Trophy,
  feeder: Utensils,
  dj: Radio,
  cutucador: Zap,
  streak: Flame,
  rico: Coins,
  falido: TrendingDown,
  corujao: Bird,
  campeao_xp: Star
}

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
  const Icon = (badgeId && BADGE_ICON[badgeId]) || Award
  return <Icon className={className ?? 'h-3.5 w-3.5'} aria-hidden />
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
  const Icon = (key && TITLE_ICON[key]) || Tag
  return <Icon className={className ?? 'h-2.5 w-2.5'} aria-hidden />
}

export function AwardIcon({
  awardKey,
  className
}: {
  awardKey: string | null | undefined
  className?: string
}) {
  const Icon = (awardKey && AWARD_ICON[awardKey]) || Trophy
  return <Icon className={className ?? 'h-4 w-4'} aria-hidden />
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
        'font-mono text-[9px] uppercase leading-4 tracking-widest text-burn',
        className
      )}
    >
      <TitleIcon titleId={titleId} className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  )
}
