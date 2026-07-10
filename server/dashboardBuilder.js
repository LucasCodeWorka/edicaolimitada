import { loadSkusVerao27, getSkusPorFamilia, getFamiliasVerao27 } from './excelReader.js';
import {
  loadDeparaFamilias,
  getFamiliaHistorica,
  ehDePara,
  REGRAS_ESPECIAIS,
  CRESCIMENTO_PADRAO,
  calcularPlanoFamilia,
  distribuirPlanoPorLoja,
  getLinha
} from './planningRules.js';

const fmtMonthPlan = [
  { mes: 'JULHO', peso: 0.25 },
  { mes: 'AGOSTO', peso: 0.35 },
  { mes: 'SETEMBRO', peso: 0.20 },
  { mes: 'OUTUBRO', peso: 0.20 }
];

function roundToTotal(items, getValue, targetTotal) {
  const prepared = items.map((item, index) => {
    const raw = getValue(item);
    const base = Math.floor(raw);
    return { item, index, base, fraction: raw - base };
  });

  let remaining = targetTotal - prepared.reduce((sum, row) => sum + row.base, 0);
  prepared.sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const values = new Map();
  prepared.forEach((row, index) => {
    values.set(row.index, row.base + (index < remaining ? 1 : 0));
  });

  return items.map((item, index) => values.get(index));
}

function normalizeName(value, fallback = 'SEM INFO') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeStoreName(value) {
  return normalizeName(value)
    .replace(/^LIEBE\s+/i, '')
    .replace(/\s+-\s+[A-Z]{2}$/i, '')
    .replace(/\s+SHOPPING$/i, '')
    .trim();
}

function groupSum(rows, key, valueKey = 'plano') {
  const map = new Map();
  rows.forEach((row) => {
    const name = normalizeName(row[key]);
    map.set(name, (map.get(name) || 0) + Number(row[valueKey] || 0));
  });
  return Array.from(map, ([nome, valor]) => ({ nome, valor }))
    .sort((a, b) => b.valor - a.valor);
}

function buildFilterOptions({ lojas, planoRows }) {
  const unique = (key) => Array.from(new Set(planoRows.map((row) => normalizeName(row[key])).filter(Boolean))).sort();
  return {
    empresas: ['TODAS', ...lojas],
    familias: ['TODAS', ...unique('familia')],
    linhas: ['TODAS', ...unique('linha')],
    grupos: ['TODAS', ...unique('grupo')],
    continuidades: ['TODAS', ...unique('continuidade')],
    colecoes: ['TODAS', ...unique('colecao')],
    meses: ['TODOS', ...fmtMonthPlan.map((row) => row.mes)],
    referencias: ['TODAS', ...unique('ref')]
  };
}

function buildMonthPlan(totalPlano) {
  const raw = fmtMonthPlan.map((item) => ({ ...item, raw: totalPlano * item.peso }));
  const values = roundToTotal(raw, (item) => item.raw, totalPlano);
  return raw.map((item, index) => ({
    mes: item.mes,
    valor: values[index]
  }));
}

// Lojas que devem sempre estar no plano (mesmo sem historico)
// ECOMMERCE com 1.5% baseado em vendas recentes (92 pecas/3 meses)
const LOJAS_OBRIGATORIAS = {
  'ECOMMERCE': 0.015  // 1.5% do plano (baseado em vendas recentes)
};

// Funcao principal: constroi dashboard a partir das vendas do cache
// usando SKUs do Excel e regras de de-para
export function buildDashboardFromSales(rows) {
  // Carregar SKUs do Excel e de-para
  const skusExcel = loadSkusVerao27();
  const depara = loadDeparaFamilias();

  console.log('[dashboardBuilder] SKUs do Excel:', skusExcel.length);
  console.log('[dashboardBuilder] Linhas de venda do cache:', rows.length);

  // Agrupar vendas por familia historica e loja
  const vendasPorFamiliaLoja = {};
  const vendasPorFamiliaRef = {};
  const lojas = new Set();

  for (const row of rows) {
    const loja = normalizeStoreName(row.empresa);
    const familia = normalizeName(row.familia).toUpperCase();
    lojas.add(loja);

    const keyFL = `${familia}|${loja}`;
    vendasPorFamiliaLoja[keyFL] = (vendasPorFamiliaLoja[keyFL] || 0) + Number(row.venda || 0);

    // Tambem por referencia/cor/tamanho para distribuicao detalhada
    const ref = normalizeName(row.referencia, row.idproduto);
    const cor = normalizeName(row.cor).toUpperCase();
    const tam = normalizeName(row.tamanho).toUpperCase();
    const keyFR = `${familia}|${ref}|${cor}|${tam}`;
    if (!vendasPorFamiliaRef[keyFR]) {
      vendasPorFamiliaRef[keyFR] = {
        familia,
        ref,
        cor,
        tam,
        grupo: normalizeName(row.grupo),
        subgrupo: normalizeName(row.subgrupo),
        classificacao: normalizeName(row.classificacao),
        continuidade: normalizeName(row.continuidade),
        venda: 0
      };
    }
    vendasPorFamiliaRef[keyFR].venda += Number(row.venda || 0);
  }

  // Adicionar lojas obrigatorias que nao estao no historico
  for (const loja of Object.keys(LOJAS_OBRIGATORIAS)) {
    lojas.add(loja);
  }

  const lojasArray = [...lojas].sort();
  console.log('[dashboardBuilder] Lojas encontradas:', lojasArray.length);

  // Para cada familia do Excel, calcular plano
  const familiasDashboard = [];
  const planoRows = [];
  const skusPorFamilia = {};

  // Agrupar SKUs do Excel por familia
  for (const sku of skusExcel) {
    if (!skusPorFamilia[sku.familia]) {
      skusPorFamilia[sku.familia] = [];
    }
    skusPorFamilia[sku.familia].push(sku);
  }

  const familiasProcessadas = new Set();

  for (const familiaNova of Object.keys(skusPorFamilia)) {
    const familiaHist = getFamiliaHistorica(familiaNova);
    const temDePara = ehDePara(familiaNova);

    // Buscar vendas da familia historica
    const vendasPorLoja = {};
    let vendaTotalFamilia = 0;

    for (const loja of lojasArray) {
      const key = `${familiaHist}|${loja}`;
      const venda = vendasPorFamiliaLoja[key] || 0;
      vendasPorLoja[loja] = venda;
      vendaTotalFamilia += venda;
    }

    // Calcular plano usando regras
    const resultado = calcularPlanoFamilia(familiaNova, vendaTotalFamilia);
    const planoTotal = resultado.plano;

    // Distribuir por loja (com tratamento especial para lojas sem historico)
    let planoPorLoja = distribuirPlanoPorLoja(planoTotal, vendasPorLoja);

    // Ajustar para lojas obrigatorias sem historico
    // Reservar percentual para essas lojas e redistribuir o resto
    let planoReservado = 0;
    for (const [loja, perc] of Object.entries(LOJAS_OBRIGATORIAS)) {
      if (vendasPorLoja[loja] === 0) {
        const planoLoja = Math.round(planoTotal * perc);
        planoPorLoja[loja] = planoLoja;
        planoReservado += planoLoja;
      }
    }

    // Se houve reserva, ajustar as outras lojas proporcionalmente
    if (planoReservado > 0) {
      const planoRestante = planoTotal - planoReservado;
      const totalOutrasLojas = Object.entries(planoPorLoja)
        .filter(([loja]) => !LOJAS_OBRIGATORIAS[loja] || vendasPorLoja[loja] > 0)
        .reduce((sum, [, val]) => sum + val, 0);

      if (totalOutrasLojas > 0) {
        const fator = planoRestante / totalOutrasLojas;
        for (const loja of Object.keys(planoPorLoja)) {
          if (!LOJAS_OBRIGATORIAS[loja] || vendasPorLoja[loja] > 0) {
            planoPorLoja[loja] = Math.round(planoPorLoja[loja] * fator);
          }
        }
      }

      // Ajustar arredondamento para bater o total
      const totalAtual = Object.values(planoPorLoja).reduce((s, v) => s + v, 0);
      const diff = planoTotal - totalAtual;
      if (diff !== 0) {
        // Adiciona/subtrai a diferenca da maior loja (exceto ECOMMERCE)
        const maiorLoja = Object.entries(planoPorLoja)
          .filter(([loja]) => !LOJAS_OBRIGATORIAS[loja])
          .sort((a, b) => b[1] - a[1])[0];
        if (maiorLoja) {
          planoPorLoja[maiorLoja[0]] += diff;
        }
      }
    }

    // Para familias com base_especial, SEMPRE usar a base especial para exibicao
    // Isso garante que PORTELLE, LACE, RENDAS, etc mostrem a base correta
    let vendasParaExibir = vendasPorLoja;
    if (resultado.regra === 'base_especial' && resultado.baseEspecial) {
      // Distribuir a base especial proporcionalmente ao plano por loja
      const baseTotal = resultado.baseEspecial;
      vendasParaExibir = {};
      for (const loja of lojasArray) {
        const proporcao = planoTotal > 0 ? (planoPorLoja[loja] || 0) / planoTotal : 0;
        vendasParaExibir[loja] = Math.round(baseTotal * proporcao);
      }
    }

    // Montar arrays para o comparativo
    const vendas2025 = lojasArray.map(l => Math.round(vendasParaExibir[l] || 0));
    const plano2026 = lojasArray.map(l => planoPorLoja[l] || 0);

    familiasDashboard.push({
      nome: familiaNova,
      familiaHistorica: familiaHist,
      temDePara,
      vendas2025,
      plano2026,
      regraAplicada: resultado.regra,
      obs: resultado.obs
    });

    familiasProcessadas.add(familiaNova);

    // Gerar planoRows (nivel SKU)
    const skusFamilia = skusPorFamilia[familiaNova];
    const totalSkus = skusFamilia.length;

    if (totalSkus > 0) {
      // Distribuir plano entre SKUs proporcionalmente
      // Por enquanto, igual entre todos
      const planoPerSku = Math.floor(planoTotal / totalSkus);
      let resto = planoTotal - (planoPerSku * totalSkus);

      for (const sku of skusFamilia) {
        const planoSku = planoPerSku + (resto > 0 ? 1 : 0);
        if (resto > 0) resto--;

        planoRows.push({
          colecao: 'VERAO 27',
          familia: familiaNova,
          grupo: 'SEM INFO', // Nao temos grupo no Excel
          subgrupo: 'SEM INFO',
          ref: sku.referencia,
          cor: sku.cor,
          tam: sku.tamanho,
          linha: sku.linha || getLinha(familiaNova),
          continuidade: sku.continuidade,
          vendaBase: Math.round(vendaTotalFamilia / totalSkus * 100) / 100,
          percCor: '100.0%',
          plano: planoSku,
          temDepara: temDePara ? 'SIM' : 'NAO',
          temPercentual: resultado.regra !== 'padrao' ? 'SIM' : 'NAO',
          familiaHist: familiaHist
        });
      }
    }
  }

  // Ordenar familias por plano total decrescente
  familiasDashboard.sort((a, b) => {
    const totalA = a.plano2026.reduce((s, v) => s + v, 0);
    const totalB = b.plano2026.reduce((s, v) => s + v, 0);
    return totalB - totalA;
  });

  // Calcular totais
  const totalVenda = familiasDashboard.reduce((sum, f) => sum + f.vendas2025.reduce((s, v) => s + v, 0), 0);
  const totalPlano = familiasDashboard.reduce((sum, f) => sum + f.plano2026.reduce((s, v) => s + v, 0), 0);

  console.log('[dashboardBuilder] Familias processadas:', familiasDashboard.length);
  console.log('[dashboardBuilder] Total venda base:', totalVenda);
  console.log('[dashboardBuilder] Total plano:', totalPlano);

  return {
    meta: {
      origem: 'banco',
      regra: 'SKUs do Excel Verao 27 + de-para familias + regras especiais',
      geradoEm: new Date().toISOString(),
      familiasProcessadas: familiasDashboard.length,
      skusProcessados: planoRows.length
    },
    filterOptions: buildFilterOptions({ lojas: lojasArray, planoRows }),
    kpiData: {
      plano2026: totalPlano,
      plano2026Original: totalPlano,
      venda2025: totalVenda,
      inverno26: 0,
      inverno25: 0,
      altoInverno26: 0,
      altoInverno25: 0
    },
    grupoData: groupSum(planoRows, 'grupo'),
    grupoData2025: groupSum(planoRows, 'grupo', 'vendaBase'),
    familiaData: groupSum(planoRows, 'familia'),
    familiaData2025: groupSum(planoRows, 'familia', 'vendaBase'),
    linhaData: groupSum(planoRows, 'linha'),
    linhaData2025: groupSum(planoRows, 'linha', 'vendaBase'),
    subgrupoData: groupSum(planoRows, 'subgrupo'),
    subgrupoData2025: groupSum(planoRows, 'subgrupo', 'vendaBase'),
    refData: groupSum(planoRows, 'ref'),
    refData2025: groupSum(planoRows, 'ref', 'vendaBase'),
    mesProducaoData: buildMonthPlan(totalPlano),
    mesVenda2025Data: buildMonthPlan(totalVenda),
    planoEdicaoLimitadaData: planoRows,
    comparativoLojasData: {
      lojas: lojasArray,
      familias: familiasDashboard.map(f => ({
        nome: f.nome,
        vendas2025: f.vendas2025,
        plano2026: f.plano2026
      }))
    },
    mapeamentoFamiliasData: {
      lojas: lojasArray,
      familias: familiasDashboard.map(f => ({
        familiaAtual: f.nome,
        familiaAnterior: f.familiaHistorica,
        vendas2025: f.vendas2025,
        plano2026: f.plano2026
      }))
    }
  };
}
