import * as React from 'react'
import { X } from 'lucide-react'
import { useOverlays } from '@/lib/overlay-context'
import { useMembers } from '@/lib/members-context'
import { useFocusTrap } from '@/lib/use-focus-trap'
import { ProfileBody } from './ProfileCard'

/**
 * O PERFIL EM MODAL — o formato do Discord.
 *
 * O popover (components/social/ProfileCard) continua existindo e continua
 * sendo o certo na lista de membros: abre do lado, ancorado na linha, sem
 * cobrir a conversa. Este aqui e pro resto do app, onde a foto da pessoa
 * aparece no meio de outra coisa — no chat, na call, num cartao — e um
 * popover ficaria espremido contra a borda da tela ou tapando justamente o
 * que a pessoa estava lendo.
 *
 * CAMADA PROPRIA, SEM RADIX, e isto nao e preferencia: o avatar que abriu o
 * perfil DESMONTA sozinho o tempo todo — a pessoa sai da call, a mensagem rola
 * pra fora da lista virtualizada, a lista de membros se reordena. Uma modal do
 * Radix arrancada da arvore com ela aberta deixa `pointer-events: none` grudado
 * no <body> e o app inteiro para de aceitar clique, inclusive os botoes de
 * fechar a janela. Ver lib/interaction-guard.ts e o cabecalho do App.
 *
 * Por isso tambem o estado mora no overlay-context e o componente e montado no
 * GlobalOverlays: quem abre so pede a abertura, e fechar e sempre uma
 * transicao de verdade — nunca um desmonte.
 */
export function ProfileModal() {
  const { profileUserId, closeProfile } = useOverlays()
  const { byId } = useMembers()

  const panelRef = useFocusTrap<HTMLDivElement>(profileUserId !== null, closeProfile)

  const member = profileUserId ? byId[profileUserId] : null

  /**
   * A pessoa saiu do grupo (ou a lista ainda nao carregou) com o perfil
   * aberto: fecha em vez de deixar uma caixa vazia no ar. Sem isto o modal
   * ficaria preso, porque o botao de fechar tambem some junto com o conteudo.
   */
  React.useEffect(() => {
    if (profileUserId && !member) closeProfile()
  }, [profileUserId, member, closeProfile])

  if (!profileUserId || !member) return null

  return (
    <div
      onClick={closeProfile}
      className="fixed inset-0 z-[58] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={`Perfil de ${member.displayName}`}
        className="card-gradient relative max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-brutal border-2 border-acid-dark shadow-[0_0_50px_rgba(0,0,0,0.8)]"
      >
        {/*
          O X flutua por cima da capa. Fica no canto oposto ao avatar, que
          entra pela esquerda logo abaixo — e sobre a capa escura de qualquer
          perfil ele precisa de fundo proprio pra nao sumir numa banner clara.
        */}
        <button
          type="button"
          onClick={closeProfile}
          title="Fechar"
          aria-label="Fechar o perfil"
          className="absolute right-2 top-2 z-10 rounded-brutal bg-void/80 p-1.5 text-muted-foreground transition-colors hover:bg-void hover:text-dirty-white"
        >
          <X className="h-4 w-4" />
        </button>

        {/* `open` fixo em true: este componente so existe aberto, e e isso que
            dispara a busca da gamificacao la dentro. */}
        <ProfileBody member={member} open wide />
      </div>
    </div>
  )
}
