import * as React from 'react'
import { ApiError, resolveAssetUrl } from './api'
import { supremeSoundApi } from './api-supreme-sound'
import {
  WAGER_PAYOUT_MULTIPLIER,
  boardOdd,
  gamification as api,
  cosmeticEmoji as glyphOf,
  cosmeticFallbackName,
  cosmeticTheme,
  xpReasonLabel,
  type Badge,
  type CosmeticType,
  type GamificationProfile,
  type DonationNotice,
  type DonationResult,
  type GiftNotice,
  type GiftResult,
  type LiveWagerGame,
  type ShopItem,
  type ShopRefundResult,
  type ShopResponse,
  type WagerHouse,
  type WagerHouseInfo,
  type WagerPrediction
} from './api-gamification'
import { useAuth } from './auth-context'
import { useSocketClient } from './socket-context'
import { useSettings } from './settings-context'
import { useLayout } from './layout-context'
import { useActivity } from './activity-context'
import { playUiSound, type UiSound } from './ui-sounds'
import { isPopout } from './platform'
import { DEFAULT_SETTINGS, isShopThemeId } from '../../electron/preload/types'
import { coherentSupremeColors } from './supreme-shop'
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

/**
 * NÃO EXISTE MAIS TOAST DE XP, e isso é de propósito.
 *
 * Cada mensagem, cada reação e cada minuto de call rendem XP, então o "+2 XP"
 * aparecia no canto da tela o dia inteiro — inclusive por cima do que a pessoa
 * estava fazendo, várias vezes por minuto. Juntar os blips num toast só (era o
 * que o `pushXp` fazia) diminuía a quantidade e não resolvia o problema: o
 * aviso continuava aparecendo toda hora pra dizer algo que a barra de XP do
 * rodapé já mostra o tempo todo, sem piscar na frente de ninguém.
 *
 * Aviso é pra o que ACONTECE de vez em quando e muda alguma coisa: subir de
 * nível, ganhar badge, receber murchos ou um presente. Esses continuam.
 */
export interface GamificationToast {
  id: number
  /** `gol`: aviso do futebol-context (gol, apito, lembrete de palpite). */
  kind: 'levelup' | 'badge' | 'coins' | 'checkin' | 'gift' | 'info' | 'error' | 'gol'
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
  /** Desfaz uma compra minha (até 24h depois): o item sai e o preço volta. */
  refundPurchase: (cosmeticId: string) => Promise<ShopRefundResult>
  /** Presente: debita meu saldo, o item vai pra `toUserId`. */
  gift: (cosmeticId: string, toUserId: string, message?: string) => Promise<GiftResult>
  /** Doa murchos direto pra alguém (botão direito na call). */
  donate: (toUserId: string, amount: number) => Promise<DonationResult>
  /** `slot` 2 só vale pra emoji (precisa do item `emojiSlot:2`). */
  equip: (type: CosmeticType, cosmeticId: string | null, slot?: 1 | 2, colors?: [string, string]) => Promise<void>
  /** Texto de um cosmético (título) pelo id; cai no id "limpo" se o catálogo não chegou. */
  cosmeticName: (id: string | null | undefined) => string | null
  /** Glifo de um cosmético de emoji pelo id (`emoji:oculos` → 😎); null sem catálogo. */
  cosmeticEmoji: (id: string | null | undefined) => string | null

  /** Partidas em andamento com pool de apostas (GET /wagers/live). */
  liveGames: LiveWagerGame[]
  refreshLiveGames: () => Promise<void>
  placeWager: (sessionId: string, prediction: WagerPrediction, amount: number) => Promise<void>
  /**
   * Cofre da casa (GET /wagers/house): pote, fundo, potes pagos. Carrega no
   * login e anda pelo socket `gamification:house`, com ou sem partida no ar.
   * Null até chegar (ou em servidor sem a rota).
   */
  house: WagerHouseInfo | null
  refreshHouse: () => Promise<void>

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
/** Um som de XP/moeda a cada 3s no máximo — spam de mensagem não vira metralhadora. */
const SOUND_THROTTLE_MS = 3_000
/** Espera depois do último evento antes de rebuscar o /me. */
const REFRESH_DEBOUNCE_MS = 1_200
/** Intervalo do poll de partidas ao vivo. */
const LIVE_POLL_MS = 30_000
/** Poll do cofre com o painel de apostas aberto — o socket é o caminho principal. */
const HOUSE_POLL_MS = 60_000
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
  const { socket } = useSocketClient()
  const { settings, update: updateSettings } = useSettings()
  const { wagersOpen } = useLayout()
  const { inGame } = useActivity()

  const [profile, setProfile] = React.useState<GamificationProfile | null>(null)
  const [ready, setReady] = React.useState(false)
  const [shop, setShop] = React.useState<ShopResponse | null>(null)
  const [liveGames, setLiveGames] = React.useState<LiveWagerGame[]>([])
  const [house, setHouse] = React.useState<WagerHouseInfo | null>(null)
  const houseRef = React.useRef(house)
  houseRef.current = house
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

  // Áudio Supremo do próprio usuário quebrado. Um aviso por URL por sessão:
  // a checagem ao abrir e o evento do socket não duplicam. `ttlMs: 0` faria o
  // toast sumir na hora (until = agora), então vai o maior prazo razoável.
  const warnedSoundsRef = React.useRef(new Set<string>())
  const warnBrokenSound = React.useCallback(
    (which: string, url?: string) => {
      const key = url ?? which
      if (warnedSoundsRef.current.has(key)) return
      warnedSoundsRef.current.add(key)
      pushToast({
        kind: 'info',
        title: `Seu Áudio Supremo de ${which} não está carregando`,
        body: 'Envie de novo na lojinha (Áudio Supremo).',
        ttlMs: 10 * 60_000
      })
    },
    [pushToast]
  )

  // Ao abrir: confere os próprios áudios (marcados pelo servidor ou que não baixam).
  React.useEffect(() => {
    if (!token || !user?.id) return
    let cancelled = false
    void (async () => {
      const state = await supremeSoundApi.list(token).catch(() => null)
      if (!state || cancelled) return
      const check = async (url: string | null, which: string) => {
        if (!url) return
        const row = state.sounds.find((s) => s.url === url)
        const ok =
          !row?.brokenAt &&
          (await fetch(resolveAssetUrl(url) ?? url).then((r) => r.ok).catch(() => false))
        if (!ok && !cancelled) warnBrokenSound(which, url)
      }
      if (state.joinSoundUrl && state.joinSoundUrl === state.leaveSoundUrl) {
        await check(state.joinSoundUrl, 'entrada e saída')
      } else {
        await check(state.joinSoundUrl, 'entrada')
        await check(state.leaveSoundUrl, 'saída')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, user?.id, warnBrokenSound])

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
      setHouse(null)
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

  // Tema da Lojinha só pra quem tem: a escolha é local (settings), a posse é
  // do servidor. Se o catálogo diz que a pessoa NÃO tem o tema que está
  // vestindo (item aposentado, arquivo de configurações editado na mão), volta
  // pro padrão — sem isso o arquivo seria um jeito de ter o tema sem pagar.
  React.useEffect(() => {
    if (!shop || !isShopThemeId(settings.theme)) return
    const mine = shop.items.some((item) => item.owned && cosmeticTheme(item) === settings.theme)
    if (!mine) void updateSettings({ theme: DEFAULT_SETTINGS.theme })
  }, [shop, settings.theme, updateSettings])

  // As 2 cores do Murcho Supremo saem das cores de nome que a pessoa TEM (ou
  // são o padrão daquela posição). Cada uma é conferida sozinha: só a que não é
  // dela volta pro padrão — mesma razão do tema acima: o arquivo de
  // configurações não pode ser um jeito de usar cor sem ter. Só roda com o
  // catálogo na mão, senão um boot frio zeraria a escolha antes de saber o que
  // a pessoa possui.
  React.useEffect(() => {
    if (!shop || settings.theme !== 'supremo') return
    const owned = new Set<string>()
    for (const item of shop.items) {
      const hex = item.data?.color
      if (item.owned && item.type === 'nameColor' && typeof hex === 'string') owned.add(hex.toLowerCase())
    }
    const fixed = coherentSupremeColors(settings.supremeTheme, owned)
    if (fixed) void updateSettings({ supremeTheme: { ...settings.supremeTheme, ...fixed } })
  }, [shop, settings.theme, settings.supremeTheme, updateSettings])

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
              ...prev,
              coins: res.profile?.coins ?? prev.coins,
              carta: res.carta ?? prev.carta,
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

  const refundPurchase = React.useCallback(
    async (cosmeticId: string): Promise<ShopRefundResult> => {
      if (!token) throw new ApiError(401, 'Sem sessão')
      const res = await api.refund(token, cosmeticId)
      if (res.profile) setProfile(res.profile)
      // O reembolso pode ter tirado o item de um slot (e a cor do nome): a
      // vitrine inteira volta do servidor em vez de adivinhar aqui.
      await loadShop()
      return res.refund
    },
    [token, loadShop]
  )

  const gift = React.useCallback(
    async (cosmeticId: string, toUserId: string, message?: string): Promise<GiftResult> => {
      if (!token) throw new ApiError(401, 'Sem sessão')
      const res = await api.gift(token, cosmeticId, toUserId, message)
      if (res.profile) setProfile(res.profile)
      setShop((prev) => (prev ? { ...prev, coins: res.gift.coins, carta: res.carta ?? prev.carta } : prev))
      return res.gift
    },
    [token]
  )

  const donate = React.useCallback(
    async (toUserId: string, amount: number): Promise<DonationResult> => {
      if (!token) throw new ApiError(401, 'Sem sessão')
      const res = await api.donate(token, toUserId, amount)
      setProfile((prev) => (prev ? { ...prev, coins: res.donation.coins } : prev))
      setShop((prev) => (prev ? { ...prev, coins: res.donation.coins } : prev))
      return res.donation
    },
    [token]
  )

  const equip = React.useCallback(
    async (type: CosmeticType, cosmeticId: string | null, slot?: 1 | 2, colors?: [string, string]) => {
      if (!token) throw new ApiError(401, 'Sem sessão')
      const res = await api.equip(token, type, cosmeticId, slot, colors)
      if (res.user) applyUser(res.user)

      // Emoji tem dois slots e vestir num pode tirar do outro: a verdade é o
      // user que a API devolveu.
      if (type === 'emoji') {
        const worn = [res.user?.emoji, res.user?.emoji2].filter(Boolean)
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                equipped: { ...prev.equipped, emoji: res.user?.emoji ?? null, emoji2: res.user?.emoji2 ?? null }
              }
            : prev
        )
        setShop((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((item) =>
                  item.type === 'emoji' ? { ...item, equipped: worn.includes(item.id) } : item
                )
              }
            : prev
        )
        return
      }

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
   * Só vale gastar requisição enquanto alguém pode apostar: painel de apostas
   * aberto ou alguém do grupo em partida (o botão de apostar aparece na lista
   * de membros, e o contador "ao vivo" na barra de canais).
   */
  const shouldPoll = wagersOpen || inGame.length > 0
  /**
   * Janela escondida (minimizada atras do jogo) so pode pular o poll se a
   * sobreposicao estiver desligada. Ligada, ela fica na tela o tempo todo e
   * desenha as apostas com o que este contexto tem — pular aqui deixava o
   * board congelado no retrato do inicio da partida, de antes de o servidor
   * registrar a sessao ("O servidor ainda nao registrou sua partida" pra
   * sempre, pra quem joga com o launcher na bandeja).
   */
  const overlayOn = settings.overlay.enabled
  React.useEffect(() => {
    if (!token || !shouldPoll) {
      setLiveGames([])
      return
    }
    void refreshLiveGames()
    const timer = setInterval(() => {
      if (overlayOn || !document.hidden) void refreshLiveGames()
    }, LIVE_POLL_MS)
    return () => clearInterval(timer)
  }, [token, shouldPoll, overlayOn, refreshLiveGames])

  // --- cofre da casa ------------------------------------------------------------
  const refreshHouse = React.useCallback(async () => {
    if (!token) return
    try {
      const next = await api.wagerHouse(token)
      if (next) setHouse(next)
    } catch {
      // Servidor sem a rota ou sem rede: o painel usa o cofre que vem nos boards.
    }
  }, [token])

  /**
   * Um retrato do cofre chegou (socket ou board): troca os números. Se o pote
   * DIMINUIU, saiu um pote — a lista de pagos ficou velha e vale rebuscar.
   */
  const applyHouseSnapshot = React.useCallback(
    (snap: WagerHouse) => {
      if (typeof snap?.jackpot !== 'number' || typeof snap.bonusFund !== 'number') return
      const prev = houseRef.current
      if (!prev) return
      // Todo caixa do cofre conta: a banca anda a cada aposta liquidada, a
      // reserva a cada empréstimo, mesmo com o pote parado.
      const keys = ['jackpot', 'bonusFund', 'sunk', 'banca', 'exposure', 'credito', 'fundoAno'] as const
      const changed = keys.some((k) => typeof snap[k] === 'number' && snap[k] !== prev[k])
      if (!changed) return
      if (snap.jackpot < prev.jackpot) {
        void refreshHouse()
        return
      }
      setHouse((cur) => {
        if (!cur) return cur
        const next = { ...cur, updatedAt: new Date().toISOString() }
        for (const k of keys) {
          const value = snap[k]
          if (typeof value === 'number') next[k] = value
        }
        if (typeof next.banca === 'number' && typeof next.exposure === 'number') {
          next.free = Math.max(0, next.banca - next.exposure)
        }
        return next
      })
    },
    [refreshHouse]
  )

  // Carrega no login: a dica da barra e o painel mostram o pote sem precisar
  // abrir nada. Com o painel aberto, rebusca ao abrir e de minuto em minuto
  // (o "entrou na semana" só muda por aqui; o socket só traz os saldos).
  React.useEffect(() => {
    if (!token) return
    void refreshHouse()
    if (!wagersOpen) return
    const timer = setInterval(() => {
      if (!document.hidden) void refreshHouse()
    }, HOUSE_POLL_MS)
    return () => clearInterval(timer)
  }, [token, wagersOpen, refreshHouse])

  // O board também traz o cofre: servidor que não emite o socket ainda anda.
  React.useEffect(() => {
    const fromBoard = liveGames.find((g) => g.house)?.house
    if (fromBoard) applyHouseSnapshot(fromBoard)
  }, [liveGames, applyHouseSnapshot])

  React.useEffect(() => {
    if (!socket) return
    const handleHouse = (data: WagerHouse): void => applyHouseSnapshot(data)
    socket.on('gamification:house', handleHouse)
    return () => {
      socket.off('gamification:house', handleHouse)
    }
  }, [socket, applyHouseSnapshot])

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
        // O servidor devolve a odd que travou; sem ela (servidor antigo), a do board.
        const potential =
          typeof res.wager?.potential === 'number'
            ? res.wager.potential
            : target?.self
              ? Math.round(amount * target.self.odds.multiplier)
              : Math.round(amount * (target ? boardOdd(target, prediction) : WAGER_PAYOUT_MULTIPLIER))

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
      // Sem toast: o XP entra calado e a barra do rodapé mexe sozinha (ver o
      // cabeçalho de GamificationToast). O bipe fica, engasgado a um a cada
      // três segundos — quem não quiser desliga os sons nas configurações.
      if (data.amount > 0) sound('xp', true)
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

      // Janela atrás do jogo: o toast não aparece pra ninguém. (A janela
      // própria da mesa deixa o balão com a principal.)
      if (!document.hasFocus() && !isPopout()) {
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

    // A compra paga com carta do consórcio chega como DOIS avisos: a carta
    // virando saldo e o débito da loja logo depois. Guardamos a carta pra o
    // aviso da compra dizer quanto saiu dela (senão "−5.000" sem o saldo mexer).
    let cartaRecent: { amount: number; at: number } | null = null

    const handleCoins = (data: { delta: number; coins: number; reason: string }): void => {
      if (!data || typeof data.delta !== 'number') return
      const reason = typeof data.reason === 'string' ? data.reason : ''
      if (reason.startsWith('consorcio_carta:') && data.delta > 0) cartaRecent = { amount: data.delta, at: Date.now() }
      const shopDebit = data.delta < 0 && (reason.startsWith('shop:') || reason.startsWith('gift:'))
      const fromCarta =
        shopDebit && cartaRecent && Date.now() - cartaRecent.at < 10_000 ? Math.min(cartaRecent.amount, -data.delta) : 0
      if (shopDebit) cartaRecent = null
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
      // Doação recebida tem toast próprio, com o nome de quem doou (handleDonation).
      const fromDonation = typeof data.reason === 'string' && data.reason.startsWith('donation_received:')
      // O empréstimo sai no toast do próprio painel do Banco, com o prazo; a
      // aplicação e o saque do CDB também. A carta do consórcio vira saldo só
      // dentro de uma compra (o toast é o da compra) ou no saque (o do painel).
      const quiet = ['loan:', 'invest:', 'invest_withdraw:', 'consorcio_carta:']
      const fromPanel = typeof data.reason === 'string' && quiet.some((p) => data.reason.startsWith(p))
      if (data.delta !== 0 && !fromLevelUp && !fromDonation && !fromPanel) {
        const label = xpReasonLabel(data.reason)
        pushToast({
          kind: 'coins',
          title: `${data.delta > 0 ? '+' : '−'}${Math.abs(data.delta)} murchos`,
          body:
            fromCarta > 0
              ? `${label} · ${fromCarta.toLocaleString('pt-BR')} ${fromCarta === -data.delta ? 'pagos com a carta' : 'da carta'}`
              : label || undefined
        })
        if (data.delta > 0) sound('coins', true)
      }
    }

    // Presente chegou: o item já é meu, então a prateleira precisa mostrar
    // "Equipar" no lugar de "Comprar" — daí o loadShop.
    const handleGift = (data: GiftNotice): void => {
      if (!data?.cosmeticId) return
      pushToast({
        kind: 'gift',
        title: `🎁 ${data.fromName} te deu ${data.cosmeticName}`,
        body: data.message ?? 'já está no seu inventário — vai lá equipar',
        ttlMs: 8_000
      })
      sound('coins')
      void loadShop()
    }

    const handleDonation = (data: DonationNotice): void => {
      if (!data || typeof data.amount !== 'number') return
      pushToast({
        kind: 'gift',
        title: `🪙 ${data.fromName} te doou ${data.amount.toLocaleString('pt-BR')} murchos`,
        ttlMs: 8_000
      })
      sound('coins')
    }

    const handleSupremeBroken = (data: { url?: string }): void =>
      warnBrokenSound('entrada/saída', data?.url)

    socket.on('gamification:gift', handleGift)
    socket.on('gamification:donation', handleDonation)
    socket.on('gamification:supremeSoundBroken', handleSupremeBroken)
    socket.on('gamification:xp', handleXp)
    socket.on('gamification:levelup', handleLevelUp)
    socket.on('gamification:badge', handleBadge)
    socket.on('gamification:coins', handleCoins)

    return () => {
      socket.off('gamification:xp', handleXp)
      socket.off('gamification:levelup', handleLevelUp)
      socket.off('gamification:badge', handleBadge)
      socket.off('gamification:coins', handleCoins)
      socket.off('gamification:gift', handleGift)
      socket.off('gamification:donation', handleDonation)
      socket.off('gamification:supremeSoundBroken', handleSupremeBroken)
    }
  }, [socket, pushToast, warnBrokenSound, sound, scheduleRefresh, loadShop])

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
      refundPurchase,
      gift,
      donate,
      equip,
      cosmeticName,
      cosmeticEmoji,
      liveGames,
      refreshLiveGames,
      placeWager,
      house,
      refreshHouse,
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
      refundPurchase,
      gift,
      donate,
      equip,
      cosmeticName,
      cosmeticEmoji,
      liveGames,
      refreshLiveGames,
      placeWager,
      house,
      refreshHouse,
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
