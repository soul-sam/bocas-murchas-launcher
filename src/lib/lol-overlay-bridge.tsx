import * as React from 'react'
import type {
  OverlayBetTarget,
  OverlayMyGame,
  OverlayNotice,
  OverlayState
} from '../../electron/preload/types'
import { ApiError } from './api'
import { WAGER_MIN } from './api-gamification'
import { queueLabel, useActivity } from './activity-context'
import { useAuth } from './auth-context'
import { useGamification } from './gamification-context'
import { useSettings } from './settings-context'

/**
 * A PONTE DA SOBREPOSIÇÃO — o lado desta janela.
 *
 * A sobreposição que aparece por cima do League é uma janela separada, sem
 * login, sem socket e sem API (ver electron/main/services/lol-overlay.ts). Ela
 * só desenha. Quem tem token, saldo e a lista de partidas ao vivo é esta
 * janela — então é daqui que sai o retrato pronto, e é aqui que os cliques de
 * lá viram chamada de verdade.
 *
 * POR QUE NÃO UM SEGUNDO APP NA OUTRA JANELA: teria dois `AuthProvider`
 * disputando o mesmo token no cofre, dois sockets contando presença em dobro e
 * dois polls de `/wagers/live` na mesma máquina. Com a ponte, a partida começa
 * e a outra janela recebe exatamente o que esta já tinha na mão.
 *
 * Não desenha nada: é um componente só pelos hooks, montado junto das outras
 * camadas globais.
 */

/** Quanto o retrato empurrado pode ficar velho quando a sobreposição pede. */
const REQUEST_DEBOUNCE_MS = 2_000
/**
 * Depois disso o aviso sai do retrato. Um pouco mais que os 6s que a
 * sobreposição deixa ele na tela — some sozinho lá antes de sumir daqui, e o
 * texto não pisca no meio da leitura.
 *
 * Precisa sair: o processo main guarda o último retrato pra pintar o primeiro
 * quadro da próxima partida, e um aviso preso ali abriria o painel do próximo
 * jogo repetindo o resultado de uma aposta de meia hora atrás.
 */
const NOTICE_CLEAR_MS = 8_000

export function LolOverlayBridge(): null {
  const { user } = useAuth()
  const { settings } = useSettings()
  const { lol } = useActivity()
  const { liveGames, profile, placeWager, refreshLiveGames } = useGamification()

  const [notice, setNotice] = React.useState<OverlayNotice | null>(null)

  const active = settings.lol.enabled && settings.lol.overlay

  /**
   * O board da MINHA partida. O servidor junta as sessões de quem caiu no
   * mesmo jogo, então "minha" é qualquer board cujo `players` me inclua — não
   * só o da minha própria sessão.
   */
  const myBoard = React.useMemo(
    () =>
      user
        ? liveGames.find(
            (game) =>
              game.session.userId === user.id ||
              (game.players ?? []).some((p) => p.userId === user.id)
          )
        : undefined,
    [liveGames, user]
  )

  /**
   * Uma linha por PARTIDA, não por pessoa.
   *
   * Duas coisas que o board ao vivo obriga:
   *
   *   1. `/wagers/live` devolve um board por SESSÃO, e as sessões do mesmo
   *      jogo repetem `matchId`, pool e `myWager`. Sem deduplicar, um 5-stack
   *      do grupo viraria cinco linhas idênticas num painel de 360px.
   *   2. Apostar em QUALQUER sessão da partida em que eu estou é 403 no
   *      servidor ("não dá pra apostar na própria partida"). Filtrar só pelo
   *      dono do board deixaria passar os colegas de time — e o clique só
   *      falharia depois de sair da máquina.
   *
   * Fechadas ficam de fora: a janela é de 5 minutos, e linha morta em
   * sobreposição é ruído em cima do jogo. A que fechar com o painel aberto o
   * cronômetro local marca como fechada até o próximo poll levá-la embora.
   */
  const targets = React.useMemo<OverlayBetTarget[]>(() => {
    const byMatch = new Map<string, OverlayBetTarget>()

    for (const game of liveGames) {
      if (!game.open) continue
      const players = game.players ?? []
      if (game.session.userId === user?.id) continue
      if (user && players.some((p) => p.userId === user.id)) continue

      const matchId = game.matchId ?? game.session.id
      if (byMatch.has(matchId)) continue

      byMatch.set(matchId, {
        matchId,
        sessionId: game.session.id,
        displayName: game.session.user?.displayName ?? 'alguém',
        squad: players
          .filter((p) => p.userId !== game.session.userId)
          .map((p) => p.displayName),
        game: game.session.game,
        champion: game.session.champion ?? undefined,
        // A fila vai daqui JÁ traduzida ("Ranked Solo", e não "ranked_solo"):
        // o dicionário mora no contexto de presença, e arrastar aquele arquivo
        // pra dentro da outra janela traria os contextos todos junto.
        queue: queueLabel(game.session.queue ?? undefined),
        pool: game.pool,
        myWager: game.myWager,
        closesAt: Date.parse(game.closesAt),
        maxAmount: game.maxAmount
      })
    }

    // Quem fecha primeiro em cima: é a linha que some se a pessoa demorar.
    return [...byMatch.values()].sort((a, b) => a.closesAt - b.closesAt)
  }, [liveGames, user])

  const myGame = React.useMemo<OverlayMyGame | null>(() => {
    if (!lol || lol.phase !== 'in-progress') return null

    return {
      champion: lol.champion,
      queue: queueLabel(lol.queue),
      since: lol.phaseSince,
      pool: myBoard?.pool ?? { win: 0, loss: 0 },
      bettors: myBoard?.bets.length ?? 0,
      // A sessão é criada no servidor quando a partida começa (ver
      // activity-context); até a resposta voltar não há pool nenhuma, e dizer
      // isso é melhor que mostrar 0 × 0 como se ninguém tivesse apostado.
      pending: !myBoard,
      closesAt: myBoard ? Date.parse(myBoard.closesAt) : 0
    }
  }, [lol, myBoard])

  const state = React.useMemo<OverlayState>(
    () => ({
      ready: Boolean(user),
      coins: profile?.coins ?? 0,
      myGame,
      targets,
      notice,
      wagerMin: WAGER_MIN
    }),
    [user, profile?.coins, myGame, targets, notice]
  )

  React.useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_CLEAR_MS)
    return () => clearTimeout(timer)
  }, [notice])

  // --- empurrar o retrato -------------------------------------------------
  // Comparado por conteúdo: `liveGames` é substituído a cada poll de 30s mesmo
  // quando nada mudou, e sem isso o IPC sairia de dois em dois minutos à toa.
  const lastPushRef = React.useRef<string>('')
  React.useEffect(() => {
    if (!active) return
    const serialized = JSON.stringify(state)
    if (serialized === lastPushRef.current) return
    lastPushRef.current = serialized
    void window.bocas.overlay.push(state)
  }, [active, state])

  // --- a sobreposição abriu e quer dados frescos ---------------------------
  const lastRequestRef = React.useRef(0)
  React.useEffect(() => {
    if (!active) return
    return window.bocas.overlay.onStateRequested(() => {
      // O retrato guardado no processo main já pintou a tela; isto aqui é só
      // pra pool ficar em dia. Com trava porque a janela pede a cada abertura
      // e o poll de apostas pode ter acabado de rodar.
      const now = Date.now()
      if (now - lastRequestRef.current < REQUEST_DEBOUNCE_MS) return
      lastRequestRef.current = now
      void refreshLiveGames()
    })
  }, [active, refreshLiveGames])

  // --- cliques que vieram de lá -------------------------------------------
  React.useEffect(() => {
    if (!active) return
    return window.bocas.overlay.onAction((action) => {
      if (action.type !== 'bet') return

      const target = liveGames.find((game) => game.session.id === action.sessionId)
      const name = target?.session.user?.displayName ?? 'essa partida'

      void placeWager(action.sessionId, action.prediction, action.amount)
        .then(() => {
          setNotice({
            kind: 'ok',
            text: `${action.amount} murchos em ${
              action.prediction === 'win' ? 'vitória' : 'derrota'
            } de ${name}.`,
            at: Date.now()
          })
        })
        .catch((error: unknown) => {
          setNotice({
            kind: 'error',
            // Fora do 402, o texto do servidor é melhor que qualquer um que eu
            // inventasse aqui: ele sabe distinguir "já apostou nessa partida"
            // de "já apostou — é a mesma partida do grupo" e de janela fechada.
            text:
              error instanceof ApiError
                ? error.status === 402
                  ? 'Murchos insuficientes.'
                  : error.message
                : 'Não deu pra apostar agora.',
            at: Date.now()
          })
        })
    })
  }, [active, liveGames, placeWager])

  return null
}
