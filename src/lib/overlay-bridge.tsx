import * as React from 'react'
import type {
  OverlayAction,
  OverlayBetTarget,
  OverlayMyGame,
  OverlayNotice,
  OverlaySound,
  OverlayState,
  OverlayVoice
} from '../../electron/preload/types'
import { ApiError } from './api'
import { WAGER_MIN } from './api-gamification'
import { queueLabel, useActivity } from './activity-context'
import { useAuth } from './auth-context'
import { useClips } from './clip-context'
import { useGamification } from './gamification-context'
import { useNudge } from './nudge-context'
import { useSettings } from './settings-context'
import { useSoundboard } from './soundboard-context'
import { useVoice } from './voice-context'

/**
 * A PONTE DA SOBREPOSIÇÃO — o lado desta janela.
 *
 * A sobreposição que aparece por cima do jogo é uma janela separada, sem
 * login, sem socket e sem API (ver electron/main/services/overlay.ts). Ela só
 * desenha. Quem tem token, saldo, catálogo de sons e a call de pé é ESTA
 * janela — então é daqui que sai o retrato pronto, e é aqui que os cliques de
 * lá viram chamada de verdade.
 *
 * POR QUE NÃO UM SEGUNDO APP NA OUTRA JANELA: teria dois `AuthProvider`
 * disputando o mesmo token no cofre, dois sockets contando presença em dobro,
 * dois polls de `/wagers/live` e — pior de tudo, agora que existe a roda de
 * sons — DOIS launchers tocando o mesmo arquivo de áudio, porque cada um
 * receberia o `soundboard:played` por conta própria. A call ouviria tudo com
 * eco.
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
 * quadro da próxima abertura, e um aviso preso ali abriria o painel do próximo
 * jogo repetindo o resultado de uma aposta de meia hora atrás.
 */
const NOTICE_CLEAR_MS = 8_000

export function OverlayBridge(): null {
  const { user } = useAuth()
  const { settings } = useSettings()
  const { lol } = useActivity()
  const { liveGames, profile, placeWager, refreshLiveGames } = useGamification()
  const soundboard = useSoundboard()
  const voice = useVoice()
  const nudge = useNudge()
  const clips = useClips()

  const [notice, setNotice] = React.useState<OverlayNotice | null>(null)

  /**
   * A sobreposição vive por conta própria agora.
   *
   * Isto já foi `settings.lol.enabled && settings.lol.overlay`, de quando ela
   * só existia durante uma partida de League. Hoje ela abre por atalho a
   * qualquer momento, então o que manda é a chave dela — `lol.overlay` decidiu
   * só se o painel APARECE SOZINHO quando a partida começa, e essa decisão é
   * do processo main.
   */
  const active = settings.overlay.enabled

  /**
   * O board da MINHA sessão: o único que traz `self` (odd e janela de apostar
   * em mim), porque a aposta em mim é registrada nela, não na do colega.
   */
  const ownBoard = React.useMemo(
    () => (user ? liveGames.find((game) => game.session.userId === user.id) : undefined),
    [liveGames, user]
  )

  /**
   * O board da MINHA partida. O servidor junta as sessões de quem caiu no
   * mesmo jogo, então "minha" é qualquer board cujo `players` me inclua — não
   * só o da minha própria sessão. Pool e apostas são do grupo, iguais em
   * todos; o `self` NÃO é, e por isso sai do `ownBoard`. Antes um `find` só
   * pegava o primeiro board que me incluísse — num 5-stack, quem não tinha a
   * sessão mais recente caía no board do colega, sem `self`, e o card
   * "apostar em mim" sumia.
   */
  const myBoard = React.useMemo(
    () =>
      ownBoard ??
      (user
        ? liveGames.find((game) => (game.players ?? []).some((p) => p.userId === user.id))
        : undefined),
    [liveGames, user, ownBoard]
  )

  /**
   * Uma linha por PARTIDA, não por pessoa.
   *
   * Duas coisas que o board ao vivo obriga:
   *
   *   1. `/wagers/live` devolve um board por SESSÃO, e as sessões do mesmo
   *      jogo repetem `matchId`, pool e `myWager`. Sem deduplicar, um 5-stack
   *      do grupo viraria cinco linhas idênticas num painel estreito.
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
      closesAt: myBoard ? Date.parse(myBoard.closesAt) : 0,
      // O board de quem está na MINHA partida mas não é a minha sessão vem
      // sem `self` — a aposta em mim é registrada na minha sessão, não na do
      // colega. Por isso o `self` sai do `ownBoard`, nunca do `myBoard`.
      self: ownBoard?.self
        ? {
            sessionId: ownBoard.session.id,
            multiplier: ownBoard.self.odds.multiplier,
            closesAt: Date.parse(ownBoard.self.closesAt),
            maxAmount: ownBoard.self.maxAmount
          }
        : undefined,
      myWager:
        myBoard?.myWager && myBoard.myWager.self
          ? { amount: myBoard.myWager.amount, potential: myBoard.myWager.potential }
          : null
    }
  }, [lol, myBoard, ownBoard])

  /**
   * O catálogo pra roda de sons.
   *
   * Vai ENXUTO de propósito — id, nome, emoji e tecla. O `Sound` completo
   * carrega url, tamanho, duração, quem subiu e contagem de toques, e nada
   * disso é desenhado num gomo de roda; mandar tudo seria engordar cada
   * retrato que atravessa o IPC por causa de campos que ninguém lê.
   *
   * Bloqueado fica de fora mesmo pra admin: na sobreposição não existe o
   * botão de desbloquear, então um som apagado ali seria só um gomo que não
   * faz nada.
   */
  const sounds = React.useMemo<OverlaySound[]>(
    () =>
      soundboard.sounds
        .filter((sound) => !sound.isBlocked)
        .map((sound) => ({
          id: sound.id,
          name: sound.name,
          emoji: sound.emoji,
          hotkey: settings.hotkeys.sounds[sound.id] || undefined
        })),
    [soundboard.sounds, settings.hotkeys.sounds]
  )

  /**
   * A call, pro painel poder mexer no microfone sem alt-tab.
   *
   * `peers` é só NOME, sem quem está falando. Foi escolha, não esquecimento:
   * "está falando" muda várias vezes por segundo, e como o retrato é comparado
   * por conteúdo antes de ser empurrado (ver mais abaixo), isso viraria uma
   * rajada de IPC por cima de um jogo — pra desenhar um ponto piscando que
   * ninguém olha no meio de uma luta.
   */
  const voiceSnapshot = React.useMemo<OverlayVoice | null>(() => {
    if (!voice.connected || !voice.channel) return null
    return {
      channelName: voice.channel.name,
      micEnabled: voice.micEnabled,
      deafened: voice.deafened,
      peers: voice.participants.map((p) => p.name)
    }
  }, [voice.connected, voice.channel, voice.micEnabled, voice.deafened, voice.participants])

  const state = React.useMemo<OverlayState>(
    () => ({
      ready: Boolean(user),
      coins: profile?.coins ?? 0,
      myGame,
      targets,
      notice,
      wagerMin: WAGER_MIN,
      sounds,
      voice: voiceSnapshot
    }),
    [user, profile?.coins, myGame, targets, notice, sounds, voiceSnapshot]
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

  /**
   * A ponte saiu do ar: logout, sessão vencida ou o app fechando.
   *
   * A sobreposição é OUTRA janela e não some junto — ela ficaria na tela com o
   * último retrato de uma sessão morta (saldo, pool, sons e a call), e o
   * clique cairia no vazio, porque quem executava era este componente. Um
   * último retrato vazio troca isso por "Entre no launcher", que é a verdade.
   */
  const activeRef = React.useRef(active)
  React.useEffect(() => {
    activeRef.current = active
  }, [active])
  React.useEffect(() => {
    return () => {
      if (!activeRef.current) return
      void window.bocas.overlay
        .push({
          ready: false,
          coins: 0,
          myGame: null,
          targets: [],
          notice: null,
          wagerMin: WAGER_MIN,
          sounds: [],
          voice: null
        })
        // A janela pode estar sendo destruída junto (app fechando): aqui não
        // há mais ninguém pra tratar a promessa recusada.
        .catch(() => {})
    }
  }, [])

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
  /**
   * Os executores vivem numa ref, e o ouvinte de IPC é registrado UMA vez.
   *
   * Sem isso o efeito dependeria de tudo que ele usa — soundboard, voz, nudge,
   * clipe, apostas — e se desfaria e refaria a cada fala de alguém na call. Um
   * clique que chegasse na janelinha de tempo entre remover e pôr o ouvinte
   * seria engolido em silêncio, e é justamente o clique dado no meio de uma
   * partida movimentada. É o mesmo arranjo do hotkeys-context.
   */
  const handlersRef = React.useRef({ liveGames, placeWager, soundboard, voice, nudge, clips })
  handlersRef.current = { liveGames, placeWager, soundboard, voice, nudge, clips }

  React.useEffect(() => {
    if (!active) return

    return window.bocas.overlay.onAction((action: OverlayAction) => {
      const h = handlersRef.current

      switch (action.type) {
        case 'bet': {
          const target = h.liveGames.find((game) => game.session.id === action.sessionId)
          const name = target?.session.user?.displayName ?? 'essa partida'
          // Aposta em mim: o board da minha sessão é o único com `self`.
          const self = Boolean(target?.self)

          void h
            .placeWager(action.sessionId, action.prediction, action.amount)
            .then(() => {
              setNotice({
                kind: 'ok',
                text: self
                  ? `${action.amount} murchos em você. Agora ganha.`
                  : `${action.amount} murchos em ${
                      action.prediction === 'win' ? 'vitória' : 'derrota'
                    } de ${name}.`,
                at: Date.now()
              })
            })
            .catch((error: unknown) => {
              setNotice({
                kind: 'error',
                // Fora do 402, o texto do servidor é melhor que qualquer um
                // que eu inventasse aqui: ele sabe distinguir "já apostou
                // nessa partida" de "já apostou — é a mesma partida do grupo"
                // e de janela fechada.
                text:
                  error instanceof ApiError
                    ? error.status === 402
                      ? 'Murchos insuficientes.'
                      : error.message
                    : 'Não deu pra apostar agora.',
                at: Date.now()
              })
            })
          break
        }

        /**
         * O som toca pelo caminho de sempre: pede ao servidor, o servidor
         * avisa a sala, e CADA launcher toca o arquivo localmente. A
         * sobreposição não toca nada — ela não tem áudio, nem token, nem
         * socket. O recado de erro que aparece lá é o do soundboard-context.
         */
        case 'sound':
          void h.soundboard.play(action.soundId)
          break

        case 'mic':
          void h.voice.toggleMic()
          break

        case 'deafen':
          h.voice.toggleDeafen()
          break

        case 'leave-voice':
          void h.voice.leave()
          break

        /**
         * O clipe NÃO é salvo aqui: `capture()` abre a tela de confirmação na
         * janela principal — que está atrás do jogo. O aviso diz isso, senão
         * o botão pareceria não ter feito nada. É o mesmo comportamento do
         * atalho global de clipe, que já existia.
         */
        case 'clip':
          void h.clips.capture().then(() => {
            setNotice({ kind: 'ok', text: 'Clipe capturado — confirme no launcher.', at: Date.now() })
          })
          break

        case 'nudge':
          h.nudge.nudgeChannel()
          setNotice({ kind: 'ok', text: 'Tremeu a sala inteira.', at: Date.now() })
          break
      }
    })
  }, [active])

  return null
}
