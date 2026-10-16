# Instalador NSIS de um clique, por usuário

- **Data:** A CONFIRMAR
- **Decisão:** `oneClick: true`, `perMachine: false` (instala em %LOCALAPPDATA%\Programs), abre sozinho,
  `deleteAppDataOnUninstall: false`. Quem instalou pelo assistente antigo continua na pasta escolhida (lê
  InstallLocation do HKCU). Auto-update sempre rodou o instalador em modo silencioso.
- **Fonte:** `electron-builder.yml` (bloco `nsis:`), `build/installer.nsh`.
