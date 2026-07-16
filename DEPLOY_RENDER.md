# Deploy Render - Edicao Limitada

## Mapa da aplicacao

Este projeto sobe como um unico Web Service no Render:

- Frontend: React/Vite, buildado em `dist/`.
- Backend: Express em `server/index.js`.
- Banco: Postgres externo, acessado pelo backend.
- API usada pelo painel: `/api/dashboard-data?source=db`.

O mesmo servico Express entrega o frontend e a API. Por isso, em producao, o frontend usa URL relativa para a API.

## Repositorio GitHub

Repositorio de destino:

```text
https://github.com/LucasCodeWorka/edicaolimitada.git
```

## Blueprint Render

O arquivo `render.yaml` ja esta configurado para:

```text
buildCommand: npm install && npm run build
startCommand: node server/index.js
```

## Variaveis de ambiente no Render

Configurar no painel do Render:

```text
VITE_DASHBOARD_DATA_SOURCE=db
DB_HOST=<host do postgres>
DB_PORT=5432
DB_NAME=<nome do banco>
DB_USER=<usuario>
DB_PASSWORD=<senha>
DB_SSL=true
```

Opcional:

```text
CORS_ORIGIN=<url do proprio Render ou vazio>
DB_POOL_MAX=5
```

Nao precisa configurar `VITE_DASHBOARD_API_URL` no Render se frontend e backend estiverem no mesmo Web Service.

## Primeiro carregamento do cache

Depois do deploy, acesse:

```text
POST https://<seu-app-render>.onrender.com/api/cache/refresh
```

Body opcional:

```json
{
  "startDate": "2025-07-01",
  "endDate": "2025-12-31"
}
```

Depois valide:

```text
GET https://<seu-app-render>.onrender.com/api/health
GET https://<seu-app-render>.onrender.com/api/dashboard-data?source=db
```

## Rotas principais

```text
GET  /                         Frontend
GET  /api/health               Teste de conexao com banco
GET  /api/dashboard-data       Dados do dashboard
POST /api/cache/refresh        Atualiza cache de vendas/produtos
GET  /api/cache/status         Ultima execucao do cache
```

