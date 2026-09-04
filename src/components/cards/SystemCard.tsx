import { ArrowUp, Award, ShoppingBag, Info } from 'lucide-react'
import type { CardProps } from './index'
import { CardFrame } from './index'
import type { SystemCardMeta } from '@/lib/api-gamification'

/**
 * CARTÃO DE SISTEMA — avisos do próprio servidor: subiu de nível, ganhou
 * badge, comprou cosmético, ou um recado genérico. Um ícone, um título, um
 * corpo. Sem botão: é pra ler, não pra clicar.
 */

const KIND: Record<
  SystemCardMeta['kind'],
  { accent: 'acid' | 'burn' | 'muted'; label: string; Icon: typeof Info }
> = {
  levelup: { accent: 'acid', label: 'Subiu de nível', Icon: ArrowUp },
  badge: { accent: 'burn', label: 'Badge nova', Icon: Award },
  purchase: { accent: 'burn', label: 'Lojinha', Icon: ShoppingBag },
  info: { accent: 'muted', label: 'Sistema', Icon: Info }
}

export function SystemCard({ message, metadata }: CardProps<SystemCardMeta>) {
  const kind = KIND[metadata.kind] ?? KIND.info
  const Icon = kind.Icon
  const title = metadata.title || kind.label
  const body = metadata.body || message.content

  return (
    <CardFrame accent={kind.accent} icon={<Icon className="h-3.5 w-3.5" />} title={kind.label}>
      <div className="flex items-center gap-3">
        {metadata.icon ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-brutal border border-[#1a1a1a] bg-void text-xl leading-none">
            {metadata.icon}
          </span>
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-brutal border border-[#1a1a1a] bg-void text-acid">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base leading-tight text-foreground">{title}</p>
          {body && <p className="text-xs leading-snug text-muted-foreground">{body}</p>}
        </div>
      </div>
    </CardFrame>
  )
}
