# Finaxis

Controle financeiro com Open Finance, categorização automática, caixinhas com simulador de metas, contas fixas, orçamentos, relatórios e educação financeira.

## Rodar

Requer **Node 22.13+**. Em desenvolvimento, o banco padrão é SQLite local; na Vercel, use Postgres via Neon.

```bash
cp .env.example .env      # opcional: sem .env roda em modo demonstração
npm start                 # http://127.0.0.1:5173
npm test                  # testes da API e do mapeamento bancário
```

## Publicar na Vercel

O build prepara os arquivos públicos e publica a API como função serverless. A integração Neon precisa estar conectada ao projeto e fornecer `DATABASE_URL`; sem essa variável a API falha de forma explícita, porque o disco da Vercel não é um banco persistente. A configuração usa a região `gru1` para a função e para o banco.

Para usar Open Finance real, configure também `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` nas variáveis de ambiente da Vercel. Sem essas credenciais, o app oferece o modo de demonstração.

- `index.html`: landing page
- `app.html`: o app. Pede login; também dá para "Explorar sem conta" (dados só no navegador).

## Open Finance de verdade (Pluggy)

1. Crie uma conta em <https://dashboard.pluggy.ai> e gere **Client ID** e **Client Secret** (o sandbox é gratuito).
2. No `.env`, preencha `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`, e reinicie.
3. Em **Contas & cartões → Conectar banco**, abre o widget oficial do Pluggy. No sandbox, escolha **Pluggy Bank** e entre com `user-ok` / `password-ok` (MFA `123456`).

O fluxo:

```
App ──POST /api/openfinance/connect-token──▶ Servidor ──/auth + /connect_token (clientUserId = id do usuário)──▶ Pluggy
App ◀── widget Pluggy Connect (o usuário autoriza no banco; o Finaxis nunca vê a senha)
App ──POST /api/openfinance/items {itemId}──▶ Servidor confere que item.clientUserId é do usuário logado
Servidor ──/items, /accounts, /v2/transactions (cursor)──▶ Pluggy ──▶ banco persistente ──SSE──▶ abas abertas
```

**Tempo real:**
- **Com webhook:** é preciso uma URL **https pública**; o Pluggy não aceita localhost. Defina `PUBLIC_URL` e `WEBHOOK_SECRET`. O Finaxis envia a URL de callback por Connect Token, com um segredo aleatório, e confirma o recebimento antes de processar o evento. Em desenvolvimento, use um túnel, como `cloudflared tunnel --url http://localhost:5173`.
- **Sem webhook:** o servidor sincroniza quando o usuário abre o app (conexões paradas há mais de 10 min) e a cada `SYNC_INTERVAL_MINUTES`.

**Sem credenciais:** o servidor usa o **provedor de demonstração**, com bancos fictícios que mandam uma transação a cada `DEMO_LIVE_SECONDS` para quem está com o app aberto.

### Histórico e investimentos

Na primeira conexão, o Finaxis busca até 365 dias de transações de contas e cartões (o limite histórico disponível na consulta Pluggy), incluindo entradas, compras e demais movimentos que a instituição disponibilizar. As sincronizações seguintes atualizam lançamentos recentes para capturar alterações e itens que chegaram atrasados. A cobertura e o tempo de atualização variam por instituição.

O widget também solicita o produto de investimentos. Quando a instituição, o consentimento e o plano Pluggy permitem, os saldos de ativos — incluindo produtos apresentados pelo banco como caixinhas/cofrinhos — aparecem em **Caixinhas** como dados bancários somente para leitura. Metas criadas no Finaxis continuam separadas e não movimentam dinheiro.

## Arquitetura

| Parte | O que faz |
|---|---|
| `server/index.js` | Rotas, CSP e cabeçalhos de segurança, CSRF (cabeçalho `X-Finaxis` + checagem de Origin); usado pelo servidor local e pela função em `api/[...path].js` |
| `server/auth.js` | Cadastro/login com scrypt, sessão em cookie `HttpOnly; SameSite=Lax` (token guardado só como hash), limite de tentativas |
| `server/store.js` | Documento do usuário (perfil, metas, orçamentos...) com versão otimista (409 em conflito) + transações em tabela própria (upsert/delete por id, tombstones para itens bancários excluídos) |
| `server/events.js` | SSE: avisa as outras abas/dispositivos quando algo muda |
| `server/openfinance/` | Cliente Pluggy, mapeamento conta/cartão/transação, sync, webhooks, provedor demo |
| `assets/js/app.js` | App (vanilla JS). Envia só o que mudou (`PUT /api/state`), mescla conflitos, ouve `/api/events` |

Banco local: SQLite embutido do Node (`data/finaxis.db`). Produção: Postgres Neon (`DATABASE_URL`). Para começar do zero localmente, pare o servidor e apague `data/`.

## Antes de ir para produção

- **HTTPS** atrás de um proxy, com `TRUST_PROXY=true` e `COOKIE_SECURE=true`.
- **Pluggy:** contrato de produção. O uso de dados de Open Finance também exige termos de uso e política de privacidade (LGPD) no app. A exclusão de conta já apaga tudo e revoga as conexões.
- **Sinal dos valores de cartão:** a documentação do Pluggy é ambígua. O mapeamento trata como compra tudo que não for pagamento de fatura ou estorno (veja `test/mapping.test.js`). **Valide com dados reais do sandbox.**
- **Categorias enriquecidas do Pluggy** (campo `category`) exigem o plano Pro. Sem elas, a categorização usa as regras do app e o que o usuário ensinar.
- **Lançamentos manuais em contas conectadas** (ex.: aporte em caixinha) somam ao saldo informado pelo banco até a próxima sincronização.
- **SSE:** notificações entre instâncias serverless podem não alcançar todas as abas; o estado é persistido no Postgres e carregado novamente pelo cliente.
- **Debug:** `app.html?debug` expõe `window.__finaxis` no console.
