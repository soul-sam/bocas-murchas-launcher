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
    version: '1.56.1',
    headline: 'Peças clássicas no xadrez',
    items: [
      'O xadrez trocou de peças: o conjunto clássico, brancas e pretas de contorno firme, que lê bem em qualquer cor de tabuleiro.'
    ]
  },
  {
    version: '1.56.0',
    headline: 'Peças novas e tabuleiro de madeira',
    items: [
      'As peças de xadrez ganharam o desenho do chess.com: brancas brancas, pretas em chumbo, base em dois degraus.',
      'Em Configurações › Tabuleiro dá pra escolher a cor das casas: a do tema ou a madeira clássica (bege e marrom).',
      'Pré-lance de recaptura: dá pra marcar um lance em cima de uma peça sua. Se o outro tomar ali, você toma de volta na hora; se não tomar, o pré-lance cai.',
      'Na dama, comer ganhou animação: a pedra pula casa por casa e cada peça comida some na hora em que ela passa por cima.'
    ],
    note: 'Pra recapturar, arraste a peça até a sua peça (clicar nela só troca a peça escolhida, como no chess.com).'
  },
  {
    version: '1.55.0',
    headline: 'Xadrez com a mecânica do chess.com',
    items: [
      'Pré-lance: na vez do outro, já faça o seu lance (ou vários seguidos). Ele sai sozinho no instante em que a vez volta, e o botão direito cancela.',
      'Arraste a peça: ela segue o mouse e a casa embaixo ganha um contorno. Clicar na peça e no destino continua valendo.',
      'O seu lance aparece na hora, sem esperar o servidor responder.',
      'Botão direito marca casas e desenha setas (em L no cavalo). Shift e Ctrl trocam a cor; um clique limpa.',
      'Lista de lances com as figuras das peças. Clique num lance ou use as setas do teclado pra rever a partida; F vira o tabuleiro.',
      'Rei em xeque fica vermelho, a promoção ganhou o × pra desistir, e cada lance tem o seu som: captura, roque, xeque e promoção.',
      'Revanche direto da tela do fim da partida.'
    ],
    note: 'O pré-lance vale no xadrez. Na dama, o arrasto e o lance na hora já valem; o pré-lance ainda não.'
  },
  {
    version: '1.54.0',
    headline: 'O xadrez ganhou mesa de verdade',
    items: [
      'Tabuleiro novo: moldura com as coordenadas gravadas, casas na cor do seu tema e peças redesenhadas.',
      'A peça desliza até a casa a cada lance, com o toque da madeira — e um estalo na captura.',
      'Placa de cada jogador com avatar, relógio grande, as peças capturadas e a vantagem de material.',
      'Fim de partida com a faixa do resultado sobre o tabuleiro: quem venceu, por quê, murchos, XP e precisão.',
      'Esperar adversário e a contagem pra começar acontecem sobre a mesa posta, não numa tela vazia.',
      'A dama ganhou o mesmo visual.'
    ]
  },
  {
    version: '1.53.2',
    headline: 'Bolinha de status sempre na mesma cor',
    items: [
      'Online, ausente e não perturbe agora são verde, amarelo e vermelho em todos os temas. Antes a bolinha pegava a cor do tema, e em alguns dava pra confundir online com ausente.'
    ]
  },
  {
    version: '1.53.0',
    headline: 'Tela do LoL: quem está jogando',
    items: [
      'A tela do LoL no Salão de jogos agora mostra quem está em partida, há quanto tempo, e se ainda dá pra apostar.',
      'Embaixo aparece quem está com o LoL aberto, com o mesmo status da Riot: online, ausente ou ocupado.',
      'Botão Jogar: abre o League of Legends direto do launcher.',
      'As estatísticas do grupo continuam no canal de LoL do chat.',
      'O Pôquer saiu da barra lateral e fica só no Salão de jogos.'
    ],
    note: 'O status só aparece pra quem está com o launcher aberto e a leitura do LoL ligada nas configurações.'
  },
  {
    version: '1.52.0',
    headline: 'Salão de jogos, com xadrez e dama',
    items: [
      'O ícone do Minecraft na barra virou o Salão de jogos: um card por jogo, com quantos estão nele agora e o botão Entrar. Minecraft, Pôquer e LoL continuam onde estavam, atrás dos cards.',
      'O painel do LoL ganhou tela própria. O do canal de chat continua lá.',
      'Xadrez e dama (brasileira ou americana), um contra o outro, dentro do launcher. Relógios: 1+0, 1+1, 3+0, 3+2, 5+0 e 10+0.',
      'Dá pra jogar valendo murchos: quem cria escolhe o valor, os dois põem igual e quem vence leva o dobro. Empate devolve.',
      'Botão Convidar: você escolhe a pessoa, o relógio e o valor, e ela aceita já sabendo de tudo.',
      'Quem assiste pode apostar em quem ganha, só antes de a partida começar. Com aposta nos dois lados, quem acerta divide o bolo. Sem ninguém do outro lado, acertar paga o dobro.',
      'Cada partida dá XP pela mesma tabela do Chess.com: vitória vale o dobro, empate vale como derrota.',
      'No fim sai um card no chat com o resultado. No xadrez ele mostra também a precisão de cada um e um rating estimado da partida.'
    ],
    note: 'Com os dois sentados, a partida começa quando ambos marcam Pronto, ou sozinha em 1 minuto. O primeiro lance tem 30 segundos: se não sair, a partida é cancelada e todo mundo recebe de volta.'
  },
  {
    version: '1.51.1',
    headline: 'Moldura na call só quando fala',
    items: [
      'Na call a moldura aparece só enquanto a pessoa fala, e numa foto só (sem moldura dobrada no card).',
      'O fogo da Lenda Murcha agora anda também no card grande da call.',
      'Quem está num canal de voz aparece na barra lateral com a cor e o efeito do nome.',
      'As conversas na coluna de ícones ficaram sem moldura.'
    ]
  },
  {
    version: '1.51.0',
    headline: 'Dois emojis no nome',
    items: [
      'Novo na Lojinha: "Segundo Emoji" (5.000 murchos), na aba Emojis. Com ele seu nome fica "Nome 😀 🎉".',
      'Quem tem o segundo slot escolhe "Slot 1" ou "Slot 2" em cada emoji, na Lojinha ou no editor de perfil.',
      'Emojis novos por 500: 🥭 🫴 🫳 🎉 🐶 🐴.',
      'Cores novas: Verde Murcho (épica, o verde do fone do ícone) e Marrom (comum).',
      'O Vermelho Sangue virou Vermelho Murcho, o vermelho da boca do ícone. O Verde Ácido ficou mais claro e o Azul Elétrico mais escuro. Quem já usava continua usando, na cor nova.',
      'A Turquesa agora é comum (500). Quem pagou 5.000 recebeu a diferença de volta.',
      'Nos temas claros, nome colorido ganhou uma sombra escura em volta pra dar pra ler. A cor continua a mesma.'
    ],
    note: 'Emoji no nome de exibição não pode mais: emoji agora é só da Lojinha. Quem tinha emoji no nome ficou com o nome sem ele.'
  },
  {
    version: '1.50.0',
    headline: 'Conquistas de streak novas',
    items: [
      'O antigo "Mês Murcho" virou "Murcho logado" (rara): continua sendo 30 dias seguidos abrindo o launcher. Quem já tinha, continua com ela.',
      'Nova "Murcho em call" (épica): 30 dias seguidos entrando na call.',
      'Nova "Murcha à toa" (lendária): 180 dias seguidos entrando na call.',
      'Quem já tinha feito essas sequências em call ganha as conquistas novas na hora.',
      'A moldura Lenda Murcha ganhou o fogo animado do Rei dos Bocas, e a coroa voltou a ter contorno.',
      'O ranking de murchos agora é o lucro de verdade: aposta conta só o que você lucrou (pela odd), mão de pôquer perdida e aposta errada descontam, e sentar e levantar da mesa não conta mais como ganho. Compras não descontam.'
    ]
  },
  {
    version: '1.49.1',
    headline: 'Streak agora é de call',
    items: [
      'O streak conta dias seguidos entrando na call — abrir o launcher não vale mais.',
      'Passou um dia inteiro sem call, o streak zera e você sai do ranking da semana até voltar.',
      'No ranking "Desde sempre" aparece o recorde de cada um, que nunca zera.'
    ]
  },
  {
    version: '1.49.0',
    headline: 'Efeito e moldura na sua cor',
    items: [
      'O efeito do nome agora usa a cor que você comprou: fogo de quem é verde queima em tons de verde, gelo de quem é rosa congela em rosa.',
      'A moldura também: borda, brilho e até a coroa da Lenda Murcha saem na sua cor.',
      'Sem cor comprada, efeito e moldura são brancos.',
      'Cada moldura ganhou um desenho próprio — pixel com sombra dura, aço chanfrado, onda com dois anéis, tubo de neon… — pra dar pra diferenciar de olho em qualquer cor.'
    ],
    note: 'O Branco Gelo saiu da lojinha (branco agora é o padrão). Quem tinha comprado recebeu os murchos de volta.'
  },
  {
    version: '1.48.0',
    headline: 'A mesa de pôquer de verdade',
    items: [
      'A mesa ganhou trilho, feltro com a boca da marca bordada e um baralho no lugar do crupiê: as cartas saem dele, uma por pessoa, e as suas viram ao pousar — nada mais aparece do nada.',
      'As suas duas cartas agora ficam embaixo, grandes, em cima da sua placa com avatar, nome e pilha. O flop também cresceu.',
      'Cartas redesenhadas: índice nos dois cantos, figuras com moldura, ás com anel e verso com o medalhão da marca.',
      'Fichas de verdade na frente de cada lugar (a pilha cresce com a aposta), botão do dealer, placa com a jogada de cada um (CHECK, RAISE 250, ALL-IN) e relógio em volta do avatar de quem está na vez.',
      'No showdown as cartas dos outros viram na frente deles, a mão vencedora acende em dourado e o pote voa pra quem levou.',
      'Botões de ação grandes, sempre no mesmo lugar (apagados quando não é a sua vez), com os atalhos F, C, A e Enter à mostra.',
      'Um estalo de ficha quando alguém aposta.'
    ]
  },
  {
    version: '1.47.3',
    headline: 'Faxina de bugs: chat, call, pôquer e configurações',
    items: [
      'Caiu a internet ou o notebook dormiu? As mensagens que chegaram nesse meio-tempo agora aparecem quando a conexão volta — antes elas simplesmente sumiam.',
      'Depois de uma atualização do servidor, ninguém mais fica falando na call sem aparecer na barra lateral, nem com o chat parado.',
      'Abrir o site no celular não tira mais você da call do PC.',
      'Os botões de Reagir, o "+" do campo de mensagem e a gorjeta voltaram a abrir — só mostravam a dica.',
      'Salvar o perfil não apaga mais links, aniversário e jogos que você não tinha mexido.',
      'Abrir o launcher sem internet (ou com o servidor reiniciando) espera e entra sozinho, em vez de pedir a senha de novo.',
      'Na call: voltar a ouvir devolve o seu microfone, trocar de sala mantém o mudo, trocar o mic ou o fone vale na hora, e o soundboard não toca com você ensurdecido.',
      'Pôquer: levantar ou recarregar durante a virada das cartas no all-in não mexe mais nas fichas de ninguém, e o all-in curto segue a regra.',
      'Configurações: arrastar os controles não corrompe mais o arquivo, e com "fechar pra bandeja" desligado o X fecha o launcher de verdade.'
    ]
  },
  {
    version: '1.47.2',
    headline: 'Pôquer sem rake',
    items: [
      'A casa não tira mais nada do pote nas mesas de murchos: quem ganha a mão leva tudo. Antes, mão que via o flop deixava 2,5% no cofre.'
    ]
  },
  {
    version: '1.47.1',
    headline: 'Aposta até o seu teto, e a sobreposição de volta ao clique',
    items: [
      'A aposta passava de 999 de jeito nenhum — o campo não aceitava o quarto dígito. Agora vai até o seu teto, e tem o botão "máx" pra apostar tudo que dá.',
      'Na sobreposição, com teto alto, aparecem as fichas de 1000 e 2500.',
      'A sobreposição do jogo voltou a aceitar clique: o painel crescia e a parte nova deixava o clique passar direto pro jogo.',
      'Passar o mouse na sobreposição não minimiza mais o jogo.'
    ]
  },
  {
    version: '1.47.0',
    headline: 'Filamento: rolo cadastrado agora se edita',
    items: [
      'Errou a cor, o nome ou a marca de um rolo? No estoque de filamento tem o botão Editar: muda material, nome da cor, cor, marca e peso do rolo sem precisar tirar da lista e cadastrar de novo.'
    ]
  },
  {
    version: '1.46.0',
    headline: 'Pôquer: quebrou? Recarrega ali mesmo',
    items: [
      'Quando a pilha zera, a mesa avisa com estilo — carimbo, fichas caindo — e já oferece a recarga no mesmo lugar: quanto cabe no teto da mesa e no seu saldo, levantar, ou ficar só olhando.',
      'Na mesa valendo sem saldo no caixa, o aviso leva direto pro depósito por Pix; o caixa agora abre de dentro da mesa e volta pra ela.'
    ]
  },
  {
    version: '1.45.0',
    headline: 'Pôquer: um minuto pra jogar, e cartas que se mexem',
    items: [
      'O relógio de ação passou de 25 segundos pra 1 minuto na mesa normal (e de 12 pra 20 na turbo). Dá pra pensar — e pra terminar a frase na call.',
      'As cartas agora são dadas de verdade: saem do meio da mesa e pousam em cada lugar, uma pessoa de cada vez; as suas descem pro rodapé.',
      'Flop, turn e river chegam de costas e viram; no showdown as cartas dos outros viram do mesmo jeito.',
      'As fichas apostadas voam pro pote quando a rodada fecha, o pote voa pra quem levou, e as cartas de quem desistiu vão pro meio. Quem pediu menos movimento no sistema vê tudo parado, como antes.'
    ]
  },
  {
    version: '1.44.0',
    headline: 'O pôquer ganhou tela própria',
    items: [
      'O pôquer saiu da janelinha e virou uma tela inteira, como a do Minecraft: o ícone na barra da esquerda leva pra ela, com a luz do tema no fundo e a mesa ocupando tudo.',
      'Com uma mesa aberta o cabeçalho some: ficam o feltro, os assentos, as suas cartas e a barra de ação. O histórico da mão aparece ao lado já em janelas médias.',
      'A colinha abre numa gaveta ao lado da mesa, sem cobrir o jogo; no celular sobe de baixo e o botão Voltar fecha.',
      'Sair da tela não levanta da mesa: a barra avisa quando é a sua vez, e voltar cai direto nela.'
    ]
  },
  {
    version: '1.43.0',
    headline: 'Pôquer na Arena',
    items: [
      "Texas Hold'em sem limite, com murchos como fichas: abra uma mesa (2 a 6 lugares, blinds baixa, média ou alta), sente com um buy-in e jogue com a galera — o ícone novo fica na barra da esquerda, embaixo das apostas.",
      'Regras completinhas: botão, blinds, aumento mínimo, all-in que não reabre, potes laterais, aposta não paga devolvida, empate e ficha ímpar. Tudo o que o servidor faz está escrito na colinha.',
      'Colinha das combinações dentro da mesa: as dez mãos do royal flush à carta alta, com exemplo desenhado, como desempata e a chance de ter cada uma no river. A sua mão atual fica marcada.',
      'Relógio de 25 segundos por jogada (12 na mesa turbo): estourou, a mesa dá check ou desiste por você; duas vezes e você senta fora. Fechar a tela não levanta da mesa — a barra avisa quando é a sua vez.',
      'Mesa valendo dinheiro de verdade, só por diversão: até R$ 20 por pessoa por mesa, sem a casa tirar nada. Depósito e saque por Pix pelo caixa, com a taxa do Asaas mostrada antes de confirmar. Aparece só quando o servidor tem o caixa ligado.',
      'Abrir uma mesa posta um card no canal de jogos com quem está sentado; /poker e o Ctrl+K também abrem o saguão. Oito conquistas novas, do primeiro pote ao royal flush.'
    ],
    note: 'Mão que viu o flop deixa 2,5% do pote (até 3 big blinds) no cofre da casa — o mesmo pote das apostas. Na mesa valendo não há rake nenhum.'
  },
  {
    version: '1.42.0',
    headline: 'Ranking de apostas e conquistas de XP',
    items: [
      'Ranking de apostas no Recap: quem mais ganhou (e perdeu) murchos apostando, com aproveitamento de acertos — na semana que está na tela.',
      'Duas conquistas novas: Cem Mil (100.000 de XP) e Meio Milhão (500.000 de XP).',
      'Peça pronta na impressora agora dá 100 XP por hora impressa, e tirar da mesa a peça de outra pessoa passou a valer 30 XP.',
      'Sobreposição: o botão de minimizar encolhe o painel pra aba em vez de sumir com tudo, e clicar fora fecha o painel e a roda de sons sem roubar o clique do jogo.',
      'Nos temas claros a logo ganhou uma versão própria, que não some no fundo.',
      'No celular, a conta do grupo abre de baixo e o X de fechar voltou a ser alcançável.',
      'A bolinha de online/ausente atualiza na hora em todo lugar — lista de membros, conversas e rodapé — e quem volta do "Volto logo!" não fica mais cinza pra todo mundo.'
    ],
    note: 'A opção "Invisível" saiu do menu de status: ela nunca funcionou de verdade e só atrapalhava o "Voltei!".'
  },
  {
    version: '1.40.0',
    headline: 'Temas na Lojinha: o launcher inteiro na sua cor',
    items: [
      'Nove temas novos pra comprar com murchos, na aba Temas da Lojinha: Oceano, Brasa, Floresta, Vinho e Café com Leite (raros), Tóquio Neon, Ouro Negro e Lavanda (épicos) e o lendário Aurora Murcha — o único que se mexe.',
      'Passa o mouse num tema e o launcher inteiro veste ele na hora, antes de gastar. Tira o mouse e volta pro seu.',
      'Cada tema da Lojinha tem uma luz própria nos cantos da janela, além da paleta. Os cinco de graça continuam iguais.',
      'Os temas que você tem aparecem também na aba Estilo do perfil e nas Configurações, ao lado dos de graça. Os que faltam mostram um cadeado e abrem a Lojinha.',
      'Dá pra presentear tema como qualquer item. Comprar libera em todo lugar, mas o PC e o celular podem ficar em temas diferentes: a escolha é por máquina.'
    ]
  },
  {
    version: '1.39.0',
    headline: 'Apostar pela sobreposição: qualquer valor, sem teclado',
    items: [
      'O valor da aposta ganhou uma régua: arrasta até quanto quiser, de 10 em 10, entre o mínimo e o seu limite. Antes eram cinco fichas fixas — entre 100 e o teto só dava 250.',
      'Botões de − e + ao lado do valor (segurar acelera) e a roda do mouse em cima do número também ajustam.',
      'As fichas rápidas continuam (10, 50, 100, 250, 500), e a última é sempre o seu limite: o teto da aposta ou tudo que você tem.',
      'Antes de confirmar você vê quanto volta se acertar, o bônus de grupo e quanto falta pra janela fechar — a linha do botão esvazia junto com o tempo.',
      'Apostar na partida dos outros agora confirma num botão, em vez de disparar no toque da ficha. Os lados mostram pra onde a galera está indo.',
      'Partida fechando em menos de um minuto fica com o relógio em vermelho, e o cartão abre e fecha pelo próprio título.'
    ]
  },
  {
    version: '1.35.0',
    headline: 'O Ranking virou a Arena: cada coisa no seu lugar',
    items: [
      'Embaixo do troféu, na barra da esquerda, agora tem um ícone pra cada coisa: Ranking, Apostas, Conquistas, Lojinha e Recap. Antes era tudo atrás do troféu, num painel só.',
      'O troféu mostra seu nível, a sacola mostra seus murchos e o dado acende em vermelho com a contagem de partidas abertas pra apostar.',
      'Ranking de cara nova: pódio com os três primeiros, sua posição em destaque com a distância pra quem está na frente, e cada métrica com ícone e uma linha dizendo o que ela conta.',
      'Apostas em painel próprio: um card por partida (o 5-stack inteiro junto, não cinco cards), contagem regressiva da janela, seus murchos e o teto, o pote e o fundo de bônus da casa, e a regra explicada pra quem chegou agora.',
      'Recap da semana em painel próprio, com todas as premiações, a semana em números, as badges que saíram e as semanas anteriores. A retrospectiva do ano está logo embaixo.',
      'Ctrl+K e os comandos /ranking, /apostas e /recap levam direto pra cada um.'
    ],
    note: 'O troféu continua abrindo o Ranking. Lojinha, conquistas, recap e apostas saíram de dentro dele e ganharam ícone próprio logo abaixo. No celular, o troféu abre um menu com os cinco.'
  },
  {
    version: '1.33.1',
    headline: 'Apostar pela sobreposição voltou a funcionar',
    items: [
      'Quem joga com o launcher na bandeja via "O servidor ainda não registrou sua partida" a partida inteira. Agora a sobreposição acha sua partida e as dos outros normalmente.',
      'Abrir o painel da sobreposição já traz a pool e as partidas atualizadas.'
    ]
  },
  {
    version: '1.33.0',
    headline: 'A sobreposição agora fica sempre na tela — e avisa quem chegou',
    items: [
      'Fora de jogo, a logo do Bocas fica meio escondida na borda direita. Encostou o mouse, ela sai e o painel abre do lado; arrastando, ela sobe e desce.',
      'Na partida continua a aba fina de sempre, no lugar em que você deixou.',
      'Notificações por cima de tudo: quem entrou ou saiu da sua call, quem ficou online, quem começou partida (com aviso da aposta aberta) e as mensagens.',
      'O painel guarda as notificações de agora há pouco, pra quem estava com a cabeça no jogo.',
      'O botão de minimizar tira a sobreposição da tela; Ctrl+Shift+O traz de volta (a tecla se troca em Atalhos).'
    ],
    note: 'Com a sobreposição na tela, a mensagem aparece nela em vez do balão do Windows. Com o launcher aberto na frente, a logo se esconde.'
  },
  {
    version: '1.32.0',
    headline: 'Mercado de horas virou loja, e o histórico ganhou aba própria',
    items: [
      'O mercado de horas saiu da Fila e virou a aba "Mercado de horas", com cara de lojinha: carteira, estoque e um card por vendedor.',
      '"Já impresso" virou a aba "Histórico", agora com a lista inteira em vez das últimas 12 peças.',
      'Abas da impressora na nova ordem: Fila, Filamento, Mercado de horas, Encomendas, Mural, Manutenção, Histórico.'
    ]
  },
  {
    version: '1.31.0',
    headline: 'Peça longa e peça de madrugada: o operador decide',
    items: [
      'Peça acima de 10h não é mais recusada: entra na fila e espera um operador autorizar.',
      'Peça que passaria mais de 30 min das 22h também pede autorização; até 30 min sai normal, com aviso.',
      'Operador vê o pedido num aviso no meio da tela ao abrir o launcher: aceitar, programar pras 7h, recusar ou ver depois.',
      'Operador pode fixar peças no topo da fila: "passar na frente" ou arrastar pela alça.',
      'Peça programada pelo operador não pode ser adiantada pelo dono.'
    ],
    note: 'Ninguém autoriza nem sobe a própria peça — nem operador.'
  },
  {
    version: '1.30.0',
    headline: 'Horas de impressão: semana fixa, mercado e murchos por peça',
    items: [
      'A cota da impressora agora zera toda sexta às 18h, pra todo mundo junto.',
      'Cada hora de impressão concluída rende 50 murchos — inclusive as peças que você já imprimiu.',
      'Mercado de horas: quem não vai imprimir na semana anuncia as horas a preço livre em murchos, ou doa direto pra alguém.',
      'Comprou hora? Vale até sexta 18h. Quem vende continua podendo imprimir; o que ele usar sai do anúncio.',
      'O cartão "Minhas horas" mostra quando zera e quanto você recebeu ou cedeu na semana.'
    ],
    note: 'Hora comprada não volta em murchos se você não usar até o reset.'
  },
  {
    version: '1.29.0',
    headline: 'Conquistas: todas as badges e quem tem cada uma',
    items: [
      'Painel novo de conquistas, no botão "Conquistas" do Ranking (ou com /conquistas no chat): o catálogo inteiro de badges, com quantas pessoas do grupo têm cada uma.',
      'A raridade agora é medida no grupo: cada badge vale pontos pelo peso dela (comum 10, raro 20, épico 40, lendário 80) vezes o quanto ela é difícil de achar. Ninguém tem, vale o dobro. Badge que quase todo mundo já tem cai um degrau.',
      'Placar de colecionador: a soma dos pontos das suas badges, com o ranking do grupo inteiro.',
      'Barra de progresso nas badges de contagem: quantas mensagens faltam pro Tagarela, quantas peças pro Maker, e por aí vai. O filtro "Quase lá" mostra as que já passaram da metade.',
      'Cada badge mostra quem tem, na ordem em que ganhou, e marca quem foi o primeiro do grupo.',
      'Vitrine: escolha até 3 badges pra aparecer na frente do seu perfil.',
      'Clicar numa badge em qualquer perfil abre o painel direto nela.'
    ],
    note: 'Os ovos escondidos aparecem como "???" com a dica até você achar. Dá pra ver quantas pessoas já acharam cada um.'
  },
  {
    version: '1.28.2',
    headline: 'Apostas: teto sobe até 5000',
    items: [
      'O teto de aposta agora vai até 5000 murchos, e não mais 500.',
      'Ele continua começando em 50 e sobe cerca de 50 a cada aposta que você faz, chegando em 5000 na 100ª.'
    ]
  },
  {
    version: '1.28.1',
    headline: 'Filamento: troca direto no slot',
    items: [
      'Cada slot do ACE tem um botão "Trocar filamento": abre a lista de rolos separada por estoque geral e grupo, e um clique já marca o rolo no slot. O que estava lá volta pra prateleira sozinho.',
      'Quem não opera a impressora vê "Pedir troca" no slot, com ele já escolhido no pedido.',
      'O estoque agora fecha: fica numa barra com o total de rolos e gramas, e abre só quando precisa.',
      'Cadastrar rolo num grupo abre o formulário dentro do próprio grupo, e não mais lá no topo, fora da tela.'
    ]
  },
  {
    version: '1.28.0',
    headline: 'Filamento: rolo de grupo, pedido de troca e aviso na hora',
    items: [
      'Rolo que só parte da galera comprou agora tem dono: quem opera a impressora cria um grupo de filamento e diz quem faz parte. Peça de quem não é do grupo espera no slot desse rolo até alguém do grupo liberar.',
      'Precisa de outra cor na máquina? Na aba Filamento (ou direto na peça travada) dá pra pedir a troca: escolhe o rolo e o slot, e quem opera é avisado. Quando ele confirma, o rolo já fica marcado no lugar.',
      'Mandou uma peça e o filamento da máquina não é o que o arquivo pede? O aviso aparece na hora do envio, com a cor pedida e a cor carregada lado a lado, e os botões pra pedir troca, imprimir assim mesmo ou tirar da fila.',
      'Se a cor que a peça pede está em outro slot, a fila diz em qual.',
      'Notificação quando a sua peça trava por filamento e quando destrava. Quem é de um grupo também fica sabendo quando o rolo está acabando.',
      'A comparação de cor ficou mais parecida com o olho: azul escuro não passa mais por preto.'
    ],
    note: '"Tanto faz a cor" continua valendo pra cor e material, mas não abre rolo de grupo: esse só sai com a liberação de quem pagou por ele.'
  },
  {
    version: '1.26.2',
    headline: 'Câmera que não abria no notebook',
    items: [
      'Em alguns notebooks (Acer, principalmente) a câmera não ligava na call: o botão ficava uns dez segundos pensando e avisava que ela estava em uso por outro programa, sem ninguém usando. Agora abre normalmente.'
    ],
    note: 'Quem tinha escolhido uma câmera específica nas configurações pode precisar escolher de novo. Até lá, a call usa a câmera padrão do computador.'
  },
  {
    version: '1.26.1',
    headline: 'Fantasma na call',
    items: [
      'A lista da call na barra lateral não mostra mais quem já saiu da sala. Acontecia quando o launcher de alguém voltava sem estar na call (depois de travar e recarregar, por exemplo): a pessoa continuava aparecendo lá dentro pra todo mundo.'
    ]
  },
  {
    version: '1.26.0',
    headline: 'Instalador novo, com a nossa cara',
    items: [
      'O instalador não tem mais assistente de "Avançar": dois cliques no Setup, ele instala e o launcher abre sozinho.',
      'No lugar da janela cinza do Windows, a instalação mostra a logo do Bocas Murchas numa janela da marca.',
      'Abrir o launcher agora mostra uma tela de abertura com a logo animada enquanto tudo carrega, em vez de alguns segundos sem nada na tela.'
    ],
    note: 'Quem já tem o launcher não precisa reinstalar: a atualização chega sozinha, como sempre.'
  },
  {
    version: '1.25.0',
    headline: 'Apostar em grupo paga mais',
    items: [
      'Quanto mais gente aposta na mesma partida, mais paga o acerto de todo mundo: cada pessoa além da primeira soma +15% do valor apostado no prêmio, até +60% com cinco apostando.',
      'Aposta perdida não some mais inteira: a maior parte vai pro cofre da casa, que banca o bônus de grupo e enche um pote.',
      'O pote sai quando quatro ou mais pessoas apostam na partida e todas acertam. Ele é dividido igualmente entre elas, e o valor atual aparece no cartão da aposta.',
      'O formulário de aposta já mostra quanto do prêmio vem do grupo, e o cartão da partida encerrada mostra o bônus de cada um.'
    ],
    note: 'O bônus sai do cofre: se ele estiver baixo, o bônus paga menos, nunca nada a mais.'
  },
  {
    version: '1.24.1',
    headline: 'Virar a câmera no celular',
    items: [
      'No celular, com a câmera ligada na call, aparece um botão pra trocar entre a frontal e a traseira sem sair do ar.',
      'A câmera traseira não sai mais espelhada: texto e placa aparecem do lado certo.',
      'Quando a câmera não abre, a call agora diz o motivo (permissão bloqueada, câmera em uso por outro programa) em vez de o botão simplesmente não fazer nada.'
    ]
  },
  {
    version: '1.24.0',
    headline: 'Chegou o Bocas Bot',
    items: [
      'O servidor agora tem um bot de verdade, com selo BOT no nome. Recap da semana, fechamento do dia, leilão, apostas e avisos saem dele — não mais no nome do Samu.',
      'Chame com @bocasbot em qualquer canal, responda uma mensagem dele ou mande DM (botão direito no Bocas Bot na lista de membros). Ele sabe quem está online, o ranking, as partidas, a agenda, a fila da impressora e procura no arquivo de mensagens.',
      '/perguntar faz uma pergunta pro bot, e /resumo pede o que você perdeu no canal (ex.: /resumo 3 = últimas 3 horas).',
      '/sortear, /times e /dado: sorteio, times com quem está na sua call e dados — o aleatório é do servidor, então ninguém pode acusar o bot de marmelada.',
      'No mural do LoL, partida marcante (pentakill, massacre, carregada ou uma noite de muitas mortes) ganha comentário de narrador.'
    ],
    note: 'O bot não lê DM de ninguém: só os canais públicos e a conversa dele com você.'
  },
  {
    version: '1.23.4',
    headline: 'Agendar impressão pra não acordar ninguém',
    items: [
      'Na aba Impressora, ao mandar uma peça, dá pra escolher quando ela começa: assim que der, na manhã seguinte ou num horário seu. A peça já na fila ganha um botão de calendário pra mudar ou tirar o horário.',
      'A impressora não começa mais uma peça que, pela estimativa, invadiria o horário de silêncio. Ela espera a manhã, e uma peça mais curta atrás dela pode passar na frente se couber antes da noite.',
      'Clicar na versão aqui em cima não diz mais "atualizado" quando tem versão nova. E se a versão acabou de ser lançada e o GitHub ainda está publicando, aparece "saindo" e o launcher tenta de novo sozinho.',
      'Com o download segurado por causa da call, clicar na versão baixa na hora.'
    ],
    note: 'O horário de silêncio é configurado pelo admin. Sem ele, só vale o agendamento.'
  },
  {
    version: '1.23.3',
    headline: 'Apostar em você no 5-stack voltou',
    items: [
      'Entrando em partida junto com o grupo, o card "apostar em mim" do overlay sumia pra quem não tinha a sessão mais recente — o launcher pegava a pool do colega, que não traz a sua odd. Agora a odd vem sempre da SUA sessão.',
      'No launcher, o botão de aposta do colega que está na sua partida abria só um aviso mandando apostar em você, sem lugar pra isso. Agora o formulário de apostar em você aparece ali mesmo.'
    ]
  },
  {
    version: '1.23.2',
    headline: 'A moldura acende quando você fala',
    items: [
      'Na call, a moldura comprada na Lojinha agora aparece em volta do seu card só enquanto você está falando — é o seu "estou falando", no lugar da borda verde de quem não tem moldura. Antes ela ficava fixa e ninguém via quando você abria a boca.',
      'O launcher não baixa mais atualização no meio de call, partida de LoL ou com o Minecraft aberto. Ele confere a versão do mesmo jeito e baixa sozinho assim que liberar. A tela de fim de partida já libera.'
    ],
    note: 'Quem fica em call o dia inteiro não escapa: depois de 4 horas segurando, o download acontece mesmo assim, em segundo plano. Foi assim que uma versão inteira não chegou em ninguém.'
  },
  {
    version: '1.23.1',
    headline: 'Ícones de canal de traço, não emoji',
    items: [
      'Emoji na barra deixava tudo colorido e com cara de modelo pronto. O ícone do canal agora sai de um catálogo com 46 desenhos de traço — Conversa, Jogos, Grupo, Servidor e Voz — incluindo os da casa: a caveira do pentakill, o dado das apostas, o vinil do DJ.',
      'Os ícones acendem junto com a linha do canal aberto. Canal que tinha emoji virou o desenho equivalente sozinho.'
    ]
  },
  {
    version: '1.23.0',
    headline: 'Gerenciador de canais novo',
    items: [
      'A tela de canais deixou de ser uma lista chapada com cinco botões por linha: agora é a lista agrupada igual à barra, com o canal aberto ao lado — ícone, nome, grupo e onde ele nasce, tudo no mesmo lugar. Apagar pede confirmação ali mesmo.',
      'O ícone de cada canal aparece em todo lugar: barra lateral, cabeçalho do chat, Ctrl+K e nos cards que apontam pra um canal.',
      'Reordenar canais não se perde mais quando alguém salva outra coisa no meio.'
    ]
  },
  {
    version: '1.22.0',
    headline: 'A impressora ganhou mural, encomendas e timelapse',
    items: [
      'Peça pronta agora vira card no chat, com a foto que a câmera tira no fim (de luz acesa) e, logo depois, o timelapse da peça crescendo camada por camada.',
      'Gostou da peça de alguém? "Quero uma igual" no card ou no mural põe o mesmo arquivo na fila, na sua cota, sem subir nada de novo.',
      'Aba Mural: todas as peças que o grupo já imprimiu, com foto, tempo, gramas e timelapse.',
      'Encomendas: quem não tem a impressora pede pelo /encomendar no chat e oferece murchos. Quem tem aceita, imprime na própria cota, e os murchos só mudam de mão quando a peça fica pronta — desistiu antes, volta tudo.',
      'Aba Filamento: o que está em cada slot do ACE e o estoque de rolos, descontado a cada peça. Avisa quando um rolo está acabando.',
      'A fila confere o filamento antes de mandar: se a peça pede PETG vermelho no slot 2 e lá tem PLA preto, ela espera e diz o que trocar — e a próxima peça que bate com o que está carregado passa na frente. "Tanto faz a cor" libera na hora.',
      'Aba Manutenção: lavar a mesa, limpar o bico, lubrificar, trocar o bico — tudo contado pelas horas de impressão, com aviso quando vence e registro de quem fez.',
      'Medalhas novas da impressora, e tirar da mesa a peça de OUTRA pessoa agora rende murchos: é o que destrava a fila de todo mundo.',
      'A retrospectiva do ano e o "naquele dia" contam as peças impressas, e as sugestões ganharam o tipo "imprimir pro grupo".'
    ],
    note: 'A leitura automática do ACE precisa do agente 1.2.0 na impressora. Até ele ser atualizado, marque em Filamento qual rolo está em cada slot.'
  },
  {
    version: '1.21.1',
    headline: 'Suas playlists do Spotify voltaram',
    items: [
      'Com o Spotify vinculado, só aparecia "Músicas curtidas". O Spotify mudou o jeito de entregar as playlists e o Bocas estava pedindo do jeito antigo — agora todas aparecem de novo, inclusive as salvas.',
      'Quem tem mais de 50 playlists vê todas, não só as primeiras.'
    ],
    note: 'Playlist salva de outra pessoa aparece na lista, mas o Spotify não libera mais as músicas dela pra apps de fora. Pra tocar, salva as faixas numa playlist sua.'
  },
  {
    version: '1.21.0',
    headline: 'As colunas agora se arrastam',
    items: [
      'Dá pra puxar a divisória da barra de canais e a da lista da direita pra mudar a largura delas. Tem limite dos dois lados pra conversa nunca virar uma tira, e dois cliques na divisória voltam ao tamanho de fábrica.',
      'A largura fica guardada nesta máquina, e encolhe sozinha se a janela apertar — o tamanho escolhido no monitor grande não come meia tela no notebook.',
      'A conta do mês agora diz quanto FALTA, e não só quanto custa. Quando a galera fecha a conta, o aviso vira a boa notícia e aparece pra todo mundo, inclusive pra quem já tinha pago.',
      'O "Volto logo!" entra sozinho também quando você passa muito tempo sem falar nada — uma hora, por padrão — mesmo com você no computador. É o caso de quem fica jogando com o launcher aberto atrás e aparece online pra quem está chamando. Sai na hora em que você falar ou mexer no launcher.',
      'O aviso de "+2 XP" saiu. Ele pulava no canto o dia inteiro pra dizer o que a barrinha do rodapé já mostra. Nível novo, conquista, murchos e presente continuam avisando.'
    ],
    note: 'O tempo do "Volto logo!" automático se ajusta em Configurações → Volto logo (AFK); dá pra desligar o novo relógio ali mesmo.'
  },
  {
    version: '1.20.0',
    headline: 'A impressora agora tem câmera',
    items: [
      'Na aba da impressora dá pra ver a peça saindo, ao vivo',
      'Botão pra acender e apagar a luz da impressora — pra enxergar pela câmera à noite',
      'O tempo que falta volta a aparecer: a peça nova não fica mais parecendo que já terminou'
    ],
    note: 'A câmera só manda imagem enquanto alguém está olhando — fechar a janela ou mandar pra bandeja desliga.'
  },
  {
    version: '1.19.0',
    headline: 'Vídeo no chat, tocando na conversa',
    items: [
      'Dá pra mandar vídeo no chat, do computador e do celular. Ele chega tocando ali mesmo, com controles — antes virava um arquivo pra baixar e abrir em outro programa, e ninguém abria.',
      'No celular o vídeo sai da galeria pelo mesmo botão da foto. Aquele era só de imagem, e o clipe de papel (que aceitava qualquer arquivo) não aparece no telefone — por isso não dava.',
      'Vídeo demora pra subir, então agora tem barra mostrando o quanto já foi. O limite é 100 MB por arquivo.',
      'Arrastar pra cima da conversa, colar ou usar o clipe de papel dá no mesmo: o app escolhe sozinho o caminho certo pro que você mandou.'
    ],
    note: 'Vídeo em .mkv ou .avi continua chegando como arquivo pra baixar — esses dois o navegador não toca, e um retângulo preto seria pior que um botão. O que o celular e o PC gravam (mp4, mov, webm) toca normal.'
  },
  {
    version: '1.18.0',
    headline: 'O Bocas no celular virou app de celular',
    items: [
      'Abrir o site no telefone dava o app do computador encolhido: a barra de ícones comendo um sexto da tela, a lista de canais cobrindo a conversa e deixando um dedo dela aparecendo atrás, e busca, fixadas, membros, agenda e ranking sem nenhum jeito de abrir. Agora a barra deita no rodapé, os canais abrem em tela cheia e os painéis sobem de baixo.',
      'Dá pra reagir, responder, fixar e editar mensagem no toque: um toque na mensagem abre os botões que antes só apareciam com o mouse em cima. Segurar o dedo em alguém abre o menu da pessoa, que era só botão direito.',
      'O Enter do teclado do celular quebra linha, como em qualquer outro app — quem envia é o botão do lado, agora do tamanho de um dedo. E a barra de digitar não fica mais escondida atrás do teclado nem embaixo da barrinha do iPhone.',
      'Campo de texto não dá mais aquele zoom no iPhone a cada toque, e puxar a conversa pra baixo parou de recarregar o app no meio da call.',
      'No PC o que muda é a arrumação das camadas: o aviso de XP e a barra da música dividiam o MESMO canto e desenhavam um por cima do outro; um anúncio do admin tapava a cobrança do mês; o aviso de interface destravada nascia a oito pixels do botão do nudge. Cada coisa tem seu lugar na fila agora.',
      'Na call pelo celular, a tela não apaga mais no meio da conversa. O botão de compartilhar tela some no iPhone e no Android — lá o navegador não deixa transmitir, e o botão só dava erro. Assistir a tela dos outros funciona igual.'
    ],
    note: 'A aba do Minecraft no navegador virou a tela do servidor: o jogo abre pelo launcher do computador, e ali no celular ficou só o que dá pra saber de longe — se o servidor está de pé e quem está jogando.'
  },
  {
    version: '1.17.0',
    headline: 'A busca de música não fecha mais na sua cara',
    items: [
      'Mandar uma música pra fila deixa a busca ABERTA — quem abre a busca pra botar música quase nunca quer botar uma só. A linha fica marcada em verde por uns segundos pra você saber que pegou, e dá pra emendar a próxima sem reabrir nada.',
      'Colar link continua igual, e o campo esvazia sozinho depois de aceitar — é só colar o próximo.',
      '"Tocar agora" continua fechando: você escolheu, quer ver tocando.',
      'O ícone do launcher (barra de tarefas, atalho, bandeja e instalador) finalmente é a marca nova — estava com a arte antiga desde setembro, enquanto o site e o app do celular já tinham trocado.'
    ],
    note: 'O Windows guarda ícone em cache. Se o atalho antigo continuar com a cara velha depois de atualizar, ele volta ao normal no próximo login — ou reinstalando pelo site.'
  },
  {
    version: '1.16.0',
    headline: 'Câmera em tamanho de gente, e a fila de música andando sozinha',
    items: [
      'Com uma tela compartilhada no ar, quem liga a câmera virava um retangulinho de 48 pixels lá embaixo — dava pra saber que a webcam estava ligada, e só. Agora a fileira de baixo usa o mesmo card 16:9 da grade: a câmera fica quase cinco vezes maior e dá pra ver a cara da pessoa sem largar a transmissão.',
      'Dá pra clicar no canto de uma câmera pra jogá-la no palco inteiro; a tela compartilhada desce pra barra fina e volta com um clique, igual ao assistir junto.',
      'Sem ninguém de câmera ligada a fileira continua enxuta, e a tela compartilhada fica com a altura toda — a fileira grande só aparece quando tem vídeo pra mostrar.',
      'A música volta a passar sozinha pra próxima da fila. O aviso de "acabou" dependia de UMA pessoa escolhida pela sala, e ninguém conferia se o player dela estava mesmo tocando — quem entra pelo site ou pelo celular tem o autoplay barrado pelo navegador, e quando a vez caia nessa pessoa a fila parava. Agora qualquer um cobre, na ordem, e passar duas de uma vez virou impossível.'
    ],
    note: 'O botão de pular na mão continua igual. O que mudou é só quem avisa o servidor quando a faixa termina sozinha.'
  },
  {
    version: '1.15.0',
    headline: 'O "já paguei" agora passa por quem recebe',
    items: [
      'Marcar continua igual pra você: um clique e a cobrança sai da sua tela na hora. O que mudou é o depois — quem é dono da chave Pix confere no extrato e confirma. É aí que você entra na lista do mês e leva a conquista.',
      'Enquanto isso a tela diz que falta só conferir. Você não precisa fazer mais nada, e ninguém além de quem confirma vê que está esperando.',
      'Se o Pix não aparecer no extrato, a marcação é desfeita e você é avisado — é só marcar de novo quando pagar.',
      'A tela ficava toda preta quando você minimizava o launcher assistindo uma transmissão, e sobrava um quadrado preto no lugar de quem desligava a câmera. Os dois acabaram.'
    ],
    note: 'A conquista Paga o Boleto 🧾 passou a sair da confirmação, e não do clique. Quem já aparecia na lista dos meses anteriores continua exatamente como estava — nada foi tirado de ninguém.'
  },
  {
    version: '1.11.0',
    headline: 'Cada coisa no seu canal',
    items: [
      'Evento, enquete e "bora?" pararam de nascer no canal errado. Marcar um treino com o mural do LoL aberto criava um card de agenda dentro do mural do LoL — o app mandava o card pro canal que VOCÊ estava lendo na hora. Agora cada tipo de card tem canal próprio, e o compositor mostra pra onde vai antes de você confirmar, e deixa trocar quando for de propósito.',
      'A barra de canais tem grupos: Conversa, Jogos, Grupo, Servidor e Voz. Dá pra dobrar o que você não usa, e o grupo fechado continua mostrando quantas não-lidas tem dentro — menção em vermelho, como sempre.',
      'Recap da semana, fechamento do dia, "naquele dia", aposta e clipe pararam de empilhar todos em #anuncios. Cada um tem o canal dele agora.',
      'Dá pra arrumar a ordem dos canais de verdade. As setinhas do gerenciador salvavam e a lista voltava ao que era: não havia como colocar #geral acima de #anuncios.',
      'A sessão não vence mais no meio do uso. Quem deixa o launcher aberto a semana toda era derrubado sem aviso: a tela seguia mostrando você logado enquanto aposta era recusada, saldo congelava e o chat ficava preso em "Reconectando...".',
      'Marcar na agenda aceita mais que jogo: rodízio, aniversário, filme, churrasco. Antes só dava pra escolher entre três jogos e o resto ia digitado no "Outro".'
    ],
    note: 'Os canais novos (agenda, enquetes, apostas, clipes) aparecem depois que um admin abrir o gerenciador de canais e clicar em "Organizar". Nada do que já existe é mexido: ninguém perde mensagem, canal, nem a ordem que já estava montada.'
  },
  {
    version: '1.10.0',
    headline: 'A tela vai fluida e o GIF finalmente roda no chat',
    items: [
      'Compartilhar tela deixou de ser slideshow. Estava preso em 15 quadros por segundo em QUALQUER máquina: o app mandava a qualidade escolhida por um caminho que o compartilhamento de tela ignora, e valia um padrão escondido de 15. Não era o seu PC nem a sua internet — agora vale o que você escolhe.',
      'GIF no chat aparece rodando. Antes, GIF que entrava pelo clipe de papel virava cartão de arquivo com botão de baixar; agora qualquer imagem vira imagem na conversa, venha arrastada, colada ou pelo clipe de papel.',
      'Sticker agora vai até 4 MB, era 1 MB. GIF animado raramente cabia no teto antigo.',
      'Foto de perfil também vai até 4 MB, era 2 MB. Era o mesmo teto que o GIF escolhido no seletor já tinha: quem pegava pelo seletor passava, quem baixava e subia o arquivo esbarrava.'
    ],
    note: 'Pra 60 quadros por segundo escolha 1080p60 na hora de compartilhar; o padrão continua 720p30, que é o que aguenta internet ruim. Imagem acima de 8 MB continua indo como anexo, com botão de baixar, em vez de dar erro.'
  },
  {
    version: '1.9.0',
    headline: 'O mural do LoL agora tem os números de verdade',
    items: [
      'CS, ouro, dano, visão, participação nos abates e fatia do dano do time voltaram a aparecer. Estavam todos vazios: o pacote que o cliente do LoL manda no fim da partida era grande demais pro servidor guardar, e ele descartava o pacote inteiro em vez de guardar o que interessa.',
      "TFT saiu das estatísticas de LoL. O cliente abre a sala do TFT marcando todo mundo com o mesmo campeão — era por isso que Kai'Sa aparecia como a campeã mais jogada do grupo, sem nunca ter sido escolhida por ninguém.",
      'As filas têm nome de novo: "ARAM: Mayhem" e "Swiftplay" no lugar de "queue 2400" e "queue 480". O nome agora vem do próprio cliente do LoL, então fila nova de evento já entra com o nome certo.',
      '"Partidas sem morrer" parou de contar as partidas 0/0/0, que não eram atuação perfeita — eram partida sem dado nenhum.'
    ],
    note: 'As partidas antigas não têm como voltar: aqueles números nunca chegaram a ser gravados. O painel agora diz quantas partidas do período estão nessa situação, em vez de mostrar um traço e deixar parecer defeito da tela.'
  },
  {
    version: '1.8.0',
    headline: 'Mural do LoL, com tudo que dá pra contar',
    items: [
      'As partidas de LoL agora caem num canal só delas, em vez de se misturarem com o resto. Ninguém escreve nesse canal — o que entra ali é partida.',
      'No cabeçalho do mural tem o botão Painel: filtre por período, por quem jogou, por fila, por campeão ou só as partidas em que a galera estava junta, e veja winrate, KDA, CS por minuto, dano, participação nos abates, tempo morto e o resto.',
      'Melhores e piores partidas com nota de atuação, melhores e piores campeões, tabela de cada um, duplas que funcionam (e as que não funcionam), sequências de vitória e derrota, e 14 recordes com a partida que fez cada um.',
      'A aba Padrões responde as perguntas de madrugada: a que horas o grupo ganha, que dia é dia de apanhar, se a quarta partida seguida ainda vale a pena e se ir de revanche na hora dá certo.',
      'O cartão de fim de partida voltou a mostrar CS, ouro, dano e visão — estavam vazios desde sempre por um erro de leitura do fim de jogo. Pentakill agora também é premiado de verdade.',
      'Som comprido no soundboard: dá pra cortar o trecho na hora de subir, arrastando as alças na forma de onda, sem precisar editar o arquivo em outro programa.'
    ],
    note: 'O painel só afirma o que a amostra sustenta: pouca partida não vira verdade, e o que não passa nessa régua fica de fora em vez de virar conselho errado. O canal do mural precisa ser criado uma vez por um admin (gerenciar canais → tipo "Mural do LoL"); enquanto ele não existe, as partidas continuam caindo onde caíam.'
  },
  {
    version: '1.6.0',
    headline: 'A conta do servidor, na mesa',
    items: [
      'Tudo isso aqui — chat, calls, tela compartilhada, o servidor de Minecraft, os clipes, as fotos — mora num computador alugado que custa R$ 125 por mês. Isso sempre saiu do bolso de uma pessoa só, e ninguém mais via o número. Agora ele aparece, dividido pelo tanto de gente que realmente usa.',
      'Tem um Pix na tela e um botão "já paguei". É na palavra: marcar só tira o aviso da sua tela até virar o mês. Ninguém é bloqueado, ninguém fica devendo, ninguém é obrigado a nada.',
      'Quem ajuda leva a conquista Paga o Boleto 🧾 no perfil — e Sustenta o Rolê 🏛️ depois de ajudar em três meses. A tela mostra quem já botou a parte dele no mês.',
      'O ícone de servidor na barra da esquerda abre isso a qualquer hora, com um pontinho laranja enquanto você não marcou o mês.'
    ],
    note: 'A divisão é só por quem apareceu nos últimos 30 dias: conta parada não entra e não empurra a parte de ninguém pra cima. O valor arredonda pra cima nos centavos, senão a soma nunca fecha a conta.'
  },
  {
    version: '1.5.0',
    headline: 'Aposta sem sair da partida',
    items: [
      'Quando a partida começa, um painel aparece num canto da tela por cima do jogo: quanto a galera apostou em você, e as outras partidas do grupo abertas pra aposta. Ele encolhe sozinho depois de alguns segundos e volta ao passar o mouse.',
      'Dá pra apostar dali mesmo, em dois cliques: vitória ou derrota, e o valor. O contador mostra quanto falta pra janela de 5 minutos fechar.',
      'O clique atravessa o painel: mexer o mouse por cima dele não tira a mira do jogo, e clicar não minimiza o League.',
      'Liga e desliga em Configurações › LoL, junto com o canto da tela onde ele fica.'
    ],
    note: 'O jogo precisa estar em janela sem bordas, que é o padrão do League. Em tela cheia exclusiva o Windows não deixa NENHUMA sobreposição aparecer — nem esta, nem a da própria Riot.'
  },
  {
    version: '1.4.3',
    headline: 'Tela compartilhada que não pesa no jogo de ninguém',
    items: [
      'Compartilhar tela deixou de custar pra quem não está olhando: o vídeo só chega (e só é decodificado) depois que a pessoa clica em "Assistir" no palco. Quem está no meio de uma partida com a call aberta não recebe nem processa a tela de ninguém.',
      'Do lado de quem transmite, a captura PARA quando ninguém está assistindo — a transmissão continua no ar e volta sozinha no primeiro clique. Dá pra desligar no seletor de tela, se preferir.',
      'A tela vai em H.264 (placa de vídeo codifica e decodifica) e com perfil "Jogo" ou "Texto" no seletor: jogo prioriza fluidez, texto prioriza nitidez. Minimizar o launcher corta o vídeo e mantém o som.',
      'Apostas: contador de 5 minutos pra fechar, teto pessoal por aposta e aviso quando a partida é em grupo.',
      'Volume do "assistir junto" não volta mais pra 100 a cada vídeo novo.',
      'Menos trabalho em segundo plano: com o launcher minimizado os relógios da tela param, e com um jogo rodando as animações decorativas somem. O detector do cliente do LoL espaça as buscas quando o cliente está fechado, e o update automático espera a partida (ou a call) acabar pra baixar.'
    ],
    note: 'Se alguém reclamar que a tela ficou preta por um instante ao clicar em "Assistir": é a captura religando. Se ficar preta de vez, desmarque "Pausar a captura quando ninguém estiver assistindo" no seletor e avise.'
  },
  {
    version: '1.4.1',
    headline: 'Clicou na foto, abriu o perfil',
    items: [
      'A foto de qualquer pessoa agora abre o perfil dela: no chat, na lista do canal de voz, dentro da call, no ranking e nos cartões (enquete, bora, fumaça, aposta, partida, clipe). Antes só dava pela lista da direita.',
      'O perfil abre no meio da tela, tipo Discord — com nível, murchos, badges, cargos, o que a pessoa está jogando, hora local e aniversário. Fecha no Esc ou clicando fora.'
    ],
    note: 'Na lista de membros da direita continua abrindo do lado, como antes: ali o cartão não cobre a conversa. E clicar na foto não dispara mais o que estava atrás dela — clicar em quem está na call, por exemplo, abre o perfil sem te jogar pra dentro do canal.'
  },
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
