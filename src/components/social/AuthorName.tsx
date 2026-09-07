import * as React from 'react'
import { cn } from '@/lib/utils'
import { useMembers } from '@/lib/members-context'
import { useGamification } from '@/lib/gamification-context'
import { TitleTag } from '@/lib/cosmetic-icons'
import { NameEffect } from './NameEffect'
import { NameEmoji } from './NameEmoji'

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
        animated={false}
        effect={member?.nameEffect}
        className={cn(className)}
        style={{ ...(color ? { color } : {}), ...style }}
      >
        {displayName}
      </NameEffect>

      {/* O emoji ao lado do nome e cosmetico COMPRADO: e conteudo que a
          pessoa escolheu, nao enfeite da interface — por isso continua emoji
          mesmo com os icones no resto. */}
      <NameEmoji id={member?.emoji} />

      {title && <TitleTag titleId={member?.title} name={title} />}
    </span>
  )
}
