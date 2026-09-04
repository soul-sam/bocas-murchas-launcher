import * as React from 'react'
import { cn } from '@/lib/utils'
import { useChat } from '@/lib/chat-context'
import { useMembers } from '@/lib/members-context'
import { useOverlays } from '@/lib/overlay-context'
import {
  collectMentions,
  mentionsEveryone,
  openExternal,
  parseBlocks,
  type Block,
  type InlineNode,
  type InlineStyle
} from '@/lib/rich-text'
import { CustomEmojiImg } from './CustomEmojiImg'

/**
 * Desenha a arvore que o lib/rich-text.ts produz.
 *
 * Os indices de @pessoa e #canal vivem num contexto proprio pra serem montados
 * UMA vez por render da lista, nao uma vez por mensagem: com 50 mensagens na
 * tela, dois Map novos em cada uma custam caro a toa.
 *
 * Emoji do servidor (`:kekw:`) nao tem indice aqui: a lista mora no
 * emoji-context (montado acima deste provider) e o CustomEmojiImg consulta la.
 */

/**
 * "Mensagem so de emoji" precisa chegar ate o no de emoji customizado, que
 * fica varios niveis abaixo (paragrafo > negrito > emoji). Contexto em vez de
 * prop pra nao enfiar `jumbo` em cada componente intermediario da arvore.
 */
const JumboContext = React.createContext(false)

interface Lookups {
  /** username (e primeiro nome) em minusculas -> pessoa. */
  users: Map<string, { id: string; displayName: string; color?: string | null }>
  /** nome do canal em minusculas -> id. */
  channels: Map<string, string>
}

const EMPTY: Lookups = { users: new Map(), channels: new Map() }

const LookupContext = React.createContext<Lookups>(EMPTY)

export function RichTextProvider({ children }: { children: React.ReactNode }) {
  const { members } = useMembers()
  const { channels } = useChat()

  const value = React.useMemo<Lookups>(() => {
    const users = new Map<string, { id: string; displayName: string; color?: string | null }>()

    for (const member of members) {
      const entry = {
        id: member.id,
        displayName: member.displayName,
        color: member.profileColor
      }
      if (member.username) users.set(member.username.toLowerCase(), entry)
      // "@Fulano de Tal" nao casa (tem espaco), mas "@Fulano" sim.
      const firstName = member.displayName.toLowerCase().split(/\s+/)[0]
      if (firstName && !users.has(firstName)) users.set(firstName, entry)
    }

    const channelMap = new Map<string, string>()
    for (const channel of channels) channelMap.set(channel.name.toLowerCase(), channel.id)

    return { users, channels: channelMap }
  }, [members, channels])

  return <LookupContext.Provider value={value}>{children}</LookupContext.Provider>
}

export function useMentionLookups(): Lookups {
  return React.useContext(LookupContext)
}

/** "Esta mensagem fala comigo?" — usado pro destaque e pra notificacao. */
export function useMentionsMe(content: string, myId: string | undefined): boolean {
  const { users } = useMentionLookups()

  return React.useMemo(() => {
    if (!myId || !content) return false
    if (mentionsEveryone(content)) return true
    return collectMentions(content).some((name) => users.get(name)?.id === myId)
  }, [content, myId, users])
}

function Spoiler({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = React.useState(false)

  return (
    <span
      role="button"
      tabIndex={0}
      title={revealed ? undefined : 'Clique pra revelar'}
      onClick={(event) => {
        // Sem parar aqui o clique ainda conta pro container da mensagem.
        event.stopPropagation()
        setRevealed(true)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') setRevealed(true)
      }}
      className={cn(
        'rounded-[3px] px-1 transition-colors',
        revealed
          ? 'bg-void-light/60 text-foreground'
          : 'cursor-pointer select-none bg-[#1f1f1f] text-transparent hover:bg-[#272727]'
      )}
    >
      {children}
    </span>
  )
}

const STYLE_CLASS: Record<InlineStyle, string> = {
  bold: 'font-semibold text-dirty-white',
  italic: 'italic',
  underline: 'underline underline-offset-2',
  strike: 'line-through opacity-70'
}

function InlineNodes({ nodes }: { nodes: InlineNode[] }) {
  const lookups = useMentionLookups()
  const { setActiveChannel } = useChat()
  const { openUserMenu } = useOverlays()
  const jumbo = React.useContext(JumboContext)

  return (
    <>
      {nodes.map((node, index) => {
        switch (node.kind) {
          case 'text':
            return <React.Fragment key={index}>{node.value}</React.Fragment>

          case 'style':
            return (
              <span key={index} className={STYLE_CLASS[node.style]}>
                <InlineNodes nodes={node.children} />
              </span>
            )

          case 'spoiler':
            return (
              <Spoiler key={index}>
                <InlineNodes nodes={node.children} />
              </Spoiler>
            )

          case 'code':
            return (
              <code
                key={index}
                className="rounded-[3px] border border-[#1f1f1f] bg-[#101010] px-1 py-px font-mono text-[0.85em] text-acid"
              >
                {node.value}
              </code>
            )

          case 'link':
            return (
              <a
                key={index}
                href={node.url}
                title={node.url}
                onClick={(event) => {
                  // Deixar o Electron navegar abriria o site DENTRO do app,
                  // numa janela sem moldura e sem barra de endereco.
                  event.preventDefault()
                  openExternal(node.url)
                }}
                className="break-all text-acid underline decoration-acid/40 underline-offset-2 transition-colors hover:decoration-acid"
              >
                {node.label}
              </a>
            )

          case 'mention': {
            const hit = lookups.users.get(node.username.toLowerCase())
            const everyone = /^(everyone|todos|geral|all)$/i.test(node.username)

            // Nome que nao existe fica texto normal, senao qualquer email
            // colado no chat viraria um chip verde sem sentido.
            if (!hit && !everyone) {
              return <React.Fragment key={index}>{node.raw}</React.Fragment>
            }

            return (
              <button
                key={index}
                type="button"
                onContextMenu={(event) => hit && openUserMenu(event, hit.id)}
                className="rounded-[3px] bg-acid/15 px-1 font-medium text-acid transition-colors hover:bg-acid/25"
                style={
                  hit?.color
                    ? { color: hit.color, backgroundColor: `${hit.color}22` }
                    : undefined
                }
              >
                @{hit?.displayName ?? node.username}
              </button>
            )
          }

          case 'channel': {
            const id = lookups.channels.get(node.name.toLowerCase())
            if (!id) return <React.Fragment key={index}>{node.raw}</React.Fragment>

            return (
              <button
                key={index}
                type="button"
                onClick={() => setActiveChannel(id)}
                className="rounded-[3px] bg-acid/10 px-1 font-medium text-acid transition-colors hover:bg-acid/25"
              >
                #{node.name}
              </button>
            )
          }

          // Nome desconhecido vira texto la dentro — o parser so reconhece a
          // sintaxe, quem sabe o que existe e o componente.
          case 'custom-emoji':
            return <CustomEmojiImg key={index} name={node.name} jumbo={jumbo} />

          default:
            return null
        }
      })}
    </>
  )
}

function BlockView({ block }: { block: Block }) {
  if (block.kind === 'codeblock') {
    return (
      <pre className="my-1 max-w-full overflow-x-auto rounded-brutal border border-[#1f1f1f] bg-[#0A0A0A] p-2.5">
        {block.lang && (
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            {block.lang}
          </span>
        )}
        <code className="whitespace-pre font-mono text-xs leading-relaxed text-dirty-white">
          {block.value}
        </code>
      </pre>
    )
  }

  if (block.kind === 'quote') {
    return (
      <blockquote className="my-0.5 border-l-2 border-acid-dark pl-2.5 text-muted-foreground">
        <InlineNodes nodes={block.children} />
      </blockquote>
    )
  }

  return (
    <p className="min-w-0">
      <InlineNodes nodes={block.children} />
    </p>
  )
}

export function RichText({
  content,
  className,
  jumbo
}: {
  content: string
  className?: string
  /** Mensagem so de emoji: renderiza grande, igual Discord. */
  jumbo?: boolean
}) {
  const blocks = React.useMemo(() => parseBlocks(content), [content])

  return (
    <JumboContext.Provider value={!!jumbo}>
      <div
        className={cn(
          'min-w-0 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground',
          jumbo && 'text-[2.4rem] leading-tight',
          className
        )}
      >
        {blocks.map((block, index) => (
          <BlockView key={index} block={block} />
        ))}
      </div>
    </JumboContext.Provider>
  )
}
