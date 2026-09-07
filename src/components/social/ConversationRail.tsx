import * as React from 'react'
import { UserAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { resolveAssetUrl, type Channel } from '@/lib/api'
import { useChat } from '@/lib/chat-context'
import { useLayout } from '@/lib/layout-context'
import { useOverlays } from '@/lib/overlay-context'

/**
 * Barra vertical mais à esquerda, igual à rail de servidores do Discord: o
 * ícone do servidor em cima, as conversas abertas embaixo — cada uma com a foto
 * da pessoa.
 *
 * As conversas saíram da coluna de canais de propósito. Mensagem direta não é
 * "um canal a mais do servidor": ela existe fora dele, e enfiá-la na mesma
 * lista fazia parecer que a conversa pertencia ao Bocas Murchas.
 *
 * Escolher uma conversa NÃO troca a coluna do meio — os canais do servidor
 * continuam lá, só a área central vira o chat da DM.
 */
export function ConversationRail({
  onSelectText
}: {
  onSelectText: (channel: Channel) => void
}) {
  const { textChannels, dmChannels, conversations, activeChannelId, unread } = useChat()
  const { view } = useLayout()
  const { openUserMenu } = useOverlays()

  const dmActive = view === 'chat' && activeChannelId?.startsWith('dm:') === true

  // Voltar pro servidor tem que cair no canal em que a pessoa estava, não num
  // canal qualquer — por isso guardamos o último canal não-DM visitado.
  const lastServerChannelRef = React.useRef<string | null>(null)
  if (activeChannelId && !activeChannelId.startsWith('dm:')) {
    lastServerChannelRef.current = activeChannelId
  }

  const backToServer = React.useCallback(() => {
    const target =
      textChannels.find((c) => c.id === lastServerChannelRef.current) ?? textChannels[0]
    if (target) onSelectText(target)
  }, [textChannels, onSelectText])

  // Soma dos não-lidos de todas as conversas fechadas some do badge: cada
  // avatar já carrega o seu.
  return (
    <nav
      aria-label="Servidor e conversas"
      className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-[#1a1a1a] bg-[#080808] py-2"
    >
      <RailItem
        active={!dmActive}
        label="Bocas Murchas"
        onClick={backToServer}
      >
        <span
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-brutal border transition-colors',
            dmActive ? 'border-[#1a1a1a] bg-void-light' : 'border-acid/50 bg-acid/10'
          )}
        >
          <img
            src="bocas-murchas-transp.png"
            alt=""
            aria-hidden
            className="h-7 w-7 drop-shadow-[0_0_8px_rgba(106,255,0,0.5)]"
          />
        </span>
      </RailItem>

      {dmChannels.length > 0 && <span className="h-px w-8 shrink-0 bg-[#1a1a1a]" />}

      <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto">
        {dmChannels.map((channel) => {
          const peer = conversations.find((c) => 'dm:' + c.id === channel.id)?.other
          const count = unread[channel.id] ?? 0
          const active = view === 'chat' && channel.id === activeChannelId

          return (
            <RailItem
              key={channel.id}
              active={active}
              label={peer ? channel.name + ' (@' + peer.username + ')' : channel.name}
              onClick={() => onSelectText(channel)}
              onContextMenu={(event) => peer && openUserMenu(event, peer.id)}
            >
              <UserAvatar
                src={resolveAssetUrl(peer?.avatar)}
                name={peer?.displayName ?? channel.name}
                status={peer?.status ?? 'offline'}
                className={cn('h-10 w-10', active && 'ring-1 ring-acid')}
              />

              {count > 0 && !active && (
                <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full border-2 border-[#080808] bg-destructive px-1 text-center font-mono text-[9px] font-bold leading-[12px] text-dirty-white">
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </RailItem>
          )
        })}
      </div>
    </nav>
  )
}

/**
 * A pílula na borda esquerda é o que diz "você está aqui" sem depender de cor
 * no avatar — foto de perfil é imprevisível demais pra carregar esse sinal.
 */
function RailItem({
  active,
  label,
  onClick,
  onContextMenu,
  children
}: {
  active: boolean
  label: string
  onClick: () => void
  onContextMenu?: (event: React.MouseEvent) => void
  children: React.ReactNode
}) {
  return (
    <div className="relative shrink-0">
      <span
        aria-hidden
        className={cn(
          'absolute -left-2 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-acid transition-all',
          active ? 'h-6 opacity-100' : 'h-0 opacity-0'
        )}
      />
      <button
        type="button"
        onClick={onClick}
        onContextMenu={onContextMenu}
        title={label}
        aria-label={label}
        aria-current={active ? 'true' : undefined}
        className="relative block rounded-brutal transition-transform hover:scale-105 focus:outline-none focus-visible:ring-1 focus-visible:ring-acid"
      >
        {children}
      </button>
    </div>
  )
}
