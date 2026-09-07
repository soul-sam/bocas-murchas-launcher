import * as React from 'react'
import {
  Volume2,
  VolumeX,
  RotateCcw,
  Zap,
  AtSign,
  Hash,
  UserCog,
  Settings,
  Headphones,
  MessageSquare
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { useChat } from '@/lib/chat-context'
import { useVoice } from '@/lib/voice-context'
import { useNudge } from '@/lib/nudge-context'
import { useSettings } from '@/lib/settings-context'
import { useOverlays } from '@/lib/overlay-context'

/**
 * Menu de botao direito nos usuarios.
 *
 * Existe UM na arvore inteira (montado na casca autenticada) e ele se move pro
 * cursor — e como menu de contexto de programa de verdade funciona. Qualquer
 * linha que mostre uma pessoa so precisa chamar `openUserMenu(event, userId)`.
 *
 * `modal={false}` de proposito: menu modal do Radix escreve
 * `pointer-events: none` no <body>, e essa e a origem do travamento descrito em
 * lib/interaction-guard.ts. Um menu de contexto nao tem motivo nenhum pra
 * bloquear o resto da tela.
 */
export function UserContextMenu() {
  const { user } = useAuth()
  const { byId } = useMembers()
  const { openDm } = useChat()
  const voice = useVoice()
  const { nudgeUser } = useNudge()
  const { open: openSettings } = useSettings()
  const { userMenu, closeUserMenu, openProfileEditor } = useOverlays()

  const target = userMenu ? byId[userMenu.userId] : undefined
  const targetIsAway = target?.status === 'away'
  const userId = userMenu?.userId ?? ''

  const isSelf = !!user && userId === user.id
  const volume = voice.userVolume(userId)
  const muted = volume === 0

  const inMyCall = voice.participants.some((p) => p.identity === userId && !p.isLocal)

  const copy = React.useCallback((text: string) => {
    /**
     * A API moderna falha calada quando a janela esta sem foco — e o menu de
     * contexto e justamente onde isso acontece. O caminho velho do textarea
     * cobre esse caso e nao custa nada.
     */
    const fallback = (): void => {
      const field = document.createElement('textarea')
      field.value = text
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.select()
      try {
        document.execCommand('copy')
      } finally {
        field.remove()
      }
    }

    const promise = navigator.clipboard?.writeText(text)
    if (!promise) {
      fallback()
      return
    }
    void promise.catch(fallback)
  }, [])

  if (!userMenu) return null

  const displayName = target?.displayName ?? 'Usuário'

  return (
    <DropdownMenu
      modal={false}
      open
      onOpenChange={(next) => {
        if (!next) closeUserMenu()
      }}
    >
      <DropdownMenuTrigger asChild>
        {/* Ancora invisivel no ponto do clique: e ela que o Radix usa pra
            posicionar (e pra virar o menu pra cima perto da borda de baixo). */}
        <span
          tabIndex={-1}
          className="pointer-events-none fixed h-0 w-0"
          style={{ left: userMenu.x, top: userMenu.y }}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="bottom" sideOffset={2} className="w-60">
        <DropdownMenuLabel className="truncate">
          {displayName}
          {isSelf && <span className="ml-1 normal-case tracking-normal">(você)</span>}
        </DropdownMenuLabel>

        {!isSelf && (
          <>
            {/* Primeira coisa do menu: é a ação mais pedida e a única que não
                tinha caminho nenhum na interface antes. */}
            <DropdownMenuItem onSelect={() => void openDm(userId)}>
              <MessageSquare className="h-3.5 w-3.5" />
              Mandar mensagem
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Fora de um DropdownMenuItem de proposito: item de menu fecha no
                clique, e arrastar um slider dispara clique o tempo todo. */}
            <div className="px-2 pb-1.5 pt-1">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11.5px] text-muted-foreground">
                  Volume
                </span>
                <span
                  className={cn(
                    'font-mono text-[11.5px]',
                    muted ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {Math.round(volume * 100)}%
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={muted ? 'Voltar a ouvir' : 'Mutar só pra mim'}
                  onClick={() => voice.setUserVolume(userId, muted ? 1 : 0)}
                  className={cn(
                    'shrink-0 transition-colors',
                    muted ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {muted ? (
                    <VolumeX className="h-3.5 w-3.5" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5" />
                  )}
                </button>

                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={volume}
                  onChange={(e) => voice.setUserVolume(userId, Number(e.target.value))}
                  onDoubleClick={() => voice.setUserVolume(userId, 1)}
                  aria-label={`Volume de ${displayName}`}
                  className={cn('mini-slider min-w-0 flex-1', muted && 'is-muted')}
                />
              </div>

              {!inMyCall && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  vale na próxima call
                </p>
              )}
            </div>

            <DropdownMenuItem
              onSelect={() => voice.setUserVolume(userId, muted ? 1 : 0)}
              danger={!muted}
            >
              {muted ? (
                <>
                  <Headphones className="h-3.5 w-3.5" />
                  Voltar a ouvir
                </>
              ) : (
                <>
                  <VolumeX className="h-3.5 w-3.5" />
                  Mutar só pra mim
                </>
              )}
            </DropdownMenuItem>

            <DropdownMenuItem
              disabled={volume === 1}
              onSelect={() => voice.setUserVolume(userId, 1)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Voltar pro volume padrão
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Quem esta na minha call esta online por definicao — a lista de
                membros pode estar atrasada, e desabilitar por causa dela
                deixaria o botao morto sem motivo. */}
            {/* Quem avisou que saiu não é cutucado — e o menu diz isso ANTES
                do clique. O servidor também recusa, mas descobrir pelo erro é
                descobrir tarde. Ver lib/afk-context. */}
            <DropdownMenuItem
              disabled={targetIsAway || (!target?.isOnline && !inMyCall)}
              onSelect={() => nudgeUser(userId)}
            >
              <Zap className="h-3.5 w-3.5" />
              <span className="min-w-0 flex-1 truncate">
                {targetIsAway ? 'Cutucar — saiu' : 'Cutucar'}
              </span>
            </DropdownMenuItem>
          </>
        )}

        {isSelf && (
          <>
            <DropdownMenuItem onSelect={openProfileEditor}>
              <UserCog className="h-3.5 w-3.5" />
              Editar perfil
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={openSettings}>
              <Settings className="h-3.5 w-3.5" />
              Configurações
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={!target?.username}
          onSelect={() => target?.username && copy(`@${target.username}`)}
        >
          <AtSign className="h-3.5 w-3.5" />
          Copiar usuário
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={() => copy(userId)}>
          <Hash className="h-3.5 w-3.5" />
          Copiar ID
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
