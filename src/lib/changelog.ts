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
