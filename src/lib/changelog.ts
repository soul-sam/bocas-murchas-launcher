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
