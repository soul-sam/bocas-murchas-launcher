# Deploy por SSH: `passphrase` em chave sem frase descarta a chave

- **Data:** 2026-10-11/12 (commit `fix(deploy): site entra na VPS pela chave, sem senha`)
- **Contexto:** VPS passou a `PasswordAuthentication no`.
- **Armadilha:** passar `passphrase` ao appleboy/scp-action com chave sem frase faz o ParsePrivateKey falhar e
  a chave é descartada em silêncio; antes caía no login por senha e ninguém percebia.
- **Decisão:** deploy-web.yml e apk.yml usam só `key` (apk.yml corrigido em 2026-10-16, ainda não
  exercitado: o último APK rodou em 17/09, antes da troca na VPS). Nunca voltar `password`/`passphrase`.
- **Fonte:** `.github/workflows/deploy-web.yml`, passo "Enviar pra VPS".
