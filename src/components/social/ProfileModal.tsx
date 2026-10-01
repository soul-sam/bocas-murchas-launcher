import * as React from 'react'
import { X } from 'lucide-react'
import { useOverlays } from '@/lib/overlay-context'
import { useMembers } from '@/lib/members-context'
import { useLayout } from '@/lib/layout-context'
import { useFocusTrap } from '@/lib/use-focus-trap'
import { cn } from '@/lib/utils'
import { ProfileBody } from './ProfileCard'

/**
 * O PERFIL EM MODAL — a tela inteira de uma pessoa.
 *
 * O popover (components/social/ProfileCard) continua existindo e continua
 * sendo o certo na lista de membros: abre do lado, ancorado na linha, sem
 * cobrir a conversa. Este aqui e pro resto do app, onde a foto da pessoa
 * aparece no meio de outra coisa — no chat, na call, num cartao — e um
 * popover ficaria espremido contra a borda da tela ou tapando justamente o
 * que a pessoa estava lendo. E e tambem pra onde o popover manda quem quer
 * ver tudo ("Ver perfil completo").
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
 *
 * NO CELULAR E FOLHA DE BAIXO, igual ao Dialog (ui/dialog.tsx): uma caixa de
 * 576px centralizada numa tela de 360 sobrava pelos lados e o rodape caia
 * fora da area visivel. Colada embaixo ela cabe, fica na altura do polegar e
 * soma a safe area.
 */
export function ProfileModal() {
  const { profileUserId, closeProfile } = useOverlays()
  const { byId } = useMembers()
  const { isPhone } = useLayout()

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

  /**
   * Trocar de pessoa com o modal aberto (clicar no padrinho, por exemplo)
   * volta a rolagem pro topo: a capa da pessoa nova e o que se espera ver,
   * nao o rodape da anterior.
   */
  React.useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 })
  }, [profileUserId, panelRef])

  if (!profileUserId || !member) return null

  return (
    <div
      onClick={closeProfile}
      className={cn(
        'fixed inset-0 z-perfil flex bg-black/70 backdrop-blur-sm',
        isPhone ? 'items-end' : 'items-center justify-center p-4'
      )}
    >
      <div
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Perfil de ${member.displayName}`}
        className={cn(
          'card-gradient relative w-full overflow-y-auto overscroll-contain border-2 border-acid-dark',
          'shadow-[0_0_50px_rgba(0,0,0,0.8)]',
          isPhone
            ? 'max-h-[92dvh] rounded-b-none rounded-t-[14px] pb-[env(safe-area-inset-bottom,0px)]'
            : 'max-h-[88dvh] max-w-xl rounded-brutal'
        )}
      >
        {/*
          O X flutua por cima da capa, no canto oposto ao avatar. Sobre a capa
          escura de qualquer perfil ele precisa de fundo proprio pra nao sumir
          numa imagem clara — e de area de toque decente no celular.
        */}
        <button
          type="button"
          onClick={closeProfile}
          aria-label="Fechar o perfil"
          className={cn(
            'absolute right-3 top-3 z-conteudo flex h-8 w-8 items-center justify-center rounded-brutal',
            'bg-void/80 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-void hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          <X className="h-4 w-4" />
        </button>

        {/* `open` fixo em true: este componente so existe aberto, e e isso que
            dispara a busca da gamificacao la dentro. `onNavigate` fecha o
            perfil quando a pessoa sai dele por uma acao (mensagem, editar,
            lojinha) — a tela nova nao pode nascer atras deste veu. */}
        <ProfileBody member={member} open variant="modal" onNavigate={closeProfile} />
      </div>
    </div>
  )
}
