import { request, upload } from './api'

/**
 * Emojis customizados (`:kekw:`) e packs de stickers — /api/emojis e
 * /api/stickers.
 *
 * Modulo separado do api.ts pelo mesmo motivo dos outros api-*.ts: o arquivo
 * central ja e grande, e isto aqui so interessa ao emoji-context.
 */

export interface CustomEmoji {
  id: string
  /** Sem os dois-pontos: "kekw". */
  name: string
  /** Relativa (/static/emojis/...) — passar por resolveAssetUrl antes de usar. */
  url: string
  uploadedBy: { id: string; displayName: string }
  createdAt: string
}

export interface Sticker {
  id: string
  name: string
  /** Relativa (/static/stickers/...). E o que vai em `stickerUrl` da mensagem. */
  url: string
}

export interface StickerPack {
  id: string
  name: string
  description: string | null
  coverUrl: string | null
  createdAt: string
  stickers: Sticker[]
}

export const emojisApi = {
  async list(token: string): Promise<CustomEmoji[]> {
    const res = await request<{ emojis: CustomEmoji[] }>('/emojis', { token })
    return res.emojis
  },

  async create(token: string, file: File, name: string): Promise<CustomEmoji> {
    const form = new FormData()
    form.append('file', file)
    form.append('name', name)
    const res = await upload<{ emoji: CustomEmoji }>('/emojis', form, token)
    return res.emoji
  },

  async rename(token: string, id: string, name: string): Promise<CustomEmoji> {
    const res = await request<{ emoji: CustomEmoji }>(`/emojis/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ name })
    })
    return res.emoji
  },

  async remove(token: string, id: string): Promise<void> {
    await request<{ message: string }>(`/emojis/${id}`, { method: 'DELETE', token })
  }
}

export const stickersApi = {
  async list(token: string): Promise<StickerPack[]> {
    const res = await request<{ packs: StickerPack[] }>('/stickers', { token })
    return res.packs
  },

  async createPack(token: string, name: string, description?: string): Promise<StickerPack> {
    const res = await request<{ pack: StickerPack }>('/stickers', {
      method: 'POST',
      token,
      body: JSON.stringify({ name, description })
    })
    return res.pack
  },

  async uploadSticker(token: string, packId: string, file: File, name: string): Promise<Sticker> {
    const form = new FormData()
    form.append('file', file)
    form.append('name', name)
    const res = await upload<{ sticker: Sticker }>(`/stickers/${packId}`, form, token)
    return res.sticker
  },

  /** Admin. */
  async removeSticker(token: string, id: string): Promise<void> {
    await request<{ message: string }>(`/stickers/sticker/${id}`, { method: 'DELETE', token })
  },

  /** Admin. Leva os stickers do pack junto. */
  async removePack(token: string, packId: string): Promise<void> {
    await request<{ message: string }>(`/stickers/${packId}`, { method: 'DELETE', token })
  }
}
