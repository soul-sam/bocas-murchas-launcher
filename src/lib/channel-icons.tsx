import type { ReactNode } from 'react'
import {
  Armchair,
  Beer,
  Bot,
  Cake,
  CalendarDays,
  ChartColumn,
  Clapperboard,
  Coffee,
  Coins,
  Crosshair,
  Crown,
  Film,
  Flame,
  Gamepad2,
  Ghost,
  Headphones,
  Image,
  Laugh,
  Lightbulb,
  Link,
  MapPin,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Mic,
  Moon,
  Pickaxe,
  Popcorn,
  Printer,
  Radiation,
  Radio,
  ScrollText,
  Shield,
  ShoppingBag,
  Skull,
  Swords,
  Target,
  Trophy,
  Tv,
  UtensilsCrossed,
  Volume2,
  Zap,
  type LucideIcon
} from 'lucide-react'
import { BADGE_GLYPH, Glyph } from './cosmetic-glyphs'

/**
 * ÍCONES DE CANAL — um catálogo fechado, de traço, no mesmo desenho do app.
 *
 * Por que não emoji: o canal abriu com emoji (💬 ⚔️ 📅) e ficou com cara de
 * modelo pronto — onze cores diferentes numa coluna que deveria ser calma, e
 * um desenho que muda de Windows pra Android. Aqui todo ícone é traço 2 em
 * grade de 24, pega a cor do texto (`currentColor`) e acende junto com a
 * linha ativa, igual ao resto da barra.
 *
 * `Channel.icon` guarda a CHAVE (`lol`, `apostas`…). Chave desconhecida — ou
 * um emoji antigo que não está no mapa de migração — cai no símbolo do tipo
 * do canal, então nada quebra se a lista mudar.
 *
 * Os da casa (caveira do pentakill, dado das apostas, vinil do DJ, balão do
 * tagarela) vêm de `cosmetic-glyphs.tsx`, que já segue as mesmas regras de
 * arte do lucide: traço 2, ponta redonda, área segura de 20.
 */

type Art = { lucide: LucideIcon } | { glyph: ReactNode }

export interface ChannelIconDef {
  key: string
  label: string
  art: Art
}

export interface ChannelIconGroup {
  label: string
  icons: ChannelIconDef[]
}

const L = (key: string, label: string, icon: LucideIcon): ChannelIconDef => ({
  key,
  label,
  art: { lucide: icon }
})
const G = (key: string, label: string, glyph: ReactNode): ChannelIconDef => ({
  key,
  label,
  art: { glyph }
})

export const CHANNEL_ICON_GROUPS: ChannelIconGroup[] = [
  {
    label: 'Conversa',
    icons: [
      L('chat', 'Papo', MessageCircle),
      L('geral', 'Geral', MessagesSquare),
      G('tagarela', 'Tagarela', BADGE_GLYPH['tagarela-1000']),
      L('memes', 'Memes', Laugh),
      L('cafe', 'Café', Coffee),
      L('fantasma', 'Off-topic', Ghost)
    ]
  },
  {
    label: 'Jogos',
    icons: [
      L('lol', 'LoL', Swords),
      G('pentakill', 'Pentakill', BADGE_GLYPH.pentakill),
      L('controle', 'Controle', Gamepad2),
      L('mira', 'Mira', Crosshair),
      L('alvo', 'Alvo', Target),
      L('minecraft', 'Minecraft', Pickaxe),
      L('arc', 'Arc Raiders', Radiation),
      L('caveira', 'Caveira', Skull),
      L('escudo', 'Escudo', Shield),
      L('trofeu', 'Troféu', Trophy),
      L('coroa', 'Coroa', Crown),
      L('raio', 'Ranked', Zap)
    ]
  },
  {
    label: 'Grupo',
    icons: [
      L('agenda', 'Agenda', CalendarDays),
      L('enquetes', 'Enquetes', ChartColumn),
      L('ideias', 'Ideias', Lightbulb),
      L('role', 'Rolê', MapPin),
      L('churrasco', 'Churrasco', Flame),
      L('bar', 'Bar', Beer),
      L('rodizio', 'Rodízio', UtensilsCrossed),
      L('aniversario', 'Aniversário', Cake),
      L('cinema', 'Cinema', Film),
      L('pipoca', 'Sessão', Popcorn)
    ]
  },
  {
    label: 'Servidor',
    icons: [
      L('avisos', 'Avisos', Megaphone),
      G('apostas', 'Apostas', BADGE_GLYPH.apostador),
      L('moedas', 'Moedas', Coins),
      L('loja', 'Lojinha', ShoppingBag),
      L('clipes', 'Clipes', Clapperboard),
      G('musica', 'Música', BADGE_GLYPH.dj),
      L('fotos', 'Fotos', Image),
      L('links', 'Links', Link),
      L('regras', 'Regras', ScrollText),
      L('impressora', 'Impressora', Printer),
      L('bot', 'Bot', Bot)
    ]
  },
  {
    label: 'Voz',
    icons: [
      L('voz', 'Voz', Volume2),
      L('fone', 'Fone', Headphones),
      L('mic', 'Microfone', Mic),
      L('radio', 'Rádio', Radio),
      L('tv', 'TV', Tv),
      L('sofa', 'Sofá', Armchair),
      L('afk', 'AFK', Moon)
    ]
  }
]

const BY_KEY = new Map<string, ChannelIconDef>(
  CHANNEL_ICON_GROUPS.flatMap((g) => g.icons.map((i) => [i.key, i] as const))
)

/**
 * O que o seed gravava antes deste catálogo existir. Mapear aqui faz o
 * servidor que já está no ar aparecer com ícone de traço no mesmo dia, sem
 * esperar ninguém clicar em "Organizar" (que também converte — ver a rota
 * /channels/seed).
 */
const LEGACY_EMOJI: Record<string, string> = {
  '💬': 'chat',
  '😂': 'memes',
  '⚔️': 'lol',
  '⚔': 'lol',
  '📅': 'agenda',
  '📊': 'enquetes',
  '💡': 'ideias',
  '📢': 'avisos',
  '🎲': 'apostas',
  '🎬': 'clipes',
  '🔊': 'voz',
  '🎮': 'controle'
}

/** A definição do ícone guardado no canal, ou null (usa o símbolo do tipo). */
export function channelIconDef(raw: string | null | undefined): ChannelIconDef | null {
  const value = raw?.trim()
  if (!value) return null
  return BY_KEY.get(value) ?? BY_KEY.get(LEGACY_EMOJI[value] ?? '') ?? null
}

/** Desenha uma definição do catálogo. O tamanho vem da classe. */
export function ChannelIconArt({ def, className }: { def: ChannelIconDef; className?: string }) {
  if ('lucide' in def.art) {
    const Icon = def.art.lucide
    return <Icon aria-hidden className={className} />
  }
  return <Glyph art={def.art.glyph} className={className} />
}
