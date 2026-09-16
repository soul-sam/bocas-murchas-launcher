/**
 * A PONTE DO ELECTRON, IMPLEMENTADA NO NAVEGADOR.
 *
 * O renderer inteiro conversa com o processo principal por `window.bocas` —
 * 18 famílias, 61 métodos, definidos em `electron/preload/types.ts`. No
 * navegador esse objeto não existe, e o app morre no primeiro `.appWindow` do
 * boot.
 *
 * Em vez de espalhar `if (estamos no navegador)` pelos 32 arquivos que usam a
 * ponte, este módulo **se instala como `window.bocas`**. Os 32 continuam
 * lendo exatamente o que sempre leram e não sabem de nada. Foi de propósito:
 * um `import` novo em 32 arquivos é 32 chances de conflito com quem estiver
 * mexendo no mesmo repo, e zero ganho.
 *
 * Cada família cai num de três baldes:
 *
 * 1. **Tem equivalente na web** e está implementado de verdade: `auth`
 *    (localStorage), `shell.openExternal` (window.open), `settings`
 *    (localStorage, com o mesmo merge do processo principal), `notify`
 *    (Notification API), `nudge` (chacoalha a página), `screen` (o seletor do
 *    próprio navegador), `appWindow.reload`, `app.idleSeconds`.
 *
 * 2. **Não existe fora do desktop** e desliga com elegância, devolvendo o
 *    formato certo em estado neutro: Minecraft (`mcAuth`/`install`/`game`),
 *    `hotkeys` globais, `tray`, `overlay` em jogo, `lol` (leitura do cliente),
 *    `serverStatus`, `modpack`. A interface some sozinha porque já sabe ler
 *    "idle"/"desligado" — ninguém precisa de tela de erro.
 *
 * 3. **Muda de significado na web**: `updater` não baixa .exe nenhum, quem
 *    atualiza é o service worker; `appWindow` não tem janela pra minimizar.
 *
 * O que NÃO fazemos aqui é inventar sucesso: `game.launch()` devolve `error`
 * com motivo legível, não um `idle` mentiroso que deixaria a pessoa clicando
 * em Jogar pra sempre sem entender.
 */
import {
  DEFAULT_SETTINGS,
  type BocasAPI,
  type LauncherSettings,
  type LolStatus,
  type ServerStatus,
} from '../../electron/preload/types'

// ============================================
// GUARDA-CHUVA DO localStorage
// ============================================

/**
 * Aba anônima, cookies bloqueados e WebView com storage desligado fazem o
 * próprio ACESSO a `localStorage` lançar — não só a escrita. Por isso tudo
 * passa por aqui: perder a preferência é chato, a tela branca não.
 */
function ler(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave)
  } catch {
    return null
  }
}

function gravar(chave: string, valor: string): void {
  try {
    window.localStorage.setItem(chave, valor)
  } catch {
    // Sem storage a sessão vale só até fechar a aba. É degradação, não erro.
  }
}

function apagar(chave: string): void {
  try {
    window.localStorage.removeItem(chave)
  } catch {
    // idem
  }
}

const CHAVE_TOKEN = 'bocas:token'
const CHAVE_SETTINGS = 'bocas:settings'

/** Injetada pelo vite.web.config.ts; no desktop este arquivo nem carrega. */
declare const __APP_VERSION__: string
const VERSAO = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'web'

// ============================================
// AÇÚCAR
// ============================================

/** Canal de evento que nunca dispara: devolve o unsubscribe que o app espera. */
const semEventos = () => () => {}

/** Motivo padrão pro que só existe no launcher de PC. */
const SO_NO_PC = 'Isso só funciona no launcher do PC.'

/**
 * Estado "desligado" do servidor de Minecraft. É função e não constante porque
 * `fetchedAt` tem que ser a hora da CHAMADA: uma constante de módulo
 * congelaria o instante em que o bundle carregou, e a tela mostraria "medido
 * há 3 horas" logo depois de você clicar em atualizar.
 */
function semServidor(): ServerStatus {
  return { online: false, host: '', port: 0, error: SO_NO_PC, fetchedAt: new Date().toISOString() }
}

/** Idem pro cliente do LoL: `updatedAt` é epoch ms, e é a hora da leitura. */
function semLol(): LolStatus {
  const agora = Date.now()
  return { clientRunning: false, phase: 'none', phaseSince: agora, updatedAt: agora }
}

// ============================================
// CONFIGURAÇÕES
// ============================================

/**
 * Mesmo merge do `updateSettings` do processo principal
 * (`electron/main/services/settings.ts`): raso no topo, fundo nos objetos
 * aninhados — senão um patch só de `voice.inputGain` apagaria o resto de
 * `voice`.
 *
 * `mutedChannels` fica FORA do merge pelo mesmo motivo de lá: silenciar e
 * dessilenciar precisam poder ENCOLHER a lista, e spread só sabe crescer.
 */
function fundir(atual: LauncherSettings, patch: Partial<LauncherSettings>): LauncherSettings {
  return {
    ...atual,
    ...patch,
    voice: { ...atual.voice, ...(patch.voice ?? {}) },
    lol: { ...atual.lol, ...(patch.lol ?? {}) },
    hotkeys: {
      ...atual.hotkeys,
      ...(patch.hotkeys ?? {}),
      sounds: { ...atual.hotkeys.sounds, ...(patch.hotkeys?.sounds ?? {}) },
    },
    chat: { ...atual.chat, ...(patch.chat ?? {}) },
    screenShare: { ...atual.screenShare, ...(patch.screenShare ?? {}) },
    music: { ...atual.music, ...(patch.music ?? {}) },
    userVolumes: { ...atual.userVolumes, ...(patch.userVolumes ?? {}) },
  }
}

function lerSettings(): LauncherSettings {
  const bruto = ler(CHAVE_SETTINGS)
  if (!bruto) return DEFAULT_SETTINGS
  try {
    // Fundir com o padrão e não confiar no arquivo: chave nova que apareceu
    // numa versão posterior chegaria `undefined` e quebraria a tela que a lê.
    return fundir(DEFAULT_SETTINGS, JSON.parse(bruto) as Partial<LauncherSettings>)
  } catch {
    return DEFAULT_SETTINGS
  }
}

// ============================================
// CHACOALHAR A PÁGINA (nudge)
// ============================================

const CLASSE_NUDGE = 'bocas-nudge-web'
let cssDoNudgeInjetado = false

/**
 * O keyframe entra por JS, não por arquivo de estilo: assim o shim é
 * autossuficiente e o CSS do launcher não carrega regra que só serve pra web.
 */
function garantirCssDoNudge(): void {
  if (cssDoNudgeInjetado) return
  cssDoNudgeInjetado = true
  const tag = document.createElement('style')
  tag.textContent = `
@keyframes ${CLASSE_NUDGE} {
  0%, 100% { transform: translate3d(0, 0, 0); }
  20% { transform: translate3d(-8px, 4px, 0); }
  40% { transform: translate3d(7px, -5px, 0); }
  60% { transform: translate3d(-5px, -3px, 0); }
  80% { transform: translate3d(4px, 5px, 0); }
}
.${CLASSE_NUDGE} { animation: ${CLASSE_NUDGE} 180ms linear infinite; }
@media (prefers-reduced-motion: reduce) { .${CLASSE_NUDGE} { animation: none; } }
`
  document.head.appendChild(tag)
}

// ============================================
// TEMPO PARADO (AFK)
// ============================================

/**
 * No desktop isso vem do `powerMonitor` e enxerga o sistema TODO — a pessoa
 * pode estar jogando em tela cheia e continuar "ativa". Aqui só dá pra ver
 * esta aba: sair pro jogo conta como parado.
 *
 * Fica assim mesmo, e é a leitura certa pra web: quem saiu da aba do chat no
 * navegador realmente não está olhando o chat.
 */
let ultimoToque = Date.now()

function marcarAtividade(): void {
  ultimoToque = Date.now()
}

function ouvirAtividade(): void {
  const eventos = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
  for (const nome of eventos) {
    window.addEventListener(nome, marcarAtividade, { passive: true })
  }
  // Voltar pra aba é sinal de presença tão bom quanto um clique.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) marcarAtividade()
  })
}

// ============================================
// A PONTE
// ============================================

function criarPonte(): BocasAPI {
  return {
    auth: {
      saveToken: async (token) => gravar(CHAVE_TOKEN, token),
      loadToken: async () => ler(CHAVE_TOKEN),
      clearToken: async () => apagar(CHAVE_TOKEN),
    },

    shell: {
      // `noopener` não é decoração: sem ele a aba aberta recebe `window.opener`
      // e consegue navegar a nossa por baixo.
      openExternal: async (url) => {
        window.open(url, '_blank', 'noopener,noreferrer')
      },
    },

    // --- Minecraft: nada disso existe sem o processo principal ---
    mcAuth: {
      start: async () => ({ ok: false, error: { message: SO_NO_PC } }),
      cancel: async () => {},
      getProfile: async () => null,
      logout: async () => {},
      onProgress: semEventos,
    },

    install: {
      start: async () => ({ stage: 'error', current: 0, total: 0, error: SO_NO_PC }),
      status: async () => ({ stage: 'idle', current: 0, total: 0 }),
      onProgress: semEventos,
    },

    game: {
      launch: async () => ({ stage: 'error', error: SO_NO_PC }),
      status: async () => ({ stage: 'idle' }),
      onStatus: semEventos,
    },

    // --- Atualização: quem manda na web é o service worker ---
    updater: {
      status: async () => ({ stage: 'idle', currentVersion: VERSAO }),
      onStatus: semEventos,
      check: async () => {
        // Força o service worker a procurar bundle novo. Se achar, ele troca
        // sozinho e a próxima abertura já vem atualizada.
        try {
          const reg = await navigator.serviceWorker?.getRegistration()
          await reg?.update()
        } catch {
          // Sem service worker (dev, http) não tem o que checar.
        }
        return { stage: 'idle', currentVersion: VERSAO }
      },
      quitAndInstall: async () => window.location.reload(),
      postpone: async () => ({ stage: 'idle', currentVersion: VERSAO }),
    },

    settings: {
      get: async () => lerSettings(),
      update: async (patch) => {
        const proximo = fundir(lerSettings(), patch)
        gravar(CHAVE_SETTINGS, JSON.stringify(proximo))
        return proximo
      },
    },

    appWindow: {
      // Minimizar/maximizar/fechar não existem numa aba, e a barra de título
      // some na web (ver isWeb() no TitleBar). Ficam como no-op em vez de
      // lançar: se alguma tela chamar sem checar, não derruba nada.
      minimize: async () => {},
      maximizeToggle: async () => false,
      close: async () => {},
      reload: async () => window.location.reload(),
      isMaximized: async () => false,
      onStateChanged: semEventos,
    },

    // Ping cru no servidor de Minecraft é TCP — o navegador não faz.
    serverStatus: {
      get: async () => semServidor(),
      refresh: async () => semServidor(),
      onStatus: semEventos,
    },

    modpack: {
      changelog: async () => null,
      installedTag: async () => null,
    },

    // Atalho GLOBAL (funciona com o app em segundo plano) é privilégio de
    // desktop. Devolvemos a lista vazia de registros: a tela de atalhos mostra
    // "não registrado" em vez de fingir que gravou.
    hotkeys: {
      set: async () => [],
      probe: async () => ({ ok: false, error: SO_NO_PC }),
      clear: async () => {},
      onTriggered: semEventos,
    },

    /**
     * No desktop o app lista as janelas com `desktopCapturer` e monta o
     * seletor próprio; o main só libera o `getDisplayMedia` da fonte marcada.
     *
     * Na web quem escolhe é o navegador, dentro do próprio `getDisplayMedia`.
     * Então devolvemos UMA fonte de mentira ("Escolher no navegador…"): a
     * pessoa clica nela, o `selectSource` não faz nada, e o
     * `getDisplayMedia` logo em seguida abre o seletor do Chrome. O fluxo do
     * `screen-capture-gate` continua igual, sem saber de nada.
     */
    screen: {
      listSources: async () => [
        {
          id: 'web:seletor-do-navegador',
          name: 'Escolher no navegador…',
          isScreen: true,
          // 1×1 transparente: o cartão do seletor renderiza <img> e um src
          // vazio viraria ícone de imagem quebrada.
          thumbnailDataUrl:
            'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        },
      ],
      selectSource: async () => {},
      cancelSelection: async () => {},
    },

    nudge: {
      shake: async (options) => {
        const duracao = options?.durationMs ?? 700
        garantirCssDoNudge()
        const alvo = document.body
        alvo.classList.add(CLASSE_NUDGE)
        window.setTimeout(() => alvo.classList.remove(CLASSE_NUDGE), duracao)
        return { shook: true }
      },
    },

    tray: {
      setVoiceState: async () => {},
      onCommand: semEventos,
    },

    notify: {
      show: async ({ title, body, silent }) => {
        if (typeof Notification === 'undefined') return
        if (Notification.permission === 'default') {
          await Notification.requestPermission().catch(() => undefined)
        }
        if (Notification.permission !== 'granted') return

        try {
          // No Android o construtor `new Notification()` LANÇA: lá a
          // notificação tem que sair pelo service worker. Tentamos o
          // registro primeiro justamente por causa do celular, que é o
          // aparelho onde isso mais importa.
          const reg = await navigator.serviceWorker?.getRegistration()
          if (reg) {
            await reg.showNotification(title, { body, silent, icon: '/icons/icon-192.png' })
            return
          }
          new Notification(title, { body, silent, icon: '/icons/icon-192.png' })
        } catch {
          // Permissão revogada entre a checagem e o disparo, ou navegador
          // sem suporte: o aviso já está na tela do chat de qualquer jeito.
        }
      },
    },

    // Ler o cliente do LoL é abrir o lockfile na máquina. Fora do alcance.
    lol: {
      status: async () => semLol(),
      onStatus: semEventos,
      onGameEnded: semEventos,
      refresh: async () => semLol(),
    },

    // Sobreposição em partida é uma segunda janela transparente por cima do
    // jogo. Não tem equivalente nenhum no navegador.
    overlay: {
      push: async () => {},
      onAction: semEventos,
      onStateRequested: semEventos,
      state: async () => null,
      onState: semEventos,
      send: async () => {},
      requestState: async () => {},
      setInteractive: async () => {},
      dismiss: async () => {},
    },

    app: {
      applyAutostart: async () => ({ enabled: false, supported: false }),
      launchedAtLogin: async () => false,
      version: async () => VERSAO,
      idleSeconds: async () => Math.round((Date.now() - ultimoToque) / 1000),
    },
  }
}

// ============================================
// INSTALAÇÃO
// ============================================

/**
 * Põe a ponte de mentira no lugar da de verdade.
 *
 * TEM que rodar antes do primeiro módulo que lê `window.bocas` — por isso o
 * `main.web.tsx` chama isto e só DEPOIS importa o app, com `import()`
 * dinâmico. Um `import` estático do app no topo seria içado pra cima desta
 * chamada e a ordem se perderia em silêncio.
 *
 * No Electron nada disso roda: `main.tsx` é outra entrada.
 */
export function installWebBridge(): void {
  if (window.bocas) return
  window.__bocasWeb = true
  window.bocas = criarPonte()
  ouvirAtividade()
}
