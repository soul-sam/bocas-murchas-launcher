import * as React from 'react'
import { Avatar, AvatarFallback, AvatarImage } from 'bocas-murchas-launcher'

// Sem `src` de rede: o card renderiza offline, entao toda imagem e' um SVG
// embutido. `AvatarImage` sem src cai no fallback, que e' o caso normal do app.

const RETRATO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">' +
      '<rect width="80" height="80" fill="#1b2410"/>' +
      '<circle cx="40" cy="30" r="15" fill="#7fdb1a"/>' +
      '<rect x="16" y="50" width="48" height="30" rx="12" fill="#7fdb1a"/>' +
      '</svg>',
  )

/** Fallback com as duas iniciais — o estado padrao de quem nao subiu foto. */
export function Iniciais() {
  return (
    <Avatar>
      <AvatarFallback>GU</AvatarFallback>
    </Avatar>
  )
}

/** Com imagem: recorte quadrado, raio brutal, borda `line`. */
export function ComImagem() {
  return (
    <Avatar>
      <AvatarImage src={RETRATO} alt="" />
      <AvatarFallback>GU</AvatarFallback>
    </Avatar>
  )
}

/** O tamanho vem por classe utilitaria — o avatar nao tem prop `size`. */
export function Tamanhos() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Avatar className="h-6 w-6">
        <AvatarFallback className="text-[10px]">GU</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>GU</AvatarFallback>
      </Avatar>
      <Avatar className="h-16 w-16">
        <AvatarFallback className="text-xl">GU</AvatarFallback>
      </Avatar>
    </div>
  )
}
