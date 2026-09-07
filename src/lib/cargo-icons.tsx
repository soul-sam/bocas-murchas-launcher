import {
  Anvil,
  Beer,
  Bomb,
  Crown,
  Dices,
  Flame,
  Gamepad2,
  Ghost,
  Hammer,
  Headphones,
  Heart,
  Music,
  Printer,
  Rocket,
  Shield,
  Skull,
  Sparkles,
  Star,
  Swords,
  Wrench,
  type LucideIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Cargo } from '@/lib/api-cargos'

/**
 * ÍCONES DOS CARGOS.
 *
 * O servidor guarda o NOME do ícone (`"Printer"`) e a tela resolve aqui. O
 * mapa é EXPLÍCITO, e não um `import * as lucide` indexado pelo nome, por dois
 * motivos:
 *
 *  - `lucide-react` tem mais de mil ícones. Indexar por nome em tempo de
 *    execução impede o tree-shaking e arrasta a biblioteca inteira pro bundle
 *    do launcher — que é um .exe que a galera baixa por auto-update;
 *  - nome de ícone vindo do banco é DADO, não código. Um cargo criado com
 *    `icon: "Xyz"` não pode virar `undefined` no meio do render e apagar a
 *    lista de membros. Aqui, nome desconhecido cai no escudo genérico.
 *
 * Esta lista é também o que o painel do admin oferece na hora de criar cargo:
 * o que não está aqui não aparece pra escolher, então não existe cargo com
 * ícone quebrado. Pra somar um ícone, importe e ponha no mapa — uma linha.
 */
export const CARGO_ICONS: Record<string, LucideIcon> = {
  Shield,
  Printer,
  Wrench,
  Hammer,
  Anvil,
  Crown,
  Star,
  Sparkles,
  Flame,
  Skull,
  Ghost,
  Bomb,
  Swords,
  Dices,
  Gamepad2,
  Headphones,
  Music,
  Rocket,
  Heart,
  Beer
}

/** Ordem em que o seletor do admin mostra. Escudo primeiro: é o padrão. */
export const CARGO_ICON_NAMES = Object.keys(CARGO_ICONS)

export function cargoIcon(name: string | null | undefined): LucideIcon {
  return (name && CARGO_ICONS[name]) || Shield
}

export function CargoIcon({
  icon,
  className
}: {
  icon: string | null | undefined
  className?: string
}) {
  const Icon = cargoIcon(icon)
  return <Icon className={className} />
}

/**
 * O CHIP do cargo — como o crachá aparece na lista de membros e no perfil.
 *
 * A cor vem do cargo e entra por `style`, não por classe: é hex escolhido pelo
 * admin, e Tailwind não tem classe pra cor arbitrária em tempo de execução. O
 * fundo é a mesma cor a 14% de opacidade, o que mantém contraste legível em
 * qualquer hex que a pessoa escolher — inclusive os escuros, que num fundo
 * sólido virariam texto ilegível.
 */
export function CargoChip({
  cargo,
  className,
  compact
}: {
  cargo: Cargo
  className?: string
  /** Só o ícone, sem o nome. Pra lugar apertado (linha da lista de membros). */
  compact?: boolean
}) {
  return (
    <span
      title={cargo.description ? `${cargo.name} — ${cargo.description}` : cargo.name}
      className={cn(
        'inline-flex shrink-0 cursor-default items-center gap-1 rounded-brutal border px-1',
        'text-[11px] leading-4',
        className
      )}
      style={{
        color: cargo.color,
        borderColor: `${cargo.color}66`,
        backgroundColor: `${cargo.color}24`
      }}
    >
      <CargoIcon icon={cargo.icon} className="h-2.5 w-2.5 shrink-0" />
      {!compact && <span className="truncate">{cargo.name}</span>}
    </span>
  )
}
