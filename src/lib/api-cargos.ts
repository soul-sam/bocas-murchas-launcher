import { request } from './api'

/**
 * Cargos — os crachás do grupo.
 *
 * Espelha `/api/cargos`. Duas coisas que valem saber:
 *
 * 1. **O catálogo vem separado do payload de usuário.** O servidor manda os
 *    cargos que existem mais um mapa `userId -> [cargoId]`, e o cliente cruza
 *    os dois. É de propósito: enfiar cargo dentro de `user:profileUpdated`
 *    faria qualquer rota que emite esse evento com menos campos apagar dado da
 *    lista de membros (ver o comentário em members-context).
 *
 * 2. **A ordem que chega é a ordem que vale.** Tanto `cargos` quanto cada
 *    lista de `members` vêm ordenados por prioridade decrescente, então o
 *    primeiro item é o cargo que pinta o nome e o chip que aparece quando só
 *    cabe um. Não reordene aqui.
 */

export interface Cargo {
  id: string
  name: string
  description: string | null
  /** Hex com #. */
  color: string
  /** Nome de ícone do lucide — resolvido em lib/cargo-icons.tsx. */
  icon: string
  permissions: string[]
  priority: number
  /** Semeado pelo servidor: o painel não deixa apagar. */
  builtin: boolean
}

export interface CargosState {
  cargos: Cargo[]
  /** userId -> ids de cargo, maior prioridade primeiro. */
  members: Record<string, string[]>
}

export interface PermissionDef {
  key: string
  label: string
  description: string
}

export const cargosApi = {
  list: (token: string | null) => request<CargosState>('/cargos', { token }),

  /**
   * As permissões que ESTE servidor confere.
   *
   * Vem de lá em vez de estar numa constante daqui porque um launcher novo
   * contra um servidor velho ofereceria caixinha que não faz nada.
   */
  permissions: (token: string | null) =>
    request<{ permissions: PermissionDef[] }>('/cargos/permissions', { token }),

  create: (
    token: string | null,
    body: { name: string; description?: string; color?: string; icon?: string; permissions?: string[]; priority?: number }
  ) => request<{ cargo: Cargo }>('/cargos', { method: 'POST', token, body: JSON.stringify(body) }),

  update: (
    token: string | null,
    id: string,
    patch: Partial<{
      name: string
      description: string | null
      color: string
      icon: string
      permissions: string[]
      priority: number
    }>
  ) => request<{ cargo: Cargo }>(`/cargos/${id}`, { method: 'PUT', token, body: JSON.stringify(patch) }),

  remove: (token: string | null, id: string) =>
    request<{ message: string }>(`/cargos/${id}`, { method: 'DELETE', token }),

  grant: (token: string | null, cargoId: string, userId: string) =>
    request<{ message: string }>(`/cargos/${cargoId}/members/${userId}`, { method: 'POST', token }),

  revoke: (token: string | null, cargoId: string, userId: string) =>
    request<{ message: string }>(`/cargos/${cargoId}/members/${userId}`, { method: 'DELETE', token })
}

/**
 * Slug de um nome de cargo — o mesmo que o servidor gera (`lib/cargos.ts`).
 *
 * Existe no cliente pra resolver menção (`@impressora-murcha`) sem ida ao
 * servidor: o chat pergunta "essa mensagem fala comigo?" no instante em que a
 * mensagem chega, e uma requisição nesse caminho atrasaria a notificação.
 *
 * Renomear um cargo não muda o id, então quem resolve menção testa os DOIS: o
 * id (slug do nome original) e o slug do nome atual.
 */
export function cargoSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/** A menção `@token` cita este cargo? */
export function cargoMatchesToken(cargo: Cargo, token: string): boolean {
  const needle = token.toLowerCase()
  return cargo.id.toLowerCase() === needle || cargoSlug(cargo.name) === needle
}
