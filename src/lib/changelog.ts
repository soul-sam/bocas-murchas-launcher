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
