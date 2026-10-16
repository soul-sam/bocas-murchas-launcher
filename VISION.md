# Visão — Bocas Murchas Launcher

**Propósito.** Um app só para o grupo Bocas Murchas: chat, voz, compartilhamento de tela, soundboard,
música/vídeo juntos, jogos de mesa (xadrez, pôquer, cacheta, bilhar) e o Minecraft do grupo (modpack +
login Microsoft), com atualização automática (fonte: package.json `description`, código em `src/` e
`electron/main/services`).

**Público.** Os membros do grupo (Windows desktop; também site e APK com o mesmo código). Grupo fechado —
tamanho e critério de entrada: A CONFIRMAR.

**Não-objetivos.** A CONFIRMAR com o dono. Inferido: não é produto público/comercial; não roda macOS/Linux
(build só `--win --x64`); não substitui a API (regras de servidor ficam em `../bocas-murchas-api`).

**Estilo.** Instalador de um clique "igual ao Discord"; atualiza sozinho sem atrapalhar call/jogo; UI
seguindo tokens de design (`lint:design`); textos e comentários em português informal.

**Critério de descarte.** Uma feature sai/não entra se: quebra a call ou o jogo de alguém, exige ação manual
para atualizar, ou não é usada pelo grupo. Métrica de uso: A CONFIRMAR (não há telemetria verificável no
código do launcher).
