import * as React from 'react'
import { ExternalLink, RefreshCw, Link2, Unlink } from 'lucide-react'
import { ApiError } from '@/lib/api'
import {
  chess,
  CHESS_RESULT_LABEL,
  TIME_CLASS_LABEL,
  type ChessGame,
  type ChessPayload,
  type ChessTimeClass
} from '@/lib/api-chess'
import { useAuth } from '@/lib/auth-context'
import { useSocket } from '@/lib/socket-context'
import { openExternal } from '@/lib/rich-text'
import { cn } from '@/lib/utils'

/**
 * Bloco "♟ Chess.com" do cartão de perfil.
 *
 * Busca só quando o cartão abre (mesma regra do resto do cartão). Pra quem
 * está olhando o próprio perfil: vincular / atualizar / desvincular. Pra os
 * outros: só leitura, e some se a pessoa não vinculou nada.
 */

const RECENT_SHOWN = 5
const SYNC_COOLDOWN_MS = 60_000
const CLASSES: ChessTimeClass[] = ['bullet', 'blitz', 'rapid']

/**
 * O cartão inteiro desmonta toda vez que o popover fecha (Radix
 * PopoverContent), então um state local de "última sync" voltaria a 0 a
 * cada reabertura e o botão de atualizar reapareceria liberado antes da
 * hora. Guardando em módulo o cooldown sobrevive ao unmount — e como o
 * launcher é por usuário, esse escopo "global" é exatamente por-pessoa.
 */
let lastManualSyncAt = 0

export function ChessBlock({ userId, isSelf, open }: { userId: string; isSelf: boolean; open: boolean }) {
  const { token } = useAuth()
  const { socket } = useSocket()
  const [data, setData] = React.useState<ChessPayload | null>(null)
  const [username, setUsername] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [syncNote, setSyncNote] = React.useState<string | null>(null)
  const [, forceTick] = React.useState(0)

  const load = React.useCallback(async () => {
    if (!token) return
    try {
      setData(isSelf ? await chess.me(token) : await chess.user(token, userId))
    } catch {
      setData({ profile: null, games: [] })
    }
  }, [token, isSelf, userId])

  React.useEffect(() => {
    if (open) void load()
  }, [open, load])

  React.useEffect(() => {
    if (!socket || !isSelf) return
    const onProfile = () => {
      // O payload do evento só traz o profile; os games também podem ter mudado, então recarrega tudo.
      void load()
    }
    socket.on('chess:profile', onProfile)
    return () => {
      socket.off('chess:profile', onProfile)
    }
  }, [socket, isSelf, load])

  // Só o dono do perfil vê o botão de atualizar — enquanto o cooldown corre,
  // esse tick periódico faz o botão reaparecer liberado sem precisar de
  // outra interação (fechar/abrir o card, digitar, etc).
  const hasProfile = Boolean(data?.profile)
  React.useEffect(() => {
    if (!hasProfile || !isSelf) return
    const id = setInterval(() => forceTick((t) => t + 1), 5_000)
    return () => clearInterval(id)
  }, [hasProfile, isSelf])

  const run = async (fn: () => Promise<void>) => {
    if (!token || busy) return
    setBusy(true)
    setError(null)
    setSyncNote(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao falar com o servidor')
    } finally {
      setBusy(false)
    }
  }

  const onLink = () =>
    run(async () => {
      setData(await chess.link(token!, username.trim()))
      setUsername('')
    })

  const onUnlink = () =>
    run(async () => {
      if (!window.confirm('Desvincular a conta do Chess.com? O histórico fica, o XP já pago também.')) return
      await chess.unlink(token!)
      setData({ profile: null, games: [] })
    })

  const onSync = () =>
    run(async () => {
      const res = await chess.sync(token!)
      setData({ profile: res.profile, games: res.games })
      lastManualSyncAt = Date.now()
      // O Chess.com publica a partida no arquivo do mês com atraso (minutos,
      // às vezes horas). Sem avisar, "sincronizei e não veio nada" parece bug.
      setSyncNote(
        res.newGames > 0
          ? `${res.newGames} partida${res.newGames > 1 ? 's' : ''} nova${res.newGames > 1 ? 's' : ''} paga${res.newGames > 1 ? 's' : ''}`
          : 'Nada novo ainda. O Chess.com demora pra publicar a partida (minutos, às vezes horas); o servidor confere sozinho a cada 2 min.'
      )
    })

  if (!data) return null
  const profile = data.profile

  if (!profile) {
    if (!isSelf) return null
    return (
      <div className="mt-2 rounded-brutal border border-[#1a1a1a] bg-void/60 px-2 py-1.5">
        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">♟ chess.com</p>
        <div className="mt-1 flex items-center gap-1">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy && username.trim().length >= 3) void onLink()
            }}
            placeholder="seu username"
            className="h-6 min-w-0 flex-1 rounded-brutal border border-[#1a1a1a] bg-void px-1.5 font-mono text-[11px] outline-none focus:border-acid"
          />
          <button
            type="button"
            disabled={busy || username.trim().length < 3}
            onClick={() => void onLink()}
            className="flex h-6 items-center gap-1 rounded-brutal border border-acid/50 px-1.5 font-mono text-[10px] uppercase text-acid disabled:opacity-40"
          >
            <Link2 className="h-3 w-3" /> vincular
          </button>
        </div>
        {error && <p className="mt-1 font-mono text-[10px] text-destructive">{error}</p>}
      </div>
    )
  }

  const canSync = Date.now() - lastManualSyncAt > SYNC_COOLDOWN_MS
  const recent = data.games.slice(0, RECENT_SHOWN)

  return (
    <div className="mt-2 space-y-1.5 rounded-brutal border border-[#1a1a1a] bg-void/60 px-2 py-1.5">
      <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        <button
          type="button"
          onClick={() => openExternal(`https://www.chess.com/member/${profile.username}`)}
          className="flex items-center gap-1 hover:text-acid"
        >
          ♟ {profile.username} <ExternalLink className="h-2.5 w-2.5" />
        </button>
        {isSelf && (
          <span className="flex items-center gap-1">
            <button
              type="button"
              title="Atualizar agora"
              disabled={busy || !canSync}
              onClick={() => void onSync()}
              className="hover:text-acid disabled:opacity-40"
            >
              <RefreshCw className={cn('h-3 w-3', busy && 'animate-spin')} />
            </button>
            <button type="button" title="Desvincular" disabled={busy} onClick={() => void onUnlink()} className="hover:text-destructive">
              <Unlink className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {CLASSES.map((c) => {
          const r = profile.ratings[c]
          if (!r) return null
          return (
            <span
              key={c}
              title={`${r.w}V ${r.l}D ${r.d}E`}
              className="rounded-brutal border border-[#1a1a1a] bg-void px-1.5 py-0.5 font-mono text-[10px]"
            >
              <span className="text-muted-foreground">{TIME_CLASS_LABEL[c]} </span>
              <span className="text-foreground">{r.rating}</span>
              <span className="text-muted-foreground"> · {r.w}-{r.l}-{r.d}</span>
            </span>
          )
        })}
      </div>

      {recent.length > 0 && (
        <ul className="space-y-0.5">
          {recent.map((g) => (
            <GameRow key={g.id} game={g} />
          ))}
        </ul>
      )}

      {error && <p className="font-mono text-[10px] text-destructive">{error}</p>}
      {syncNote && !error && <p className="font-mono text-[10px] text-muted-foreground">{syncNote}</p>}
    </div>
  )
}

function GameRow({ game }: { game: ChessGame }) {
  const color =
    game.result === 'win' ? 'text-acid' : game.result === 'loss' ? 'text-destructive' : 'text-muted-foreground'
  return (
    <li className="flex items-center gap-1.5 font-mono text-[10px]">
      <span className={cn('w-12 shrink-0 uppercase', color)}>{CHESS_RESULT_LABEL[game.result]}</span>
      <span className="w-10 shrink-0 text-muted-foreground">{TIME_CLASS_LABEL[game.timeClass]}</span>
      <span className="min-w-0 flex-1 truncate text-foreground">
        {game.opponent} <span className="text-muted-foreground">({game.opponentRating})</span>
      </span>
      <span className="text-foreground">{game.ratingAfter}</span>
      <button type="button" onClick={() => openExternal(game.url)} className="text-muted-foreground hover:text-acid">
        <ExternalLink className="h-2.5 w-2.5" />
      </button>
    </li>
  )
}
