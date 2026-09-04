import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { installInteractionGuard } from './lib/interaction-guard'
import './styles/globals.css'

// Antes do React: se a interface travar, o guarda tem que estar de pe
// independente do que a arvore de componentes esteja fazendo.
installInteractionGuard()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
