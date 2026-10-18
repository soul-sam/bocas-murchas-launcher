import * as React from 'react'
import type EmojiPickerComponent from 'emoji-picker-react'
import type { EmojiStyle as PickerEmojiStyle, Theme as PickerTheme } from 'emoji-picker-react'

/**
 * Seletor de emoji carregado só quando abre.
 *
 * O `emoji-picker-react` traz a lista inteira de emojis e o próprio CSS; era
 * importado no topo de cinco telas e, por isso, entrava no pacote da
 * inicialização mesmo pra quem nunca abria o seletor. Agora o chunk vem no
 * primeiro clique (e fica em cache).
 *
 * `Theme`/`EmojiStyle` aqui são só os valores que usamos, com o tipo do
 * pacote: importar os enums de verdade puxaria o pacote inteiro de volta.
 */
export const Theme = {
  DARK: 'dark' as PickerTheme,
  LIGHT: 'light' as PickerTheme
}

export const EmojiStyle = {
  NATIVE: 'native' as PickerEmojiStyle
}

type PickerProps = React.ComponentProps<typeof EmojiPickerComponent>

const Picker = React.lazy(() => import('emoji-picker-react'))

export function LazyEmojiPicker(props: PickerProps) {
  // Reserva o tamanho enquanto o chunk chega: o popover não pula.
  const width = props.width ?? 350
  const height = props.height ?? 450
  return (
    <React.Suspense fallback={<div style={{ width, height }} aria-busy="true" />}>
      <Picker {...props} />
    </React.Suspense>
  )
}

export default LazyEmojiPicker
