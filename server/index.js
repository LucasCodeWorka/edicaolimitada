import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getCachedPlanningRows,
  getLatestCacheRun,
  refreshPlanningCache,
  getGrupoSubgrupoProdutos
} from './cacheRepository.js';
import { buildDashboardFromSales } from './dashboardBuilder.js';
import {
  getClassificationTypes,
  getCompanies,
  getHealth,
  getSalesSummary
} from './dashboardRepository.js';
import { loadSkusVerao27 } from './excelReader.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const dashboardCache = new Map();

function normalizeOption(value, fallback = 'SEM INFO') {
  const text = String(value || '').trim();
  return text || fallback;
}

function groupPlanRows(rows, key) {
  const grouped = new Map();

  rows.forEach((row) => {
    const name = normalizeOption(row[key]);
    grouped.set(name, (grouped.get(name) || 0) + Number(row.plano || 0));
  });

  return Array.from(grouped, ([nome, valor]) => ({ nome, valor }))
    .sort((a, b) => b.valor - a.valor);
}

function refreshPlanDerivedData(dashboard) {
  const rows = dashboard.planoEdicaoLimitadaData || [];
  const unique = (key) => Array.from(new Set(rows.map(row => normalizeOption(row[key])).filter(Boolean))).sort();

  dashboard.filterOptions = {
    ...(dashboard.filterOptions || {}),
    grupos: ['TODAS', ...unique('grupo')],
    subgrupos: ['TODAS', ...unique('subgrupo')]
  };
  dashboard.grupoData = groupPlanRows(rows, 'grupo');
  dashboard.subgrupoData = groupPlanRows(rows, 'subgrupo');
}

app.use(cors({
  origin: process.env.CORS_ORIGIN || true
}));
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  try {
    const db = await getHealth();
    res.json({ ok: true, db });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/db/classification-types', async (_req, res) => {
  try {
    res.json(await getClassificationTypes());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/db/companies', async (_req, res) => {
  try {
    res.json(await getCompanies());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/db/sales', async (req, res) => {
  try {
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const limit = Math.min(Number(req.query.limit || 1000), 10000);

    res.json(await getSalesSummary({ startDate, endDate, limit }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/cache/status', async (_req, res) => {
  try {
    res.json(await getLatestCacheRun());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/cache/refresh', async (req, res) => {
  try {
    const startDate = req.body?.startDate || '2025-07-01';
    const endDate = req.body?.endDate || '2025-12-31';

    dashboardCache.clear();
    res.json(await refreshPlanningCache({ startDate, endDate }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dashboard-data', async (req, res) => {
  if (req.query.source === 'db') {
    try {
      const cacheKey = 'verao26-edicao-limitada-2025s2-v10'; // v10: curva de tamanho por grade ordenada
      const needsRefresh = !dashboardCache.has(cacheKey) || req.query.refresh === '1';
      console.log('[dashboard-data] cacheKey:', cacheKey, 'hasCache:', dashboardCache.has(cacheKey), 'refresh:', req.query.refresh, 'needsRefresh:', needsRefresh);

      if (needsRefresh) {
        const rows = await getCachedPlanningRows();

        if (rows.length === 0) {
          res.status(409).json({
            error: 'Cache do banco ainda nao foi carregado. Execute POST /api/cache/refresh primeiro.'
          });
          return;
        }

        const skusExcel = loadSkusVerao27();
        const codProdutosPlano = skusExcel
          .map(sku => sku.codProduto)
          .filter(cod => cod && cod !== '');
        const grupoSubgrupoMap = await getGrupoSubgrupoProdutos(codProdutosPlano);
        const dashboard = buildDashboardFromSales(rows, { grupoSubgrupoMap });

        // Enriquecer SKUs com grupo/subgrupo do banco
        const codProdutos = dashboard.planoEdicaoLimitadaData
          .map(sku => sku.codProduto)
          .filter(cod => cod && cod !== '');

        if (codProdutos.length > 0) {
          dashboard.planoEdicaoLimitadaData.forEach(sku => {
            const info = grupoSubgrupoMap[sku.codProduto];
            if (info) {
              sku.grupo = info.grupo;
              sku.subgrupo = info.subgrupo;
            }
          });

          console.log('[dashboard-data] Enriquecidos', Object.keys(grupoSubgrupoMap).length, 'SKUs com grupo/subgrupo');
        }

        refreshPlanDerivedData(dashboard);
        dashboardCache.set(cacheKey, dashboard);
      }

      res.json(dashboardCache.get(cacheKey));
      return;
    } catch (error) {
      res.status(500).json({ error: error.message });
      return;
    }
  }

  const filePath = path.join(rootDir, 'dados_reais.json');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  data.meta = {
    ...(data.meta || {}),
    origem: 'arquivo-local',
    observacao: 'Use /api/dashboard-data?source=db para gerar a primeira versao pelo banco usando mv_vendas_qtd.'
  };

  res.json(data);
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`API do dashboard em http://localhost:${port}`);
});
