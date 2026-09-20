import * as React from 'react'

/**
 * A TELA NÃO APAGA NO MEIO DA CALL.
 *
 * No celular a tela dorme em 30 segundos sem toque. No navegador, tela apagada
 * é aba em segundo plano: o áudio até segue, mas o app perde quadros, o
 * assistir junto trava e voltar exige desbloquear o aparelho. Numa call de uma
 * hora, ninguém toca na tela o tempo todo.
 *
 * `wakeLock` é da web e não existe no Electron (lá o problema também não
 * existe — o PC não dorme com o app em primeiro plano). Onde não existe, isto
 * é um no-op silencioso: nada de pedir permissão, nada de erro.
 *
 * O bloqueio MORRE sozinho quando a aba vai pro fundo — é o navegador que o
 * derruba, não nós. Por isso o `visibilitychange`: voltar pro app tem que
 * pedir de novo, senão a tela volta a apagar depois da primeira troca de app.
 */
export function useWakeLock(ativo: boolean): void {
  React.useEffect(() => {
    if (!ativo) return
    const wakeLock = navigator.wakeLock
    if (!wakeLock) return

    let sentinela: WakeLockSentinel | null = null
    let cancelado = false

    const pedir = async (): Promise<void> => {
      if (cancelado || document.visibilityState !== 'visible') return
      try {
        sentinela = await wakeLock.request('screen')
      } catch {
        // Bateria fraca ou aparelho em economia de energia recusam. Não é
        // erro de ninguém, e não muda nada do que o app faz.
      }
    }

    const aoVoltar = (): void => {
      if (document.visibilityState === 'visible' && !sentinela?.released) void pedir()
    }

    void pedir()
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      cancelado = true
      document.removeEventListener('visibilitychange', aoVoltar)
      void sentinela?.release().catch(() => {})
      sentinela = null
    }
  }, [ativo])
}
