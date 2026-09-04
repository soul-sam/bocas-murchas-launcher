import * as React from 'react'
import { cn } from '@/lib/utils'
import { useMembers } from '@/lib/members-context'
import { useGamification } from '@/lib/gamification-context'
import { NameEffect } from './NameEffect'

/**
 * Nome de quem escreveu, como aparece no cabeçalho da mensagem.
 *
 * Existe como componente próprio pra os cosméticos da gamificação (efeito no
 * nome, título do lado) entrarem aqui sem mexer no MessageItem. Recebe o que o
 * MessageItem já sabia: nome, cor do perfil e o id.
 *
 * Os cosméticos vêm da lista de membros, não do `message.author`: o autor da
 * mensagem é uma foto da hora do envio, e quem troca de título quer ver a
 * troca nas mensagens antigas também. A lista já recebe `user:profileUpdated`.
 */
export function AuthorName({
  userId,
  displayName,
  color,
  className,
  style,
  onContextMenu
}: {
  userId: string
  displayName: string
  color?: string
  className?: string
  style?: React.CSSProperties
  onContextMenu?: (event: React.MouseEvent) => void
}) {
  const { byId } = useMembers()
  const { cosmeticName } = useGamification()

  const member = byId[userId]
  const title = cosmeticName(member?.title)

  return (
    // shrink-0 no conjunto: o nome nunca encolhia pra dar espaço ao texto
    // (nem no modo compacto), e o título não pode mudar isso.
    <span onContextMenu={onContextMenu} className="inline-flex shrink-0 items-baseline gap-1.5">
      <NameEffect
        effect={member?.nameEffect}
        className={cn(className)}
        style={{ ...(color ? { color } : {}), ...style }}
      >
        {displayName}
      </NameEffect>

      {title && (
        <span
          title="Título equipado (lojinha)"
          className="shrink-0 cursor-default rounded-brutal border border-burn/40 px-1 font-mono text-[9px] uppercase leading-4 tracking-widest text-burn"
        >
          {title}
        </span>
      )}
    </span>
  )
}
