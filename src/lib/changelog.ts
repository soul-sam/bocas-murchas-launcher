/**
 * NOVIDADES DE CADA VERSÃO — o que a galera vê depois que o launcher se
 * atualiza sozinho.
 *
 * ## Por que aqui e não no GitHub
 *
 * O `electron-updater` traz `releaseNotes` no evento `update-available`, e por
 * um tempo a ideia era usar aquilo. Não serve: o aviso chega ANTES de
 * atualizar, e a `quitAndInstall` reinicia o app — quando a pessoa volta, o
 * estado do updater não existe mais e as notas se foram. Pior: quem deixa o
 * launcher na bandeja é atualizado com a janela escondida
 * (`services/updater.ts`), então ninguém estava lá pra ler.
 *
 * Notas embutidas no bundle resolvem os dois: a versão nova JÁ CHEGA sabendo o
 * que ela mesma mudou, e o aviso aparece na primeira vez que a pessoa olha a
 * janela — sem rede, sem esperar o GitHub, funcionando com a internet caída.
 *
 * ## Como escrever
 *
 * Uma entrada por versão publicada, mais nova primeiro, `version` batendo
 * EXATAMENTE com o `package.json` (é assim que a comparação acha a entrada).
 * O texto é pra galera, não pra dev: "a impressora agora só aparece pra quem
 * rachou" e não "gate de permissão por cargo no AppRail". Quem quer o commit
 * sabe onde procurar.
 *
 * Uma versão sem entrada aqui não mostra nada — e é o comportamento certo pra
 * correção de bug que não muda nada na tela.
 */

export interface ChangelogEntry {
  version: string
  /** Chamada curta. Aparece grande, embaixo do "Atualizado". */
  headline: string
  /** Uma linha por novidade. Sem markdown: a tela desenha a lista. */
  items: string[]
  /**
   * Recado que não é novidade nem correção — uma mudança de comportamento que
   * vale explicar antes que alguém ache que quebrou.
   */
  note?: string
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: '1.4.0',
    headline: 'Música na call — e ela não para quando você vai jogar',
    items: [
      'Pedir música: o botão do disquinho na call, ou /tocar no chat. Toca pra todo mundo no mesmo segundo, igual ao assistir junto — só que sem vídeo na tela e sem sumir quando você troca pra aba do Minecraft. É esse o ponto: dá pra jogar com a música rolando.',
      'Barra de pesquisa de verdade: você digita o nome da música e ela aparece com capa, artista e duração enquanto você escreve. Colar link do YouTube continua funcionando pra quando você já sabe qual é o vídeo.',
      'A música abaixa sozinha quando alguém fala e volta quando a call cala. É o que faz dar pra ouvir som sem ninguém precisar gritar por cima. Dá pra desligar (ou escolher quanto ela abaixa) em Configurações → Zoeira.',
      'O volume é SEU. Cada um ouve no nível que quiser, e mutar a música não muta pra mais ninguém — coisa que bot de Discord não faz, porque lá é um áudio mixado só pra todo mundo.',
      'A fila é em rodízio: se você jogar cinco músicas de uma vez e outra pessoa pedir uma, a dela toca antes da sua segunda. Ninguém mais sequestra a noite com a própria playlist.',
      'Vincular o Spotify (na aba "Minhas playlists") traz as SUAS playlists e curtidas pra dentro da fila. Quem toca continua sendo o YouTube — o Spotify não deixa a call inteira ouvir a mesma faixa —, então ele entra só como catálogo. Não pedimos permissão pra mexer em nada na sua conta.'
    ],
    note: 'A call toca uma coisa de cada vez: botar um vídeo no assistir junto para a música, e vice-versa. Música que o grupo já tocou antes entra na hora; a primeira vez de cada música demora um instante porque o launcher vai procurar o vídeo.'
  },
  {
    version: '1.3.0',
    headline: 'Sinal de fumaça, clipes da call e murcho que sai pro bolso dos outros',
    items: [
      'Sinal de fumaça: um clique avisa que você entra daqui a 15, 30, 60 ou 120 minutos. Quem quiser diz "eu também" e entra na MESMA fumaça — na hora marcada todo mundo é chamado, inclusive no celular de quem já tinha fechado o launcher. Aparecer dentro da janela paga 25 murchos e 30 XP; prometer não paga nada.',
      '"Me avisa quando encher", em Configurações → Chat: você escolhe quantas pessoas na call fazem valer a pena, e o launcher te chama quando chegar lá. Com ele fechado, o aviso vai pro celular. Não dispara se você já estiver numa call, e no máximo uma vez a cada duas horas — tem um "hoje não" do lado.',
      'Clipe da call com Ctrl+Shift+C: salva os últimos ~30 segundos e pergunta se você quer guardar. O launcher segura esse pedaço em memória o tempo todo enquanto você está na call, mas NADA sai da sua máquina antes de você apertar. Os clipes viram card no chat e ficam no painel de Clipes, no topo da conversa.',
      'O clipe mais reagido da semana leva 200 murchos no recap de domingo — dez vezes o que os outros prêmios pagam, porque é o único que ninguém ganha por acidente.',
      'Gorjeta: o botão de moeda no canto da mensagem manda 10, 50 ou 200 murchos SEUS pra quem escreveu. Uma por pessoa por mensagem, e aparece um chip embaixo com o total e quem deu. Reação diz "vi"; gorjeta diz "isso valeu alguma coisa".',
      'Som pago: quem subiu um som pode botar preço nele (no ⋯ do tile), e metade do que for cobrado volta pro dono. Repetir o mesmo som em poucos minutos vai ficando mais caro — o freio do soundboard deixou de ser "você não pode" e virou "quanto você quer gastar".',
      'Recap do dia, às 23h: quantas mensagens, quanto de call, quantas partidas, quem foi a boca do dia — e a fileira de quem apareceu.',
      '"Naquele dia": de vez em quando o launcher desenterra o que o grupo estava fazendo nesta mesma data meses atrás, com a mensagem que a galera mais reagiu na época.',
      'Retrospectiva Murcha: o seu ano em slides, no botão do ano dentro do Ranking. Horas de call, com quem você mais ficou, sua melhor partida, o som que você mais tocou, o que você disse de melhor — e no fim os números do grupo inteiro. Já dá pra espiar a prévia de 2026.'
    ],
    note: 'O soundboard continua de graça: som só custa se alguém tiver posto preço nele, e o preço aparece no canto do botão antes do clique. Sobre os clipes: o buffer só existe enquanto você está numa call, some quando ela acaba, e dá pra desligar em Configurações → Zoeira.'
  },
  {
    version: '1.2.3',
    headline: 'Subir de nível agora paga murchos',
    items: [
      'Cada nível novo cai em murchos na sua conta, e quanto mais alto o nível, mais ele paga. Do nível 2 ao 30 são 50.000 murchos no total.',
      'Quem já tinha nível não ficou pra trás: todo mundo recebeu de uma vez o que os níveis já conquistados valem.',
      'O aviso de subir de nível agora diz quanto você ganhou.',
      'Botão "?" do lado do seu saldo na Lojinha: mostra tudo que rende murcho — check-in, tempo em call, partida, xadrez, aposta, missão e o prêmio do recap — e quanto vale a sua próxima subida de nível.'
    ],
    note: 'Nível continua vindo só de XP; nada aqui muda como você ganha XP.'
  },
  {
    version: '1.2.2',
    headline: 'O anel de quem está falando agora acende na hora',
    items: [
      'Quem está falando acende na primeira sílaba, e acende pra todo mundo que estiver falando ao mesmo tempo. Antes quem decidia isso era o servidor, com meio segundo de atraso — e quem falava baixo, ou era o terceiro a falar, às vezes não acendia nunca.',
      'O anel agora também aparece em volta do avatar na lista da call, na barra lateral. Ali ele simplesmente não existia.',
      '"Volto logo!" muta seu microfone e o som da call quando você clica, e devolve os dois como estavam quando você volta. Se você já estava mudo antes de sair, continua mudo.'
    ],
    note: 'O AFK automático (aquele por tempo parado) não mexe no seu áudio — só o botão. Quem fica dez minutos assistindo a uma tela compartilhada não pode levar um mute do nada.'
  },
  {
    version: '1.2.0',
    headline: 'Volto logo, caixa de sugestões e o som do compartilhamento arrumado',
    items: [
      'Botão "Volto logo!" do lado do microfone: avisa a galera que você saiu e desliga as cutucadas até você voltar. Ele se marca sozinho depois de 10 minutos longe do teclado e se desmarca quando você mexe na janela — dá pra mudar o tempo em Configurações → Chat.',
      'Quem está fora aparece com o recado do lado do nome, inclusive na lista de quem está na call. Cutucar quem saiu não funciona mais, e o menu diz isso antes do clique.',
      'Canal #sugestoes: peça o que falta ou avise o que quebrou, e a galera vota. O que tem mais voto fica no topo do quadro. Também dá pelo /sugestao, de qualquer canal.',
      'Compartilhar tela com som: o Launcher fica mudo enquanto isso, então os avisos daqui e o soundboard param de voltar pra call com atraso. As vozes ainda vão junto — não tem como tirar, e agora está escrito na tela de compartilhar.',
      'O som que você compartilha agora vai em estéreo e sem os filtros de voz que o Windows metia no meio. Jogo e música chegam do jeito que saem.',
      'Passar o mouse em badge, cargo, título, pacote de sticker ou botão de ícone agora mostra uma dica nossa, com a descrição inteira e o atalho de teclado — no lugar daquela caixinha branca do Windows.',
      'O que já estava salvo no seletor de tela (som, qualidade) não é mais perguntado do zero toda vez.'
    ],
    note: 'Quem pediu menos animação no Windows agora é atendido também nos menus e nas janelas — antes só o fundo e os brilhos obedeciam.'
  },
  {
    version: '1.1.1',
    headline: 'Roxo Murcho pra todo mundo',
    items: [
      'O tema padrão agora é o Roxo Murcho. Quem preferir o preto de antes: Configurações → Início → Tema → Grafite.'
    ],
    note: 'Efeito de nome, título, moldura ou emoji que estava equipado sem ter sido comprado na Lojinha foi tirado.'
  },
  {
    version: '1.1.0',
    headline: 'Menos neon, mais leitura — e cinco temas',
    items: [
      'Cinco temas em Configurações → Início: Grafite (o de sempre, sem a grade verde de fundo), Meia-Noite, Roxo Murcho e dois claros, Papel Murcho e Ácido Claro.',
      'Texto maior em todo lugar: nada abaixo de 11px. Rótulos em CAIXA ALTA ESPAÇADA viraram texto normal; a fonte de código ficou só pra número, versão e atalho.',
      'O verde saiu de onde não precisava: ícone, borda, hover, texto de apoio. Ficou no botão principal, no que está selecionado e no seu nome se você comprou a cor.',
      'Lojinha: preço em destaque no card, raridade com ícone (○ ◆ ✦ ★) e cores novas que dá pra ler — épico deixou de ser aquele roxo apagado.',
      'Lojinha → Cores: a cor do seu nome agora é um item da loja, 17 cores de comum a lendário. O verde-ácido é épico.',
      'Editar perfil → Aparência ficou só com foto e capa. Título, efeito, moldura e cor: tudo se escolhe na Lojinha, no botão Equipar.',
      'Efeitos de nome (brilho, arco-íris, fogo, glitch) param de se mexer na lista de membros e no chat; continuam animados no perfil, na loja e na call.',
      'Jogar subiu pro topo da tela do Minecraft; o que falta configurar vem embaixo.',
      'Gaveta de canais em janela estreita: Esc fecha, Tab não escapa pro chat.'
    ],
    note:
      'Preços da lojinha mudaram: agora é só pela raridade — 500, 2.000, 5.000 e 10.000 murchos — igual pra tudo. Quem já tinha comprado qualquer coisa recebeu de volta TUDO que gastou e ficou com os itens. A cor antiga do seu nome saiu junto; escolhe uma nova na Lojinha.'
  },
  {
    version: '1.0.0',
    headline: 'Cargos, e a impressora de quem rachou',
    items: [
      'Cargos: crachá com nome, cor e ícone, que o admin dá pra quem quiser. Aparece no seu perfil e do lado do seu nome na lista.',
      'A aba da impressora 3D agora só aparece pra quem tem o cargo "Impressora Murcha" — quem entrou no rateio da Kobra.',
      'Chamar um cargo no chat: escreve @ e o cargo aparece na lista, junto com as pessoas. "@impressora-murcha a mesa tá suja" cutuca todo mundo que tem o cargo.',
      'Painel do admin ganhou duas abas: Cargos (criar e distribuir) e Impressora (cota de horas, prioridade na fila, auto-start).',
      'Esta tela: quando o launcher se atualizar sozinho, ele passa a te contar o que mudou.'
    ],
    note: 'Se a aba da impressora sumiu pra você e você rachou a máquina, fala com um admin — é só ele te dar o cargo.'
  }
]

/** A entrada de uma versão, ou null se essa versão não trouxe nada visível. */
export function changelogFor(version: string | null | undefined): ChangelogEntry | null {
  if (!version) return null
  return CHANGELOG.find((entry) => entry.version === version) ?? null
}

/**
 * Deve mostrar as novidades?
 *
 * Só quando a versão instalada mudou desde a última vez que a pessoa viu, E
 * essa versão tem entrada escrita.
 *
 * O caso que decide o desenho é a **primeira abertura depois de instalar do
 * zero**: ali `lastSeen` é null, e o certo é NÃO mostrar. Quem acabou de
 * instalar não tem "novidade" — tem o app inteiro pela frente, e abrir um
 * "olha o que mudou na 1.0.0" como primeira tela é conversa sobre um passado
 * que a pessoa não viveu. Então null carimba a versão atual em silêncio, e a
 * pessoa passa a receber avisos da PRÓXIMA pra frente.
 */
export function shouldShowChangelog(
  current: string | null | undefined,
  lastSeen: string | null | undefined
): boolean {
  if (!current) return false
  if (!lastSeen) return false
  if (lastSeen === current) return false
  return changelogFor(current) !== null
}
