import * as React from 'react'
import {
  Hash,
  Swords,
  Volume2,
  Megaphone,
  Lightbulb,
  Plus,
  Trash2,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  Loader2,
  Pencil,
  SlidersHorizontal,
  Wand2
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  CHANNEL_FEEDS,
  FEED_LABEL,
  channels as channelsApi,
  parseChannelFeeds,
  type Channel,
  type ChannelFeed,
  type ChannelType
} from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'

/**
 * Gerenciador de canais (admin).
 *
 * A API de criar, renomear e apagar canal já existia e não tinha NENHUM botão:
 * mexer na lista de canais exigia bater na API na mão. Aqui está a tela.
 *
 * A reordenação é por setas, não por arrastar. Numa lista de 5–10 itens dentro
 * de uma modal, arrastar é mais difícil de acertar do que clicar — e ainda
 * teria que funcionar com a lista rolando.
 *
 * Cada canal tem duas coisas além do nome, no painel da chave inglesa:
 *
 *   CATEGORIA  o grupo na barra lateral. Texto livre — criar um grupo novo não
 *              pode exigir um deploy.
 *   RECEBE     o que NASCE ali (agenda, enquetes, jogos…). É isto que impede a
 *              agenda de cair no mural do LoL: antes, evento e enquete nasciam
 *              no canal que a pessoa estava OLHANDO. Ver api/lib/channel-routing.
 *
 * Um feed mora num canal só. Marcar "agenda" aqui tira a agenda de onde ela
 * estava, e por isso o painel avisa de quem está tirando em vez de fazer
 * calado.
 */

const TYPE_META: Record<ChannelType, { icon: React.ReactNode; label: string }> = {
  text: { icon: <Hash className="h-3.5 w-3.5" />, label: 'Texto' },
  voice: { icon: <Volume2 className="h-3.5 w-3.5" />, label: 'Voz' },
  announcements: { icon: <Megaphone className="h-3.5 w-3.5" />, label: 'Avisos' },
  suggestions: { icon: <Lightbulb className="h-3.5 w-3.5" />, label: 'Sugestões' },
  // Um servidor tem UM mural do LoL: é pra ele que o card de pós-jogo vai
  // sozinho. Criar o segundo não quebra nada, mas as partidas continuam caindo
  // no primeiro.
  lol: { icon: <Swords className="h-3.5 w-3.5" />, label: 'Mural do LoL' },
  dm: { icon: <Hash className="h-3.5 w-3.5" />, label: 'Conversa' }
}

export function ChannelManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token, user } = useAuth()
  const { channels, refreshChannels } = useChat()

  const [draft, setDraft] = React.useState<Channel[]>([])
  const [newName, setNewName] = React.useState('')
  const [newType, setNewType] = React.useState<ChannelType>('text')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editName, setEditName] = React.useState('')
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null)
  /** Canal com o painel de categoria/feeds aberto. */
  const [tuningId, setTuningId] = React.useState<string | null>(null)
  const [seedNote, setSeedNote] = React.useState<string | null>(null)

  /**
   * Categorias que ja existem, pro `datalist` do campo.
   *
   * Sugerir o que o servidor ja usa e o que evita "Jogos" e "jogos" virarem
   * dois grupos na barra lateral por causa de uma maiuscula.
   */
  const knownCategories = React.useMemo(() => {
    const found = new Set<string>(['Conversa', 'Jogos', 'Grupo', 'Servidor', 'Voz'])
    for (const channel of channels) {
      const value = channel.category?.trim()
      if (value) found.add(value)
    }
    return [...found].sort((a, b) => a.localeCompare(b))
  }, [channels])

  /** Quem recebe cada feed hoje — pra avisar de quem o feed esta saindo. */
  const ownerOf = React.useCallback(
    (feed: ChannelFeed): Channel | null =>
      channels.find((c) => parseChannelFeeds(c.feeds).includes(feed)) ?? null,
    [channels]
  )

  /**
   * A lista local é um RASCUNHO.
   *
   * Reordenar mexe em vários canais de uma vez; salvar a cada clique de seta
   * mandaria uma requisição por passo e deixaria a ordem no servidor num estado
   * intermediário se alguma falhasse. Aqui a pessoa arruma tudo e salva uma vez.
   */
  React.useEffect(() => {
    if (!open) return
    setDraft(channels)
    setError(null)
    setEditingId(null)
    setConfirmDelete(null)
    setNewName('')
  }, [open, channels])

  const dirty = React.useMemo(
    () => draft.map((c) => c.id).join(',') !== channels.map((c) => c.id).join(','),
    [draft, channels]
  )

  const move = (index: number, direction: -1 | 1): void => {
    const target = index + direction
    if (target < 0 || target >= draft.length) return
    const next = [...draft]
    ;[next[index], next[target]] = [next[target], next[index]]
    setDraft(next)
  }

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refreshChannels()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deu ruim')
    } finally {
      setBusy(false)
    }
  }

  const create = (): void => {
    const name = newName.trim()
    if (!name || !token) return
    void run(async () => {
      await channelsApi.create(token, { name, type: newType })
      setNewName('')
    })
  }

  const rename = (id: string): void => {
    const name = editName.trim()
    setEditingId(null)
    if (!name || !token) return
    void run(() => channelsApi.update(token, id, { name }))
  }

  const remove = (id: string): void => {
    if (!token) return
    setConfirmDelete(null)
    void run(() => channelsApi.remove(token, id))
  }

  const setCategory = (channel: Channel, value: string): void => {
    if (!token) return
    const next = value.trim()
    if ((channel.category ?? '') === next) return
    void run(() => channelsApi.update(token, channel.id, { category: next || null }))
  }

  /**
   * Liga/desliga um feed num canal.
   *
   * Ligar TIRA o feed de quem tinha: o servidor escolhe o primeiro canal que
   * declara, entao deixar dois marcados nao daria erro — daria um destino
   * decidido pela posicao, que e pior que um erro porque parece funcionar.
   */
  const toggleFeed = (channel: Channel, feed: ChannelFeed): void => {
    if (!token) return
    const current = parseChannelFeeds(channel.feeds)
    const turningOn = !current.includes(feed)
    const next = turningOn ? [...current, feed] : current.filter((f) => f !== feed)
    const previousOwner = turningOn ? ownerOf(feed) : null

    void run(async () => {
      await channelsApi.update(token, channel.id, { feeds: next })
      if (previousOwner && previousOwner.id !== channel.id) {
        await channelsApi.update(token, previousOwner.id, {
          feeds: parseChannelFeeds(previousOwner.feeds).filter((f) => f !== feed)
        })
      }
    })
  }

  /** Cria o que falta e preenche categoria/feeds vazios. Nao sobrescreve nada. */
  const organize = (): void => {
    if (!token) return
    setSeedNote(null)
    void run(async () => {
      const result = await channelsApi.seedDefaults(token)
      setSeedNote(result.message)
    })
  }

  const saveOrder = (): void => {
    if (!token) return
    void run(() => channelsApi.reorder(token, draft.map((c) => c.id)))
  }

  if (user?.role !== 'admin') return null

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="h-[80dvh] max-w-xl">
        <DialogHeader>
          <DialogTitle>Canais</DialogTitle>
          <DialogDescription>criar, renomear, reordenar e apagar</DialogDescription>
        </DialogHeader>

        <div className="mb-3 flex shrink-0 items-center gap-2">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') create()
            }}
            placeholder="nome do canal novo"
            className="input-terminal min-w-0 flex-1 rounded-brutal px-2 py-1.5 text-sm"
          />

          <select
            value={newType}
            onChange={(event) => setNewType(event.target.value as ChannelType)}
            className="input-terminal h-9 shrink-0 rounded-brutal px-2 text-xs"
          >
            <option value="text">Texto</option>
            <option value="voice">Voz</option>
            <option value="announcements">Avisos</option>
            <option value="suggestions">Sugestões</option>
            <option value="lol">Mural do LoL</option>
          </select>

          <Button size="sm" onClick={create} disabled={!newName.trim() || busy}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Criar
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {draft.map((channel, index) => {
            const meta = TYPE_META[channel.type]
            const isEditing = editingId === channel.id
            const channelFeeds = parseChannelFeeds(channel.feeds)

            return (
              <div
                key={channel.id}
                className="rounded-brutal border border-line bg-void-light/30"
              >
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="shrink-0 text-muted-foreground">{meta.icon}</span>

                {isEditing ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') rename(channel.id)
                      if (event.key === 'Escape') setEditingId(null)
                    }}
                    onBlur={() => rename(channel.id)}
                    className="input-terminal min-w-0 flex-1 rounded-brutal px-1.5 py-0.5 text-sm"
                  />
                ) : (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">
                      {channel.name}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {channel.category?.trim() || 'sem grupo'}
                      {' · '}
                      {meta.label}
                      {channelFeeds.length > 0 && ` · recebe ${channelFeeds.join(', ')}`}
                      {channel._count ? ` · ${channel._count.messages} msg` : ''}
                    </span>
                  </span>
                )}

                <div className="flex shrink-0 items-center gap-0.5">
                  <IconButton
                    label="Subir"
                    disabled={index === 0 || busy}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </IconButton>

                  <IconButton
                    label="Descer"
                    disabled={index === draft.length - 1 || busy}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </IconButton>

                  <IconButton
                    label="Grupo e o que nasce aqui"
                    disabled={busy}
                    onClick={() => setTuningId(tuningId === channel.id ? null : channel.id)}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                  </IconButton>

                  <IconButton
                    label="Renomear"
                    disabled={busy}
                    onClick={() => {
                      setEditName(channel.name)
                      setEditingId(channel.id)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </IconButton>

                  {/* Apagar canal leva as mensagens junto (cascade no banco).
                      Por isso a confirmação vira o próprio botão em vez de
                      abrir outra modal por cima desta. */}
                  {confirmDelete === channel.id ? (
                    <>
                      <IconButton label="Confirmar" danger onClick={() => remove(channel.id)}>
                        <Check className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton label="Cancelar" onClick={() => setConfirmDelete(null)}>
                        <X className="h-3.5 w-3.5" />
                      </IconButton>
                    </>
                  ) : (
                    <IconButton
                      label="Apagar (leva as mensagens junto)"
                      danger
                      disabled={busy}
                      onClick={() => setConfirmDelete(channel.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  )}
                </div>
              </div>

              {tuningId === channel.id && (
                <div className="space-y-2.5 border-t border-line px-2 py-2.5">
                  <label className="block">
                    <span className="mb-1 block text-[11.5px] text-muted-foreground">
                      Grupo na barra
                    </span>
                    <input
                      list="bm-categorias"
                      defaultValue={channel.category ?? ''}
                      disabled={busy}
                      onBlur={(event) => setCategory(channel, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur()
                      }}
                      placeholder="Conversa, Jogos, Grupo…"
                      className="input-terminal w-full rounded-brutal px-2 py-1 text-sm"
                    />
                  </label>

                  {/* Canal de voz nao tem chat: card nenhum nasce ali. */}
                  {channel.type !== 'voice' && (
                    <div>
                      <span className="mb-1 block text-[11.5px] text-muted-foreground">
                        Nasce aqui
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {CHANNEL_FEEDS.map((feed) => {
                          const on = channelFeeds.includes(feed)
                          const owner = ownerOf(feed)
                          const takenFrom = !on && owner && owner.id !== channel.id ? owner : null

                          return (
                            <button
                              key={feed}
                              type="button"
                              disabled={busy}
                              onClick={() => toggleFeed(channel, feed)}
                              title={
                                takenFrom
                                  ? `${FEED_LABEL[feed]} — hoje cai em #${takenFrom.name}`
                                  : FEED_LABEL[feed]
                              }
                              className={cn(
                                'rounded-brutal border-2 px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest transition-colors disabled:opacity-40',
                                on
                                  ? 'border-acid bg-acid/10 text-acid'
                                  : 'border-line text-muted-foreground hover:border-acid/50 hover:text-foreground'
                              )}
                            >
                              {feed}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              </div>
            )
          })}

          {draft.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum canal ainda.
            </p>
          )}

          <datalist id="bm-categorias">
            {knownCategories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </div>

        {error && <p className="mt-2 shrink-0 text-xs text-destructive">{error}</p>}
        {seedNote && !error && (
          <p className="mt-2 shrink-0 text-xs text-acid">{seedNote}</p>
        )}

        <div className="mt-3 flex shrink-0 items-center gap-2 border-t border-line pt-3">
          {confirmDelete && (
            <p className="flex-1 text-[11px] leading-tight text-destructive">
              Apagar o canal apaga todas as mensagens dele. Não tem volta.
            </p>
          )}

          <span className="flex-1" />

          {/* Cria os canais que faltam e preenche grupo/feeds dos que ja
              existem. Nao sobrescreve escolha de ninguem nem mexe na ordem —
              ver a rota /channels/seed. */}
          <Button variant="ghost" size="sm" onClick={organize} disabled={busy}>
            <Wand2 className="mr-1 h-3.5 w-3.5" />
            Organizar
          </Button>

          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => setDraft(channels)} disabled={busy}>
              Desfazer
            </Button>
          )}

          <Button size="sm" onClick={saveOrder} disabled={!dirty || busy}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            Salvar ordem
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function IconButton({
  children,
  label,
  onClick,
  danger,
  disabled
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-brutal p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-30',
        danger
          ? 'text-muted-foreground hover:bg-destructive/15 hover:text-destructive'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}
