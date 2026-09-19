import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { LolWindowMode } from '../../preload/types.js'

/**
 * EM QUE MODO DE VIDEO O LEAGUE ESTA — e por que isso e problema nosso.
 *
 * A sobreposicao e uma janela por cima do jogo. Isso funciona quando o jogo
 * deixa o Windows compor a tela ("Sem bordas"); NAO funciona quando o jogo
 * toma conta da saida de video sozinho ("Tela cheia"). Nao e limitacao do
 * nosso codigo: em tela cheia exclusiva nada aparece por cima — nem Discord,
 * nem Overwolf. A da propria Riot aparece porque quem desenha ela e o jogo.
 *
 * O QUE ISSO CUSTOU, e por que este arquivo existe: com o League em tela
 * cheia, a sobreposicao ABRIA (janela criada, visivel, no topo, desenhando os
 * pixels certos — tudo conferido) e simplesmente nao aparecia. Da tela do
 * launcher, isso e indistinguivel de "a sobreposicao esta quebrada". Uma tarde
 * inteira de conserto foi gasta procurando um defeito que nao existia, porque
 * o app sabia da limitacao e nao dizia nada.
 *
 * Entao agora ele le a configuracao do jogo e conta. O conserto de verdade
 * nao era codigo de sobreposicao: era parar de falhar calado.
 *
 * ## Onde mora
 *
 * `<instalacao>/Config/game.cfg`, um INI simples. A chave e `WindowMode`:
 *
 *   0 = Tela cheia (exclusiva)  -> a sobreposicao nao aparece
 *   1 = Sem bordas              -> aparece
 *   2 = Em janela               -> aparece (quando o jogo nao esta por cima)
 *
 * Valor desconhecido ou arquivo ausente devolve `null`: e melhor nao dizer
 * nada do que acusar errado. Quem nunca abriu as opcoes de video pode nao ter
 * o arquivo ainda.
 */

const MODOS: Record<string, LolWindowMode> = {
  '0': 'fullscreen',
  '1': 'borderless',
  '2': 'windowed'
}

/**
 * Candidatos a `game.cfg`.
 *
 * O primeiro vem do lockfile, que e o caminho que a descoberta ja achou e o
 * unico que vale pra quem instalou fora do padrao. Os outros sao os mesmos
 * palpites de `lol-discovery`, pra o aviso funcionar mesmo com o cliente
 * fechado (que e quando a pessoa vai ler as configuracoes).
 */
function candidatos(lockfilePath?: string): string[] {
  const lista: string[] = []

  if (lockfilePath) {
    const base = path.basename(lockfilePath).toLowerCase() === 'lockfile'
      ? path.dirname(lockfilePath)
      : lockfilePath
    lista.push(path.join(base, 'Config', 'game.cfg'))
  }

  lista.push('C:\\Riot Games\\League of Legends\\Config\\game.cfg')
  lista.push('D:\\Riot Games\\League of Legends\\Config\\game.cfg')

  const programFiles = process.env['ProgramFiles(x86)'] ?? process.env['ProgramFiles']
  if (programFiles) {
    lista.push(path.join(programFiles, 'Riot Games', 'League of Legends', 'Config', 'game.cfg'))
  }

  return lista
}

/**
 * Le o modo de video. `null` = nao deu pra saber (e nao se inventa aviso).
 *
 * O arquivo e pequeno e so e lido quando alguem pergunta, entao nao ha cache:
 * a pessoa pode trocar o modo no meio da partida — que e exatamente o que a
 * gente vai pedir pra ela fazer — e o aviso precisa sumir na leitura seguinte.
 */
export async function readLolWindowMode(lockfilePath?: string): Promise<LolWindowMode | null> {
  for (const arquivo of candidatos(lockfilePath)) {
    let texto: string
    try {
      texto = await fs.readFile(arquivo, 'utf8')
    } catch {
      continue
    }

    // `WindowMode=0`, com espaco ou sem, em qualquer secao do INI.
    const achado = /^\s*WindowMode\s*=\s*(\d+)\s*$/im.exec(texto)
    if (!achado) continue

    return MODOS[achado[1]] ?? null
  }

  return null
}
