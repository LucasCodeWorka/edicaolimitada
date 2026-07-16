import fs from 'fs';
import { getCachedPlanningRows, getGrupoSubgrupoProdutos, getReferencePlanningRows, getSpecialFamilyBaseRows, getFamilyReferenceRows } from '../server/cacheRepository.js';
import { loadSkusVerao27 } from '../server/excelReader.js';
import { buildDashboardFromSales } from '../server/dashboardBuilder.js';
import { buildComparativoDetalhadoRows } from '../src/utils/exportExcel.js';

const ADDITIONAL_REFERENCE_BASE_ROWS = ['503810'];
const CURVE_2026_REFERENCE_ROWS = ['211303', '211703', '136121', '136221', '136910'];

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

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

function getField(row, type) {
  const keys = Object.keys(row || {});
  const exactByType = {
    familia: ['familia', 'Família', 'FamÃ­lia', 'FamÃƒÂ­lia', 'FamÃƒÆ’Ã‚Â­lia'],
    ref: ['ref', 'Referência', 'ReferÃªncia', 'ReferÃƒÂªncia', 'ReferÃƒÆ’Ã‚Âªncia'],
    cor: ['cor', 'Cor'],
    tam: ['tam', 'Tamanho'],
    grupo: ['grupo', 'Grupo'],
    subgrupo: ['subgrupo', 'Subgrupo'],
    planoTotal: ['Plano Total', 'planoTotal']
  };

  for (const key of exactByType[type] || []) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }

  const matcher = {
    familia: header => header.startsWith('FAM'),
    ref: header => header.startsWith('REFER'),
    cor: header => header === 'COR',
    tam: header => header === 'TAM' || header === 'TAMANHO',
    grupo: header => header === 'GRUPO',
    subgrupo: header => header === 'SUBGRUPO',
    planoTotal: header => header === 'PLANOTOTAL'
  }[type];

  const key = keys.find(candidate => matcher?.(normalizeHeader(candidate)));
  return key ? row[key] : '';
}

function sum(rows, getValue) {
  return rows.reduce((total, row) => total + Number(getValue(row) || 0), 0);
}

function groupRows(rows, keys, getValue) {
  const map = new Map();
  rows.forEach((row) => {
    const key = keys.map(field => row[field]).join('|');
    const current = map.get(key) || Object.fromEntries(keys.map(field => [field, row[field]]));
    current.valor = Number(current.valor || 0) + Number(getValue(row) || 0);
    current.linhas = Number(current.linhas || 0) + 1;
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => Number(b.valor || 0) - Number(a.valor || 0));
}

const cachedRows = await getCachedPlanningRows();
const additionalRows = await getReferencePlanningRows({ referencias: ADDITIONAL_REFERENCE_BASE_ROWS });
const rows = [
  ...cachedRows,
  ...additionalRows
];
const specialBaseRows = await getSpecialFamilyBaseRows();
const curve2026Rows = await getFamilyReferenceRows({
  referencias: CURVE_2026_REFERENCE_ROWS,
  colecoes: ['INVERNO 26', 'VERAO 26']
});
const skus = loadSkusVerao27();
const codProdutos = skus.map(sku => sku.codProduto).filter(Boolean);
const grupoSubgrupoMap = await getGrupoSubgrupoProdutos(codProdutos);
const dashboard = buildDashboardFromSales(rows, { grupoSubgrupoMap, specialBaseRows, curve2026Rows });
const planoRows = dashboard.planoEdicaoLimitadaData;
const pcpRows = buildComparativoDetalhadoRows(planoRows, dashboard.comparativoLojasData);

const lojas = dashboard.comparativoLojasData.lojas || [];
const totalVendaBase = sum(planoRows, row => row.vendaBase);
const planoSku = sum(planoRows, row => row.plano);
const planoFinal = sum(pcpRows, row => getField(row, 'planoTotal'));
const teto10 = Math.round(totalVendaBase * 1.10);
const excessoSobre10 = Math.max(planoFinal - teto10, 0);

const bySkuKey = new Map(planoRows.map(row => [
  [row.familia, row.ref, row.cor, row.tam, row.grupo, row.subgrupo].map(normalize).join('|'),
  row
]));

const detalheSkuRaw = pcpRows.map((row) => {
  const key = [
    row['FamÃƒÂ­lia'] || row['FamÃ­lia'],
    row['ReferÃƒÂªncia'] || row['ReferÃªncia'],
    row.Cor,
    row.Tamanho,
    row.Grupo,
    row.Subgrupo
  ].map(normalize).join('|');
  const sku = bySkuKey.get(key) || {};
  const planoBackend = Number(sku.plano || 0);
  const planoFinalSku = Number(row['Plano Total'] || 0);
  const impactoLoja = planoFinalSku - planoBackend;
  const minimoSku = Number(sku.vendaBase || 0) > 0 && Number(sku.vendaBase || 0) < 1 && planoBackend >= 1;
  const lojasComUm = lojas.filter(loja => Number(row[loja] || 0) === 1).length;
  const lojasZeradas = lojas.filter(loja => Number(row[loja] || 0) === 0).length;

  return {
    familia: sku.familia || row['FamÃƒÂ­lia'] || row['FamÃ­lia'],
    ref: sku.ref || row['ReferÃƒÂªncia'] || row['ReferÃªncia'],
    cor: sku.cor || row.Cor,
    tam: sku.tam || row.Tamanho,
    grupo: sku.grupo || row.Grupo,
    subgrupo: sku.subgrupo || row.Subgrupo,
    continuidade: sku.continuidade || '',
    vendaBase: Number(sku.vendaBase || 0),
    planoBackend,
    planoFinal: planoFinalSku,
    impactoLoja,
    minimoSku: minimoSku ? 1 : 0,
    lojasComUm,
    lojasZeradas
  };
});

const detalheSku = pcpRows.map((row) => {
  const key = [
    getField(row, 'familia'),
    getField(row, 'ref'),
    getField(row, 'cor'),
    getField(row, 'tam'),
    getField(row, 'grupo'),
    getField(row, 'subgrupo')
  ].map(normalize).join('|');
  const sku = bySkuKey.get(key) || {};
  const planoBackend = Number(sku.plano || 0);
  const planoFinalSku = Number(getField(row, 'planoTotal') || 0);
  const impactoLoja = planoFinalSku - planoBackend;
  const minimoSku = Number(sku.vendaBase || 0) > 0 && Number(sku.vendaBase || 0) < 1 && planoBackend >= 1;
  const lojasComUm = lojas.filter(loja => Number(row[loja] || 0) === 1).length;
  const lojasZeradas = lojas.filter(loja => Number(row[loja] || 0) === 0).length;

  return {
    familia: sku.familia || getField(row, 'familia'),
    ref: sku.ref || getField(row, 'ref'),
    cor: sku.cor || getField(row, 'cor'),
    tam: sku.tam || getField(row, 'tam'),
    grupo: sku.grupo || getField(row, 'grupo'),
    subgrupo: sku.subgrupo || getField(row, 'subgrupo'),
    continuidade: sku.continuidade || '',
    vendaBase: Number(sku.vendaBase || 0),
    planoBackend,
    planoFinal: planoFinalSku,
    impactoLoja,
    minimoSku: minimoSku ? 1 : 0,
    lojasComUm,
    lojasZeradas
  };
});

const impactoLojaRows = detalheSku.filter(row => row.impactoLoja !== 0);
const minimoSkuRows = detalheSku.filter(row => row.minimoSku);
const baixoVolumeRows = detalheSku.filter(row => row.vendaBase > 0 && row.vendaBase < 2);

const resumoFamilia = groupRows(detalheSku, ['familia'], row => row.planoFinal).map(row => {
  const familiaRows = detalheSku.filter(item => item.familia === row.familia);
  return {
    familia: row.familia,
    vendaBase: sum(familiaRows, item => item.vendaBase).toFixed(2),
    planoBackend: sum(familiaRows, item => item.planoBackend),
    planoFinal: sum(familiaRows, item => item.planoFinal),
    aumentoPct: sum(familiaRows, item => item.vendaBase) > 0
      ? (((sum(familiaRows, item => item.planoFinal) - sum(familiaRows, item => item.vendaBase)) / sum(familiaRows, item => item.vendaBase)) * 100).toFixed(1)
      : '0.0',
    impactoLoja: sum(familiaRows, item => item.impactoLoja),
    skusMinimoBackend: familiaRows.filter(item => item.minimoSku).length,
    lojasComUm: sum(familiaRows, item => item.lojasComUm)
  };
}).sort((a, b) => Number(b.impactoLoja || 0) - Number(a.impactoLoja || 0));

const resumo = {
  vendaBase: Number(totalVendaBase.toFixed(2)),
  teto10,
  planoBackendSku: planoSku,
  planoFinalTelaExport: planoFinal,
  aumentoBackendPct: totalVendaBase > 0 ? Number((((planoSku - totalVendaBase) / totalVendaBase) * 100).toFixed(2)) : 0,
  aumentoFinalPct: totalVendaBase > 0 ? Number((((planoFinal - totalVendaBase) / totalVendaBase) * 100).toFixed(2)) : 0,
  impactoDistribuicaoLoja: planoFinal - planoSku,
  excessoSobre10,
  skusComVendaBaseMenorQue1EPlanoMinimo: minimoSkuRows.length,
  impactoEstimadoMinimoSkuAte1: Number(sum(minimoSkuRows, row => Math.max(1 - row.vendaBase, 0)).toFixed(2)),
  skusComVendaBaseEntre0e2: baixoVolumeRows.length,
  lojasComQuantidade1: sum(detalheSku, row => row.lojasComUm)
};

const baseOrigem = [
  {
    origem: 'cache_2025_2',
    linhas: cachedRows.length,
    venda: Number(sum(cachedRows, row => row.venda).toFixed(2)),
    observacao: 'base principal carregada do banco/cache'
  },
  {
    origem: 'referencias_adicionais_18_19',
    linhas: additionalRows.length,
    venda: Number(sum(additionalRows, row => row.venda).toFixed(2)),
    observacao: 'foi somada ao rows principal; hoje pode impactar base/mix quando casa com familia historica'
  },
  {
    origem: 'special_inverno26',
    linhas: specialBaseRows.length,
    venda: Number(sum(specialBaseRows, row => row.venda).toFixed(2)),
    observacao: 'usada por regras especiais; NOIVAS/LOVE APPEAL como base, RENDAS como curva'
  },
  {
    origem: 'base_2026_cetim_breeze',
    linhas: curve2026Rows.length,
    venda: Number(sum(curve2026Rows, row => row.venda).toFixed(2)),
    observacao: 'usada como base de volume e curva de grade para CETIM/BREEZE'
  }
];

const resumoBaseFamilia = groupRows(planoRows, ['familia'], row => row.vendaBase)
  .map(row => ({ familia: row.familia, vendaBasePlano: Number(Number(row.valor || 0).toFixed(2)) }))
  .sort((a, b) => b.vendaBasePlano - a.vendaBasePlano);

writeCsv('impacto-aumento-resumo-familia.csv', resumoFamilia, [
  'familia', 'vendaBase', 'planoBackend', 'planoFinal', 'aumentoPct', 'impactoLoja', 'skusMinimoBackend', 'lojasComUm'
]);
writeCsv('impacto-aumento-detalhe-sku.csv', detalheSku, [
  'familia', 'ref', 'cor', 'tam', 'grupo', 'subgrupo', 'continuidade', 'vendaBase',
  'planoBackend', 'planoFinal', 'impactoLoja', 'minimoSku', 'lojasComUm', 'lojasZeradas'
]);

console.log(JSON.stringify({
  resumo,
  baseOrigem,
  topBaseFamilias: resumoBaseFamilia.slice(0, 12),
  topFamiliasImpactoLoja: resumoFamilia.slice(0, 12),
  topSkusImpactoLoja: impactoLojaRows
    .sort((a, b) => b.impactoLoja - a.impactoLoja)
    .slice(0, 20)
}, null, 2));
