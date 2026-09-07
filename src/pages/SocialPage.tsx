import * as React from 'react'
import { useChat } from '@/lib/chat-context'
import { useVoice } from '@/lib/voice-context'
import { useLayout } from '@/lib/layout-context'
import type { Channel } from '@/lib/api'
import { ConversationRail } from '@/components/social/ConversationRail'
import { ChannelSidebar } from '@/components/social/ChannelSidebar'
import { ChatView } from '@/components/social/ChatView'
import { VoiceStage } from '@/components/social/VoiceStage'
import { MemberList } from '@/components/social/MemberList'
import { PinnedPanel } from '@/components/social/PinnedPanel'
import { SearchPanel } from '@/components/social/SearchPanel'
import { ChannelManager } from '@/components/social/ChannelManager'
import { LinksPanel } from '@/components/social/LinksPanel'
import { AgendaPanel } from '@/components/social/AgendaPanel'
import { LeaderboardPanel } from '@/components/social/LeaderboardPanel'
import { useOverlays } from '@/lib/overlay-context'

/**
 * Tela social: rail de conversas na ponta esquerda, canais ao lado, chat ou
 * call no meio, membros à direita.
 *
 * Clicar num canal de voz entra na call E troca a área central pro palco;
 * clicar num canal de texto (ou numa conversa) volta pro chat sem sair da call
 * — igual Discord.
 *
 * As colunas laterais somem sozinhas conforme a janela aperta — a regra mora em
 * lib/layout-context.tsx. `relative` aqui não é decoração: é o que ancora a
 * gaveta de canais em janela estreita.
 */
export function SocialPage() {
  const { setActiveChannel } = useChat()
  const voice = useVoice()
  // O editor de perfil vive na casca autenticada, não aqui: esta página some ao
  // trocar pra aba do Minecraft, e desmontar uma modal aberta trava o app
  // inteiro (ver lib/interaction-guard.ts).
  const { openProfileEditor } = useOverlays()
  const { view, setView, membersOpen, pinnedOpen, searchOpen, linksOpen, agendaOpen, leaderboardOpen } =
    useLayout()

  const [channelManagerOpen, setChannelManagerOpen] = React.useState(false)

  const handleSelectText = React.useCallback(
    (channel: Channel) => {
      setActiveChannel(channel.id)
      setView('chat')
    },
    [setActiveChannel, setView]
  )

  const handleSelectVoice = React.useCallback(
    (channel: Channel) => {
      setView('voice')
      // Já estou nesse canal: só trazer o palco pra frente, não reconectar.
      if (voice.channel?.id === channel.id) return
      void voice.join(channel)
    },
    [voice, setView]
  )

  // Sair da call (por qualquer caminho) não pode deixar a tela num palco vazio.
  React.useEffect(() => {
    if (view !== 'voice') return
    if (voice.connected || voice.connecting) return

    // Se a entrada FALHOU, fica no palco: é lá que a mensagem de erro aparece.
    // Voltando pro chat aqui, o usuário clicava no canal de voz e simplesmente
    // não acontecia nada visível — sem pista nenhuma do que deu errado.
    if (voice.error) return

    setView('chat')
  }, [view, voice.connected, voice.connecting, voice.error, setView])

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <ConversationRail onSelectText={handleSelectText} />

      <ChannelSidebar
        onSelectText={handleSelectText}
        onSelectVoice={handleSelectVoice}
        onOpenProfile={openProfileEditor}
        onManageChannels={() => setChannelManagerOpen(true)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {view === 'voice' ? (
          <VoiceStage />
        ) : (
          <ChatView />
        )}
      </main>

      {/* Uma coluna à direita só, disputada por cinco painéis. Empilhar todos
          numa janela de 1000px não sobraria chat nenhum.

          O SOUNDBOARD SAIU DESTA DISPUTA: virou um drop-up ancorado no próprio
          botão (components/social/SoundboardPopover.tsx). Ele era o pior
          inquilino desta coluna — o botão fica no rodapé da barra ESQUERDA, e o
          painel abria do outro lado da tela, fechando o que estivesse aberto
          aqui. */}
      {searchOpen && view === 'chat' ? (
        <SearchPanel />
      ) : pinnedOpen && view === 'chat' ? (
        <PinnedPanel />
      ) : linksOpen && view === 'chat' ? (
        <LinksPanel />
      ) : agendaOpen ? (
        <AgendaPanel />
      ) : leaderboardOpen ? (
        <LeaderboardPanel />
      ) : membersOpen ? (
        <MemberList />
      ) : null}

      {/* A modal fica AQUI e não na casca porque só existe pra esta tela — e
          fecha por transição, nunca sendo arrancada da árvore. */}
      <ChannelManager
        open={channelManagerOpen}
        onClose={() => setChannelManagerOpen(false)}
      />
    </div>
  )
}
