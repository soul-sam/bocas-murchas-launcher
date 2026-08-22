import { desktopCapturer, session, type Session } from 'electron'

/**
 * Compartilhar tela no Electron.
 *
 * getDisplayMedia() no renderer NAO abre seletor sozinho: quem escolhe a fonte
 * e o processo main, pelo setDisplayMediaRequestHandler. Entao o fluxo e:
 *
 *   1. renderer pede a lista  -> listSources()
 *   2. usuario escolhe no nosso proprio seletor (bonito, com preview)
 *   3. renderer marca a escolha -> selectSource(id)
 *   4. renderer chama getDisplayMedia() -> o handler abaixo entrega aquela fonte
 *
 * O passo 3 e obrigatorio: sem fonte marcada, negamos o pedido. Isso impede que
 * qualquer script da pagina comece a capturar tela sem o usuario ter escolhido.
 */

export interface ScreenSource {
  id: string
  name: string
  isScreen: boolean
  thumbnailDataUrl: string
  appIconDataUrl?: string
}

/** Fonte escolhida aguardando o getDisplayMedia() correspondente. */
let pendingSourceId: string | null = null
let pendingWithAudio = true

/** A escolha expira: um pedido que chega muito depois nao e o nosso. */
let pendingSince = 0
const PENDING_TTL_MS = 30_000

export async function listSources(): Promise<ScreenSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true
  })

  return sources
    .filter((source) => !source.thumbnail.isEmpty())
    .map((source) => ({
      id: source.id,
      name: source.name,
      isScreen: source.id.startsWith('screen:'),
      thumbnailDataUrl: source.thumbnail.toDataURL(),
      appIconDataUrl:
        source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : undefined
    }))
}

export function selectSource(sourceId: string, withAudio = true): void {
  pendingSourceId = sourceId
  pendingWithAudio = withAudio
  pendingSince = Date.now()
}

export function cancelSelection(): void {
  pendingSourceId = null
  pendingSince = 0
}

export function initScreenShare(target: Session = session.defaultSession): void {
  target.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const expired = Date.now() - pendingSince > PENDING_TTL_MS

      if (!pendingSourceId || expired) {
        cancelSelection()
        // callback({}) nega o pedido — o renderer recebe NotAllowedError.
        callback({})
        return
      }

      const wantedId = pendingSourceId
      const wantsAudio = pendingWithAudio
      cancelSelection()

      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 0, height: 0 }
        })

        const source = sources.find((s) => s.id === wantedId)
        if (!source) {
          // A janela pode ter fechado entre a escolha e o pedido.
          callback({})
          return
        }

        callback({
          video: source,
          // 'loopback' = audio do sistema junto (som do jogo). So no Windows;
          // em outros sistemas o Electron ignora e vai so o video.
          audio: wantsAudio && process.platform === 'win32' ? 'loopback' : undefined
        })
      } catch {
        callback({})
      }
    },
    // Nosso seletor, nao o do sistema operacional.
    { useSystemPicker: false }
  )

  // Microfone e captura de tela sao liberados; o resto continua negado.
  target.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = permission === 'media' || permission === 'display-capture'
    callback(allowed)
  })

  // O check handler tem uma lista de permissoes mais estreita que a do request
  // handler: 'display-capture' nao existe aqui, so 'media'.
  target.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media'
  })
}
