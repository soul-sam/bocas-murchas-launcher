; ============================================================================
; INSTALADOR COM A CARA DO BOCAS MURCHAS
;
; O instalador e o de um clique do electron-builder (oneClick): sem assistente,
; instala e abre o launcher. Por padrao ele mostra uma janelinha cinza do
; Windows com uma barra de progresso (o plugin SpiderBanner). Aqui ela e
; escondida e no lugar entra uma janela SEM BORDA com a arte da marca
; (build/installer-splash-<escala>.bmp, gerada por
; scripts/gen-installer-splash.mjs) e uma barra animada por cima.
;
; Por que tudo na mao, com System::Call: o NSIS nao tem janela sem borda nem
; imagem de fundo prontas no modo de um clique. So da pra desenhar com a API
; do Windows, e o System.dll ja vem no NSIS do electron-builder.
;
; Onde cada coisa acontece, e por que ali:
;
;   - customInit roda no .onInit, na THREAD PRINCIPAL, antes de qualquer
;     janela. E essa thread que depois fica bombeando mensagens enquanto a
;     instalacao roda em outra thread — janela criada em qualquer outro lugar
;     ficaria branca e "sem resposta".
;   - customCheckAppRunning e o primeiro gancho DEPOIS do SpiderBanner::Show
;     (installSection.nsh). E ali que da pra esconder a janelinha cinza.
;
; ATUALIZACAO AUTOMATICA NAO PASSA POR NADA DISSO: o electron-updater roda o
; instalador com /S (silencioso), e todo bloco aqui e `${IfNot} ${Silent}`.
; ============================================================================

!include WinMessages.nsh
; Com customCheckAppRunning definido, o electron-builder deixa de incluir isto
; (allowOnlyOneInstallerInstance.nsh) — e o _CHECK_APP_RUNNING padrao, que a
; gente continua chamando, depende dele e da Var pid. Tem guarda de inclusao.
!include "getProcessInfo.nsh"
Var pid

!macro customHeader
  ; Sem isso o Windows estica a janela em tela com escala (150%, 200%) e a arte
  ; sai borrada. Com isso, a escala e escolhida no customInit pelo DPI.
  ManifestDPIAware true
  ; Estilos visuais: sem eles a barra nao anima (PBS_MARQUEE e do comctl32 v6).
  XPStyle on
!macroend

!macro customInit
  ${IfNot} ${Silent}
    Push $0
    Push $1
    Push $2
    Push $3
    Push $4
    Push $5
    Push $6
    Push $7
    Push $8
    Push $9

    InitPluginsDir

    ; DPI da tela: 96 = 100%, 144 = 150%, 192 = 200%.
    System::Call 'user32::GetDC(p 0) p .r1'
    System::Call 'gdi32::GetDeviceCaps(p r1, i 88) i .r0'
    System::Call 'user32::ReleaseDC(p 0, p r1)'

    ; $2 x $3 = janela; $4,$5 $6 x $7 = barra. Mesmos numeros do
    ; gen-installer-splash.mjs (W, H e BAR) vezes a escala.
    ${If} $0 >= 168
      File /oname=$PLUGINSDIR\bm-splash.bmp "${BUILD_RESOURCES_DIR}\installer-splash-200.bmp"
      StrCpy $2 840
      StrCpy $3 520
      StrCpy $4 128
      StrCpy $5 444
      StrCpy $6 584
      StrCpy $7 8
    ${ElseIf} $0 >= 120
      File /oname=$PLUGINSDIR\bm-splash.bmp "${BUILD_RESOURCES_DIR}\installer-splash-150.bmp"
      StrCpy $2 630
      StrCpy $3 390
      StrCpy $4 96
      StrCpy $5 333
      StrCpy $6 438
      StrCpy $7 6
    ${Else}
      File /oname=$PLUGINSDIR\bm-splash.bmp "${BUILD_RESOURCES_DIR}\installer-splash-100.bmp"
      StrCpy $2 420
      StrCpy $3 260
      StrCpy $4 64
      StrCpy $5 222
      StrCpy $6 292
      StrCpy $7 4
    ${EndIf}

    ; Centro da area de trabalho (sem a barra de tarefas).
    System::Call '*(i, i, i, i) p .r8'
    System::Call 'user32::SystemParametersInfo(i 0x30, i 0, p r8, i 0)'
    System::Call '*$8(i .r0, i .r1, i .r9, i)'
    System::Free $8
    IntOp $9 $9 - $0
    IntOp $9 $9 - $2
    IntOp $9 $9 / 2
    IntOp $0 $0 + $9
    System::Call '*(i, i, i, i) p .r8'
    System::Call 'user32::SystemParametersInfo(i 0x30, i 0, p r8, i 0)'
    System::Call '*$8(i, i .r1, i, i .r9)'
    System::Free $8
    IntOp $9 $9 - $1
    IntOp $9 $9 - $3
    IntOp $9 $9 / 2
    IntOp $1 $1 + $9

    ; Janela: STATIC com bitmap, WS_POPUP|WS_VISIBLE|SS_BITMAP, fora da barra
    ; de tarefas (WS_EX_TOOLWINDOW) — a janela do NSIS tambem some dela.
    System::Call 'user32::CreateWindowEx(i 0x80, t "STATIC", t "Bocas Murchas", i 0x9000000E, i r0, i r1, i r2, i r3, p 0, p 0, p 0, p 0) p .r8'
    System::Call 'user32::LoadImage(p 0, t "$PLUGINSDIR\bm-splash.bmp", i 0, i 0, i 0, i 0x10) p .r9'
    SendMessage $8 0x172 0 $9 ; STM_SETIMAGE, IMAGE_BITMAP

    ; Cantos arredondados no Windows 11 (DWMWA_WINDOW_CORNER_PREFERENCE =
    ; ROUND). No Windows 10 a chamada falha calada e a janela fica reta.
    System::Call 'dwmapi::DwmSetWindowAttribute(p r8, i 33, *i 2, i 4)'

    ; Barra animada (marquee): nao ha progresso real pra mostrar — a extracao
    ; e um Nsis7z::Extract so. Tema desligado pra ela aceitar as cores da
    ; marca em vez do verde do Windows.
    System::Call 'comctl32::InitCommonControls()'
    System::Call 'user32::CreateWindowEx(i 0, t "msctls_progress32", t "", i 0x50000009, i r4, i r5, i r6, i r7, p r8, p 0, p 0, p 0) p .r9'
    System::Call 'uxtheme::SetWindowTheme(p r9, w "", w "")'
    SendMessage $9 0x409 0 0x0000FF6A  ; PBM_SETBARCOLOR  #6AFF00
    SendMessage $9 0x2001 0 0x00211E1B ; PBM_SETBKCOLOR   #1B1E21
    SendMessage $9 0x40A 1 20          ; PBM_SETMARQUEE, a cada 20 ms

    System::Call 'user32::SetForegroundWindow(p r8)'

    Pop $9
    Pop $8
    Pop $7
    Pop $6
    Pop $5
    Pop $4
    Pop $3
    Pop $2
    Pop $1
    Pop $0
  ${EndIf}
!macroend

!macro customCheckAppRunning
  !ifndef BUILD_UNINSTALLER
    ; A janelinha cinza do SpiderBanner acabou de aparecer: some com ela. A
    ; nossa continua ate o launcher abrir e o instalador sair.
    ${IfNot} ${Silent}
      ShowWindow $HWNDPARENT ${SW_HIDE}
    ${EndIf}
  !endif
  !insertmacro _CHECK_APP_RUNNING
!macroend
