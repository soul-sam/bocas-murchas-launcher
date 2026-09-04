import * as React from 'react'
import {
  emojisApi,
  stickersApi,
  type CustomEmoji,
  type Sticker,
  type StickerPack
} from './api-emojis'
import { resolveAssetUrl } from './api'
import { useAuth } from './auth-context'
import { useSocket } from './socket-context'

export type { CustomEmoji, Sticker, StickerPack } from './api-emojis'

/**
 * Formato que o emoji-picker-react espera em `customEmojis`. Tipado na mao
 * pra nao arrastar o tipo da biblioteca pra dentro de lib/. `id` e `names[0]`
 * sao o NOME do emoji: e o que volta em `onEmojiClick` (`emoji.names[0]`) e
 * vira `:nome:` no texto ou na reacao.
 */
export function toPickerEmojis(
  emojis: CustomEmoji[]
): { id: string; names: string[]; imgUrl: string }[] {
  return emojis.map((e) => ({
    id: e.name,
    names: [e.name],
    imgUrl: resolveAssetUrl(e.url) ?? ''
  }))
}

/**
 * Emojis customizados e stickers do servidor.
 *
 * Carrega as duas listas uma vez ao logar e depois so escuta o socket: o
 * RichText desenha `:kekw:` consultando `byName` em CADA mensagem da tela,
 * entao a lista precisa estar em memoria, nunca atras de um fetch.
 *
 * Emoji chega pelo socket com o objeto inteiro (`emoji:added/updated/removed`)
 * e a lista e ajustada no lugar. Sticker chega so como aviso
 * (`sticker:changed`) e a lista de packs e recarregada: sao poucos e o payload
 * completo poupa quatro eventos diferentes pra manter em sincronia.
 */

interface EmojiContextValue {
  emojis: CustomEmoji[]
  /** nome (sem dois-pontos) -> emoji. E o que o RichText consulta. */
  byName: Map<string, CustomEmoji>
  packs: StickerPack[]
  loading: boolean

  uploadEmoji: (file: File, name: string) => Promise<CustomEmoji>
  renameEmoji: (id: string, name: string) => Promise<void>
  removeEmoji: (id: string) => Promise<void>

  createPack: (name: string, description?: string) => Promise<StickerPack>
  uploadSticker: (packId: string, file: File, name: string) => Promise<Sticker>
  /** Admin. */
  removeSticker: (id: string) => Promise<void>
  /** Admin. */
  removePack: (packId: string) => Promise<void>

  refresh: () => Promise<void>
}

const EmojiContext = React.createContext<EmojiContextValue | null>(null)

/** Insere ou substitui pelo id, mantendo a lista em ordem alfabetica. */
function upsertEmoji(list: CustomEmoji[], emoji: CustomEmoji): CustomEmoji[] {
  const next = list.filter((e) => e.id !== emoji.id)
  next.push(emoji)
  return next.sort((a, b) => a.name.localeCompare(b.name))
}

export function EmojiProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  const { socket } = useSocket()

  const [emojis, setEmojis] = React.useState<CustomEmoji[]>([])
  const [packs, setPacks] = React.useState<StickerPack[]>([])
  const [loading, setLoading] = React.useState(false)

  const refreshPacks = React.useCallback(async () => {
    if (!token) return
    try {
      setPacks(await stickersApi.list(token))
    } catch (err) {
      console.warn('[emojis] falha ao carregar stickers:', err)
    }
  }, [token])

  const refresh = React.useCallback(async () => {
    if (!token) {
      setEmojis([])
      setPacks([])
      return
    }
    setLoading(true)
    try {
      // As duas em paralelo, e uma falhando nao derruba a outra: chat sem
      // sticker ainda e chat; sem emoji tambem.
      const [emojiResult, packResult] = await Promise.allSettled([
        emojisApi.list(token),
        stickersApi.list(token)
      ])
      if (emojiResult.status === 'fulfilled') setEmojis(emojiResult.value)
      else console.warn('[emojis] falha ao carregar emojis:', emojiResult.reason)
      if (packResult.status === 'fulfilled') setPacks(packResult.value)
      else console.warn('[emojis] falha ao carregar stickers:', packResult.reason)
    } finally {
      setLoading(false)
    }
  }, [token])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    if (!socket) return

    const handleAdded = (data: { emoji: CustomEmoji }): void => {
      if (!data?.emoji) return
      setEmojis((prev) => upsertEmoji(prev, data.emoji))
    }

    const handleUpdated = (data: { emoji: CustomEmoji }): void => {
      if (!data?.emoji) return
      setEmojis((prev) => upsertEmoji(prev, data.emoji))
    }

    const handleRemoved = (data: { id: string }): void => {
      setEmojis((prev) => prev.filter((e) => e.id !== data?.id))
    }

    const handleStickersChanged = (): void => {
      void refreshPacks()
    }

    socket.on('emoji:added', handleAdded)
    socket.on('emoji:updated', handleUpdated)
    socket.on('emoji:removed', handleRemoved)
    socket.on('sticker:changed', handleStickersChanged)

    return () => {
      socket.off('emoji:added', handleAdded)
      socket.off('emoji:updated', handleUpdated)
      socket.off('emoji:removed', handleRemoved)
      socket.off('sticker:changed', handleStickersChanged)
    }
  }, [socket, refreshPacks])

  const byName = React.useMemo(() => {
    const map = new Map<string, CustomEmoji>()
    for (const emoji of emojis) map.set(emoji.name, emoji)
    return map
  }, [emojis])

  // As acoes tambem ajustam o estado local na hora. O socket vai repetir o
  // mesmo ajuste logo depois (upsert pelo id e idempotente), mas esperar por
  // ele deixaria o gerenciador com cara de travado depois de cada clique.

  const uploadEmoji = React.useCallback(
    async (file: File, name: string) => {
      if (!token) throw new Error('Sem sessão')
      const emoji = await emojisApi.create(token, file, name)
      setEmojis((prev) => upsertEmoji(prev, emoji))
      return emoji
    },
    [token]
  )

  const renameEmoji = React.useCallback(
    async (id: string, name: string) => {
      if (!token) throw new Error('Sem sessão')
      const emoji = await emojisApi.rename(token, id, name)
      setEmojis((prev) => upsertEmoji(prev, emoji))
    },
    [token]
  )

  const removeEmoji = React.useCallback(
    async (id: string) => {
      if (!token) throw new Error('Sem sessão')
      await emojisApi.remove(token, id)
      setEmojis((prev) => prev.filter((e) => e.id !== id))
    },
    [token]
  )

  const createPack = React.useCallback(
    async (name: string, description?: string) => {
      if (!token) throw new Error('Sem sessão')
      const pack = await stickersApi.createPack(token, name, description)
      setPacks((prev) => (prev.some((p) => p.id === pack.id) ? prev : [...prev, pack]))
      return pack
    },
    [token]
  )

  const uploadSticker = React.useCallback(
    async (packId: string, file: File, name: string) => {
      if (!token) throw new Error('Sem sessão')
      const sticker = await stickersApi.uploadSticker(token, packId, file, name)
      setPacks((prev) =>
        prev.map((pack) => {
          if (pack.id !== packId || pack.stickers.some((s) => s.id === sticker.id)) return pack
          return {
            ...pack,
            coverUrl: pack.coverUrl ?? sticker.url,
            stickers: [...pack.stickers, sticker]
          }
        })
      )
      return sticker
    },
    [token]
  )

  const removeSticker = React.useCallback(
    async (id: string) => {
      if (!token) throw new Error('Sem sessão')
      await stickersApi.removeSticker(token, id)
      setPacks((prev) =>
        prev.map((pack) => ({ ...pack, stickers: pack.stickers.filter((s) => s.id !== id) }))
      )
    },
    [token]
  )

  const removePack = React.useCallback(
    async (packId: string) => {
      if (!token) throw new Error('Sem sessão')
      await stickersApi.removePack(token, packId)
      setPacks((prev) => prev.filter((p) => p.id !== packId))
    },
    [token]
  )

  const value = React.useMemo<EmojiContextValue>(
    () => ({
      emojis,
      byName,
      packs,
      loading,
      uploadEmoji,
      renameEmoji,
      removeEmoji,
      createPack,
      uploadSticker,
      removeSticker,
      removePack,
      refresh
    }),
    [
      emojis,
      byName,
      packs,
      loading,
      uploadEmoji,
      renameEmoji,
      removeEmoji,
      createPack,
      uploadSticker,
      removeSticker,
      removePack,
      refresh
    ]
  )

  return <EmojiContext.Provider value={value}>{children}</EmojiContext.Provider>
}

export function useEmojis(): EmojiContextValue {
  const ctx = React.useContext(EmojiContext)
  if (!ctx) throw new Error('useEmojis must be used within EmojiProvider')
  return ctx
}
