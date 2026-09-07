import * as React from 'react'
import { Pin, X, Loader2, PinOff } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { resolveAssetUrl } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'
import { useLayout } from '@/lib/layout-context'

/**
 * Painel de mensagens fixadas.
 *
 * A API de fixar ja existia e ninguem conseguia VER o resultado: a mensagem
 * ganhava uma barra amarela e sumia no historico junto com o resto. Aqui elas
 * ficam a um clique — que e o unico motivo de existir fixar alguma coisa.
 *
 * O clique rola ate a mensagem no proprio chat quando ela esta carregada. Nao
 * damos "carregar ate achar": buscar pagina por pagina ate encontrar uma
 * mensagem de meses atras seguraria a interface por dezenas de requisicoes.
 */
export function PinnedPanel() {
  const { pinned, loadingPinned, togglePin } = useChat()
  const { closePinned } = useLayout()
  const { user } = useAuth()

  const isAdmin = user?.role === 'admin'

  /** Fixada antiga que não está no histórico carregado. */
  const [outOfReach, setOutOfReach] = React.useState<string | null>(null)

  const jump = (messageId: string): void => {
    const target = document.getElementById(`msg-${messageId}`)

    // Um clique que não faz nada parece bug. Se a mensagem está longe demais
    // no histórico, dizemos isso em vez de fingir que rolou.
    if (!target) {
      setOutOfReach(messageId)
      setTimeout(() => setOutOfReach((prev) => (prev === messageId ? null : prev)), 2_500)
      return
    }

    setOutOfReach(null)
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-l border-line bg-void">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <Pin className="h-3.5 w-3.5 shrink-0 text-burn" />
        <h3 className="flex-1 truncate font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
          Fixadas — {pinned.length}
        </h3>
        <button
          type="button"
          onClick={closePinned}
          title="Fechar"
          aria-label="Fechar fixadas"
          className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="scroll-stable min-h-0 flex-1 overflow-y-auto p-2">
        {loadingPinned && pinned.length === 0 ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : pinned.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs leading-relaxed text-muted-foreground">
            Nada fixado aqui.
            {isAdmin && ' Passe o mouse numa mensagem e clique no alfinete.'}
          </p>
        ) : (
          <div className="space-y-1.5">
            {pinned.map((message) => (
              <div
                key={message.id}
                className="group rounded-brutal border border-line bg-void-light/30 p-2 transition-colors hover:border-burn/40"
              >
                <button
                  type="button"
                  onClick={() => jump(message.id)}
                  className="block w-full text-left"
                >
                  <span className="mb-1 flex items-center gap-1.5">
                    <UserAvatar
                      src={resolveAssetUrl(message.author.avatar)}
                      name={message.author.displayName}
                      className="h-4 w-4"
                    />
                    <span className="truncate text-[11px] font-medium text-foreground">
                      {message.author.displayName}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                      {new Date(message.createdAt).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit'
                      })}
                    </span>
                  </span>

                  <span
                    className={cn(
                      'block text-[11px] leading-relaxed text-muted-foreground',
                      // 4 linhas: o suficiente pra reconhecer, pouco o bastante
                      // pra caberem varias fixadas sem rolagem.
                      'line-clamp-4'
                    )}
                  >
                    {message.content || '📷 imagem'}
                  </span>
                </button>

                {outOfReach === message.id && (
                  <p className="mt-1 text-[11px] text-burn">
                    role o chat pra cima pra chegar nela
                  </p>
                )}

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => void togglePin(message.id)}
                    title="Desafixar"
                    className="mt-1 flex items-center gap-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    <PinOff className="h-2.5 w-2.5" />
                    desafixar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
