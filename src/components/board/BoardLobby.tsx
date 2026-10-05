import * as React from 'react'
import { Eye, Loader2, Plus, Radio, Send, Timer, Users } from 'lucide-react'
import { MurchosIcon } from '@/lib/bocas-icons'
import { UserAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { resolveAssetUrl } from '@/lib/api'
import { boardGameLabel, type BoardGame, type BoardPerson, type LobbyBoardTable } from '@/lib/api-board'
import { useAuth } from '@/lib/auth-context'
import { useBoard } from '@/lib/board-context'
import { useGamification } from '@/lib/gamification-context'
import { useMembers } from '@/lib/members-context'
import { cn } from '@/lib/utils'
import { CreateDialog } from './CreateDialog'

/**
 * O SAGUÃO do xadrez e da dama — no visual do PokerLobby.
 *
 * Três listas, cada uma só aparece com itens: mesas abertas (esperando
 * adversário), começando (dois sentados, ainda dá pra apostar) e em andamento.
 * Só as mesas do jogo desta página. Sentar e assistir abrem a mesa pelo
 * contexto; a tela troca sozinha pro tabuleiro.
 */

export function BoardLobby({ game }: { game: BoardGame }) {
  const { tables, ready, myTable, openTable, leaveTable, sit } = useBoard()
  const { profile } = useGamification()
  const { user } = useAuth()
  const [dialog, setDialog] = React.useState<'open' | 'invite' | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const mine = React.useMemo(() => tables.filter((t) => t.game === game), [tables, game])
  const open = mine.filter((t) => t.phase === 'open')
  const pending = mine.filter((t) => t.phase === 'pending')
  const playing = mine.filter((t) => t.phase === 'playing')
  const empty = open.length + pending.length + playing.length === 0

  const fail = (ack: { ok: boolean; error?: string }): void => {
    if (!ack.ok) setError(ack.error ?? 'Não deu certo.')
  }

  const onOpen = (id: string): void => {
    setError(null)
    void openTable(id).then(fail)
  }
  const onSit = (id: string): void => {
    setError(null)
    void sit(id).then((ack) => {
      if (!ack.ok) return fail(ack)
      return openTable(id).then(fail)
    })
  }
  // Cancelar a minha: abre a sala e sai dela (jogador que sai antes do início
  // cancela a mesa, isso é com o servidor).
  const onCancel = (id: string): void => {
    setError(null)
    void openTable(id).then((ack) => {
      if (ack.ok) leaveTable()
      else fail(ack)
    })
  }

  const isMine = (t: LobbyBoardTable): boolean =>
    !!user && (t.host.userId === user.id || t.white?.userId === user.id || t.black?.userId === user.id)

  return (
    <div className="scroll-stable flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      {/* Saldo + convidar + criar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-brutal border border-burn/60 bg-burn/10 px-3 py-1.5 font-mono text-sm text-burn">
          <MurchosIcon className="h-4 w-4" aria-hidden />
          {profile ? profile.coins.toLocaleString('pt-BR') : '…'}
          <span className="text-[11.5px] opacity-70">murchos</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setDialog('invite')}>
            <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Convidar
          </Button>
          <Button size="sm" onClick={() => setDialog('open')}>
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            Criar mesa
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{error}</p>
      )}

      {!ready ? (
        <p className="flex items-center gap-2 rounded-brutal border border-line bg-void/60 px-3 py-6 text-center text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Carregando as mesas…
        </p>
      ) : empty ? (
        <div className="rounded-brutal border border-line bg-void/60 px-3 py-6 text-center">
          <p className="text-xs text-foreground">Nenhuma mesa de {boardGameLabel(game, null).split(' ')[0].toLowerCase()} aberta agora.</p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Crie uma: ela aparece aqui pra todo mundo e vira um card no canal de jogos.
          </p>
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <Section title="Mesas abertas" count={open.length} live>
              {open.map((t) => (
                <TableRow
                  key={t.id}
                  table={t}
                  mine={isMine(t)}
                  highlight={myTable?.id === t.id}
                  action={
                    isMine(t) ? (
                      <>
                        <Button size="sm" onClick={() => onOpen(t.id)}>
                          Sua mesa
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => onCancel(t.id)}>
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" onClick={() => onSit(t.id)}>
                        Sentar · {t.stake > 0 ? `${t.stake.toLocaleString('pt-BR')} · ` : ''}
                        <span className="font-mono">{t.clock}</span>
                      </Button>
                    )
                  }
                />
              ))}
            </Section>
          )}

          {pending.length > 0 && (
            <Section title="Começando" count={pending.length}>
              {pending.map((t) => (
                <TableRow
                  key={t.id}
                  table={t}
                  mine={isMine(t)}
                  highlight={myTable?.id === t.id}
                  action={
                    <Button size="sm" variant={isMine(t) ? 'default' : 'secondary'} onClick={() => onOpen(t.id)}>
                      {isMine(t) ? (
                        'Voltar'
                      ) : (
                        <>
                          <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                          Assistir e apostar
                        </>
                      )}
                    </Button>
                  }
                />
              ))}
            </Section>
          )}

          {playing.length > 0 && (
            <Section title="Em andamento" count={playing.length}>
              {playing.map((t) => (
                <TableRow
                  key={t.id}
                  table={t}
                  mine={isMine(t)}
                  highlight={myTable?.id === t.id}
                  action={
                    <Button size="sm" variant={isMine(t) ? 'default' : 'secondary'} onClick={() => onOpen(t.id)}>
                      {isMine(t) ? (
                        'Voltar'
                      ) : (
                        <>
                          <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                          Assistir
                        </>
                      )}
                    </Button>
                  }
                />
              ))}
            </Section>
          )}
        </>
      )}

      {dialog && <CreateDialog game={game} mode={dialog} onClose={() => setDialog(null)} />}
    </div>
  )
}

function Section({
  title,
  count,
  live,
  children
}: {
  title: string
  count: number
  live?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="min-w-0">
      <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Radio className={cn('h-3.5 w-3.5', live ? 'text-destructive' : 'text-muted-foreground')} aria-hidden />
        {title}
        <span className="font-mono text-xs text-muted-foreground">{count}</span>
      </h4>
      <ul className="space-y-2">{children}</ul>
    </section>
  )
}

function TableRow({
  table,
  mine,
  highlight,
  action
}: {
  table: LobbyBoardTable
  mine: boolean
  highlight: boolean
  action: React.ReactNode
}) {
  const { byId } = useMembers()
  // Mesa aberta ainda só tem o anfitrião; com dois sentados, os dois.
  const people: BoardPerson[] = [table.white, table.black].filter((p): p is BoardPerson => !!p)
  if (people.length === 0) people.push(table.host)
  const names = people.map((p) => byId[p.userId]?.displayName ?? p.displayName)

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-brutal border px-3 py-2',
        mine || highlight
          ? 'border-acid/60 bg-acid/[0.06]'
          : table.phase === 'playing'
            ? 'border-burn/40 bg-burn/[0.04]'
            : 'border-line bg-void/60'
      )}
    >
      <div className="flex shrink-0 -space-x-2">
        {people.map((p) => {
          const m = byId[p.userId]
          return (
            <UserAvatar
              key={p.userId}
              userId={p.userId}
              src={resolveAssetUrl(m?.avatar ?? p.avatar)}
              name={m?.displayName ?? p.displayName}
              ringColor={m?.profileColor ?? undefined}
              frame={m?.avatarFrame}
              frameColor={m?.profileColor}
              className="h-7 w-7 border-2 border-void"
            />
          )
        })}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">
          {names.join(' vs ')}
          {mine && <span className="text-acid"> · você está aqui</span>}
        </p>
        <p className="truncate text-[11.5px] text-muted-foreground">
          {table.game === 'draughts' && (
            <>
              {boardGameLabel(table.game, table.variant)}
              {' · '}
            </>
          )}
          <Timer className="inline h-3 w-3" aria-hidden /> <span className="font-mono">{table.clock}</span>
          {' · '}
          {table.stake > 0 ? (
            <span className="font-mono text-burn">{table.stake.toLocaleString('pt-BR')} murchos</span>
          ) : (
            'amistosa'
          )}
          {table.pool > 0 && (
            <>
              {' · bolo '}
              <span className="font-mono text-burn">{table.pool.toLocaleString('pt-BR')}</span>
            </>
          )}
          {table.spectators > 0 && (
            <>
              {' · '}
              <Users className="inline h-3 w-3" aria-hidden /> <span className="font-mono">{table.spectators}</span>
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{action}</div>
    </li>
  )
}
