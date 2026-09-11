import * as React from 'react'
import { ApiError } from './api'
import {
  WAGER_PAYOUT_MULTIPLIER,
  gamification as api,
  cosmeticEmoji as glyphOf,
  cosmeticFallbackName,
  xpReasonLabel,
  type Badge,
  type CosmeticType,
  type GamificationProfile,
  type LiveWagerGame,
  type ShopItem,
  type ShopResponse,
  type WagerPrediction
} from './api-gamification'
import { useAuth } from './auth-context'
import { useSocket } from './socket-context'
import { useSettings } from './settings-context'
import { useLayout } from './layout-context'
import { useActivity } from './activity-context'
import { playUiSound, type UiSound } from './ui-sounds'
import { XpToasts } from '@/components/social/XpToast'

/**
 * GAMIFICAÇÃO — meu XP/nível/murchos/streak/badges, os avisos que chegam pelo
 * socket e as ações da lojinha e das apostas.
 *
 * O perfil vem de GET /gamification/me ao logar. Os eventos do socket
 * (`gamification:xp|levelup|badge|coins`) atualizam o que dá pra atualizar na
 * hora (xp, nível, moedas, badges) e agendam um refresh curto pra buscar o
 * que só o servidor sabe calcular (levelXp/nextLevelXp, contadores). Assim a
 * barra de XP mexe no ato e fica certa meio segundo depois.
 *
 * Os toasts moram aqui e não num contexto próprio porque só a gamificação os
 * usa — e porque o `<XpToasts />` precisa ser montado em algum lugar que só
 * desmonta no logout, e este provider é exatamente isso (App.tsx não é nosso).
 */

export interface GamificationToast {
  id: number
  kind: 'xp' | 'levelup' | 'badge' | 'coins' | 'checkin' | 'info' | 'error'
  title: string
  body?: string
  /**
   * Id da badge, quando o toast é de badge. É daqui que sai o ícone de
   * verdade (ver lib/cosmetic-icons.tsx) — antes vinha o emoji que o servidor
   * guarda, que é desenhado pela fonte do sistema e sai diferente em cada
   * máquina. Os outros tipos de toast usam o ícone do próprio `kind`.
   */
  badgeId?: string
  /** Epoch ms de quando sai da tela sozinho. */
  until: number
  /** Só nos de XP: soma e motivos, pra juntar vários blips num toast só. */
  xpAmount?: number
  reasons?: string[]
}

interface GamificationContextValue {
  /** Perfil já carregado (ou tentativa já falhou). */
  ready: boolean
  profile: GamificationProfile | null
  refresh: () => Promise<void>

  /** Catálogo da lojinha indexado por id — nomes de título saem daqui. */
  catalog: Record<string, ShopItem>
  shop: ShopResponse | null
  loadShop: () => Promise<ShopResponse | null>
  buy: (cosmeticId: string) => Promise<ShopItem>
  equip: (type: CosmeticType, cosmeticId: string | null) => Promise<void>
  /** Texto de um cosmético (título) pelo id; cai no id "limpo" se o catálogo não chegou. */
  cosmeticName: (id: string | null | undefined) => string | null
  /** Glifo de um cosmético de emoji pelo id (`emoji:oculos` → 😎); null sem catálogo. */
  cosmeticEmoji: (id: string | null | undefined) => string | null

  /** Partidas em andamento com pool de apostas (GET /wagers/live). */
  liveGames: LiveWagerGame[]
  refreshLiveGames: () => Promise<void>
  placeWager: (sessionId: string, prediction: WagerPrediction, amount: number) => Promise<void>

  /** Perfil de gamificação de outra pessoa, com cache curto. */
  profileOf: (userId: string) => Promise<GamificationProfile>

  toasts: GamificationToast[]
  pushToast: (
    toast: Omit<GamificationToast, 'id' | 'until'> & { ttlMs?: number }
  ) => void
  dismissToast: (id: number) => void
}

const Context = React.createContext<GamificationContextValue | null>(null)

/** Quanto tempo um toast fica na tela. */
const TOAST_TTL_MS = 4_000
/** Quantos toasts ao mesmo tempo — mais que isso vira parede. */
const TOAST_MAX = 4
/** Blips de XP dentro desta janela viram um toast só. */
const XP_MERGE_WINDOW_MS = 3_000
/** Um som de XP/moeda a cada 3s no máximo — spam de mensagem não vira metralhadora. */
const SOUND_THROTTLE_MS = 3_000
/** Espera depois do último evento antes de rebuscar o /me. */
const REFRESH_DEBOUNCE_MS = 1_200
/** Intervalo do poll de partidas ao vivo. */
const LIVE_POLL_MS = 30_000
/** Perfil alheio vale por este tempo antes de buscar de novo. */
const PROFILE_CACHE_MS = 60_000

/**
 * Check-in é uma vez por sessão do APP, não por montagem do provider: trocar
 * de aba não desmonta, mas um hot reload em dev sim. Guardado por usuário pra
 * logout+login de outra conta na mesma janela também fazer o dele.
 */
const checkedInFor = new Set<string>()

let toastSeq = 0

export function GamificationProvider({ children }: { children: React.ReactNode }) {
  const { token, user, applyUser } = useAuth()
  const { socket } = useSocket()
  const { settings } = useSettings()
  const { leaderboardOpen } = useLayout()
  const { inGame } = useActivity()

  const [profile, setProfile] = React.useState<GamificationProfile | null>(null)
  const [ready, setReady] = React.useState(false)
  const [shop, setShop] = React.useState<ShopResponse | null>(null)
  const [liveGames, setLiveGames] = React.useState<LiveWagerGame[]>([])
  const [toasts, setToasts] = React.useState<GamificationToast[]>([])

  // Settings numa ref: os handlers do socket são registrados uma vez e não
  // podem "congelar" o volume que valia na hora do registro.
  const settingsRef = React.useRef(settings)
  settingsRef.current = settings

  const userIdRef = React.useRef<string | null>(null)
  userIdRef.current = user?.id ?? null

  // --- sons ------------------------------------------------------------------
  const lastSoundAtRef = React.useRef<Partial<Record<UiSound, number>>>({})

  const sound = React.useCallback((name: UiSound, throttle = false) => {
    const now = Date.now()
    if (throttle) {
      const last = lastSoundAtRef.current[name] ?? 0
      if (now - last < SOUND_THROTTLE_MS) return
      lastSoundAtRef.current[name] = now
    }
    const { soundEnabled, soundVolume } = settingsRef.current
    playUiSound(name, soundEnabled ? soundVolume : 0)
  }, [])

  // --- toasts ----------------------------------------------------------------
  const pushToast = React.useCallback<GamificationContextValue['pushToast']>((toast) => {
    const { ttlMs, ...rest } = toast
    const entry: GamificationToast = {
      ...rest,
      id: ++toastSeq,
      until: Date.now() + (ttlMs ?? TOAST_TTL_MS)
    }
    setToasts((prev) => [...prev, entry].slice(-TOAST_MAX))
  }, [])

  const dismissToast = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  /**
   * XP chega em blips pequenos e frequentes (mensagem, reação, minuto de
   * call). Se o toast de XP mais recente ainda está na tela, soma nele em vez
   * de empilhar quatro "+2 XP" iguais.
   */
  const pushXp = React.useCallback((amount: number, reason: string) => {
    const label = xpReasonLabel(reason)
    setToasts((prev) => {
      const now = Date.now()
      const last = prev[prev.length - 1]
      // Ainda na tela e recente o bastante: soma. Cada soma renova o prazo,
      // então uma rajada de blips vira um toast só que vai crescendo.
      if (last && last.kind === 'xp' && now < last.until && now - (last.until - TOAST_TTL_MS) < XP_MERGE_WINDOW_MS) {
        const total = (last.xpAmount ?? 0) + amount
        const reasons = last.reasons ? [...last.reasons] : []
        if (label && !reasons.includes(label)) reasons.push(label)
        const merged: GamificationToast = {
          ...last,
          xpAmount: total,
          reasons,
          title: `+${total} XP`,
          body: reasons.slice(0, 3).join(', ') + (reasons.length > 3 ? '…' : ''),
          until: now + TOAST_TTL_MS
        }
        return [...prev.slice(0, -1), merged]
      }
      const entry: GamificationToast = {
        id: ++toastSeq,
        kind: 'xp',
        title: `+${amount} XP`,
        body: label || undefined,
        xpAmount: amount,
        reasons: label ? [label] : [],
        until: now + TOAST_TTL_MS
      }
      return [...prev, entry].slice(-TOAST_MAX)
    })
  }, [])

  // Um timer só, mirando o toast que vence primeiro. Re-arma a cada mudança.
  React.useEffect(() => {
    if (toasts.length === 0) return
    const next = Math.min(...toasts.map((t) => t.until))
    const timer = setTimeout(() => {
      const now = Date.now()
      setToasts((prev) => prev.filter((t) => t.until > now))
    }, Math.max(50, next - Date.now()))
    return () => clearTimeout(timer)
  }, [toasts])

  // --- perfil ------------------------------------------------------------------
  const refresh = React.useCallback(async () => {
    if (!token) return
    try {
      setProfile(await api.me(token))
    } catch {
      // Gamificação é enfeite: falhar aqui não pode derrubar nada.
    } finally {
      setReady(true)
    }
  }, [token])

  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleRefresh = React.useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null
      void refresh()
    }, REFRESH_DEBOUNCE_MS)
  }, [refresh])

  React.useEffect(() => {
    if (!token || !user) {
      setProfile(null)
      setShop(null)
      setLiveGames([])
      setReady(false)
      return
    }

    let cancelled = false

    void (async () => {
      await refresh()
      if (cancelled) return

      if (checkedInFor.has(user.id)) return
      checkedInFor.add(user.id)

      try {
        const res = await api.checkin(token)
        if (cancelled) return
        if (res.profile) setProfile(res.profile)
        if (res.awarded) {
          pushToast({
            kind: 'checkin',
            title: 'Check-in!',
            // O toast de check-in já tem a chama do `kind` no ícone; repetir
            // o emoji no texto era chama duas vezes na mesma linha.
            body: `+${res.awarded.xp} XP · streak de ${res.awarded.streak}`,
            ttlMs: 6_000
          })
          sound('coins', true)
        }
      } catch {
        // Check-in de hoje já feito em outra máquina, ou servidor sem a rota
        // ainda. Nenhum dos dois merece aviso.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token, user?.id, refresh, pushToast, sound])

  // --- catálogo / lojinha ---------------------------------------------------------
  const loadShop = React.useCallback(async () => {
    if (!token) return null
    try {
      const res = await api.shop(token)
      setShop(res)
      return res
    } catch {
      return null
    }
  }, [token])

  // O catálogo entra cedo porque o AuthorName precisa dele pra escrever o
  // texto de um título equipado — e mensagem aparece antes de qualquer um
  // abrir a lojinha.
  React.useEffect(() => {
    if (!token) return
    void loadShop()
  }, [token, loadShop])

  const catalog = React.useMemo(() => {
    const map: Record<string, ShopItem> = {}
    for (const item of shop?.items ?? []) map[item.id] = item
    return map
  }, [shop])

  const cosmeticName = React.useCallback(
    (id: string | null | undefined): string | null => {
      if (!id) return null
      return catalog[id]?.name ?? cosmeticFallbackName(id)
    },
    [catalog]
  )

  const cosmeticEmoji = React.useCallback(
    (id: string | null | undefined): string | null => (id ? glyphOf(catalog[id]) : null),
    [catalog]
  )

  const buy = React.useCallback(
    async (cosmeticId: string): Promise<ShopItem> => {
      if (!token) throw new ApiError(401, 'Sem sessão')
      const res = await api.buy(token, cosmeticId)
      if (res.profile) setProfile(res.profile)
      setShop((prev) =>
        prev
          ? {
              coins: res.profile?.coins ?? prev.coins,
              items: prev.items.map((item) =>
                item.id === cosmeticId ? { ...item, ...res.item, owned: true } : item
              )
            }
          : prev
      )
      return res.item
    },
    [token]
  )

  const equip = React.useCallback(
    async (type: CosmeticType, cosmeticId: string | null) => {
      if (!token) throw new ApiError(401, 'Sem sessão')
      const res = await api.equip(token, type, cosmeticId)
      if (res.user) applyUser(res.user)

      setProfile((prev) =>
        prev ? { ...prev, equipped: { ...prev.equipped, [type]: cosmeticId } } : prev
      )
      // Um slot, um equipado: quem era desse tipo perde a marca.
      setShop((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((item) =>
                item.type === type ? { ...item, equipped: item.id === cosmeticId } : item
              )
            }
          : prev
      )
    },
    [token, applyUser]
  )

  // --- apostas ------------------------------------------------------------------
  const refreshLiveGames = React.useCallback(async () => {
    if (!token) return
    try {
      setLiveGames(await api.liveWagers(token))
    } catch {
      // Sem rota ainda, ou sem rede: fica o que tinha.
    }
  }, [token])

  /**
   * Só vale gastar requisição enquanto alguém pode apostar: painel de ranking
   * aberto (tem a seção "ao vivo") ou alguém do grupo em partida (o botão de
   * apostar aparece na lista de membros).
   */
  const shouldPoll = leaderboardOpen || inGame.length > 0
  React.useEffect(() => {
    if (!token || !shouldPoll) {
      setLiveGames([])
      return
    }
    void refreshLiveGames()
    // Janela escondida (minimizada atras do jogo): ninguem ve o botao de
    // apostar, entao a requisicao espera a janela voltar.
    const timer = setInterval(() => {
      if (!document.hidden) void refreshLiveGames()
    }, LIVE_POLL_MS)
    return () => clearInterval(timer)
  }, [token, shouldPoll, refreshLiveGames])

  const placeWager = React.useCallback(
    async (sessionId: string, prediction: WagerPrediction, amount: number) => {
      if (!token) throw new ApiError(401, 'Sem sessão')
      const res = await api.placeWager(token, sessionId, prediction, amount)
      const me = userIdRef.current

      if (typeof res.coins === 'number') {
        setProfile((prev) => (prev ? { ...prev, coins: res.coins } : prev))
      }

      // Otimista: a pool e a minha aposta aparecem já; o poll confirma depois.
      // A aposta vale pela PARTIDA, então marca todas as sessões do mesmo
      // grupo (mesmo `matchId`) — senão o colega ao lado continuaria clicável.
      setLiveGames((prev) => {
        const target = prev.find((g) => g.session.id === sessionId)
        const matchId = target?.matchId ?? sessionId
        // Apostei em MIM? Só o board da minha própria sessão traz `self`, e é
        // ele que carrega a odd. Vale igual pros outros boards da mesma
        // partida: a aposta é uma só e foi registrada nesta sessão.
        const self = Boolean(target?.self)
        const potential = target?.self
          ? Math.round(amount * target.self.odds.multiplier)
          : amount * WAGER_PAYOUT_MULTIPLIER

        return prev.map((game) => {
          if (game.matchId !== matchId && game.session.id !== sessionId) return game
          const bets = me
            ? [
                ...game.bets.filter((b) => b.userId !== me),
                { userId: me, prediction, amount, potential, self }
              ]
            : game.bets
          return {
            ...game,
            bets,
            pool: { ...game.pool, [prediction]: game.pool[prediction] + amount },
            myWager: { prediction, amount, potential, self }
          }
        })
      })
      void refreshLiveGames()
    },
    [token, refreshLiveGames]
  )

  // --- perfil dos outros -------------------------------------------------------
  const profileCacheRef = React.useRef(new Map<string, { at: number; profile: GamificationProfile }>())

  const profileOf = React.useCallback(
    async (userId: string): Promise<GamificationProfile> => {
      if (!token) throw new ApiError(401, 'Sem sessão')
      const cached = profileCacheRef.current.get(userId)
      if (cached && Date.now() - cached.at < PROFILE_CACHE_MS) return cached.profile
      const fresh = await api.user(token, userId)
      profileCacheRef.current.set(userId, { at: Date.now(), profile: fresh })
      return fresh
    },
    [token]
  )

  // --- socket -------------------------------------------------------------------
  React.useEffect(() => {
    if (!socket) return

    const handleXp = (data: { amount: number; reason: string; xp: number; level: number }): void => {
      if (!data || typeof data.amount !== 'number') return
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              xp: typeof data.xp === 'number' ? data.xp : prev.xp + data.amount,
              level: typeof data.level === 'number' ? data.level : prev.level,
              weeklyXp: prev.weeklyXp + data.amount,
              // Chute até o refresh chegar: se passou do teto, o servidor
              // manda `levelup` separado e o refresh acerta os números.
              levelXp: Math.min(prev.nextLevelXp, prev.levelXp + data.amount)
            }
          : prev
      )
      if (data.amount > 0) {
        pushXp(data.amount, data.reason)
        sound('xp', true)
      }
      scheduleRefresh()
    }

    const handleLevelUp = (data: { level: number; xp: number; coins?: number }): void => {
      if (!data || typeof data.level !== 'number') return
      setProfile((prev) => (prev ? { ...prev, level: data.level, xp: data.xp ?? prev.xp } : prev))
      // O saldo novo chega no `gamification:coins` da mesma subida; aqui só o
      // valor ganho, pra não precisar de um segundo toast.
      const coins = typeof data.coins === 'number' ? data.coins : 0
      pushToast({
        kind: 'levelup',
        title: `Nível ${data.level}!`,
        body: coins > 0 ? `subiu de nível · +${coins} murchos` : 'subiu de nível',
        ttlMs: 6_000
      })
      sound('levelup')

      // Janela atrás do jogo: o toast não aparece pra ninguém.
      if (!document.hasFocus()) {
        void window.bocas.notify.show({
          title: `Nível ${data.level}!`,
          body:
            coins > 0
              ? `Você subiu de nível e ganhou ${coins} murchos`
              : 'Você subiu de nível no Bocas Murchas',
          silent: !settingsRef.current.soundEnabled
        })
      }
      scheduleRefresh()
    }

    const handleBadge = (data: { badge: Badge }): void => {
      const badge = data?.badge
      if (!badge?.id) return
      setProfile((prev) =>
        prev && !prev.badges.some((b) => b.id === badge.id)
          ? { ...prev, badges: [...prev.badges, badge] }
          : prev
      )
      pushToast({
        kind: 'badge',
        badgeId: badge.id,
        title: badge.name,
        body: badge.description || 'badge nova',
        ttlMs: 6_000
      })
      sound('coins')
    }

    const handleCoins = (data: { delta: number; coins: number; reason: string }): void => {
      if (!data || typeof data.delta !== 'number') return
      setProfile((prev) =>
        prev
          ? { ...prev, coins: typeof data.coins === 'number' ? data.coins : prev.coins + data.delta }
          : prev
      )
      setShop((prev) =>
        prev && typeof data.coins === 'number' ? { ...prev, coins: data.coins } : prev
      )
      // Murchos de subida de nível já saem no toast de `levelup`; um segundo
      // toast com o mesmo número seria eco.
      const fromLevelUp = typeof data.reason === 'string' && data.reason.startsWith('levelup:')
      if (data.delta !== 0 && !fromLevelUp) {
        pushToast({
          kind: 'coins',
          title: `${data.delta > 0 ? '+' : '−'}${Math.abs(data.delta)} murchos`,
          body: xpReasonLabel(data.reason) || undefined
        })
        if (data.delta > 0) sound('coins', true)
      }
    }

    socket.on('gamification:xp', handleXp)
    socket.on('gamification:levelup', handleLevelUp)
    socket.on('gamification:badge', handleBadge)
    socket.on('gamification:coins', handleCoins)

    return () => {
      socket.off('gamification:xp', handleXp)
      socket.off('gamification:levelup', handleLevelUp)
      socket.off('gamification:badge', handleBadge)
      socket.off('gamification:coins', handleCoins)
    }
  }, [socket, pushToast, pushXp, sound, scheduleRefresh])

  React.useEffect(
    () => () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    },
    []
  )

  const value = React.useMemo<GamificationContextValue>(
    () => ({
      ready,
      profile,
      refresh,
      catalog,
      shop,
      loadShop,
      buy,
      equip,
      cosmeticName,
      cosmeticEmoji,
      liveGames,
      refreshLiveGames,
      placeWager,
      profileOf,
      toasts,
      pushToast,
      dismissToast
    }),
    [
      ready,
      profile,
      refresh,
      catalog,
      shop,
      loadShop,
      buy,
      equip,
      cosmeticName,
      cosmeticEmoji,
      liveGames,
      refreshLiveGames,
      placeWager,
      profileOf,
      toasts,
      pushToast,
      dismissToast
    ]
  )

  return (
    <Context.Provider value={value}>
      {children}
      <XpToasts toasts={toasts} onDismiss={dismissToast} />
    </Context.Provider>
  )
}

export function useGamification(): GamificationContextValue {
  const ctx = React.useContext(Context)
  if (!ctx) throw new Error('useGamification must be used within GamificationProvider')
  return ctx
}
