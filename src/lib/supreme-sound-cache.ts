type Entry = { status: 'loading' } | { status: 'ready'; buffer: AudioBuffer } | { status: 'failed' }

/**
 * Áudios Supremos decodificados, por URL. O `voiceCue` é síncrono (o som
 * tem que sair na hora em que a pessoa entra), então só toca o que já está
 * pronto; o resto cai no aviso padrão e fica carregando pra próxima vez.
 */
export function createSoundCache(deps: {
  load(url: string): Promise<AudioBuffer>
  report(ownerId: string, url: string): void
}) {
  const entries = new Map<string, Entry>()
  return {
    status(url: string): 'ready' | 'loading' | 'failed' | 'missing' {
      return entries.get(url)?.status ?? 'missing'
    },
    get(url: string): AudioBuffer | null {
      const e = entries.get(url)
      return e?.status === 'ready' ? e.buffer : null
    },
    preload(url: string, ownerId: string): void {
      if (entries.has(url)) return
      entries.set(url, { status: 'loading' })
      deps.load(url).then(
        (buffer) => entries.set(url, { status: 'ready', buffer }),
        () => {
          entries.set(url, { status: 'failed' })
          deps.report(ownerId, url)
        }
      )
    }
  }
}
