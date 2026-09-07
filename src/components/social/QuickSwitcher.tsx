import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Hash,
  Megaphone,
  Lightbulb,
  Volume2,
  Settings,
  UserCog,
  MonitorUp,
  PhoneOff,
  Gamepad2,
  CornerDownLeft,
  ShoppingBag,
  Shield
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChat } from '@/lib/chat-context'
import { useVoice } from '@/lib/voice-context'
import { useSettings } from '@/lib/settings-context'
import { useOverlays } from '@/lib/overlay-context'
import { useLayout } from '@/lib/layout-context'
import { useAuth } from '@/lib/auth-context'

/**
 * Troca-canal do Ctrl+K.
 *
 * Com uma dezena de canais a barra lateral ja obriga a procurar com o olho.
 * Aqui e o teclado: dois caracteres e Enter. Alem dos canais, entram os
 * comandos que a galera mais repete — entrar na call, compartilhar, sair — que
 * de outra forma exigem achar o botao certo em duas telas diferentes.
 *
 * NAO usa o Dialog do Radix: uma camada modal arrancada da arvore trava o app
 * inteiro (ver lib/interaction-guard.ts), e este componente e justamente do
 * tipo que some junto com uma troca de rota.
 */

type Entry = {
  id: string
  label: string
  hint?: string
  icon: React.ReactNode
  keywords: string
  run: () => void
}

/**
 * Busca por subsequencia, igual todo lançador de comando.
 * "vgr" acha "voz-geral"; "gr" tambem. Devolve nulo quando nao casa.
 */
function fuzzyScore(text: string, term: string): number | null {
  if (!term) return 0

  const haystack = text.toLowerCase()
  const needle = term.toLowerCase()

  // Prefixo exato ganha de longe: quem digita "ger" quer "#geral" no topo,
  // nao um canal qualquer que tenha g, e, r espalhados.
  const direct = haystack.indexOf(needle)
  if (direct === 0) return 1_000
  if (direct > 0) return 500 - direct

  let index = 0
  let score = 0
  for (const char of needle) {
    const found = haystack.indexOf(char, index)
    if (found === -1) return null
    score -= found - index
    index = found + 1
  }
  return score
}

export function QuickSwitcher() {
  const {
    quickSwitcherOpen,
    closeQuickSwitcher,
    openProfileEditor,
    openScreenPicker,
    openShop,
    openAdmin
  } = useOverlays()
  const { user } = useAuth()
  const { textChannels, voiceChannels, setActiveChannel } = useChat()
  const voice = useVoice()
  const { open: openSettings } = useSettings()
  const { setView } = useLayout()
  const navigate = useNavigate()

  const [term, setTerm] = React.useState('')
  const [index, setIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!quickSwitcherOpen) return
    setTerm('')
    setIndex(0)
    // O autoFocus do React nao pega aqui: o elemento acabou de entrar no DOM.
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [quickSwitcherOpen])

  const entries = React.useMemo<Entry[]>(() => {
    const list: Entry[] = []

    for (const channel of textChannels) {
      list.push({
        id: `text:${channel.id}`,
        label: channel.name,
        hint: 'canal de texto',
        icon:
          channel.type === 'announcements' ? (
            <Megaphone className="h-3.5 w-3.5 text-burn" />
          ) : channel.type === 'suggestions' ? (
            <Lightbulb className="h-3.5 w-3.5 text-burn" />
          ) : (
            <Hash className="h-3.5 w-3.5" />
          ),
        keywords: channel.name + ' ' + (channel.description ?? ''),
        run: () => {
          navigate('/')
          setActiveChannel(channel.id)
          setView('chat')
        }
      })
    }

    for (const channel of voiceChannels) {
      const here = voice.channel?.id === channel.id
      list.push({
        id: `voice:${channel.id}`,
        label: channel.name,
        hint: here ? 'você já está aqui' : 'entrar na call',
        icon: <Volume2 className="h-3.5 w-3.5" />,
        keywords: channel.name + ' voz call',
        run: () => {
          navigate('/')
          setView('voice')
          if (!here) void voice.join(channel)
        }
      })
    }

    list.push({
      id: 'cmd:game',
      label: 'Minecraft',
      hint: 'abrir o launcher',
      icon: <Gamepad2 className="h-3.5 w-3.5" />,
      keywords: 'minecraft jogo jogar launcher',
      run: () => navigate('/jogo')
    })

    if (voice.connected) {
      list.push({
        id: 'cmd:share',
        label: voice.screenSharing ? 'Parar de compartilhar' : 'Compartilhar tela',
        icon: <MonitorUp className="h-3.5 w-3.5" />,
        keywords: 'compartilhar tela stream transmitir',
        run: () => {
          if (voice.screenSharing) void voice.stopScreenShare()
          else {
            navigate('/')
            setView('voice')
            openScreenPicker()
          }
        }
      })

      list.push({
        id: 'cmd:leave',
        label: 'Sair da call',
        icon: <PhoneOff className="h-3.5 w-3.5 text-destructive" />,
        keywords: 'sair call desconectar leave',
        run: () => void voice.leave()
      })
    }

    list.push({
      id: 'cmd:profile',
      label: 'Editar perfil',
      icon: <UserCog className="h-3.5 w-3.5" />,
      keywords: 'perfil avatar nome bio',
      run: openProfileEditor
    })

    list.push({
      id: 'cmd:settings',
      label: 'Configurações',
      icon: <Settings className="h-3.5 w-3.5" />,
      keywords: 'configuracoes settings audio microfone atalhos',
      run: openSettings
    })

    list.push({
      id: 'cmd:shop',
      label: 'Lojinha',
      hint: 'gastar moedas',
      icon: <ShoppingBag className="h-3.5 w-3.5" />,
      keywords: 'loja lojinha moedas cosmeticos titulo moldura comprar',
      run: openShop
    })

    // So aparece pra quem pode usar: o servidor recusaria, mas listar um
    // comando que da erro e pior que nao listar.
    if (user?.role === 'admin') {
      list.push({
        id: 'cmd:admin',
        label: 'Painel admin',
        hint: 'convites, membros, sons',
        icon: <Shield className="h-3.5 w-3.5 text-muted-foreground" />,
        keywords: 'admin painel convites membros sons ferramentas',
        run: openAdmin
      })
    }

    return list
  }, [
    textChannels,
    voiceChannels,
    voice,
    navigate,
    setActiveChannel,
    setView,
    openProfileEditor,
    openScreenPicker,
    openSettings,
    openShop,
    openAdmin,
    user?.role
  ])

  const results = React.useMemo(() => {
    if (!term.trim()) return entries.slice(0, 10)

    return entries
      .map((entry) => ({ entry, score: fuzzyScore(entry.label + ' ' + entry.keywords, term.trim()) }))
      .filter((row): row is { entry: Entry; score: number } => row.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((row) => row.entry)
  }, [entries, term])

  React.useEffect(() => {
    setIndex(0)
  }, [term])

  if (!quickSwitcherOpen) return null

  const choose = (entry: Entry | undefined): void => {
    if (!entry) return
    // Fecha ANTES de executar: alguns comandos abrem outra camada (o seletor
    // de tela, as configurações) e duas camadas trocando de dono no mesmo
    // quadro é o caminho conhecido pro app travar sem clique.
    closeQuickSwitcher()
    entry.run()
  }

  return (
    <div
      onClick={closeQuickSwitcher}
      className="fixed inset-0 z-[55] flex items-start justify-center bg-black/70 pt-[12vh] backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="card-gradient w-full max-w-lg overflow-hidden rounded-brutal border-2 border-acid-dark shadow-[0_0_50px_rgba(0,0,0,0.8)]"
      >
        <input
          ref={inputRef}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setIndex((prev) => (prev + 1) % Math.max(results.length, 1))
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setIndex((prev) => (prev - 1 + results.length) % Math.max(results.length, 1))
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              choose(results[index])
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              closeQuickSwitcher()
            }
          }}
          placeholder="Ir pra um canal ou rodar um comando…"
          className="w-full border-b-2 border-line bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
        />

        <div className="max-h-80 overflow-y-auto p-1">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nada com esse nome.
            </p>
          ) : (
            results.map((entry, position) => (
              <button
                key={entry.id}
                type="button"
                onMouseEnter={() => setIndex(position)}
                onClick={() => choose(entry)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-brutal px-3 py-2 text-left transition-colors',
                  position === index ? 'bg-acid/15 text-acid' : 'text-foreground'
                )}
              >
                <span className="shrink-0">{entry.icon}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{entry.label}</span>
                {entry.hint && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {entry.hint}
                  </span>
                )}
                {position === index && <CornerDownLeft className="h-3 w-3 shrink-0" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
