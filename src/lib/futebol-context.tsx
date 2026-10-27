import * as React from 'react'
import { useAuth } from './auth-context'
import { useSocketClient } from './socket-context'
import { useGamification } from './gamification-context'
import { useSettings } from './settings-context'
import {
  futebol,
  type ApitoEvento,
  type Fonte,
  type GolEvento,
  type Jogo,
  type LembreteEvento,
  type Torcedor
} from './api-futebol'
import { isPopout } from './platform'
import { escolherFonte, selecaoDoJogo, textoDoApito, textoDoGol } from './futebol-calc'

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
 *
 * JOGO DA SELEÇÃO chega pra todo mundo (`selecao: true`, ver modules/futebol
 * na API) e é tratado como "meu time": GOL DO BRASIL! em caixa alta. A chave
 * `settings.futebol.selecao` cala só esses.
 *
 * O ESTADO DO PLAYER também mora aqui: assistir um jogo e sair da tela de
 * futebol não pode parar a transmissão. O player em si
 * (components/futebol/FutebolPlayer) o App monta dentro deste provider, fora
 * de qualquer tela. Enquanto ele
 * está aberto, o launcher bate ponto em /futebol/assistindo a cada minuto —
 * é o "quem está assistindo" da lista e do próprio player.
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

  /** jogoId -> quem está com o player aberto nele. */
  assistindo: Record<string, string[]>
  /** O que está no player (null = fechado). */
  tocando: Tocando | null
  /** Abre o player no jogo; sem fonte, escolhe a melhor que a API achar. */
  assistir: (jogo: Jogo, fonte?: Fonte | null) => void
  trocarFonte: (fonte: Fonte) => void
  recarregarFontes: () => Promise<void>
  fecharPlayer: () => void
  /** Player grande (por cima da tela) ou mini no canto. */
  grande: boolean
  setGrande: (grande: boolean) => void
}

export interface Tocando {
  jogo: Jogo
  fontes: Fonte[]
  atual: Fonte | null
  carregando: boolean
  erro: string | null
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
  const [assistindo, setAssistindo] = React.useState<Record<string, string[]>>({})
  const [tocando, setTocando] = React.useState<Tocando | null>(null)
  const [grande, setGrande] = React.useState(true)

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
    futebol
      .assistindo(token)
      .then((a) => vivo && setAssistindo(a))
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
  const selecaoRef = React.useRef(settings.futebol?.selecao !== false)
  selecaoRef.current = settings.futebol?.selecao !== false
  const userIdRef = React.useRef(user?.id ?? null)
  userIdRef.current = user?.id ?? null

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
      if (ev.selecao && !selecaoRef.current) return
      // Jogo da Seleção: o Brasil é o time de todo mundo.
      const meu = (ev.selecao ? selecaoDoJogo(ev.jogo) : null) ?? meuTimeRef.current?.teamId ?? null
      const { title, body } = textoDoGol(ev, meu)
      avisar(title, body, ev.timeId === meu)
    }
    const onApito = (ev: ApitoEvento) => {
      if (ev.selecao && !selecaoRef.current) return
      const { title, body } = textoDoApito(ev)
      avisar(title, body, !!ev.selecao)
    }
    const onLembrete = (ev: LembreteEvento) => {
      if (ev.selecao) {
        if (!selecaoRef.current || (userIdRef.current && ev.palpitaram?.includes(userIdRef.current))) return
        avisar('Tem jogo da Seleção', `${ev.jogo.casa.curto} x ${ev.jogo.fora.curto} começa em 1 hora. Palpita no bolão!`, false)
        return
      }
      avisar('Palpite aberto', `${ev.jogo.casa.curto} x ${ev.jogo.fora.curto} começa em 1 hora. Já palpitou?`, false)
    }
    const onAssistindo = (data: { assistindo?: Record<string, string[]> }) =>
      setAssistindo(data?.assistindo && typeof data.assistindo === 'object' ? data.assistindo : {})

    socket.on('futebol:aovivo', onAoVivo)
    socket.on('futebol:torcedor', onTorcedor)
    socket.on('futebol:gol', onGol)
    socket.on('futebol:apito', onApito)
    socket.on('futebol:lembrete', onLembrete)
    socket.on('futebol:assistindo', onAssistindo)
    return () => {
      socket.off('futebol:aovivo', onAoVivo)
      socket.off('futebol:torcedor', onTorcedor)
      socket.off('futebol:gol', onGol)
      socket.off('futebol:apito', onApito)
      socket.off('futebol:lembrete', onLembrete)
      socket.off('futebol:assistindo', onAssistindo)
    }
  }, [socket, avisar])

  // --- player ---------------------------------------------------------------

  const tocandoId = tocando?.jogo.id ?? null
  const tocandoRef = React.useRef(tocando)
  tocandoRef.current = tocando

  const buscarFontes = React.useCallback(
    async (jogo: Jogo, manter: Fonte | null) => {
      if (!token) return
      try {
        const t = await futebol.transmissoes(token, jogo.liga, jogo.id)
        setTocando((atual) => {
          if (!atual || atual.jogo.id !== jogo.id) return atual
          const ainda = manter && (t.fontes.find((f) => f.videoId === manter.videoId) ?? manter)
          // O jogo do summary vem com os lances sem autor; o do placar tem os nomes.
          const comNomes = t.jogo.lances.some((l) => l.jogador) ? t.jogo : { ...t.jogo, lances: atual.jogo.lances }
          return { ...atual, jogo: comNomes, fontes: t.fontes, atual: ainda || escolherFonte(t.jogo, t.fontes), carregando: false, erro: null }
        })
      } catch {
        setTocando((atual) =>
          atual && atual.jogo.id === jogo.id ? { ...atual, carregando: false, erro: 'Não deu pra buscar as transmissões agora.' } : atual
        )
      }
    },
    [token]
  )

  const assistir = React.useCallback(
    (jogo: Jogo, fonte?: Fonte | null) => {
      setTocando({ jogo, fontes: fonte ? [fonte] : [], atual: fonte ?? null, carregando: true, erro: null })
      setGrande(true)
      void buscarFontes(jogo, fonte ?? null)
    },
    [buscarFontes]
  )

  const trocarFonte = React.useCallback((fonte: Fonte) => {
    setTocando((atual) => (atual ? { ...atual, atual: fonte } : atual))
  }, [])

  const recarregarFontes = React.useCallback(async () => {
    const t = tocandoRef.current
    if (t) await buscarFontes(t.jogo, t.atual)
  }, [buscarFontes])

  const fecharPlayer = React.useCallback(() => setTocando(null), [])

  // Alguém colou ou tirou um link do jogo que está no player.
  React.useEffect(() => {
    if (!socket || !tocandoId) return
    const onTransmissao = (data: { jogoId?: string }) => {
      if (data?.jogoId === tocandoId) void recarregarFontes()
    }
    socket.on('futebol:transmissao', onTransmissao)
    return () => {
      socket.off('futebol:transmissao', onTransmissao)
    }
  }, [socket, tocandoId, recarregarFontes])

  // Ponto de "assistindo": na abertura e a cada minuto; fechar tira na hora.
  React.useEffect(() => {
    if (!token || !tocandoId || isPopout()) return
    const bater = () => void futebol.marcarAssistindo(token, tocandoId).catch(() => undefined)
    bater()
    const t = setInterval(bater, 60_000)
    return () => {
      clearInterval(t)
      void futebol.marcarAssistindo(token, null).catch(() => undefined)
    }
  }, [token, tocandoId])

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
    () => ({
      torcidas,
      meuTime,
      aoVivo,
      meuJogo,
      definirTime,
      assistindo,
      tocando,
      assistir,
      trocarFonte,
      recarregarFontes,
      fecharPlayer,
      grande,
      setGrande
    }),
    [torcidas, meuTime, aoVivo, meuJogo, definirTime, assistindo, tocando, assistir, trocarFonte, recarregarFontes, fecharPlayer, grande]
  )
  return <FutebolContext.Provider value={value}>{children}</FutebolContext.Provider>
}
