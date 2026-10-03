import { request } from './api'

/**
 * O CAIXA da mesa valendo — contrato com /api/cash. Tudo em CENTAVOS.
 *
 *   GET  /cash/me               -> estado: saldo, chave Pix, taxas, limites, Pix pendente
 *   PUT  /cash/pix-key          -> { type, key, holderName? }  (key vazia remove)
 *   POST /cash/deposit          -> { valueCents, cpfCnpj?, name? } -> { deposit } com QR
 *   GET  /cash/deposits/:id     -> status (pergunta ao Asaas se ainda pendente)
 *   POST /cash/withdraw         -> { valueCents } -> { withdrawal, balanceCents }
 *   GET  /cash/history          -> extrato
 *   GET  /cash/withdrawals      -> saques
 *
 * O servidor avisa `cash:changed { balanceCents, kind, deltaCents }` pelo
 * socket quando o saldo muda (depósito caiu, saque falhou e voltou…).
 */

export type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP'

export const PIX_KEY_TYPES: Array<{ id: PixKeyType; label: string; hint: string }> = [
  { id: 'CPF', label: 'CPF', hint: 'só números' },
  { id: 'EMAIL', label: 'E-mail', hint: 'o mesmo cadastrado no banco' },
  { id: 'PHONE', label: 'Celular', hint: 'com DDD' },
  { id: 'EVP', label: 'Aleatória', hint: 'a chave de 32 caracteres do banco' },
  { id: 'CNPJ', label: 'CNPJ', hint: 'só números' }
]

export interface CashFees {
  pixInFixedCents: number
  pixInPercent: number
  transferFeeCents: number
  monthlyTransfersWithoutFee: number
}

export interface CashDeposit {
  id: string
  valueCents: number
  netCents: number | null
  status: 'pending' | 'received' | 'expired' | 'refunded' | 'superseded' | string
  qrPayload: string | null
  /** PNG em base64 (sem o prefixo data:). */
  qrImage: string | null
  expiresAt: string
  createdAt: string
  creditedAt: string | null
}

export interface CashState {
  enabled: boolean
  sandbox: boolean
  balanceCents: number
  pixKey: string | null
  pixKeyType: PixKeyType | string | null
  holderName: string | null
  hasCustomer: boolean
  limits: {
    minDepositCents: number
    maxDepositCents: number
    minWithdrawCents: number
    tableCapCents: number
  }
  fees: CashFees | null
  pendingDeposits: CashDeposit[]
}

export interface CashTx {
  id: string
  deltaCents: number
  kind: string
  refId: string | null
  note: string | null
  createdAt: string
}

export interface CashWithdrawal {
  id: string
  valueCents: number
  feeCents: number
  netCents: number
  status: 'pending' | 'done' | 'failed' | string
  failReason?: string | null
  createdAt: string
  settledAt: string | null
}

export const cash = {
  me: (token: string) => request<CashState>('/cash/me', { token }),
  setPixKey: (token: string, input: { type: PixKeyType | null; key: string; holderName?: string }) =>
    request<Omit<CashState, 'enabled' | 'sandbox' | 'limits' | 'fees' | 'pendingDeposits'>>('/cash/pix-key', {
      token,
      method: 'PUT',
      body: JSON.stringify(input)
    }),
  deposit: (token: string, input: { valueCents: number; cpfCnpj?: string; name?: string }) =>
    request<{ deposit: CashDeposit }>('/cash/deposit', { token, method: 'POST', body: JSON.stringify(input) }).then(
      (r) => r.deposit
    ),
  depositStatus: (token: string, id: string) =>
    request<{ deposit: CashDeposit; balanceCents: number }>(`/cash/deposits/${id}`, { token }),
  withdraw: (token: string, valueCents: number) =>
    request<{ withdrawal: CashWithdrawal; balanceCents: number }>('/cash/withdraw', {
      token,
      method: 'POST',
      body: JSON.stringify({ valueCents })
    }),
  history: (token: string) => request<{ entries: CashTx[] }>('/cash/history', { token }).then((r) => r.entries),
  withdrawals: (token: string) =>
    request<{ withdrawals: CashWithdrawal[] }>('/cash/withdrawals', { token }).then((r) => r.withdrawals)
}

/** "R$ 19,01" */
export function formatBrl(centsValue: number): string {
  return (centsValue / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Quanto entra de um depósito, pela tabela de taxas que o Asaas informou. */
export function estimateNet(valueCents: number, fees: CashFees | null): number | null {
  if (!fees) return null
  const pct = Math.round((valueCents * fees.pixInPercent) / 100)
  return Math.max(0, valueCents - fees.pixInFixedCents - pct)
}

export const CASH_KIND_LABEL: Record<string, string> = {
  deposit: 'Depósito Pix',
  deposit_refund: 'Estorno de depósito',
  buyin: 'Buy-in na mesa',
  topup: 'Recarga na mesa',
  cashout: 'Levantou da mesa',
  refund: 'Devolução da mesa',
  withdraw: 'Saque Pix',
  withdraw_failed: 'Saque devolvido',
  admin: 'Ajuste'
}
