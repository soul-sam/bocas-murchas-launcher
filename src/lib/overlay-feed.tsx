import * as React from 'react'
import type { OverlayToast } from '../../electron/preload/types'
import { queueLabel } from './activity-context'
import { useAuth } from './auth-context'
import { useChat } from './chat-context'
import { useSettings } from './settings-context'
import { useSocket } from './socket-context'

/**
 * AS NOTIFICAÇÕES DA SOBREPOSIÇÃO — quem entrou na call, quem ficou online,
 * quem começou partida.
 *
 * Nada disso é evento próprio do servidor: são DIFERENÇAS entre dois retratos
 * que o socket já mantém (`voiceByChannel`, `onlineUsers`, `activities`). Por
 * isso mora aqui, na janela principal, que tem o socket de pé, e sai pronto
 * pra outra janela por `overlay.toast` — a sobreposição não tem rede nenhuma
 * (ver lib/overlay-bridge.tsx).
 *
 * As outras notificações (mensagem, cutucada, convite, lembrete) já existiam
 * como notificação do Windows e são desviadas pra sobreposição lá no processo
 * main, no `notify:show` — não passam por aqui.
 *
 * Componente só pelos hooks, separado da ponte de propósito: o socket muda a
 * cada entrada e saída de alguém, e a ponte serializa o retrato inteiro a cada
 * render.
 */

/**
 * Janela depois de conectar (ou reconectar) em que diferença NÃO vira aviso.
 *
 * Todo `connect` pede presença e voz de novo, e o retrato novo chega inteiro:
 * comparado com o velho (ou com nada, no boot), a sala inteira pareceria ter
 * acabado de entrar. Isto é só o tempo de os dois retratos chegarem.
 */
const SETTLE_MS = 4_000
/**
 * Mais que isto numa leva só não é gente entrando, é retrato chegando (queda
 * de rede do servidor, deploy). Joga fora em vez de despejar oito avisos.
 */
const MAX_BATCH = 4
/**
 * "Ficou online" de novo da mesma pessoa antes disso é a internet dela
 * piscando, não ela chegando.
 */
const ONLINE_COOLDOWN_MS = 10 * 60_000

export function OverlayFeed(): null {
  const { user } = useAuth()
  const { settings } = useSettings()
  const { connected, voiceByChannel, onlineUsers, activities, presenceById } = useSocket()
  const { voiceChannels } = useChat()

  const active = settings.overlay.enabled
  const me = user?.id

  const prevVoiceRef = React.useRef<Record<string, Set<string>> | null>(null)
  const prevOnlineRef = React.useRef<Set<string> | null>(null)
  const prevActivitiesRef = React.useRef<typeof activities | null>(null)

  /**
   * Conectou: o PRÓXIMO retrato de cada coisa é a linha de base, não novidade.
   * Zerar os anteriores cobre a rede lenta (o retrato chegando depois da
   * janela de acomodação); a janela cobre o que chega picado logo no começo.
   */
  const settleUntilRef = React.useRef(0)
  React.useEffect(() => {
    if (!connected) return
    settleUntilRef.current = Date.now() + SETTLE_MS
    prevVoiceRef.current = null
    prevOnlineRef.current = null
    prevActivitiesRef.current = null
  }, [connected, me])

  const emit = React.useCallback(
    (toasts: OverlayToast[]) => {
      if (!active || toasts.length === 0) return
      if (Date.now() < settleUntilRef.current) return
      if (toasts.length > MAX_BATCH) return
      for (const toast of toasts) void window.bocas.overlay.toast(toast).catch(() => {})
    },
    [active]
  )

  // Nomes lidos de dentro dos efeitos sem virar dependência deles: mudar o
  // nome de um canal não é motivo pra recomparar quem está na call.
  const channelNameRef = React.useRef<Record<string, string>>({})
  channelNameRef.current = Object.fromEntries(voiceChannels.map((c) => [c.id, c.name]))
  const presenceRef = React.useRef(presenceById)
  presenceRef.current = presenceById

  // --- call ---------------------------------------------------------------
  React.useEffect(() => {
    const now: Record<string, Set<string>> = {}
    const names: Record<string, string> = {}
    for (const [channelId, users] of Object.entries(voiceByChannel)) {
      now[channelId] = new Set(users.map((u) => u.id))
      for (const u of users) names[u.id] = u.displayName
    }

    const prev = prevVoiceRef.current
    prevVoiceRef.current = now
    if (!prev || !me) return

    const inAnyNow = new Set(Object.values(now).flatMap((ids) => [...ids]))
    const myChannel = Object.keys(now).find((id) => now[id].has(me))
    const at = Date.now()
    const toasts: OverlayToast[] = []

    for (const [channelId, ids] of Object.entries(now)) {
      const before = prev[channelId] ?? new Set<string>()
      const channel = channelNameRef.current[channelId]
      for (const id of ids) {
        if (id === me || before.has(id)) continue
        toasts.push({
          kind: 'voice-join',
          title: `${names[id] ?? 'Alguém'} entrou na call`,
          body: channel ? (channelId === myChannel ? `${channel} · com você` : channel) : undefined,
          at
        })
      }
    }

    // Saída só da MINHA call: das outras é ruído, e quem trocou de canal já
    // apareceu entrando no outro.
    if (myChannel) {
      for (const id of prev[myChannel] ?? []) {
        if (id === me || inAnyNow.has(id)) continue
        const name = presenceRef.current[id]?.displayName
        toasts.push({ kind: 'voice-leave', title: `${name ?? 'Alguém'} saiu da call`, at })
      }
    }

    emit(toasts)
  }, [voiceByChannel, me, emit])

  // --- presença -----------------------------------------------------------
  const lastOnlineToastRef = React.useRef<Record<string, number>>({})
  React.useEffect(() => {
    const now = new Set(onlineUsers.map((u) => u.id))
    const prev = prevOnlineRef.current
    prevOnlineRef.current = now
    if (!prev || !me) return

    const at = Date.now()
    const toasts: OverlayToast[] = []
    for (const u of onlineUsers) {
      if (u.id === me || prev.has(u.id)) continue
      // Conta bot não "chega": ela é um processo do servidor.
      if (u.role === 'bot') continue
      if (at - (lastOnlineToastRef.current[u.id] ?? 0) < ONLINE_COOLDOWN_MS) continue
      lastOnlineToastRef.current[u.id] = at
      toasts.push({ kind: 'online', title: `${u.displayName} ficou online`, at })
    }
    emit(toasts)
  }, [onlineUsers, me, emit])

  // --- partidas -----------------------------------------------------------
  /** userId -> `since` da partida já avisada. */
  const announcedRef = React.useRef<Record<string, number>>({})
  React.useEffect(() => {
    const prev = prevActivitiesRef.current
    prevActivitiesRef.current = activities
    if (!prev || !me) return

    const at = Date.now()
    const toasts: OverlayToast[] = []
    for (const [userId, activity] of Object.entries(activities)) {
      if (userId === me || activity.phase !== 'in-progress') continue
      if (prev[userId]?.phase === 'in-progress') continue
      if (announcedRef.current[userId] === activity.since) continue
      announcedRef.current[userId] = activity.since
      // Colega da MINHA partida: eu sei que ele entrou, e aposta nela é 403.
      if (activity.partyUserIds?.includes(me)) continue

      const name = presenceRef.current[userId]?.displayName ?? 'Alguém'
      const lol = activity.game === 'lol'
      toasts.push({
        kind: 'game',
        title: lol ? `${name} entrou em partida` : `${name} entrou no Minecraft`,
        body: lol
          ? [activity.champion, queueLabel(activity.queue), 'aposta aberta por 5 min']
              .filter(Boolean)
              .join(' · ')
          : activity.server,
        at
      })
    }
    emit(toasts)
  }, [activities, me, emit])

  return null
}
