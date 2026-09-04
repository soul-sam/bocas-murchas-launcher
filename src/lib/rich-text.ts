/**
 * Formatacao das mensagens — o "markdown" do Discord.
 *
 * O chat guardava (e mostrava) texto cru: link colado ficava cinza e sem
 * clique, e nao havia como destacar nada. Aqui o conteudo vira uma arvore
 * pequena de nos; quem desenha e components/social/RichText.tsx.
 *
 * O que entende:
 *
 *   **negrito**  *italico*  __sublinhado__  ~~riscado~~  ||spoiler||
 *   `codigo`     ```bloco```              > citacao
 *   [texto](url) <url> url-solta          @pessoa  #canal
 *
 * DECISAO: nada de biblioteca de markdown. As de verdade cospem HTML — e HTML
 * vindo de mensagem de terceiro dentro de um Electron com acesso a
 * `window.bocas` e exatamente o buraco que ninguem quer. Aqui nenhum caminho
 * produz HTML: todo no vira elemento React e texto continua sendo texto.
 *
 * Este arquivo e PURO de proposito (nao importa React nem contexto): o
 * chat-context precisa dele pra detectar mencao antes de qualquer render, e
 * importar o renderer de la fecharia um ciclo de modulos.
 */

export type InlineStyle = 'bold' | 'italic' | 'underline' | 'strike'

export type InlineNode =
  | { kind: 'text'; value: string }
  | { kind: 'style'; style: InlineStyle; children: InlineNode[] }
  | { kind: 'spoiler'; children: InlineNode[] }
  | { kind: 'code'; value: string }
  | { kind: 'link'; url: string; label: string }
  | { kind: 'mention'; raw: string; username: string }
  | { kind: 'channel'; raw: string; name: string }

export type Block =
  | { kind: 'paragraph'; children: InlineNode[] }
  | { kind: 'quote'; children: InlineNode[] }
  | { kind: 'codeblock'; lang: string | null; value: string }

// ============================================
// LINKS
// ============================================

/**
 * So http(s) sai daqui. `shell.openExternal` entrega o endereco pro sistema
 * operacional: um `file:` abriria arquivo local e um esquema registrado por
 * outro programa executaria aquele programa. Mensagem de chat nao pode isso.
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function openExternal(url: string): void {
  if (!isSafeUrl(url)) return
  void window.bocas.shell.openExternal(url)
}

/** `https://www.youtube.com/watch?v=x` -> `youtube.com`. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const TAIL_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', '"', "'"])

/**
 * Pontuacao no fim de link solto pertence a frase, nao ao endereco: em
 * "olha isso https://exemplo.com/foo." o ponto final e da pessoa. Parenteses
 * so saem quando sobram — a Wikipedia usa parenteses DENTRO da URL.
 */
function trimUrlTail(url: string): string {
  let end = url.length

  while (end > 0) {
    const last = url[end - 1]

    if (TAIL_PUNCTUATION.has(last)) {
      end -= 1
      continue
    }

    if (last === ')') {
      const slice = url.slice(0, end)
      const opens = (slice.match(/\(/g) ?? []).length
      const closes = (slice.match(/\)/g) ?? []).length
      if (closes > opens) {
        end -= 1
        continue
      }
    }

    break
  }

  return url.slice(0, end)
}

// ============================================
// PARSER
// ============================================

/**
 * O texto CONSUMIDO nem sempre e o texto que casou.
 *
 * Duas regras devolvem menos do que a regex pegou:
 *
 *   - link solto seguido de pontuacao ("...exemplo.com.") — o ponto e da
 *     frase, nao do endereco, e tem que voltar pro fluxo de texto;
 *   - mencao e canal, cuja regex inclui o caractere anterior por causa do
 *     lookbehind.
 *
 * Sem separar as duas coisas o pedaco descartado sumia da mensagem: quem
 * escrevia "entra em https://x.com." via o ponto final desaparecer.
 */
interface Built {
  node: InlineNode
  /** Trecho exato que este no consome do texto. */
  raw: string
}

interface Rule {
  re: RegExp
  build: (match: RegExpExecArray) => Built | null
}

/**
 * A ordem resolve empate: quando duas regras casam na MESMA posicao, ganha a
 * primeira da lista. Por isso `***` vem antes de `**`, que vem antes de `*`.
 */
const RULES: Rule[] = [
  {
    re: /`([^`\n]+)`/,
    build: (m) => ({ node: { kind: 'code', value: m[1] }, raw: m[0] })
  },
  {
    re: /\|\|([\s\S]+?)\|\|/,
    build: (m) => ({ node: { kind: 'spoiler', children: parseInline(m[1]) }, raw: m[0] })
  },
  {
    re: /\[([^\]\n]{1,120})\]\((https?:\/\/[^\s)]+)\)/,
    build: (m) =>
      isSafeUrl(m[2]) ? { node: { kind: 'link', url: m[2], label: m[1] }, raw: m[0] } : null
  },
  {
    // <url> e a forma de colar link SEM ganhar cartao de preview embaixo.
    re: /<(https?:\/\/[^\s>]+)>/,
    build: (m) =>
      isSafeUrl(m[1]) ? { node: { kind: 'link', url: m[1], label: m[1] }, raw: m[0] } : null
  },
  {
    re: /https?:\/\/[^\s<>"']+/,
    build: (m) => {
      const url = trimUrlTail(m[0])
      return isSafeUrl(url) ? { node: { kind: 'link', url, label: url }, raw: url } : null
    }
  },
  {
    // Sem esquema: quase todo mundo digita "www.site.com" e espera que abra.
    re: /\bwww\.[^\s<>"']+\.[^\s<>"']+/,
    build: (m) => {
      const label = trimUrlTail(m[0])
      const url = 'https://' + label
      return isSafeUrl(url) ? { node: { kind: 'link', url, label }, raw: label } : null
    }
  },
  {
    re: /\*\*\*([\s\S]+?)\*\*\*/,
    build: (m) => ({
      node: {
        kind: 'style',
        style: 'bold',
        children: [{ kind: 'style', style: 'italic', children: parseInline(m[1]) }]
      },
      raw: m[0]
    })
  },
  {
    re: /\*\*([\s\S]+?)\*\*/,
    build: (m) => ({
      node: { kind: 'style', style: 'bold', children: parseInline(m[1]) },
      raw: m[0]
    })
  },
  {
    re: /__([\s\S]+?)__/,
    build: (m) => ({
      node: { kind: 'style', style: 'underline', children: parseInline(m[1]) },
      raw: m[0]
    })
  },
  {
    re: /~~([\s\S]+?)~~/,
    build: (m) => ({
      node: { kind: 'style', style: 'strike', children: parseInline(m[1]) },
      raw: m[0]
    })
  },
  {
    re: /\*([^*\n]+)\*/,
    build: (m) => ({
      node: { kind: 'style', style: 'italic', children: parseInline(m[1]) },
      raw: m[0]
    })
  },
  {
    // `_x_` so entre limites de palavra: nome_de_variavel nao vira italico.
    re: /(?:^|(?<=[\s([{]))_([^_\n]+)_(?=$|[\s.,!?)\]}])/,
    build: (m) => ({
      node: { kind: 'style', style: 'italic', children: parseInline(m[1]) },
      raw: '_' + m[1] + '_'
    })
  },
  {
    re: /(?:^|(?<=[\s([{]))@([\p{L}\p{N}_.-]{2,32})/u,
    build: (m) => ({
      node: { kind: 'mention', raw: '@' + m[1], username: m[1] },
      raw: '@' + m[1]
    })
  },
  {
    re: /(?:^|(?<=[\s([{]))#([\p{L}\p{N}_-]{1,32})/u,
    build: (m) => ({
      node: { kind: 'channel', raw: '#' + m[1], name: m[1] },
      raw: '#' + m[1]
    })
  }
]

/** Trava contra regra futura de casamento vazio: 2000 nos ja e absurdo. */
const MAX_INLINE_NODES = 2_000

/** Quebra um trecho solto na arvore de nos inline. */
export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let rest = text
  let guard = 0

  while (rest.length > 0 && guard < MAX_INLINE_NODES) {
    guard += 1

    let bestStart = -1
    let bestRaw = ''
    let bestNode: InlineNode | null = null

    for (const rule of RULES) {
      const match = rule.re.exec(rest)
      if (!match) continue

      const built = rule.build(match)
      if (!built) continue

      // O trecho consumido pode ser menor que o casamento (ver `Built`) e,
      // nesses casos, comeca depois do inicio do match.
      const offset = match[0].indexOf(built.raw)
      const start = match.index + (offset === -1 ? 0 : offset)

      if (bestStart !== -1 && start >= bestStart) continue

      bestStart = start
      bestRaw = built.raw
      bestNode = built.node
    }

    if (!bestNode || bestStart === -1 || bestRaw.length === 0) break

    if (bestStart > 0) nodes.push({ kind: 'text', value: rest.slice(0, bestStart) })
    nodes.push(bestNode)
    rest = rest.slice(bestStart + bestRaw.length)
  }

  if (rest.length > 0) nodes.push({ kind: 'text', value: rest })
  return nodes
}

/** Quebra a mensagem em blocos (paragrafo, citacao, bloco de codigo). */
export function parseBlocks(content: string): Block[] {
  const blocks: Block[] = []
  const lines = content.split('\n')

  let paragraph: string[] = []
  let quote: string[] = []

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return
    blocks.push({ kind: 'paragraph', children: parseInline(paragraph.join('\n')) })
    paragraph = []
  }

  const flushQuote = (): void => {
    if (quote.length === 0) return
    blocks.push({ kind: 'quote', children: parseInline(quote.join('\n')) })
    quote = []
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const fence = /^```(\w+)?\s*$/.exec(line)

    if (fence) {
      flushParagraph()
      flushQuote()

      const body: string[] = []
      let closed = false
      i += 1

      for (; i < lines.length; i += 1) {
        if (/^```\s*$/.test(lines[i])) {
          closed = true
          break
        }
        body.push(lines[i])
      }

      // Cerca aberta e nunca fechada e texto normal, nao codigo: senao o resto
      // da mensagem sumiria dentro de um bloco que ninguem pediu.
      if (!closed) {
        paragraph.push(line, ...body)
        continue
      }

      blocks.push({ kind: 'codeblock', lang: fence[1] ?? null, value: body.join('\n') })
      continue
    }

    const quoted = /^>\s?(.*)$/.exec(line)
    if (quoted) {
      flushParagraph()
      quote.push(quoted[1])
      continue
    }

    flushQuote()
    paragraph.push(line)
  }

  flushParagraph()
  flushQuote()
  return blocks
}

function walkInline(nodes: InlineNode[], visit: (node: InlineNode) => void): void {
  for (const node of nodes) {
    visit(node)
    if (node.kind === 'style' || node.kind === 'spoiler') walkInline(node.children, visit)
  }
}

function walkBlocks(blocks: Block[], visit: (node: InlineNode) => void): void {
  for (const block of blocks) {
    if (block.kind === 'paragraph' || block.kind === 'quote') walkInline(block.children, visit)
  }
}

/** Todos os links da mensagem, na ordem e sem repetir. */
export function collectLinks(blocks: Block[]): string[] {
  const found: string[] = []
  walkBlocks(blocks, (node) => {
    if (node.kind === 'link' && !found.includes(node.url)) found.push(node.url)
  })
  return found
}

/** Nomes citados com @, em minusculas. */
export function collectMentions(content: string): string[] {
  const found: string[] = []
  walkBlocks(parseBlocks(content), (node) => {
    if (node.kind !== 'mention') return
    const name = node.username.toLowerCase()
    if (!found.includes(name)) found.push(name)
  })
  return found
}

/** `@everyone` e os apelidos em portugues que a galera usa. */
export function mentionsEveryone(content: string): boolean {
  return /(^|\s)@(everyone|todos|geral|all)\b/i.test(content)
}

/**
 * Mensagem so de emoji vira gigante, igual Discord. O limite evita que alguem
 * cole uma parede de emoji e ocupe a tela inteira.
 */
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|️|‍|\s)+$/u

export function isEmojiOnly(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed || trimmed.length > 40) return false
  if (!EMOJI_ONLY.test(trimmed)) return false
  return Array.from(trimmed.replace(/\s/g, '')).length <= 16
}

// ============================================
// PREVIEW DE LINK
// ============================================

export type EmbedKind = 'image' | 'video' | 'youtube' | 'link'

export interface LinkEmbed {
  kind: EmbedKind
  url: string
  host: string
  /** Miniatura, quando da pra deduzir sem consultar o servidor. */
  thumbnail?: string
  title?: string
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp)(\?|#|$)/i
const VIDEO_EXT = /\.(mp4|webm|mov)(\?|#|$)/i

/** Id do video em qualquer das formas que o YouTube publica. */
function youtubeId(url: string): string | null {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') return parsed.pathname.slice(1).split('/')[0] || null

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const v = parsed.searchParams.get('v')
      if (v) return v
      const match = /^\/(?:embed|shorts|live)\/([^/?]+)/.exec(parsed.pathname)
      if (match) return match[1]
    }

    return null
  } catch {
    return null
  }
}

/**
 * Preview SEM chamar ninguem.
 *
 * O servidor nao tem endpoint de metadados (og:title e afins), e sair buscando
 * a pagina do renderer significaria entregar o IP da galera pra qualquer site
 * colado no chat, esbarrar no CSP e ainda travar a lista enquanto carrega. O
 * que da pra deduzir da propria URL cobre o uso real — video do YouTube,
 * imagem e print — e o resto vira um cartao discreto com o dominio.
 */
export function describeLink(url: string): LinkEmbed {
  const host = hostOf(url)

  const videoId = youtubeId(url)
  if (videoId) {
    return {
      kind: 'youtube',
      url,
      host,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      title: 'YouTube'
    }
  }

  if (IMAGE_EXT.test(url)) return { kind: 'image', url, host, thumbnail: url }
  if (VIDEO_EXT.test(url)) return { kind: 'video', url, host }

  return { kind: 'link', url, host }
}
