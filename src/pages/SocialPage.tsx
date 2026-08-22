import * as React from 'react'
import { X } from 'lucide-react'
import { useChat } from '@/lib/chat-context'
import { useVoice } from '@/lib/voice-context'
import type { Channel } from '@/lib/api'
import { ChannelSidebar } from '@/components/social/ChannelSidebar'
import { ChatView } from '@/components/social/ChatView'
import { VoiceStage } from '@/components/social/VoiceStage'
import { MemberList } from '@/components/social/MemberList'
import { SoundboardPanel } from '@/components/social/SoundboardPanel'
import { ProfileEditor } from '@/components/social/ProfileEditor'

/**
 * Tela social: canais à esquerda, chat ou call no meio, membros à direita.
 *
 * Clicar num canal de voz entra na call E troca a área central pro palco;
 * clicar num canal de texto volta pro chat sem sair da call — igual Discord.
 */
export function SocialPage() {
  const { setActiveChannel } = useChat()
  const voice = useVoice()

  const [view, setView] = React.useState<'chat' | 'voice'>('chat')
  const [soundboardOpen, setSoundboardOpen] = React.useState(false)
  const [profileOpen, setProfileOpen] = React.useState(false)

  const handleSelectText = React.useCallback(
    (channel: Channel) => {
      setActiveChannel(channel.id)
      setView('chat')
    },
    [setActiveChannel]
  )

  const handleSelectVoice = React.useCallback(
    (channel: Channel) => {
      setView('voice')
      // Já estou nesse canal: só trazer o palco pra frente, não reconectar.
      if (voice.channel?.id === channel.id) return
      void voice.join(channel)
    },
    [voice]
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
  }, [view, voice.connected, voice.connecting, voice.error])

  return (
    <div className="flex min-h-0 flex-1">
      <ChannelSidebar
        view={view}
        onSelectText={handleSelectText}
        onSelectVoice={handleSelectVoice}
        onOpenProfile={() => setProfileOpen(true)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {view === 'voice' ? (
          <VoiceStage onOpenSoundboard={() => setSoundboardOpen(true)} />
        ) : (
          <ChatView />
        )}
      </main>

      {soundboardOpen ? (
        <aside className="flex w-80 shrink-0 flex-col border-l border-[#1a1a1a] bg-[#0D0D0D] p-3">
          <button
            type="button"
            onClick={() => setSoundboardOpen(false)}
            title="Fechar soundboard"
            className="mb-1 self-end rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-acid"
          >
            <X className="h-4 w-4" />
          </button>
          <SoundboardPanel />
        </aside>
      ) : (
        <MemberList />
      )}

      <ProfileEditor open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  )
}
