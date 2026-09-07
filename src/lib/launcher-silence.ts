/**
 * "O LAUNCHER ESTÁ MUDO" — o interruptor que tira o som do próprio app do
 * compartilhamento de tela.
 *
 * ------------------------------------------------------------------
 * POR QUE ISSO EXISTE (e por que não é um filtro na captura)
 * ------------------------------------------------------------------
 * Levar "o som do sistema" no compartilhamento de tela usa o loopback do
 * Windows (`audio: 'loopback'` em electron/main/services/screen-share.ts).
 * Loopback é a MISTURA FINAL da placa de som: tudo que sai pelo fone, veio de
 * onde vier. Inclusive o que o próprio launcher está tocando.
 *
 * Isso foi MEDIDO nesta máquina, não deduzido: um tom de 1 kHz tocado pelo
 * renderer aparece na faixa capturada a −28 dB, 69 dB acima do piso de ruído.
 * Ou seja: sem fazer nada, quem compartilha a tela com som devolve pra call
 * as vozes da call, os sons do soundboard e cada aviso da interface.
 *
 * Três saídas foram testadas e NENHUMA funciona no Electron 33 (Chromium 130):
 *
 *  1. `loopbackWithoutChrome` — o device id do Chromium que captura o sistema
 *     EXCLUINDO o próprio processo. É exatamente o que a gente queria, e é o
 *     que o Chrome usa pra não ecoar ao compartilhar aba. A string não existe
 *     em nenhum binário do Electron 33 (conferido com grep no electron.exe e
 *     nas dlls); o `Streams.audio` do Electron só aceita 'loopback' e
 *     'loopbackWithMute'.
 *  2. `echoCancellation: true` na captura — o AEC do Chromium cancelaria o
 *     que o próprio Chromium toca. A faixa RESPONDE que está ligado
 *     (`getSettings()` devolve `echoCancellation: true`) mas não faz nada: o
 *     tom continua a −28 dB, idêntico. É constraint aceita e ignorada.
 *  3. `loopbackWithMute` — captura o sistema e MUTA a saída local. Tira o eco
 *     tirando o som de quem compartilha: não serve.
 *
 * A saída completa seria captura por processo do Windows
 * (`AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK` com exclusão da árvore do
 * nosso processo), que é addon nativo — outra empreitada.
 *
 * ------------------------------------------------------------------
 * O QUE DÁ PRA FAZER, ENTÃO
 * ------------------------------------------------------------------
 * Não colocar o som na mistura, em vez de tentar tirá-lo depois. Enquanto o
 * som do sistema está no ar, o launcher fica mudo do que é DELE:
 *
 *  - avisos da interface (entrar, sair, mutar, mensagem, XP…) — ninguém
 *    precisa ouvir o ping do launcher de quem compartilha;
 *  - soundboard — todo mundo na call já recebe o som pelo socket e toca no
 *    próprio launcher, então o que voltava pelo loopback era só a segunda
 *    cópia, atrasada;
 *  - a cutucada.
 *
 * O que NÃO dá: as vozes da call. Quem compartilha precisa continuar ouvindo
 * a conversa, e a única saída de áudio dele é a mesma que o loopback captura.
 * Isso está escrito no seletor de tela em vez de escondido aqui.
 */

let silenced = false

/**
 * Liga/desliga o silêncio. Chamado pelo voice-context ao começar e ao parar
 * de compartilhar — e no `finally` de um erro, pra não deixar o launcher mudo
 * porque a transmissão falhou no meio.
 */
export function setLauncherSilenced(value: boolean): void {
  silenced = value
}

/**
 * Consultado NO MOMENTO DE TOCAR, não guardado em estado de React: quem toca
 * som aqui é módulo solto (ui-sounds) e handler de socket (soundboard), e os
 * dois rodam fora de qualquer render.
 */
export function isLauncherSilenced(): boolean {
  return silenced
}
