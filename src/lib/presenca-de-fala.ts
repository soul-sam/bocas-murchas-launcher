/**
 * A ÚLTIMA VEZ QUE VOCÊ DEU SINAL DE VIDA — falando, escrevendo ou voltando.
 *
 * Existe por causa do "Volto logo!" automático (ver lib/afk-context.tsx).
 * O ocioso do SISTEMA responde "a pessoa saiu do computador?", e é uma
 * pergunta boa — mas não é a que o grupo faz. Quem está jogando com o
 * launcher aberto atrás nunca fica ocioso pro Windows, e mesmo assim pode
 * passar três horas sem responder ninguém. Pra quem chama, "online" e "não
 * responde" é pior do que "ausente": a pessoa fica esperando.
 *
 * Então o outro relógio é este: quanto tempo faz desde a última mensagem sua
 * no chat ou desde a última vez que o seu microfone abriu na call.
 *
 * ## POR QUE UM MÓDULO SOLTO, E NÃO UM CONTEXTO DO REACT
 *
 * Dois motivos, e os dois doem se ignorados:
 *
 *  - Quem MARCA é o chat (ao enviar) e quem LÊ é o AFK. Fazer isso por
 *    contexto amarraria a ordem dos providers em App.tsx — e amarrar ordem de
 *    provider por causa de um carimbo de tempo é criar um jeito novo de a tela
 *    ficar branca.
 *  - Isto muda a cada mensagem enviada. Como estado do React, redesenharia a
 *    árvore inteira toda vez, pra nada: ninguém DESENHA este número, ele é
 *    consultado de 30 em 30 segundos por um timer.
 *
 * É o mesmo desenho do `ultimoToque` da ponte web (lib/bridge-web.ts).
 */

/**
 * Começa agora, e não em zero: abrir o launcher é chegar. Zero diria que você
 * está calado desde 1970 e o automático marcaria "ausente" no primeiro tique
 * de quem acabou de entrar.
 */
let ultimoSinal = Date.now()

/** Você falou: mandou mensagem no chat ou abriu o microfone na call. */
export function marcarFala(): void {
  ultimoSinal = Date.now()
}

/**
 * Você voltou (o "Volto logo!" saiu).
 *
 * Empurra o MESMO relógio da fala, de propósito: sem isto, quem volta e mexe
 * no launcher sem dizer nada sairia do ausente e o tique seguinte — trinta
 * segundos depois, com o silêncio ainda estourado — o marcaria de novo. O
 * crachá ficaria piscando.
 */
export function marcarVolta(): void {
  ultimoSinal = Date.now()
}

/** Há quanto tempo você não dá sinal, em milissegundos. */
export function silencioMs(): number {
  return Date.now() - ultimoSinal
}
