/**
 * Emoji do lado do nome é item da Lojinha; no nome de exibição não entra.
 * Mesma regra da API (`bocas-murchas-api/src/lib/display-name.ts`), que é
 * quem manda — aqui é só pra avisar antes de salvar.
 */
const EMOJI_RE = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{20E3}\u{200D}]/u

export function hasEmoji(text: string): boolean {
  return EMOJI_RE.test(text)
}
