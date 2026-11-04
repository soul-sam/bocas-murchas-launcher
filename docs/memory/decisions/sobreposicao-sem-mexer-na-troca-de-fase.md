# Sobreposição: só confere o topo, e fica quieta na troca de fase da partida

**Quando:** nov/2026.

**Problema:** um usuário com notebook de duas GPUs (Intel + RTX 4050, cada monitor numa) teve 23
travamentos do DWM: a tela congela e só volta no botão de energia. Cruzando os horários com o banco,
~15 caíram a 0–2 min do começo ou do fim de uma partida de LoL. Até aqui a sobreposição dava
`setAlwaysOnTop` + `moveTop` a cada 1,5 s, a partida inteira, e no começo da partida chamava
`setBounds` duas vezes. Nada disso está provado como causa, mas é o que a nossa janela fazia
justo nesse momento.

**Decisão:**
- O relógio só **confere** a pilha de janelas (`zorder.ts`, `GetWindow` via koffi) e reafirma o
  topo apenas se uma janela visível cobrir ≥ 50% da sobreposição. Metade, e não "encostou": a
  barra de tarefas e widgets pequenos ficam sempre por cima (medido). Medido em dev: 0
  reafirmações em 30 s sem ninguém por cima (antes eram ~20), e uma só quando um Bloco de Notas
  TOPMOST foi posto por cima.
- **Silêncio de 45 s** (`TRANSITION_QUIET_MS`) quando `inGame` muda: não cria a janela, não
  muda tamanho, não reafirma topo. O que foi pedido nesse tempo roda no fim.
- `fitToDisplay` não chama `setBounds` se o retângulo já está certo, com folga de 4 px (a 125% o
  Windows arredonda: pede 960, fica 963).
- Regras puras em `electron/main/services/overlay-policy.ts`, com teste no `test:policy`.

**Log:** `logs/main.log` em userData (`diag-log.ts`), com fsync por linha, para que a última linha
sobreviva a um desligamento no botão. Guarda boot, GPU, monitores, processos que morreram, fase do
LoL, o que a sobreposição fez, call e tela (pelo renderer, só tags `call`/`tela`) e um pulso a
cada 30 s. Sem dados de gente.

**Para testar em dev com o launcher instalado aberto:** os dois usam a mesma pasta de dados e a
segunda instância fecha sozinha. Usar
`npx electron-vite dev -- --user-data-dir=<pasta temporária>`.
