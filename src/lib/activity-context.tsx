import * as React from 'react'
import { games as gamesApi, type GameActivity, type LolGameResult, type LolStatus } from './api'
import { useAuth } from './auth-context'
import { useSocket, type ActivityEntry } from './socket-context'
import { useSettings } from './settings-context'
import { useLaunch } from './launch-context'
import { useMembers } from './members-context'
import { useVoice } from './voice-context'
import { useChat } from './chat-context'
import { playUiSound } from './ui-sounds'

/**
 * PRESENÇA DE JOGO — o que EU estou fazendo, publicado pra galera.
 *
 * Duas fontes locais:
 *   - o cliente do LoL, lido pelo processo main (LCU) e entregue por IPC;
 *   - o launch do Minecraft, que já existia como estado local e nunca saía
 *     desta máquina.
 *
 * Daqui sai um `activity:set` pro servidor a cada mudança (e a cada
 * reconexão, pra se reapresentar). O que os OUTROS estão fazendo chega pelo
 * socket-context (`activities`); aqui só juntamos as duas coisas numa API
 * cômoda pra tela: `activityOf(userId)`.
 *
 * Também mora aqui o "5-stack": quando o lobby do LoL tem 2+ pessoas do grupo
 * e ninguém está em call, sugerimos (ou entramos sozinhos) no primeiro canal
 * de voz — conforme a preferência.
 */

export interface PendingPartyCall {
  /** Ids (Bocas) de quem está no lobby com você. */
  userIds: string[]
  channelId: string
}

interface ActivityContextValue {
  /** Retrato cru do cliente do LoL nesta máquina. */
  lol: LolStatus | null
  /** Minha atividade publicada (null = nada). */
  mine: GameActivity | null
  /** Atividade de qualquer pessoa, inclusive eu. */
  activityOf: (userId: string) => ActivityEntry | undefined
  /** Todo mundo em partida agora (pra apostas). */
  inGame: ActivityEntry[]
  /** Sugestão de entrar na call com o lobby (modo "perguntar"). */
  pendingCall: PendingPartyCall | null
  acceptPendingCall: () => void
  dismissPendingCall: () => void
  /** Último resultado de partida desta máquina (pra tela de pós-jogo local). */
  lastResult: LolGameResult | null
}

const ActivityContext = React.createContext<ActivityContextValue | null>(null)

const QUEUE_LABEL: Record<string, string> = {
  ranked_solo: 'Ranked Solo',
  ranked_flex: 'Ranked Flex',
  normal_draft: 'Normal',
  normal_blind: 'Normal',
  aram: 'ARAM',
  arena: 'Arena',
  tft: 'TFT',
  custom: 'Personalizada',
  urf: 'URF',
  coop: 'Coop vs IA'
}

export function queueLabel(queue: string | undefined): string | undefined {
  if (!queue) return undefined
  return QUEUE_LABEL[queue] ?? queue.replace(/_/g, ' ')
}

/** Riot ID "Nome#TAG" em minúsculas e sem espaços, pra comparar. */
export function normalizeRiotId(gameName: string | null | undefined, tagLine: string | null | undefined): string | null {
  if (!gameName) return null
  return `${gameName}#${tagLine ?? ''}`.toLowerCase().replace(/\s+/g, '')
}

function lolToActivity(
  status: LolStatus,
  partyUserIds: string[],
  shareScore: boolean
): GameActivity | null {
  if (!status.clientRunning || status.phase === 'none') return null

  const base: GameActivity = {
    game: 'lol',
    phase: status.phase,
    queue: status.queue,
    champion: status.champion,
    since: status.phaseSince,
    partyUserIds: partyUserIds.length > 0 ? partyUserIds : undefined
  }

  switch (status.phase) {
    case 'lobby':
      base.detail = status.lobby && status.lobby.length > 1 ? `Lobby ${status.lobby.length}/5` : 'No lobby'
      break
    case 'matchmaking':
      base.detail = 'Na fila'
      break
    case 'ready-check':
      base.detail = 'Partida encontrada'
      break
    case 'champ-select':
      base.detail = 'Champ select'
      break
    case 'in-progress':
      base.detail = 'Em partida'
      if (shareScore && status.score) {
        const { kills, deaths, assists, cs, gold, level } = status.score
        base.score = { kills, deaths, assists, cs, gold, level }
      }
      break
    case 'end-of-game':
      base.detail = 'Fim de jogo'
      break
  }

  return base
}

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth()
  const { socket, connected, activities } = useSocket()
  const { settings } = useSettings()
  const { status: launch } = useLaunch()
  const { members } = useMembers()
  const voice = useVoice()
  const { voiceChannels } = useChat()

  const [lol, setLol] = React.useState<LolStatus | null>(null)
  const [lastResult, setLastResult] = React.useState<LolGameResult | null>(null)
  const [pendingCall, setPendingCall] = React.useState<PendingPartyCall | null>(null)

  // --- ler o cliente do LoL (IPC) ---------------------------------------
  React.useEffect(() => {
    if (!settings.lol.enabled) {
      setLol(null)
      return
    }
    void window.bocas.lol.status().then(setLol)
    const offStatus = window.bocas.lol.onStatus(setLol)
    const offEnded = window.bocas.lol.onGameEnded(setLastResult)
    return () => {
      offStatus()
      offEnded()
    }
  }, [settings.lol.enabled])

  // --- quem do grupo está no meu lobby -----------------------------------
  const riotIndex = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const member of members) {
      const key = normalizeRiotId(member.riotGameName, member.riotTagLine)
      if (key) map.set(key, member.id)
    }
    return map
  }, [members])

  const partyUserIds = React.useMemo(() => {
    if (!lol?.lobby || !user) return []
    const ids: string[] = []
    for (const member of lol.lobby) {
      const id = riotIndex.get(member.riotId.toLowerCase().replace(/\s+/g, ''))
      if (id && id !== user.id && !ids.includes(id)) ids.push(id)
    }
    return ids
  }, [lol?.lobby, riotIndex, user])

  // --- guardar meu Riot ID no servidor (uma vez por valor) ----------------
  const savedRiotRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!token || !lol?.me?.riotId) return
    const [gameName, tagLine = ''] = lol.me.riotId.split('#')
    const key = normalizeRiotId(gameName, tagLine)
    if (!key || savedRiotRef.current === key) return
    if (normalizeRiotId(user?.riotGameName, user?.riotTagLine) === key) {
      savedRiotRef.current = key
      return
    }
    savedRiotRef.current = key
    void gamesApi.setRiotId(token, gameName, tagLine).catch(() => {
      savedRiotRef.current = null
    })
  }, [token, lol?.me?.riotId, user?.riotGameName, user?.riotTagLine])

  // --- minha atividade ------------------------------------------------------
  const mine = React.useMemo<GameActivity | null>(() => {
    if (lol && settings.lol.enabled) {
      const fromLol = lolToActivity(lol, partyUserIds, settings.lol.shareLiveScore)
      if (fromLol) return fromLol
    }

    if (settings.shareMinecraftActivity && launch.stage === 'running') {
      return {
        game: 'minecraft',
        phase: 'in-progress',
        detail: launch.serverTarget ? 'No servidor' : 'Jogando',
        server: launch.serverTarget,
        since: launch.startedAt ? new Date(launch.startedAt).getTime() : Date.now()
      }
    }

    return null
  }, [lol, settings.lol.enabled, settings.lol.shareLiveScore, settings.shareMinecraftActivity, partyUserIds, launch])

  // Publica a cada mudança e a cada reconexão.
  React.useEffect(() => {
    if (!socket || !connected) return
    socket.emit('activity:set', mine)
  }, [socket, connected, mine])

  // --- sessão de partida no servidor (pra recap, apostas e card) ----------
  /**
   * Uma sessão por jogo em andamento. Guardamos quando ela começou pra
   * calcular a duração no fim mesmo que a atividade local já tenha mudado
   * (fechou o Minecraft e abriu o LoL no mesmo segundo, por exemplo).
   */
  const sessionRef = React.useRef<{ id: string; game: 'lol' | 'minecraft'; since: number } | null>(
    null
  )
  const startingRef = React.useRef(false)

  React.useEffect(() => {
    if (!token) return
    const inGame = mine?.phase === 'in-progress'

    if (inGame && mine && !sessionRef.current && !startingRef.current) {
      startingRef.current = true
      const game = mine.game
      const since = mine.since
      void gamesApi
        .start(token, {
          game,
          queue: mine.queue,
          champion: mine.champion,
          startedAt: new Date(since).toISOString()
        })
        .then((session) => {
          sessionRef.current = { id: session.id, game, since }
        })
        .catch(() => {})
        .finally(() => {
          startingRef.current = false
        })
    }

    // Minecraft fechou: encerra sem estatísticas. (LoL encerra no resultado
    // que chega do processo main, mais abaixo.)
    const open = sessionRef.current
    const minecraftStillRunning = inGame && mine?.game === 'minecraft'
    if (open?.game === 'minecraft' && !minecraftStillRunning) {
      sessionRef.current = null
      void gamesApi
        .end(token, open.id, {
          result: 'unknown',
          kills: 0,
          deaths: 0,
          assists: 0,
          durationSec: Math.max(0, Math.round((Date.now() - open.since) / 1000)),
          postCard: false
        })
        .catch(() => {})
    }
  }, [token, mine])

  // LoL: o resultado chega do main; fecha a sessão com as estatísticas.
  const lastResultRef = React.useRef<number>(0)
  React.useEffect(() => {
    if (!token || !lastResult || lastResult.endedAt === lastResultRef.current) return
    lastResultRef.current = lastResult.endedAt

    const finish = async (): Promise<void> => {
      let sessionId = sessionRef.current?.game === 'lol' ? sessionRef.current.id : null
      sessionRef.current = null

      // A partida pode ter começado com o launcher fechado: abre e fecha.
      if (!sessionId) {
        const started = await gamesApi
          .start(token, {
            game: 'lol',
            queue: lastResult.queue,
            champion: lastResult.champion,
            startedAt: new Date(lastResult.endedAt - lastResult.durationSec * 1000).toISOString()
          })
          .catch(() => null)
        sessionId = started?.id ?? null
      }
      if (!sessionId) return

      await gamesApi.end(token, sessionId, {
        result: lastResult.result,
        kills: lastResult.kills,
        deaths: lastResult.deaths,
        assists: lastResult.assists,
        durationSec: lastResult.durationSec,
        champion: lastResult.champion,
        queue: lastResult.queue,
        data: lastResult.raw,
        teammateRiotIds: lastResult.teammates?.map((t) => t.riotId),
        postCard: settings.lol.postGameCard
      })
    }

    void finish().catch(() => {})
  }, [token, lastResult, settings.lol.postGameCard])

  // --- 5-stack: sugerir/entrar na call ----------------------------------
  const suggestedForRef = React.useRef<string>('')
  React.useEffect(() => {
    const mode = settings.lol.autoJoinVoice
    if (mode === 'off' || !user) return
    if (partyUserIds.length === 0) {
      suggestedForRef.current = ''
      return
    }
    // Uma sugestão por composição de lobby — não a cada poll.
    const key = [...partyUserIds].sort().join(',')
    if (suggestedForRef.current === key) return
    if (voice.connected || voice.connecting) return

    const target = voiceChannels[0]
    if (!target) return
    suggestedForRef.current = key

    if (mode === 'auto') {
      void voice.join(target)
      return
    }

    setPendingCall({ userIds: partyUserIds, channelId: target.id })
    playUiSound('user-join', settings.soundEnabled ? settings.soundVolume : 0)
  }, [partyUserIds, settings.lol.autoJoinVoice, settings.soundEnabled, settings.soundVolume, user, voice, voiceChannels])

  // Entrou na call por qualquer caminho: a sugestão perdeu o sentido.
  React.useEffect(() => {
    if (voice.connected) setPendingCall(null)
  }, [voice.connected])

  const acceptPendingCall = React.useCallback(() => {
    if (!pendingCall) return
    const target = voiceChannels.find((c) => c.id === pendingCall.channelId)
    setPendingCall(null)
    if (target) void voice.join(target)
  }, [pendingCall, voiceChannels, voice])

  const dismissPendingCall = React.useCallback(() => setPendingCall(null), [])

  const activityOf = React.useCallback(
    (userId: string) => activities[userId],
    [activities]
  )

  const inGame = React.useMemo(
    () => Object.values(activities).filter((a) => a.phase === 'in-progress'),
    [activities]
  )

  /**
   * JOGO RODANDO NESTA MAQUINA → `<html class="game-running">`.
   *
   * Pelos sinais crus (processo do Minecraft vivo, partida de LoL em
   * andamento), nao pelo que a pessoa escolheu COMPARTILHAR: e um modo de
   * economia, nao presenca. O CSS desliga as animacoes decorativas infinitas
   * (pulsos, brilhos, scanlines) enquanto a classe esta la — o launcher
   * aberto no segundo monitor deixa de acordar o compositor 60 vezes por
   * segundo pra piscar uma bolinha. Ver styles/globals.css.
   */
  const gameRunning = launch.stage === 'running' || lol?.phase === 'in-progress'
  React.useEffect(() => {
    document.documentElement.classList.toggle('game-running', gameRunning)
    return () => document.documentElement.classList.remove('game-running')
  }, [gameRunning])

  const value = React.useMemo<ActivityContextValue>(
    () => ({
      lol,
      mine,
      activityOf,
      inGame,
      pendingCall,
      acceptPendingCall,
      dismissPendingCall,
      lastResult
    }),
    [lol, mine, activityOf, inGame, pendingCall, acceptPendingCall, dismissPendingCall, lastResult]
  )

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>
}

export function useActivity(): ActivityContextValue {
  const ctx = React.useContext(ActivityContext)
  if (!ctx) throw new Error('useActivity must be used within an ActivityProvider')
  return ctx
}
