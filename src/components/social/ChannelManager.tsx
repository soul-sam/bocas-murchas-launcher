import * as React from 'react'
import {
  Hash,
  Swords,
  Volume2,
  Megaphone,
  Lightbulb,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  Loader2,
  Pencil,
  Wand2,
  type LucideIcon
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { SwitchRow } from '@/components/ui/switch'
import { Hint } from '@/components/ui/tooltip'
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
import { groupByCategory, useChat } from '@/lib/chat-context'
import { useLayout } from '@/lib/layout-context'
import { CHANNEL_ICON_GROUPS, ChannelIconArt, channelIconDef } from '@/lib/channel-icons'
import { ChannelGlyph } from './ChannelGlyph'

/**
 * Gerenciador de canais (admin).
 *
 * Lista de um lado, o canal aberto do outro — o mesmo desenho de qualquer
 * tela de "configurações" que a pessoa já usou. O que isso conserta: a versão
 * anterior era uma lista chapada com CINCO botões de ícone por linha (subir,
 * descer, ajustes, renomear, apagar) e um subtítulo "grupo · tipo · recebe
 * agenda, jogos · 812 msg" em cada uma. Com dez canais eram cinquenta botões
 * na tela pra editar um canal de cada vez. Agora a lista é só a lista —
 * agrupada igual à barra lateral, com o ícone de cada canal — e as ações
 * existem uma vez, no canal que está aberto.
 *
 * A reordenação continua por setas, e só no canal selecionado. Arrastar numa
 * lista que rola dentro de uma modal é mais difícil de acertar do que clicar,
 * e setas funcionam no dedo. Uma seta move DENTRO do grupo: a posição global
 * só desempata dentro da categoria, então subir um canal pra cima do grupo
 * vizinho não mudaria nada de visível.
 *
 * A ordem é um RASCUNHO até "Salvar ordem". Reordenar mexe em vários canais
 * de uma vez; salvar a cada clique mandaria uma requisição por passo. Já
 * nome, ícone, grupo e feeds salvam na hora — são uma requisição cada e a
 * pessoa vê o resultado na barra atrás da modal.
 *
 * Cada canal tem, além do nome e do ícone:
 *
 *   GRUPO     a seção na barra lateral. Texto livre — criar um grupo novo não
 *             pode exigir um deploy — mas oferecido como chips do que já
 *             existe, pra "Jogos" e "jogos" não virarem dois grupos.
 *   NASCE     o que o app cria sozinho neste canal (agenda, enquetes, jogos…).
 *             É isto que impede a agenda de cair no mural do LoL: antes,
 *             evento e enquete nasciam no canal que a pessoa estava OLHANDO.
 *             Ver api/lib/channel-routing. Um feed mora num canal só: ligar
 *             aqui tira de onde estava, e a linha avisa de quem está tirando.
 */

const TYPE_META: Record<ChannelType, { icon: LucideIcon; label: string }> = {
  text: { icon: Hash, label: 'Texto' },
  voice: { icon: Volume2, label: 'Voz' },
  announcements: { icon: Megaphone, label: 'Avisos' },
  suggestions: { icon: Lightbulb, label: 'Sugestões' },
  lol: { icon: Swords, label: 'Mural do LoL' },
  dm: { icon: Hash, label: 'Conversa' }
}

/** O que dá pra criar aqui. `dm` é sintético e nasce do botão direito. */
const CREATABLE: ChannelType[] = ['text', 'voice', 'announcements', 'suggestions', 'lol']

/** Nota curta sob o seletor de tipo, só onde a escolha tem consequência. */
const TYPE_NOTE: Partial<Record<ChannelType, string>> = {
  voice: 'Canal de voz não tem chat, então nenhum card nasce nele.',
  lol: 'O pós-jogo vai sozinho pro primeiro mural do LoL. Um segundo fica vazio.'
}

const DEFAULT_CATEGORIES = ['Conversa', 'Jogos', 'Grupo', 'Servidor', 'Voz']

export function ChannelManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token, user } = useAuth()
  const { channels, refreshChannels } = useChat()
  const { isPhone } = useLayout()

  /**
   * A ordem em rascunho é só a lista de ids.
   *
   * Guardar os objetos inteiros era o bug da versão anterior: qualquer
   * salvamento (renomear, ligar um feed) recarregava a lista e sobrescrevia o
   * rascunho, perdendo a reordenação que a pessoa ainda não tinha salvo. Com
   * ids, `draft` é recalculado a partir dos canais frescos mantendo a ordem
   * pendente — canal apagado some, canal novo entra no fim.
   */
  const [order, setOrder] = React.useState<string[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  /** No celular só cabe uma coluna: a lista OU o canal aberto. */
  const [pane, setPane] = React.useState<'lista' | 'canal'>('lista')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [seedNote, setSeedNote] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setOrder(channels.map((c) => c.id))
    setError(null)
    setSeedNote(null)
    setCreating(false)
    setPane('lista')
    // Só ao abrir: no meio do uso a lista muda a cada salvamento, e o
    // rascunho da ordem tem que sobreviver a isso (ver `order`).
  }, [open])

  const draft = React.useMemo(() => {
    const byId = new Map(channels.map((c) => [c.id, c]))
    const seen = new Set<string>()
    const out: Channel[] = []
    for (const id of order) {
      const channel = byId.get(id)
      if (channel) {
        out.push(channel)
        seen.add(id)
      }
    }
    for (const channel of channels) if (!seen.has(channel.id)) out.push(channel)
    return out
  }, [order, channels])

  const dirty = React.useMemo(
    () => draft.map((c) => c.id).join(',') !== channels.map((c) => c.id).join(','),
    [draft, channels]
  )

  /**
   * Os grupos, na ordem e com os rótulos da barra lateral.
   *
   * Texto antes de voz, e um grupo de voz sozinho chama "Voz" — é exatamente o
   * que a pessoa vê atrás da modal, então subir um canal aqui sobe lá.
   */
  const groups = React.useMemo(() => {
    const text = groupByCategory(draft.filter((c) => c.type !== 'voice'))
    const voice = groupByCategory(draft.filter((c) => c.type === 'voice'))
    return [
      ...text.map((g) => ({ key: 'texto:' + g.category, label: g.category, channels: g.channels })),
      ...voice.map((g) => ({
        key: 'voz:' + g.category,
        label: voice.length === 1 ? 'Voz' : g.category,
        channels: g.channels
      }))
    ]
  }, [draft])

  const selected = React.useMemo(
    () => (selectedId ? (channels.find((c) => c.id === selectedId) ?? null) : null),
    [channels, selectedId]
  )

  // No computador o painel da direita nunca fica vazio: abre no primeiro
  // canal, e se o selecionado foi apagado pula pro primeiro de novo. No
  // celular a lista é a tela inicial e ninguém é aberto sem toque.
  React.useEffect(() => {
    if (!open || isPhone || creating || selected) return
    const first = draft[0]
    if (first) setSelectedId(first.id)
  }, [open, isPhone, creating, selected, draft])

  const knownCategories = React.useMemo(() => {
    const found = new Set<string>(DEFAULT_CATEGORIES)
    for (const channel of channels) {
      const value = channel.category?.trim()
      if (value) found.add(value)
    }
    return [...found].sort((a, b) => a.localeCompare(b))
  }, [channels])

  /** Quem recebe cada feed hoje — pra avisar de quem o feed está saindo. */
  const ownerOf = React.useCallback(
    (feed: ChannelFeed): Channel | null =>
      channels.find((c) => parseChannelFeeds(c.feeds).includes(feed)) ?? null,
    [channels]
  )

  const run = async <T,>(
    action: () => Promise<T>
  ): Promise<{ ok: true; value: T } | { ok: false }> => {
    setBusy(true)
    setError(null)
    try {
      const value = await action()
      await refreshChannels()
      return { ok: true, value }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deu ruim')
      return { ok: false }
    } finally {
      setBusy(false)
    }
  }

  const openChannel = (id: string): void => {
    setSelectedId(id)
    setCreating(false)
    setPane('canal')
  }

  const startCreate = (): void => {
    setCreating(true)
    setPane('canal')
  }

  const cancelCreate = (): void => {
    setCreating(false)
    setPane('lista')
  }

  const move = (id: string, direction: -1 | 1): void => {
    const group = groups.find((g) => g.channels.some((c) => c.id === id))
    if (!group) return
    const at = group.channels.findIndex((c) => c.id === id)
    const neighbor = group.channels[at + direction]
    if (!neighbor) return
    // Trocar os dois no rascunho global preserva a ordem relativa de todo o
    // resto — inclusive dos canais de outros grupos que estão entre eles.
    const ids = draft.map((c) => c.id)
    const a = ids.indexOf(id)
    const b = ids.indexOf(neighbor.id)
    ;[ids[a], ids[b]] = [ids[b], ids[a]]
    setOrder(ids)
  }

  const create = async (payload: {
    name: string
    type: ChannelType
    icon: string | null
    category: string | null
  }): Promise<void> => {
    if (!token) return
    const result = await run(() =>
      channelsApi.create(token, {
        name: payload.name,
        type: payload.type,
        icon: payload.icon ?? undefined,
        category: payload.category
      })
    )
    if (result.ok) {
      setCreating(false)
      setSelectedId(result.value.id)
      setPane('canal')
    }
  }

  const rename = (channel: Channel, name: string): void => {
    if (!token || !name || name === channel.name) return
    void run(() => channelsApi.update(token, channel.id, { name }))
  }

  const setIcon = (channel: Channel, icon: string | null): void => {
    if (!token || (channel.icon ?? null) === icon) return
    void run(() => channelsApi.update(token, channel.id, { icon }))
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
   * declara, então deixar dois marcados não daria erro — daria um destino
   * decidido pela posição, que é pior que um erro porque parece funcionar.
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

  const remove = async (channel: Channel): Promise<void> => {
    if (!token) return
    const result = await run(() => channelsApi.remove(token, channel.id))
    if (result.ok) {
      setSelectedId(null)
      setPane('lista')
    }
  }

  /** Cria o que falta e preenche grupo/ícone/feeds vazios. Não sobrescreve nada. */
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

  const showList = !isPhone || pane === 'lista'
  const showDetail = !isPhone || pane === 'canal'

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="h-[82dvh] max-w-3xl max-sm:h-[88dvh]">
        <DialogHeader>
          <DialogTitle>Canais</DialogTitle>
          <DialogDescription>o que aparece na barra, em que grupo e em que ordem</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 overflow-hidden rounded-brutal border border-line">
          {showList && (
            <nav
              aria-label="Lista de canais"
              className={cn(
                'flex min-h-0 flex-col bg-void/40',
                isPhone ? 'w-full' : 'w-56 shrink-0 border-r border-line'
              )}
            >
              <div className="shrink-0 p-2">
                <button
                  type="button"
                  onClick={startCreate}
                  disabled={busy}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-brutal border border-dashed px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-50',
                    creating
                      ? 'border-acid bg-acid/10 text-acid'
                      : 'border-line-strong text-muted-foreground hover:border-acid/60 hover:text-foreground'
                  )}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  Novo canal
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {groups.map((group) => (
                  <section key={group.key} className="mb-2">
                    <h3 className="px-2 pb-1 pt-1 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
                      {group.label}
                    </h3>
                    <div className="space-y-0.5">
                      {group.channels.map((channel, index) => {
                        const active = !creating && channel.id === selectedId
                        return (
                          <div
                            key={channel.id}
                            className={cn(
                              'flex items-center rounded-brutal transition-colors',
                              active
                                ? 'bg-acid/10 text-acid'
                                : 'text-muted-foreground hover:bg-void-light hover:text-foreground'
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => openChannel(channel.id)}
                              aria-current={active ? 'true' : undefined}
                              className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                            >
                              <ChannelGlyph channel={channel} />
                              <span className="min-w-0 flex-1 truncate text-sm">{channel.name}</span>
                            </button>

                            {/* Setas só no canal aberto: é o único que a
                                pessoa está mexendo, e vinte setas na lista
                                era o barulho que esta tela tirou. */}
                            {active && (
                              <span className="flex shrink-0 items-center pr-1">
                                <IconButton
                                  label="Subir"
                                  disabled={index === 0 || busy}
                                  onClick={() => move(channel.id, -1)}
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </IconButton>
                                <IconButton
                                  label="Descer"
                                  disabled={index === group.channels.length - 1 || busy}
                                  onClick={() => move(channel.id, 1)}
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </IconButton>
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                ))}

                {draft.length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Nenhum canal ainda.
                  </p>
                )}
              </div>
            </nav>
          )}

          {showDetail && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {creating ? (
                <CreateForm
                  knownCategories={knownCategories}
                  busy={busy}
                  showBack={isPhone}
                  onBack={cancelCreate}
                  onCancel={cancelCreate}
                  onCreate={create}
                />
              ) : selected ? (
                <ChannelEditor
                  key={selected.id}
                  channel={selected}
                  knownCategories={knownCategories}
                  ownerOf={ownerOf}
                  busy={busy}
                  showBack={isPhone}
                  onBack={() => setPane('lista')}
                  onRename={(name) => rename(selected, name)}
                  onIcon={(icon) => setIcon(selected, icon)}
                  onCategory={(value) => setCategory(selected, value)}
                  onToggleFeed={(feed) => toggleFeed(selected, feed)}
                  onDelete={() => void remove(selected)}
                />
              ) : (
                <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
                  Escolha um canal na lista.
                </div>
              )}
            </div>
          )}
        </div>

        {error && <p className="mt-2 shrink-0 text-xs text-destructive">{error}</p>}
        {seedNote && !error && (
          <p className="mt-2 shrink-0 text-xs text-acid-text">{seedNote}</p>
        )}

        <div className="mt-3 flex shrink-0 items-center gap-2 border-t border-line pt-3">
          {/* Cria os canais padrão que faltam e preenche grupo, ícone e
              feeds dos que já existem. Não sobrescreve escolha de ninguém
              nem mexe na ordem — ver a rota /channels/seed. */}
          <Hint
            label="Organizar"
            description="Cria os canais padrão que faltam e preenche grupo, ícone e o que nasce nos que estão vazios. Não mexe em nada que já foi escolhido."
            side="top"
            align="start"
          >
            <Button variant="ghost" size="sm" onClick={organize} disabled={busy}>
              <Wand2 className="mr-1 h-3.5 w-3.5" />
              Organizar
            </Button>
          </Hint>

          <span className="flex-1" />

          {dirty && (
            <>
              <span className="text-xs text-muted-foreground max-sm:hidden">ordem alterada</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOrder(channels.map((c) => c.id))}
                disabled={busy}
              >
                Desfazer
              </Button>
              <Button size="sm" onClick={saveOrder} disabled={busy}>
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Salvar ordem
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// O canal aberto
// ---------------------------------------------------------------------------

function ChannelEditor({
  channel,
  knownCategories,
  ownerOf,
  busy,
  showBack,
  onBack,
  onRename,
  onIcon,
  onCategory,
  onToggleFeed,
  onDelete
}: {
  channel: Channel
  knownCategories: string[]
  ownerOf: (feed: ChannelFeed) => Channel | null
  busy: boolean
  showBack: boolean
  onBack: () => void
  onRename: (name: string) => void
  onIcon: (icon: string | null) => void
  onCategory: (value: string) => void
  onToggleFeed: (feed: ChannelFeed) => void
  onDelete: () => void
}) {
  const [editingName, setEditingName] = React.useState(false)
  const [name, setName] = React.useState(channel.name)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const confirmRef = React.useRef<HTMLDivElement>(null)

  // A confirmação nasce no pé do painel, quase sempre abaixo da dobra: rola
  // até ela pra que os botões apareçam sem a pessoa ter que procurar.
  React.useEffect(() => {
    if (confirmDelete) confirmRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [confirmDelete])

  const meta = TYPE_META[channel.type]
  const TypeIcon = meta.icon
  const feeds = parseChannelFeeds(channel.feeds)
  const messages = channel._count?.messages

  const commitName = (): void => {
    setEditingName(false)
    onRename(name.trim())
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 max-sm:p-3">
      {showBack && <BackButton onClick={onBack} />}

      <div className="flex items-start gap-3">
        <IconPicker
          glyph={channel}
          busy={busy}
          onChange={onIcon}
        />

        <div className="min-w-0 flex-1 pt-0.5">
          {editingName ? (
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitName()
                if (event.key === 'Escape') {
                  setName(channel.name)
                  setEditingName(false)
                }
              }}
              onBlur={commitName}
              aria-label="Nome do canal"
              className="input-terminal w-full rounded-brutal px-2 py-1 text-base font-semibold"
            />
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setName(channel.name)
                setEditingName(true)
              }}
              title="Renomear"
              className="group flex max-w-full items-center gap-2 rounded-brutal py-1 text-left disabled:opacity-50"
            >
              <span className="truncate text-base font-semibold text-foreground">
                {channel.name}
              </span>
              <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" />
            </button>
          )}

          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <TypeIcon className="h-3 w-3 shrink-0" />
            <span>{meta.label}</span>
            {typeof messages === 'number' && (
              <span>
                · {messages.toLocaleString('pt-BR')} {messages === 1 ? 'mensagem' : 'mensagens'}
              </span>
            )}
          </p>
        </div>
      </div>

      <Section title="Grupo na barra" hint="A seção da lista da esquerda onde o canal aparece.">
        <CategoryChips
          value={channel.category?.trim() || ''}
          options={knownCategories}
          disabled={busy}
          onChange={onCategory}
        />
      </Section>

      {/* Canal de voz não tem chat: card nenhum nasce ali. */}
      {channel.type !== 'voice' && (
        <Section
          title="Nasce aqui"
          hint="O que o app cria sozinho cai neste canal. Cada coisa mora num canal só."
        >
          <div className="divide-y divide-line rounded-brutal border border-line px-3">
            {CHANNEL_FEEDS.map((feed) => {
              const on = feeds.includes(feed)
              const owner = ownerOf(feed)
              const takenFrom = !on && owner && owner.id !== channel.id ? owner : null
              return (
                <SwitchRow
                  key={feed}
                  label={FEED_LABEL[feed]}
                  hint={takenFrom ? `hoje cai em #${takenFrom.name} — ligar aqui tira de lá` : undefined}
                  checked={on}
                  onCheckedChange={() => onToggleFeed(feed)}
                  disabled={busy}
                />
              )
            })}
          </div>
        </Section>
      )}

      {/* Apagar leva as mensagens junto (cascade no banco). A confirmação
          abre no lugar do botão em vez de outra modal por cima desta. */}
      <div className="mt-6 border-t border-line pt-3">
        {confirmDelete ? (
          <div
            ref={confirmRef}
            className="rounded-brutal border border-destructive/50 bg-destructive/5 p-3"
          >
            <p className="text-sm text-foreground">
              Apagar <span className="font-semibold">{channel.name}</span>
              {typeof messages === 'number' && messages > 0
                ? ` e as ${messages.toLocaleString('pt-BR')} mensagens dele?`
                : '?'}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Não tem volta.</p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onDelete}
                disabled={busy}
              >
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Apagar de vez
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
                disabled={busy}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Apagar canal
          </Button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Canal novo
// ---------------------------------------------------------------------------

function CreateForm({
  knownCategories,
  busy,
  showBack,
  onBack,
  onCancel,
  onCreate
}: {
  knownCategories: string[]
  busy: boolean
  showBack: boolean
  onBack: () => void
  onCancel: () => void
  onCreate: (payload: {
    name: string
    type: ChannelType
    icon: string | null
    category: string | null
  }) => Promise<void>
}) {
  const [name, setName] = React.useState('')
  const [type, setType] = React.useState<ChannelType>('text')
  const [icon, setIcon] = React.useState<string | null>(null)
  const [category, setCategory] = React.useState('Conversa')
  // Enquanto a pessoa não escolheu grupo, o tipo sugere um: voz vai pra
  // "Voz". Depois que ela tocou nos chips, a escolha dela fica.
  const [categoryTouched, setCategoryTouched] = React.useState(false)

  const pickType = (next: ChannelType): void => {
    setType(next)
    if (!categoryTouched) setCategory(next === 'voice' ? 'Voz' : 'Conversa')
  }

  const canSubmit = name.trim().length > 0 && !busy

  const submit = (): void => {
    if (!canSubmit) return
    void onCreate({ name: name.trim(), type, icon, category: category.trim() || null })
  }

  const note = TYPE_NOTE[type]

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 max-sm:p-3">
      {showBack && <BackButton onClick={onBack} />}

      <h3 className="text-base font-semibold text-foreground">Novo canal</h3>

      <div className="mt-3 flex items-center gap-3">
        <IconPicker
          glyph={{ type, icon }}
          busy={busy}
          onChange={setIcon}
        />
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
          }}
          placeholder="nome do canal"
          aria-label="Nome do canal"
          className="input-terminal h-12 min-w-0 flex-1 rounded-brutal px-3 text-base"
        />
      </div>

      <Section title="Tipo">
        <div className="flex flex-wrap gap-1.5">
          {CREATABLE.map((option) => {
            const meta = TYPE_META[option]
            const Icon = meta.icon
            return (
              <Chip
                key={option}
                active={type === option}
                disabled={busy}
                onClick={() => pickType(option)}
              >
                <Icon className="h-3 w-3" />
                {meta.label}
              </Chip>
            )
          })}
        </div>
        {note && <p className="mt-1.5 text-xs text-muted-foreground">{note}</p>}
      </Section>

      <Section title="Grupo na barra">
        <CategoryChips
          value={category}
          options={knownCategories}
          disabled={busy}
          onChange={(value) => {
            setCategoryTouched(true)
            setCategory(value)
          }}
        />
      </Section>

      <div className="mt-6 flex gap-2">
        <Button size="sm" onClick={submit} disabled={!canSubmit}>
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          Criar canal
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------------

/**
 * O ícone grande do canal, que abre a grade de ícones.
 *
 * Grade fechada e não seletor de emoji: o catálogo (lib/channel-icons) é
 * traço no desenho do app, agrupado pelo que o canal é. Sem ícone escolhido
 * o botão mostra o símbolo do tipo, que é o que a barra mostra também.
 */
function IconPicker({
  glyph,
  busy,
  onChange
}: {
  glyph: Pick<Channel, 'type' | 'icon'>
  busy: boolean
  onChange: (icon: string | null) => void
}) {
  const [open, setOpen] = React.useState(false)
  const current = channelIconDef(glyph.icon)
  const hasIcon = current !== null

  /**
   * Escape fecha SÓ o seletor, não a modal inteira junto.
   *
   * O Dialog e o Popover do Radix carregam cada um a própria cópia aninhada
   * de `react-dismissable-layer` (node_modules/@radix-ui/react-dialog/… e
   * …/react-popover/…), então as duas camadas vivem em contextos separados e
   * cada uma se acha "a de cima": um Escape com o seletor aberto fechava o
   * seletor E a modal de canais. Um listener no `window` em fase de captura
   * roda antes de qualquer listener do `document`, que é onde o Radix escuta
   * — daí dá pra fechar o seletor e segurar a tecla ali. Some quando o
   * `npm dedupe` unificar as cópias; até lá, é o que mantém a tecla honesta.
   */
  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={busy}
          title={hasIcon ? 'Trocar o ícone' : 'Escolher um ícone'}
          aria-label={hasIcon ? 'Trocar o ícone' : 'Escolher um ícone'}
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-brutal border-2 transition-colors disabled:opacity-50',
            hasIcon
              ? 'border-acid-dark bg-acid/5 text-acid hover:border-acid'
              : 'border-dashed border-line text-muted-foreground hover:border-acid/50 hover:text-foreground'
          )}
        >
          <ChannelGlyph channel={glyph} size="lg" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[308px] p-0">
        {hasIcon && (
          <button
            type="button"
            onClick={() => {
              onChange(null)
              setOpen(false)
            }}
            className="w-full border-b border-line px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-destructive"
          >
            Tirar o ícone — volta pro símbolo do tipo
          </button>
        )}
        <div className="max-h-[340px] overflow-y-auto p-2">
          {CHANNEL_ICON_GROUPS.map((group) => (
            <section key={group.label} className="mb-2 last:mb-0">
              <h4 className="px-1 pb-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </h4>
              <div className="grid grid-cols-7 gap-1">
                {group.icons.map((def) => {
                  const active = current?.key === def.key
                  return (
                    <Hint key={def.key} label={def.label} side="top">
                      <button
                        type="button"
                        aria-label={def.label}
                        aria-pressed={active}
                        onClick={() => {
                          onChange(def.key)
                          setOpen(false)
                        }}
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-brutal border transition-colors',
                          active
                            ? 'border-acid bg-acid/10 text-acid'
                            : 'border-transparent text-muted-foreground hover:border-line hover:bg-void-light hover:text-foreground'
                        )}
                      >
                        <ChannelIconArt def={def} className="h-[18px] w-[18px]" />
                      </button>
                    </Hint>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Os grupos como chips, mais "novo grupo" que vira um campo.
 *
 * Chips em vez de campo livre: o que o servidor já usa fica a um clique, e
 * ninguém digita "jogos" achando que é o mesmo grupo que "Jogos".
 */
function CategoryChips({
  value,
  options,
  disabled,
  onChange
}: {
  value: string
  options: string[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  const [custom, setCustom] = React.useState<string | null>(null)

  const commit = (): void => {
    const next = (custom ?? '').trim()
    setCustom(null)
    if (next) onChange(next)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((option) => (
        <Chip
          key={option}
          active={value === option}
          disabled={disabled}
          onClick={() => onChange(option)}
        >
          {option}
        </Chip>
      ))}

      {/* Grupo que só este canal usa (e não está na lista fixa) ainda tem
          que aparecer marcado — senão parece que o canal está sem grupo. */}
      {value && !options.includes(value) && (
        <Chip active disabled={disabled} onClick={() => undefined}>
          {value}
        </Chip>
      )}

      {custom !== null ? (
        <input
          autoFocus
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
            if (event.key === 'Escape') setCustom(null)
          }}
          onBlur={commit}
          placeholder="nome do grupo"
          aria-label="Nome do grupo novo"
          className="input-terminal h-7 w-36 rounded-brutal px-2 text-xs"
        />
      ) : (
        <Chip disabled={disabled} onClick={() => setCustom('')}>
          <Plus className="h-3 w-3" />
          novo grupo
        </Chip>
      )}
    </div>
  )
}

function Chip({
  active,
  disabled,
  onClick,
  children
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-brutal border px-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'border-acid bg-acid/10 text-acid'
          : 'border-line text-muted-foreground hover:border-acid/50 hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function Section({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-5">
      <h3 className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground/80">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-3 flex items-center gap-1 rounded-brutal text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      Todos os canais
    </button>
  )
}

function IconButton({
  children,
  label,
  onClick,
  disabled
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-brutal p-1 text-current opacity-80 transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  )
}
