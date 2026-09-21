import * as React from 'react'
import { users as usersApi } from './api'
import { useAuth } from './auth-context'
import { useSettings } from './settings-context'
import { useVoice } from './voice-context'
import { marcarFala, marcarVolta, silencioMs } from './presenca-de-fala'

/**
 * "VOLTO LOGO!" — o aviso de que você não está aí.
 *
 * O problema que isso resolve não é técnico: é a galera chamando, cutucando e
 * marcando alguém que levantou da cadeira. Existir um status "Ausente" no menu
 * não resolvia por dois motivos — ninguém lembra de marcar antes de sair, e
 * ninguém lembra de desmarcar ao voltar, então em uma semana metade do grupo
 * aparece "ausente" para sempre e o aviso deixa de significar qualquer coisa.
 *
 * Então aqui o AFK é um estado com as duas pontas automáticas:
 *
 *  - ENTRA sozinho depois de N minutos sem tocar em teclado e mouse (do
 *    sistema, não da janela — ver `window.bocas.app.idleSeconds`), e
 *  - SAI sozinho quando você volta pra janela e mexe em algo.
 *
 * Enquanto está ligado:
 *  - seu status vira "ausente", e é SÓ isso que vai pro servidor. O aviso na
 *    tela dos outros é um CRACHÁ desenhado a partir do status (ver
 *    components/social/AwayBadge), não um texto gravado no seu perfil;
 *  - cutucada não te acha (o servidor tem uma lista de quem optou por não
 *    receber, e a gente entra nela sem mexer na preferência salva da pessoa —
 *    ver nudge-context);
 *  - se você MARCOU NA MÃO e está numa call, o microfone e o som desligam
 *    junto. Quem clicou "Volto logo!" está saindo da frente do computador, e
 *    deixar o mic aberto pra sala ouvir a casa é o defeito clássico disso.
 *
 * O AUTOMÁTICO NÃO MEXE EM ÁUDIO, de propósito. Quem fica dez minutos sem
 * tocar no teclado pode estar assistindo à tela que alguém compartilhou, e
 * cortar o som de quem está ASSISTINDO é exatamente o contrário do que a
 * feature promete. O automático só põe o recado.
 *
 * Voltar devolve o que estava antes — e só o que ESTE módulo mexeu: quem já
 * estava mudo antes de sair continua mudo ao voltar.
 *
 * O que nunca acontece: sair da call ou parar de receber mensagem. AFK é um
 * recado, não um modo de operação.
 *
 * ## O AFK NÃO ESCREVE NO SEU RECADO (consertado)
 *
 * Isto já gravou "Longe do teclado" no `customStatus` de quem passasse dez
 * minutos sem mexer no mouse — por cima do recado que a pessoa tinha escrito.
 * E o estrago não era temporário: o recado antigo só voltava se o AFK
 * terminasse NESTA sessão, então fechar o launcher ausente (ou o app cair)
 * apagava o recado pra sempre. Recado é do dono; ausência é um crachá.
 *
 * Quem tiver um dos dois textos do AFK preso no perfil de antes da correção é
 * limpo uma vez, na montagem — ver `LEGACY_AFK_NOTES`.
 *
 * ## VOLTAR TAMBÉM É AUTOMÁTICO PELO SISTEMA (consertado)
 *
 * A entrada sempre olhou o ocioso do SISTEMA; a saída só olhava a janela do
 * launcher (foco + clique/tecla). Quem ficava ausente e voltava pro PC pra
 * jogar, navegar ou trabalhar — ou seja, quase sempre — continuava "ausente"
 * pra todo mundo até lembrar de abrir o launcher e arrumar na mão. Era esta a
 * reclamação de "preciso ficar online manualmente mesmo com o launcher
 * aberto". Agora o mesmo relógio que marca desmarca: mexeu no computador, o
 * automático cai sozinho.
 *
 * Só o AUTOMÁTICO sai por aqui. Quem clicou "Volto logo!" disse que ia sair;
 * o mouse encostando na mesa não desmente isso — esse continua saindo pelo
 * toque na janela (ou por outro clique no botão).
 *
 * ## SEM FALAR TAMBÉM É SINAL DE AUSÊNCIA (novo)
 *
 * O ocioso do sistema responde "saiu do computador?". Só que o caso que mais
 * deixa gente falando sozinha é o outro: a pessoa está no PC, jogando ou
 * trabalhando, com o launcher aberto atrás — pro Windows ela nunca fica
 * ociosa, e pro grupo ela aparece online há seis horas sem dizer nada.
 *
 * Então há DOIS relógios automáticos, cada um com o seu tempo nas
 * configurações:
 *
 *  - `afkAutoMinutes` — sem teclado e mouse (do sistema);
 *  - `afkSilenceMinutes` — sem MANDAR MENSAGEM nem abrir o microfone (ver
 *    lib/presenca-de-fala.ts).
 *
 * A volta de cada um é diferente, e tem que ser: o de ocioso cai quando você
 * mexe no computador; o de silêncio, não — mexer no PC é justamente o que ele
 * não conta como presença. Esse cai quando você FALA, ou quando encosta na
 * janela do launcher (que já significa "voltei pra cá"). Ao cair, o relógio do
 * silêncio é zerado, senão o crachá voltaria no tique seguinte, piscando.
 */

/** O que o crachá diz quando VOCÊ marcou. Curto: cabe na linha da lista. */
export const AFK_NOTE = 'Volto logo!'

/** O que o crachá diz quando o launcher marcou sozinho. */
export const AFK_AUTO_NOTE = 'Longe do teclado'

/**
 * Quando quem marcou foi o relógio do SILÊNCIO — a pessoa está no computador,
 * só não fala há tempo demais. Dizer "longe do teclado" aqui seria mentira na
 * cara de quem está com a mão nele.
 */
export const AFK_SILENCE_NOTE = 'Sumido da conversa'

/**
 * Os textos que o AFK antigo gravava no `customStatus` das pessoas.
 *
 * Enquanto existir gente com um deles preso no perfil, o recado que ela
 * escreveu está perdido e o que se vê é lixo nosso. Limpamos uma vez, ao
 * montar — só o que bate EXATAMENTE, pra não encostar em quem por acaso
 * escreveu "volto logo!" de propósito.
 */
const LEGACY_AFK_NOTES = [AFK_NOTE, AFK_AUTO_NOTE]

/** Quem marcou sozinho: o ocioso do sistema ou o silêncio na conversa. */
type MotivoAutomatico = 'ocioso' | 'silencio' | null

/**
 * De quanto em quanto tempo perguntamos o ocioso do sistema.
 *
 * 30s é grosso o suficiente pra não custar nada e fino o suficiente pra que o
 * "8 minutos" configurado não vire 10 na prática.
 */
const IDLE_POLL_MS = 30_000

/**
 * Abaixo disso a pessoa está de volta ao computador.
 *
 * Tem que ser MAIOR que o intervalo do poll: com 30s entre perguntas, exigir
 * "menos de 5s de ocioso" só desmarcaria quem estivesse digitando no instante
 * exato do tique. Um minuto é folgado o bastante pra pegar qualquer uso real e
 * curto o bastante pra não deixar o crachá pendurado depois que a pessoa voltou.
 */
const BACK_IDLE_SECONDS = 60

/**
 * Carência depois de ligar o AFK na mão.
 *
 * Sem ela, o clique no próprio botão (e o movimento do mouse saindo dele) já
 * contaria como "voltei" e o AFK se desligaria no mesmo segundo.
 */
const MANUAL_GRACE_MS = 3_000

interface AfkContextValue {
  /** Você está marcado como AFK agora. */
  afk: boolean
  /** O recado que os outros estão vendo. Null quando não está AFK. */
  note: string | null
  /** Foi o launcher que marcou (ocioso ou silêncio), não você. */
  automatic: boolean
  /** Liga o AFK. Sem recado, usa o padrão. */
  enable: (note?: string) => void
  /** Desliga e devolve o status e o recado que você tinha antes. */
  disable: () => void
  toggle: () => void
}

const AfkContext = React.createContext<AfkContextValue | null>(null)

export function AfkProvider({ children }: { children: React.ReactNode }) {
  const { user, token, applyUser } = useAuth()
  const { settings } = useSettings()
  const voice = useVoice()

  const [afk, setAfk] = React.useState(false)
  const [note, setNote] = React.useState<string | null>(null)
  const [automatic, setAutomatic] = React.useState(false)

  /**
   * O que devolver quando o AFK sair.
   *
   * Guardado no instante em que o AFK entra, porque é o único momento em que
   * dá pra saber: depois disso o status NO SERVIDOR já é 'away'. Quem estava
   * em "não perturbe" volta pra "não perturbe".
   */
  const previousRef = React.useRef<{ status: string } | null>(null)

  /**
   * Estado de áudio de antes do AFK — null quando não havia call, ou quando o
   * AFK foi automático (que não mexe em áudio). Só se devolve o que se mexeu.
   */
  const audioRef = React.useRef<{ micEnabled: boolean; deafened: boolean } | null>(null)

  /**
   * A call por REFERÊNCIA, não por dependência.
   *
   * O contexto de voz muda a cada transição de "quem está falando" — várias
   * vezes por segundo numa conversa. Se `enable`/`disable` dependessem dele,
   * elas ganhariam identidade nova na mesma frequência, e o efeito do AFK
   * automático (que tem `enable` na lista) refaria o `setInterval` de 30s
   * antes de cada tique chegar: o automático simplesmente nunca dispararia
   * enquanto alguém estivesse falando.
   */
  const voiceRef = React.useRef(voice)
  voiceRef.current = voice

  /**
   * `armed` é o que impede o AFK de se desligar no mesmo clique que o ligou:
   * só depois de a janela perder o foco (ou passar a carência) um toque na
   * janela conta como "voltei".
   */
  const armedRef = React.useRef(false)
  const afkRef = React.useRef(false)
  afkRef.current = afk
  /**
   * O poll só desfaz o que ele mesmo marcou — e cada motivo tem a sua regra de
   * volta, por isso guarda-se QUAL foi, e não só que foi automático.
   */
  const motivoRef = React.useRef<MotivoAutomatico>(null)

  const tokenRef = React.useRef(token)
  tokenRef.current = token

  /**
   * FAXINA DO ESTRAGO ANTIGO: limpa o recado que o AFK antigo deixou gravado.
   *
   * Uma vez por sessão, e só quando o texto bate exatamente com um dos nossos
   * — ver LEGACY_AFK_NOTES.
   */
  const cleanedLegacyRef = React.useRef(false)

  React.useEffect(() => {
    if (cleanedLegacyRef.current) return
    if (!token || !user) return
    const stuck = user.customStatus?.trim()
    if (!stuck || !LEGACY_AFK_NOTES.includes(stuck)) return

    cleanedLegacyRef.current = true
    void usersApi.updateProfile(token, { customStatus: null }).catch(() => {})
    applyUser({ ...user, customStatus: null })
  }, [token, user, applyUser])

  /**
   * Só o STATUS vai pro servidor. O recado é do dono — ver o cabeçalho.
   *
   * Falhar não desfaz o estado local: insistir numa rede ruim só deixaria o
   * botão travado.
   */
  const applyRemote = React.useCallback((status: 'away' | 'online' | 'dnd' | 'offline') => {
    const auth = tokenRef.current
    if (!auth) return
    void usersApi.setStatus(auth, status).catch(() => {})
  }, [])

  const enable = React.useCallback(
    (nextNote?: string, auto: MotivoAutomatico = null) => {
      if (afkRef.current) return

      previousRef.current = { status: user?.status ?? 'online' }

      const message = nextNote?.trim() || (auto ? AFK_AUTO_NOTE : AFK_NOTE)

      setAfk(true)
      setNote(message)
      setAutomatic(auto !== null)
      motivoRef.current = auto
      applyRemote('away')

      // Só no clique, e só dentro de uma call. `setDeafen(true)` já muta o
      // microfone junto (ver voice-context): quem não ouve ninguém também não
      // deveria estar falando.
      const call = voiceRef.current
      if (!auto && call.connected) {
        audioRef.current = { micEnabled: call.micEnabled, deafened: call.deafened }
        call.setDeafen(true)
      } else {
        audioRef.current = null
      }

      // O objeto de usuário local também muda: é dele que a barra lateral e o
      // seu próprio avatar leem o status. O recado fica como está.
      if (user) applyUser({ ...user, status: 'away' })

      // Marcado sozinho já nasce armado: a pessoa não estava aqui pra clicar,
      // então qualquer toque na janela é volta. Na mão, espera a carência.
      armedRef.current = auto !== null
      if (!auto) {
        window.setTimeout(() => {
          armedRef.current = true
        }, MANUAL_GRACE_MS)
      }
    },
    [user, applyUser, applyRemote]
  )

  const disable = React.useCallback(() => {
    if (!afkRef.current) return

    const before = previousRef.current
    previousRef.current = null
    armedRef.current = false
    motivoRef.current = null

    setAfk(false)
    setNote(null)
    setAutomatic(false)

    // Voltar zera o relógio do silêncio: senão o tique seguinte — com o mesmo
    // silêncio estourado de antes — marcaria de novo, e o crachá piscaria.
    marcarVolta()

    // Devolve o áudio ANTES do resto: é o que a pessoa nota primeiro ao voltar.
    // Sai do ensurdecido primeiro (que não mexe no mic) e só então restaura o
    // microfone — na ordem inversa o `setDeafen` mutaria de novo.
    const audio = audioRef.current
    audioRef.current = null
    const call = voiceRef.current
    if (audio && call.connected) {
      call.setDeafen(audio.deafened)
      if (audio.micEnabled) void call.setMic(true)
    }

    const status = (before?.status ?? 'online') as 'away' | 'online' | 'dnd' | 'offline'
    // Voltar pra 'away' não faz sentido: se a pessoa está mexendo, ela está
    // online. Quem estava em "não perturbe" ou invisível mantém a escolha.
    const restored = status === 'away' ? 'online' : status

    applyRemote(restored)
    if (user) applyUser({ ...user, status: restored })
  }, [user, applyUser, applyRemote])

  const toggle = React.useCallback(() => {
    if (afkRef.current) disable()
    else enable()
  }, [disable, enable])

  /**
   * VOLTEI: a janela ganhou o foco e a pessoa mexeu em algo.
   *
   * Só o foco não basta — a janela ganha foco quando a pessoa passa o mouse
   * atrás dela pra clicar em outra coisa, e ninguém quer "voltei" por isso. E
   * só o `blur` arma o gatilho, pra que o clique que ligou o AFK não conte.
   */
  React.useEffect(() => {
    if (!afk) return

    const arm = (): void => {
      armedRef.current = true
    }
    const back = (): void => {
      if (armedRef.current) disable()
    }

    window.addEventListener('blur', arm)
    window.addEventListener('pointerdown', back)
    window.addEventListener('keydown', back)
    return () => {
      window.removeEventListener('blur', arm)
      window.removeEventListener('pointerdown', back)
      window.removeEventListener('keydown', back)
    }
  }, [afk, disable])

  /** Falar na call conta como estar presente, mesmo sem tocar no teclado. */
  React.useEffect(() => {
    const me = voice.participants.find((p) => p.isLocal)
    if (me?.isSpeaking) marcarFala()
  }, [voice.participants])

  /**
   * MARCAR SOZINHO — os dois relógios, no mesmo tique.
   *
   * OCIOSO: N minutos sem teclado e mouse do sistema. Duas condições, e a
   * segunda é a que evita o erro bobo: quem passa a noite na call falando sem
   * tocar no mouse ficaria "ausente" no meio de uma frase, porque pro Windows
   * teclado e mouse parados é ocioso. Então o mesmo tempo precisa ter passado
   * desde a última vez que você falou.
   *
   * SILÊNCIO: N minutos sem mandar mensagem nem abrir o microfone, estando
   * você no computador ou não — é o caso de quem joga a tarde inteira com o
   * launcher aberto atrás e aparece online pra quem está chamando.
   *
   * Zero em um dos dois desliga AQUELE relógio; zero nos dois desliga o
   * automático inteiro (o botão continua funcionando na mão).
   */
  React.useEffect(() => {
    const minutes = settings.afkAutoMinutes
    const silenceMinutes = settings.afkSilenceMinutes
    if (!token || (minutes <= 0 && silenceMinutes <= 0)) return

    const limitMs = minutes * 60_000
    const silenceLimitMs = silenceMinutes * 60_000

    const check = async (): Promise<void> => {
      const idleSeconds = await window.bocas.app.idleSeconds().catch(() => 0)

      /**
       * JÁ ESTÁ AUSENTE: a volta é do mesmo relógio que marcou.
       *
       * Só desfaz o que ELE mesmo marcou (`motivoRef`) — ver o cabeçalho. E a
       * regra muda com o motivo: o de ocioso cai quando a pessoa mexe no
       * computador; o de silêncio, só quando ela fala (encostar na janela do
       * launcher já o desfaz pelo listener de `pointerdown`).
       */
      if (afkRef.current) {
        const motivo = motivoRef.current
        if (!motivo) return
        if (motivo === 'ocioso' && idleSeconds > BACK_IDLE_SECONDS) return
        if (motivo === 'silencio' && silencioMs() >= silenceLimitMs) return
        disable()
        return
      }

      // Invisível é uma escolha explícita de não aparecer; mexer no status de
      // quem pediu isso seria desfazer a escolha dela.
      if (user?.status === 'offline') return

      if (minutes > 0 && idleSeconds * 1000 >= limitMs && silencioMs() >= limitMs) {
        enable(AFK_AUTO_NOTE, 'ocioso')
        return
      }

      if (silenceMinutes > 0 && silencioMs() >= silenceLimitMs) {
        enable(AFK_SILENCE_NOTE, 'silencio')
      }
    }

    const timer = window.setInterval(() => void check(), IDLE_POLL_MS)
    return () => window.clearInterval(timer)
  }, [settings.afkAutoMinutes, settings.afkSilenceMinutes, token, user?.status, enable, disable])

  const value = React.useMemo<AfkContextValue>(
    () => ({
      afk,
      note,
      automatic,
      enable: (n?: string) => enable(n, null),
      disable,
      toggle
    }),
    [afk, note, automatic, enable, disable, toggle]
  )

  return <AfkContext.Provider value={value}>{children}</AfkContext.Provider>
}

export function useAfk(): AfkContextValue {
  const ctx = React.useContext(AfkContext)
  if (!ctx) throw new Error('useAfk must be used within an AfkProvider')
  return ctx
}
