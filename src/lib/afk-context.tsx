import * as React from 'react'
import { users as usersApi } from './api'
import { useAuth } from './auth-context'
import { useSettings } from './settings-context'
import { useVoice } from './voice-context'

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
 *  - seu status vira "ausente" e o recado aparece do lado do seu nome pra todo
 *    mundo (é o `customStatus`, o mesmo campo que a lista de membros já
 *    desenha);
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
 */

/** O recado padrão. Curto de propósito: cabe na linha da lista de membros. */
export const AFK_NOTE = 'Volto logo!'

/** Recado de quando o launcher marcou sozinho — diferente do que você marcou. */
export const AFK_AUTO_NOTE = 'Longe do teclado'

/**
 * De quanto em quanto tempo perguntamos o ocioso do sistema.
 *
 * 30s é grosso o suficiente pra não custar nada e fino o suficiente pra que o
 * "8 minutos" configurado não vire 10 na prática.
 */
const IDLE_POLL_MS = 30_000

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
  /** Foi o launcher que marcou (ocioso), não você. */
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
   * dá pra saber: depois disso o status NO SERVIDOR já é 'away' e o recado já
   * é o nosso. Quem estava em "não perturbe" volta pra "não perturbe".
   */
  const previousRef = React.useRef<{ status: string; customStatus: string | null } | null>(null)

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

  const tokenRef = React.useRef(token)
  tokenRef.current = token

  /** Última vez que ESTE microfone abriu. Ver o poll de ocioso mais abaixo. */
  const lastSpokeRef = React.useRef(0)

  const applyRemote = React.useCallback(
    (status: 'away' | 'online' | 'dnd' | 'offline', customStatus: string | null) => {
      const auth = tokenRef.current
      if (!auth) return

      // Duas chamadas porque status e recado moram em rotas diferentes. Falhar
      // não desfaz o estado local: o recado é uma cortesia, e insistir numa
      // rede ruim só deixaria o botão travado.
      void usersApi.setStatus(auth, status).catch(() => {})
      void usersApi.updateProfile(auth, { customStatus }).catch(() => {})
    },
    []
  )

  const enable = React.useCallback(
    (nextNote?: string, auto = false) => {
      if (afkRef.current) return

      previousRef.current = {
        status: user?.status ?? 'online',
        customStatus: user?.customStatus ?? null
      }

      const message = nextNote?.trim() || (auto ? AFK_AUTO_NOTE : AFK_NOTE)

      setAfk(true)
      setNote(message)
      setAutomatic(auto)
      applyRemote('away', message)

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
      // seu próprio avatar leem status e recado.
      if (user) applyUser({ ...user, status: 'away', customStatus: message })

      // Marcado sozinho já nasce armado: a pessoa não estava aqui pra clicar,
      // então qualquer toque na janela é volta. Na mão, espera a carência.
      armedRef.current = auto
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

    setAfk(false)
    setNote(null)
    setAutomatic(false)

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
    const customStatus = before?.customStatus ?? null

    applyRemote(restored, customStatus)
    if (user) applyUser({ ...user, status: restored, customStatus })
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
    if (me?.isSpeaking) lastSpokeRef.current = Date.now()
  }, [voice.participants])

  /**
   * MARCAR SOZINHO depois de N minutos ocioso.
   *
   * Duas condições, e a segunda é a que evita o erro bobo: quem passa a noite
   * na call falando sem tocar no mouse ficaria "ausente" no meio de uma frase,
   * porque pro Windows teclado e mouse parados é ocioso. Então o mesmo tempo
   * precisa ter passado desde a última vez que o microfone abriu.
   */
  React.useEffect(() => {
    const minutes = settings.afkAutoMinutes
    if (!token || minutes <= 0) return

    const limitMs = minutes * 60_000

    const check = async (): Promise<void> => {
      if (afkRef.current) return
      // Invisível é uma escolha explícita de não aparecer; mexer no status de
      // quem pediu isso seria desfazer a escolha dela.
      if (user?.status === 'offline') return

      const idleSeconds = await window.bocas.app.idleSeconds().catch(() => 0)
      if (idleSeconds * 1000 < limitMs) return
      if (Date.now() - lastSpokeRef.current < limitMs) return

      enable(AFK_AUTO_NOTE, true)
    }

    const timer = window.setInterval(() => void check(), IDLE_POLL_MS)
    return () => window.clearInterval(timer)
  }, [settings.afkAutoMinutes, token, user?.status, enable])

  const value = React.useMemo<AfkContextValue>(
    () => ({
      afk,
      note,
      automatic,
      enable: (n?: string) => enable(n, false),
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
