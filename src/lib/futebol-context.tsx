import * as React from 'react'
import { useAuth } from './auth-context'
import { useSocketClient } from './socket-context'
import { useGamification } from './gamification-context'
import { useSettings } from './settings-context'
import {
  futebol,
  type ApitoEvento,
  type GolEvento,
  type Jogo,
  type LembreteEvento,
  type Torcedor
} from './api-futebol'
import { isPopout } from './platform'
import { textoDoApito, textoDoGol } from './futebol-calc'

/**
 * FUTEBOL — o que mais de uma tela precisa saber: o time do coração de cada
 * um (perfil, tabela, card), os jogos rolando agora (rail, tela) e os avisos
 * que chegam pela sala pessoal (gol, apito, lembrete de palpite).
 *
 * Os avisos moram AQUI, e não na tela de futebol, porque o gol do time tem
 * que chegar com a pessoa no chat, na call ou no meio de uma partida de LoL:
 *  - app em foco: toast no canto (o mesmo dos níveis e badges);
 *  - app atrás ou em jogo: `notify.show`, que o main manda pra sobreposição
 *    quando ela está na tela e pro balão do Windows quando não.
 * `settings.futebol.avisos` desliga tudo isso de uma vez.
 */

interface FutebolContextValue {
  /** userId -> time do coração. */
  torcidas: Record<string, Torcedor>
  meuTime: Torcedor | null
  /** Jogos rolando agora (foto do vigia da API). */
  aoVivo: Jogo[]
  /** O jogo do meu time, se estiver rolando. */
  meuJogo: Jogo | null
  definirTime: (teamId: string | null) => Promise<void>
}

const FutebolContext = React.createContext<FutebolContextValue | null>(null)

export function useFutebol(): FutebolContextValue {
  const ctx = React.useContext(FutebolContext)
  if (!ctx) throw new Error('useFutebol fora do FutebolProvider')
  return ctx
}

/** Pra quem pode estar fora do provider (popout, overlay): devolve null. */
export function useFutebolOpcional(): FutebolContextValue | null {
  return React.useContext(FutebolContext)
}

export function FutebolProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth()
  const { socket } = useSocketClient()
  const { pushToast } = useGamification()
  const { settings } = useSettings()
  const [torcidas, setTorcidas] = React.useState<Record<string, Torcedor>>({})
  const [aoVivo, setAoVivo] = React.useState<Jogo[]>([])

  React.useEffect(() => {
    if (!token) return
    let vivo = true
    futebol
      .torcedores(token)
      .then((lista) => vivo && setTorcidas(Object.fromEntries(lista.map((t) => [t.userId, t]))))
      .catch(() => undefined)
    futebol
      .aoVivo(token)
      .then((jogos) => vivo && setAoVivo(jogos))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [token])

  const meuTime = (user && torcidas[user.id]) || null
  const meuTimeRef = React.useRef(meuTime)
  meuTimeRef.current = meuTime
  const avisosRef = React.useRef(settings.futebol?.avisos !== false)
  avisosRef.current = settings.futebol?.avisos !== false
  const soundRef = React.useRef(settings.soundEnabled)
  soundRef.current = settings.soundEnabled

  const avisar = React.useCallback(
    (title: string, body: string, alto: boolean) => {
      if (!avisosRef.current) return
      if (document.hasFocus() && !document.hidden) {
        pushToast({ kind: 'gol', title, body, ttlMs: alto ? 7_000 : 5_000 })
        return
      }
      // A janela própria (pôquer) também tem este provider: só a principal avisa.
      if (isPopout()) return
      void window.bocas.notify.show({ title, body, silent: !soundRef.current || !alto }).catch(() => undefined)
    },
    [pushToast]
  )

  React.useEffect(() => {
    if (!socket) return
    const onAoVivo = (data: { jogos: Jogo[] }) => setAoVivo(Array.isArray(data?.jogos) ? data.jogos : [])
    const onTorcedor = (data: { userId: string; torcedor: Torcedor | null }) =>
      setTorcidas((prev) => {
        const next = { ...prev }
        if (data.torcedor) next[data.userId] = data.torcedor
        else delete next[data.userId]
        return next
      })
    const onGol = (ev: GolEvento) => {
      const meu = meuTimeRef.current?.teamId ?? null
      const { title, body } = textoDoGol(ev, meu)
      avisar(title, body, ev.timeId === meu)
    }
    const onApito = (ev: ApitoEvento) => {
      const { title, body } = textoDoApito(ev)
      avisar(title, body, false)
    }
    const onLembrete = (ev: LembreteEvento) =>
      avisar('Palpite aberto', `${ev.jogo.casa.curto} x ${ev.jogo.fora.curto} começa em 1 hora. Já palpitou?`, false)

    socket.on('futebol:aovivo', onAoVivo)
    socket.on('futebol:torcedor', onTorcedor)
    socket.on('futebol:gol', onGol)
    socket.on('futebol:apito', onApito)
    socket.on('futebol:lembrete', onLembrete)
    return () => {
      socket.off('futebol:aovivo', onAoVivo)
      socket.off('futebol:torcedor', onTorcedor)
      socket.off('futebol:gol', onGol)
      socket.off('futebol:apito', onApito)
      socket.off('futebol:lembrete', onLembrete)
    }
  }, [socket, avisar])

  const definirTime = React.useCallback(
    async (teamId: string | null) => {
      if (!token || !user) return
      const torcedor = await futebol.definirTime(token, teamId)
      setTorcidas((prev) => {
        const next = { ...prev }
        if (torcedor) next[user.id] = torcedor
        else delete next[user.id]
        return next
      })
    },
    [token, user]
  )

  const meuJogo = React.useMemo(
    () => (meuTime ? aoVivo.find((j) => j.casa.id === meuTime.teamId || j.fora.id === meuTime.teamId) ?? null : null),
    [aoVivo, meuTime]
  )

  const value = React.useMemo(
    () => ({ torcidas, meuTime, aoVivo, meuJogo, definirTime }),
    [torcidas, meuTime, aoVivo, meuJogo, definirTime]
  )
  return <FutebolContext.Provider value={value}>{children}</FutebolContext.Provider>
}
