// Barrel de entrada do design-sync.
//
// O launcher e um app Electron (`private: true`), nao uma lib publicada: nao
// existe `dist/` de biblioteca pra apontar. Sem este arquivo o converter cai
// no modo synth-entry e faz `export *` de TODO o src/ — 90+ componentes,
// incluindo telas inteiras que so fazem sentido dentro do app. Este barrel e
// o recorte deliberado: primitivos de UI + os cards.
//
// Mantenha em sincronia com `componentSrcMap` em .design-sync/config.json.

// ---- Primitivos (src/components/ui) ----
export * from '@/components/ui/avatar'
export * from '@/components/ui/button'
export * from '@/components/ui/card'
export * from '@/components/ui/dialog'
export * from '@/components/ui/dropdown-menu'
export * from '@/components/ui/input'
export * from '@/components/ui/label'
export * from '@/components/ui/popover'
export * from '@/components/ui/switch'
export * from '@/components/ui/tabs'
export * from '@/components/ui/tooltip'

// ---- Cards de mensagem (src/components/cards) ----
// `/index` explicito: o resolvedor de alias do converter testa o caminho nu
// antes das extensoes, acha o DIRETORIO src/components/cards e manda o esbuild
// ler uma pasta como arquivo ("Cannot read file ...: Incorrect function").
export { CardFrame, MessageCard, hasCard } from '@/components/cards/index'
export { SystemCard } from '@/components/cards/SystemCard'
export { ChessResultCard } from '@/components/cards/ChessResultCard'
export { EventCard } from '@/components/cards/EventCard'
export { GameResultCard } from '@/components/cards/GameResultCard'
export { PartyCard } from '@/components/cards/PartyCard'
export { PollCard } from '@/components/cards/PollCard'
export { RecapCard } from '@/components/cards/RecapCard'
export { SuggestionCard } from '@/components/cards/SuggestionCard'
export { WagerCard } from '@/components/cards/WagerCard'
export { WatchCard } from '@/components/cards/WatchCard'

// ---- Cards de nivel raiz (src/components) ----
export { InstallStatusCard } from '@/components/InstallStatusCard'
export { MicrosoftAccountCard } from '@/components/MicrosoftAccountCard'
export { PlayCard } from '@/components/PlayCard'
export { ServerStatusCard } from '@/components/ServerStatusCard'
