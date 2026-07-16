import fs from 'fs';
import {
  getCachedPlanningRows,
  getSpecialFamilyBaseRows,
  getGrupoSubgrupoProdutos,
  getReferencePlanningRows,
  getFamilyReferenceRows
} from '../server/cacheRepository.js';
import { loadSkusVerao27 } from '../server/excelReader.js';
import { buildDashboardFromSales } from '../server/dashboardBuilder.js';

const TARGETS = new Set([
  '103010',
  '103605',
  '136109',
  '503503'
]);
const ADDITIONAL_REFERENCE_BASE_ROWS = ['503810'];
const CURVE_2026_REFERENCE_ROWS = ['211303', '211703', '136121', '136221', '136910'];

function norm(value) {
  return String(value || '').trim().toUpperCase();
}

function csvValue(value) {
  const text = String(value ?? '');
  if (/[",\n;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeCsv(file, rows, headers) {
  const lines = [
    headers.join(';'),
    ...rows.map(row => headers.map(header => csvValue(row[header])).join(';'))
  ];
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
}

function add(map, key, value) {
  map.set(key, (map.get(key) || 0) + Number(value || 0));
}

function buildHistory(rows) {
  const maps = {
    refCorTam: new Map(),
    refTam: new Map(),
    refTotal: new Map(),
    familiaGrupoSubgrupoTam: new Map(),
    familiaGrupoTam: new Map(),
    familiaTam: new Map()
  };

  rows.forEach((row) => {
    const familia = norm(row.familia);
    const grupo = norm(row.grupo);
    const subgrupo = norm(row.subgrupo);
    const ref = norm(row.referencia || row.ref);
    const cor = norm(row.cor);
    const tam = norm(row.tamanho || row.tam);
    const venda = Number(row.venda || 0);

    add(maps.refCorTam, `${ref}|${cor}|${tam}`, venda);
    add(maps.refTam, `${ref}|${tam}`, venda);
    add(maps.refTotal, ref, venda);
    add(maps.familiaGrupoSubgrupoTam, `${familia}|${grupo}|${subgrupo}|${tam}`, venda);
    add(maps.familiaGrupoTam, `${familia}|${grupo}|${tam}`, venda);
    add(maps.familiaTam, `${familia}|${tam}`, venda);
  });

  return maps;
}

function reasonFor(row, history) {
  const familia = norm(row.familiaHist || row.familia);
  const grupo = norm(row.grupoHist || row.grupo);
  const subgrupo = norm(row.subgrupoHist || row.subgrupo);
  const ref = norm(row.ref);
  const cor = norm(row.cor);
  const tam = norm(row.tam);
  const vendaBase = Number(row.vendaBase || 0);
  const match = norm(row.matchSubgrupo);

  const refCorTam = history.refCorTam.get(`${ref}|${cor}|${tam}`) || 0;
  const refTam = history.refTam.get(`${ref}|${tam}`) || 0;
  const refTotal = history.refTotal.get(ref) || 0;
  const histSubgrupoTam = history.familiaGrupoSubgrupoTam.get(`${familia}|${grupo}|${subgrupo}|${tam}`) || 0;
  const histGrupoTam = history.familiaGrupoTam.get(`${familia}|${grupo}|${tam}`) || 0;
  const histFamiliaTam = history.familiaTam.get(`${familia}|${tam}`) || 0;

  let motivo = 'SEM_CAUSA_CLASSIFICADA';
  if (match.includes('SEM_CURVA')) motivo = 'FAMILIA_SEM_CURVA_TOTAL';
  else if (vendaBase <= 0 && refTotal <= 0) motivo = 'REFERENCIA_SEM_HISTORICO_BASE';
  else if (vendaBase <= 0 && refTotal > 0 && refTam <= 0) motivo = 'TAMANHO_SEM_HISTORICO_NA_REFERENCIA';
  else if (vendaBase <= 0 && refTam > 0 && refCorTam <= 0) motivo = 'COR_TAMANHO_SEM_HISTORICO';
  else if (vendaBase <= 0 && histSubgrupoTam <= 0 && histGrupoTam > 0) motivo = 'SUBGRUPO_SEM_TAMANHO_MAS_GRUPO_TEM';
  else if (vendaBase <= 0 && histFamiliaTam > 0) motivo = 'SUBGRUPO_GRUPO_SEM_TAMANHO_MAS_FAMILIA_TEM';
  else if (Number(row.plano || 0) <= 0 && vendaBase > 0) motivo = 'ARREDONDAMENTO_OU_ALOCACAO_BAIXA';

  return {
    motivo,
    histRefCorTam: refCorTam,
    histRefTam: refTam,
    histRefTotal: refTotal,
    histSubgrupoTam,
    histGrupoTam,
    histFamiliaTam
  };
}

const rows = [
  ...await getCachedPlanningRows(),
  ...await getReferencePlanningRows({ referencias: ADDITIONAL_REFERENCE_BASE_ROWS })
];
const specialBaseRows = await getSpecialFamilyBaseRows();
const curve2026Rows = await getFamilyReferenceRows({
  referencias: CURVE_2026_REFERENCE_ROWS,
  colecoes: ['INVERNO 26', 'VERAO 26']
});
const allHistoryRows = [...rows, ...specialBaseRows];
const skus = loadSkusVerao27();
const codProdutos = skus.map(sku => sku.codProduto).filter(Boolean);
const grupoSubgrupoMap = await getGrupoSubgrupoProdutos(codProdutos);
const dashboard = buildDashboardFromSales(rows, { grupoSubgrupoMap, specialBaseRows, curve2026Rows });
const history = buildHistory(allHistoryRows);

const zeros = dashboard.planoEdicaoLimitadaData
  .filter(row => Number(row.plano || 0) <= 0)
  .map(row => {
    const extra = reasonFor(row, history);
    return {
      familia: row.familia,
      ref: row.ref,
      cor: row.cor,
      tam: row.tam,
      grupo: row.grupo,
      subgrupo: row.subgrupo,
      continuidade: row.continuidade,
      plano: row.plano,
      vendaBase: row.vendaBase,
      familiaHist: row.familiaHist,
      grupoHist: row.grupoHist,
      subgrupoHist: row.subgrupoHist,
      matchSubgrupo: row.matchSubgrupo,
      ...extra
    };
  });

const summaryMap = new Map();
zeros.forEach((row) => {
  const key = `${row.familia}|${row.ref}|${row.motivo}`;
  const current = summaryMap.get(key) || {
    familia: row.familia,
    ref: row.ref,
    motivo: row.motivo,
    skusZerados: 0,
    cores: new Set(),
    tamanhos: new Set()
  };
  current.skusZerados += 1;
  current.cores.add(row.cor);
  current.tamanhos.add(row.tam);
  summaryMap.set(key, current);
});

const summary = [...summaryMap.values()]
  .map(row => ({
    familia: row.familia,
    ref: row.ref,
    motivo: row.motivo,
    skusZerados: row.skusZerados,
    cores: [...row.cores].sort().join(', '),
    tamanhos: [...row.tamanhos].sort().join(', ')
  }))
  .sort((a, b) => b.skusZerados - a.skusZerados || a.familia.localeCompare(b.familia) || a.ref.localeCompare(b.ref));

const familyGroupSummaryMap = new Map();
allHistoryRows.forEach((row) => {
  const familia = norm(row.familia);
  const key = `${familia}|${norm(row.grupo)}|${norm(row.subgrupo)}`;
  const current = familyGroupSummaryMap.get(key) || {
    familia,
    grupo: norm(row.grupo),
    subgrupo: norm(row.subgrupo),
    venda: 0,
    tamanhos: new Set()
  };
  current.venda += Number(row.venda || 0);
  current.tamanhos.add(norm(row.tamanho || row.tam));
  familyGroupSummaryMap.set(key, current);
});

const familyGroupSummary = [...familyGroupSummaryMap.values()]
  .map(row => ({
    familia: row.familia,
    grupo: row.grupo,
    subgrupo: row.subgrupo,
    venda: row.venda,
    tamanhos: [...row.tamanhos].sort().join(', ')
  }))
  .sort((a, b) => a.familia.localeCompare(b.familia) || b.venda - a.venda);

const targetRows = zeros.filter(row => TARGETS.has(String(row.ref)));
const targetAllRows = dashboard.planoEdicaoLimitadaData
  .filter(row => TARGETS.has(String(row.ref)))
  .map(row => ({
    familia: row.familia,
    ref: row.ref,
    cor: row.cor,
    tam: row.tam,
    grupo: row.grupo,
    subgrupo: row.subgrupo,
    continuidade: row.continuidade,
    plano: row.plano,
    vendaBase: row.vendaBase,
    familiaHist: row.familiaHist,
    grupoHist: row.grupoHist,
    subgrupoHist: row.subgrupoHist,
    matchSubgrupo: row.matchSubgrupo,
    ...reasonFor(row, history)
  }));

writeCsv('skus-zerados-detalhe.csv', zeros, [
  'familia', 'ref', 'cor', 'tam', 'grupo', 'subgrupo', 'continuidade', 'plano', 'vendaBase',
  'familiaHist', 'grupoHist', 'subgrupoHist', 'matchSubgrupo', 'motivo',
  'histRefCorTam', 'histRefTam', 'histRefTotal', 'histSubgrupoTam', 'histGrupoTam', 'histFamiliaTam'
]);
writeCsv('skus-zerados-resumo.csv', summary, ['familia', 'ref', 'motivo', 'skusZerados', 'cores', 'tamanhos']);
writeCsv('skus-zerados-alvos.csv', targetRows, [
  'familia', 'ref', 'cor', 'tam', 'grupo', 'subgrupo', 'continuidade', 'plano', 'vendaBase',
  'familiaHist', 'grupoHist', 'subgrupoHist', 'matchSubgrupo', 'motivo',
  'histRefCorTam', 'histRefTam', 'histRefTotal', 'histSubgrupoTam', 'histGrupoTam', 'histFamiliaTam'
]);
writeCsv('skus-alvos-completo.csv', targetAllRows, [
  'familia', 'ref', 'cor', 'tam', 'grupo', 'subgrupo', 'continuidade', 'plano', 'vendaBase',
  'familiaHist', 'grupoHist', 'subgrupoHist', 'matchSubgrupo', 'motivo',
  'histRefCorTam', 'histRefTam', 'histRefTotal', 'histSubgrupoTam', 'histGrupoTam', 'histFamiliaTam'
]);
writeCsv('historico-familia-grupo-subgrupo.csv', familyGroupSummary, [
  'familia', 'grupo', 'subgrupo', 'venda', 'tamanhos'
]);

console.log(JSON.stringify({
  totalSkus: dashboard.planoEdicaoLimitadaData.length,
  totalZerados: zeros.length,
  refsZeradas: new Set(zeros.map(row => row.ref)).size,
  targetRows: targetRows.length,
  topResumo: summary.slice(0, 20)
}, null, 2));
