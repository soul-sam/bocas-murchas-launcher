import { request, type ChatMessage } from './api'

/**
 * O Bocas Bot (API em src/routes/bot.routes.ts).
 *
 * Conversar com ele NÃO passa por aqui: é mensagem comum com @bocasbot (ou DM
 * com a conta dele), e o servidor decide responder. Aqui fica só o que é do
 * admin — falar pela boca do bot.
 */

export interface BotStatus {
  bot: { id: string; username: string; displayName: string; avatar: string | null } | null
  /** A IA está ligada no servidor (tem chave)? Sem ela, só comandos de bolso. */
  ai: boolean
}

export const bot = {
  status(token: string): Promise<BotStatus> {
    return request<BotStatus>('/bot', { token })
  },

  /** Publica no canal de avisos (ou no `channelId`) como o bot. */
  announce(
    token: string,
    input: { content: string; channelId?: string; mentionEveryone?: boolean }
  ): Promise<{ message: ChatMessage }> {
    return request<{ message: ChatMessage }>('/bot/announce', {
      method: 'POST',
      token,
      body: JSON.stringify(input)
    })
  },

  /** Reescreve na voz do bot, sem publicar — o admin revisa antes. */
  polish(token: string, content: string): Promise<{ content: string }> {
    return request<{ content: string }>('/bot/polish', {
      method: 'POST',
      token,
      body: JSON.stringify({ content })
    })
  }
}
