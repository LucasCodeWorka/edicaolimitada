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

const SPECIAL_INVERNO26_FAMILIES = new Set(['NOIVAS', 'LOVE APPEAL']);
const SPECIAL_INVERNO26_CURVE_FAMILIES = new Set(['RENDAS']);
const SPECIAL_MONTH_DEPARA = {
  1: 'JULHO',
  2: 'AGOSTO',
  3: 'SETEMBRO',
  4: 'OUTUBRO',
  5: 'NOVEMBRO',
  6: 'DEZEMBRO'
};

const SPECIAL_SUBGROUP_DEPARA = {
  'LOVE APPEAL|CALCA|CALCINHA STRING': 'CALCINHA FIO DENTAL'
};

const LOVE_APPEAL_ALLOWED_SIZES = {
  CALCA: new Set(['M', 'G']),
  SUTIA: new Set(['42', '44'])
};

function getLoveAppealAllowedSizes(sku) {
  if (normalizeName(sku.familia).toUpperCase() !== 'LOVE APPEAL') return null;

  const grupo = normalizeName(sku.grupo).toUpperCase();
  if (grupo.includes('CALCA')) return LOVE_APPEAL_ALLOWED_SIZES.CALCA;
  if (grupo.includes('SUTIA')) return LOVE_APPEAL_ALLOWED_SIZES.SUTIA;

  return null;
}

function applyLoveAppealSkuRules(skusFamilia, planoPorSku, vendaBasePorSku) {
  const groups = new Map();

  skusFamilia.forEach((sku) => {
    if (!getLoveAppealAllowedSizes(sku)) return;

    const key = `${sku.referencia}|${sku.cor}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sku);
  });

  groups.forEach((skus) => {
    const totalPlano = skus.reduce((sum, sku) => sum + Number(planoPorSku.get(sku) || 0), 0);
    const totalBase = skus.reduce((sum, sku) => sum + Number(vendaBasePorSku.get(sku) || 0), 0);
    const allowedSkus = skus.filter((sku) => {
      const allowed = getLoveAppealAllowedSizes(sku);
      return allowed && allowed.has(normalizeName(sku.tamanho).toUpperCase());
    });
    const originalAllowedPlano = new Map(
      allowedSkus.map(sku => [sku, Number(planoPorSku.get(sku) || 0)])
    );
    const originalAllowedBase = new Map(
      allowedSkus.map(sku => [sku, Number(vendaBasePorSku.get(sku) || 0)])
    );
    const originalAllowedTotal = [...originalAllowedPlano.values()].reduce((sum, value) => sum + value, 0);
    const originalAllowedBaseTotal = [...originalAllowedBase.values()].reduce((sum, value) => sum + value, 0);

    skus.forEach((sku) => {
      planoPorSku.set(sku, 0);
      vendaBasePorSku.set(sku, 0);
    });

    if (allowedSkus.length === 0 || totalPlano <= 0) return;

    const planoValues = roundToTotal(
      allowedSkus,
      sku => originalAllowedTotal > 0
        ? totalPlano * (Number(originalAllowedPlano.get(sku) || 0) / originalAllowedTotal)
        : totalPlano / allowedSkus.length,
      totalPlano
    );

    allowedSkus.forEach((sku, index) => {
      const base = originalAllowedBaseTotal > 0
        ? totalBase * (Number(originalAllowedBase.get(sku) || 0) / originalAllowedBaseTotal)
        : totalBase / allowedSkus.length;
      planoPorSku.set(sku, planoValues[index] || 0);
      vendaBasePorSku.set(sku, Math.round(base * 100) / 100);
    });
  });
}

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

function getSkuGrupoSubgrupo(sku, grupoSubgrupoMap = {}) {
  const info = grupoSubgrupoMap[sku.codProduto] || {};
  return {
    grupo: normalizeName(info.grupo || sku.grupo).toUpperCase(),
    subgrupo: normalizeName(info.subgrupo || sku.subgrupo).toUpperCase()
  };
}

function getHistoricSubgroupTotals(vendasPorFamiliaGrupoSubgrupo, familiaHist, grupo) {
  const totals = new Map();
  const prefix = `${familiaHist}|${grupo}|`;

  Object.entries(vendasPorFamiliaGrupoSubgrupo).forEach(([key, value]) => {
    if (!key.startsWith(prefix)) return;
    const [, , subgrupo] = key.split('|');
    totals.set(subgrupo, (totals.get(subgrupo) || 0) + Number(value || 0));
  });

  return totals;
}

function buildHistoricalFamilyLineMap(depara) {
  const map = new Map();

  Object.entries(depara).forEach(([familiaNova, familiaHist]) => {
    const linha = getLinha(familiaNova);
    if (!linha) return;

    const histKey = normalizeName(familiaHist).toUpperCase();
    if (!map.has(histKey)) map.set(histKey, new Set());
    map.get(histKey).add(normalizeName(linha).toUpperCase());
  });

  return map;
}

function rowMatchesLine(row, linhaKey, historicalFamilyLineMap) {
  const familia = normalizeName(row.familia).toUpperCase();
  const mappedLines = historicalFamilyLineMap.get(familia);

  if (mappedLines && mappedLines.size > 0) {
    return mappedLines.has(linhaKey);
  }

  const rowLinha = normalizeName(getLinha(row.familia) || row.classificacao).toUpperCase();
  return rowLinha === linhaKey;
}

function getLineSubgroupTotals(rows, linha, grupo, historicalFamilyLineMap) {
  const totals = new Map();
  const linhaKey = normalizeName(linha).toUpperCase();
  const grupoKey = normalizeName(grupo).toUpperCase();

  rows.forEach((row) => {
    if (!rowMatchesLine(row, linhaKey, historicalFamilyLineMap)) return;

    const rowGrupo = normalizeName(row.grupo).toUpperCase();
    if (rowGrupo !== grupoKey) return;

    const subgrupo = normalizeName(row.subgrupo).toUpperCase();
    totals.set(subgrupo, (totals.get(subgrupo) || 0) + Number(row.venda || 0));
  });

  return totals;
}

function getLineGroupSubgroupReferenceAverage(rows, linha, grupo, subgrupo, historicalFamilyLineMap) {
  const linhaKey = normalizeName(linha).toUpperCase();
  const grupoKey = normalizeName(grupo).toUpperCase();
  const subgrupoKey = normalizeName(subgrupo).toUpperCase();
  const totalsByRef = new Map();

  rows.forEach((row) => {
    if (!rowMatchesLine(row, linhaKey, historicalFamilyLineMap)) return;
    if (normalizeName(row.grupo).toUpperCase() !== grupoKey) return;
    if (normalizeName(row.subgrupo).toUpperCase() !== subgrupoKey) return;

    const ref = normalizeName(row.referencia, row.idproduto).toUpperCase();
    if (!ref || ref === 'SEM INFO') return;
    totalsByRef.set(ref, (totalsByRef.get(ref) || 0) + Number(row.venda || 0));
  });

  const positiveTotals = [...totalsByRef.values()].filter(value => value > 0);
  if (positiveTotals.length === 0) {
    return { average: 0, referenceCount: 0, total: 0 };
  }

  const total = positiveTotals.reduce((sum, value) => sum + value, 0);
  return {
    average: total / positiveTotals.length,
    referenceCount: positiveTotals.length,
    total
  };
}

function getGroupSubgroupReferenceAverage(rows, grupo, subgrupo) {
  const grupoKey = normalizeName(grupo).toUpperCase();
  const subgrupoKey = normalizeName(subgrupo).toUpperCase();
  const totalsByRef = new Map();

  rows.forEach((row) => {
    if (normalizeName(row.grupo).toUpperCase() !== grupoKey) return;
    if (normalizeName(row.subgrupo).toUpperCase() !== subgrupoKey) return;

    const ref = normalizeName(row.referencia, row.idproduto).toUpperCase();
    if (!ref || ref === 'SEM INFO') return;
    totalsByRef.set(ref, (totalsByRef.get(ref) || 0) + Number(row.venda || 0));
  });

  const positiveTotals = [...totalsByRef.values()].filter(value => value > 0);
  if (positiveTotals.length === 0) {
    return { average: 0, referenceCount: 0, total: 0 };
  }

  const total = positiveTotals.reduce((sum, value) => sum + value, 0);
  return {
    average: total / positiveTotals.length,
    referenceCount: positiveTotals.length,
    total
  };
}

const LETTER_SIZE_ORDER = [
  'PP', 'P', 'M', 'G', 'GG', 'EG', 'XG', 'XGG', 'XXG', 'EXG'
];

function sizeRank(size) {
  const value = normalizeName(size).toUpperCase();
  const numeric = Number(value.replace(',', '.'));

  if (Number.isFinite(numeric)) {
    return numeric;
  }

  const index = LETTER_SIZE_ORDER.indexOf(value);
  return index >= 0 ? 1000 + index : 2000;
}

function sortSizes(sizes) {
  return [...sizes].sort((a, b) => {
    const rankDiff = sizeRank(a) - sizeRank(b);
    return rankDiff || String(a).localeCompare(String(b));
  });
}

function addSizeTotal(totals, size, value) {
  const key = normalizeName(size).toUpperCase();
  totals.set(key, (totals.get(key) || 0) + Number(value || 0));
}

function getFamilySubgroupSizeTotals(rows, familiaHist, grupo, subgrupos) {
  const totals = new Map();
  const familiaKey = normalizeName(familiaHist).toUpperCase();
  const grupoKey = normalizeName(grupo).toUpperCase();
  const subgrupoSet = new Set(subgrupos.map(subgrupo => normalizeName(subgrupo).toUpperCase()));

  rows.forEach((row) => {
    if (normalizeName(row.familia).toUpperCase() !== familiaKey) return;
    if (normalizeName(row.grupo).toUpperCase() !== grupoKey) return;
    if (!subgrupoSet.has(normalizeName(row.subgrupo).toUpperCase())) return;

    addSizeTotal(totals, row.tamanho, row.venda);
  });

  return totals;
}

function getFamilyGroupSizeTotals(rows, familiaHist, grupo) {
  const totals = new Map();
  const familiaKey = normalizeName(familiaHist).toUpperCase();
  const grupoKey = normalizeName(grupo).toUpperCase();

  rows.forEach((row) => {
    if (normalizeName(row.familia).toUpperCase() !== familiaKey) return;
    if (normalizeName(row.grupo).toUpperCase() !== grupoKey) return;

    addSizeTotal(totals, row.tamanho, row.venda);
  });

  return totals;
}

function getFamilySizeTotals(rows, familiaHist) {
  const totals = new Map();
  const familiaKey = normalizeName(familiaHist).toUpperCase();

  rows.forEach((row) => {
    if (normalizeName(row.familia).toUpperCase() !== familiaKey) return;
    addSizeTotal(totals, row.tamanho, row.venda);
  });

  return totals;
}

function getReferenceColorSizeTotals(rows, familiaHist, referencia, cor) {
  const totals = new Map();
  const familiaKey = normalizeName(familiaHist).toUpperCase();
  const refKey = normalizeName(referencia).toUpperCase();
  const corKey = normalizeName(cor).toUpperCase();

  rows.forEach((row) => {
    const rowRef = normalizeName(row.referencia, row.idproduto).toUpperCase();
    if (normalizeName(row.familia).toUpperCase() !== familiaKey) return;
    if (rowRef !== refKey) return;
    if (normalizeName(row.cor).toUpperCase() !== corKey) return;
    addSizeTotal(totals, row.tamanho, row.venda);
  });

  return totals;
}

function getReferenceSizeTotals(rows, familiaHist, referencia) {
  const totals = new Map();
  const familiaKey = normalizeName(familiaHist).toUpperCase();
  const refKey = normalizeName(referencia).toUpperCase();

  rows.forEach((row) => {
    const rowRef = normalizeName(row.referencia, row.idproduto).toUpperCase();
    if (normalizeName(row.familia).toUpperCase() !== familiaKey) return;
    if (rowRef !== refKey) return;
    addSizeTotal(totals, row.tamanho, row.venda);
  });

  return totals;
}

function getReferenceAverageColorSizeTotals(rows, familiaHist, referencia) {
  const totalsByColor = new Map();
  const familiaKey = normalizeName(familiaHist).toUpperCase();
  const refKey = normalizeName(referencia).toUpperCase();

  rows.forEach((row) => {
    const rowRef = normalizeName(row.referencia, row.idproduto).toUpperCase();
    if (normalizeName(row.familia).toUpperCase() !== familiaKey) return;
    if (rowRef !== refKey) return;

    const corKey = normalizeName(row.cor).toUpperCase();
    if (!corKey || corKey === 'SEM INFO') return;
    if (!totalsByColor.has(corKey)) totalsByColor.set(corKey, new Map());
    addSizeTotal(totalsByColor.get(corKey), row.tamanho, row.venda);
  });

  const totals = new Map();
  totalsByColor.forEach((sizeTotals) => {
    sizeTotals.forEach((value, size) => {
      totals.set(size, (totals.get(size) || 0) + Number(value || 0));
    });
  });

  if (totalsByColor.size === 0) return totals;

  totals.forEach((value, size) => {
    totals.set(size, value / totalsByColor.size);
  });

  return totals;
}

function getLineSizeTotals(rows, linha, historicalFamilyLineMap) {
  const totals = new Map();
  const linhaKey = normalizeName(linha).toUpperCase();

  rows.forEach((row) => {
    if (!rowMatchesLine(row, linhaKey, historicalFamilyLineMap)) return;
    addSizeTotal(totals, row.tamanho, row.venda);
  });

  return totals;
}

function getLineSubgroupSizeTotals(rows, linha, grupo, subgrupo, historicalFamilyLineMap) {
  const totals = new Map();
  const linhaKey = normalizeName(linha).toUpperCase();
  const grupoKey = normalizeName(grupo).toUpperCase();
  const subgrupoKey = normalizeName(subgrupo).toUpperCase();

  rows.forEach((row) => {
    if (!rowMatchesLine(row, linhaKey, historicalFamilyLineMap)) return;
    if (normalizeName(row.grupo).toUpperCase() !== grupoKey) return;
    if (normalizeName(row.subgrupo).toUpperCase() !== subgrupoKey) return;

    addSizeTotal(totals, row.tamanho, row.venda);
  });

  return totals;
}

function getGroupSubgroupSizeTotals(rows, grupo, subgrupo, allowedSizes = null) {
  const totals = new Map();
  const grupoKey = normalizeName(grupo).toUpperCase();
  const subgrupoKey = normalizeName(subgrupo).toUpperCase();
  const allowedSizeSet = allowedSizes
    ? new Set(allowedSizes.map(size => normalizeName(size).toUpperCase()))
    : null;

  rows.forEach((row) => {
    if (normalizeName(row.grupo).toUpperCase() !== grupoKey) return;
    if (normalizeName(row.subgrupo).toUpperCase() !== subgrupoKey) return;
    if (allowedSizeSet && !allowedSizeSet.has(normalizeName(row.tamanho).toUpperCase())) return;

    addSizeTotal(totals, row.tamanho, row.venda);
  });

  return totals;
}

function mapHistoricalSizesToNewSizes(newSizes, historicalSizeTotals) {
  const mapped = new Map(newSizes.map(size => [size, 0]));
  const sortedNewSizes = sortSizes(newSizes);
  const sortedHistoricalSizes = sortSizes([...historicalSizeTotals.keys()]);

  if (sortedNewSizes.length === 0 || sortedHistoricalSizes.length === 0) {
    return mapped;
  }

  sortedHistoricalSizes.forEach((historicalSize, index) => {
    const targetIndex = Math.min(index, sortedNewSizes.length - 1);
    const targetSize = sortedNewSizes[targetIndex];
    mapped.set(targetSize, (mapped.get(targetSize) || 0) + Number(historicalSizeTotals.get(historicalSize) || 0));
  });

  return mapped;
}

function mergeMissingSizeWeights(primaryWeights, fallbackWeights) {
  const result = new Map(primaryWeights);

  result.forEach((value, size) => {
    if (value > 0) return;
    result.set(size, Number(fallbackWeights.get(size) || 0));
  });

  const total = [...result.values()].reduce((sum, value) => sum + Number(value || 0), 0);
  if (total > 0) {
    return result;
  }

  return result;
}

function buildSubgroupMapping(skusFamilia, vendasPorFamiliaGrupoSubgrupo, familiaHist, rows, familiaNova, historicalFamilyLineMap) {
  const mapping = new Map();
  const grupos = new Map();
  const skuCounts = new Map();
  const linhaFamiliaNova = getLinha(familiaNova);
  const familiaNovaKey = normalizeName(familiaNova).toUpperCase();

  skusFamilia.forEach((sku) => {
    if (!grupos.has(sku.grupo)) grupos.set(sku.grupo, new Set());
    grupos.get(sku.grupo).add(sku.subgrupo);
    const key = `${sku.grupo}|${sku.subgrupo}`;
    skuCounts.set(key, (skuCounts.get(key) || 0) + 1);
  });

  grupos.forEach((novosSubgrupos, grupo) => {
    const histTotals = getHistoricSubgroupTotals(vendasPorFamiliaGrupoSubgrupo, familiaHist, grupo);
    const historicosSubgrupos = new Set(histTotals.keys());
    const matchedNovos = new Set();
    const matchedHistoricos = new Set();

    novosSubgrupos.forEach((subgrupo) => {
      if (historicosSubgrupos.has(subgrupo)) {
        mapping.set(`${grupo}|${subgrupo}`, {
          grupoHist: grupo,
          subgrupoHist: subgrupo,
          histSubgrupos: [subgrupo],
          matchTipo: 'EXATO'
        });
        matchedNovos.add(subgrupo);
        matchedHistoricos.add(subgrupo);
      }
    });

    const novosSobra = [...novosSubgrupos].filter(subgrupo => !matchedNovos.has(subgrupo));
    const historicosSobra = [...historicosSubgrupos].filter(subgrupo => !matchedHistoricos.has(subgrupo));

    if (novosSobra.length === 1 && historicosSobra.length === 1) {
      mapping.set(`${grupo}|${novosSobra[0]}`, {
        grupoHist: grupo,
        subgrupoHist: historicosSobra[0],
        histSubgrupos: [historicosSobra[0]],
        matchTipo: 'SOBRA_UNICA'
      });
      return;
    }

    if (novosSobra.length > 0 && historicosSobra.length > 0) {
      const baseHistoricaRestante = historicosSobra.reduce(
        (sum, subgrupo) => sum + Number(histTotals.get(subgrupo) || 0),
        0
      );
      const totalSkusSobra = novosSobra.reduce(
        (sum, subgrupo) => sum + Number(skuCounts.get(`${grupo}|${subgrupo}`) || 0),
        0
      );
      const linhaSubgroupTotals = getLineSubgroupTotals(rows, linhaFamiliaNova, grupo, historicalFamilyLineMap);
      const totalLinhaSobra = novosSobra.reduce(
        (sum, subgrupo) => sum + Number(linhaSubgroupTotals.get(subgrupo) || 0),
        0
      );

      novosSobra.forEach((subgrupo) => {
        const skuCount = Number(skuCounts.get(`${grupo}|${subgrupo}`) || 0);
        const participacaoLinha = totalLinhaSobra > 0
          ? Number(linhaSubgroupTotals.get(subgrupo) || 0) / totalLinhaSobra
          : 0;
        const participacaoSku = totalSkusSobra > 0 ? skuCount / totalSkusSobra : 1 / novosSobra.length;
        const participacao = participacaoLinha || participacaoSku;

        mapping.set(`${grupo}|${subgrupo}`, {
          grupoHist: grupo,
          subgrupoHist: historicosSobra.join(' + '),
          histSubgrupos: historicosSobra,
          matchTipo: participacaoLinha ? 'POOL_LINHA' : 'POOL_RESTANTE',
          vendaBaseOverride: baseHistoricaRestante * participacao,
          linhaBase: participacaoLinha ? linhaFamiliaNova : undefined
        });
      });
    }

    novosSobra.forEach((subgrupo) => {
      const key = `${grupo}|${subgrupo}`;
      if (mapping.has(key)) return;

      const subgroupDepara = SPECIAL_SUBGROUP_DEPARA[`${familiaNovaKey}|${grupo}|${subgrupo}`];
      if (subgroupDepara && histTotals.has(subgroupDepara)) {
        mapping.set(key, {
          grupoHist: grupo,
          subgrupoHist: subgroupDepara,
          histSubgrupos: [subgroupDepara],
          matchTipo: 'DEPARA_SUBGRUPO',
          vendaBaseOverride: Number(histTotals.get(subgroupDepara) || 0)
        });
        return;
      }

      const lineAverage = getLineGroupSubgroupReferenceAverage(
        rows,
        linhaFamiliaNova,
        grupo,
        subgrupo,
        historicalFamilyLineMap
      );

      if (lineAverage.average > 0) {
        mapping.set(key, {
          grupoHist: grupo,
          subgrupoHist: subgrupo,
          histSubgrupos: [subgrupo],
          matchTipo: 'FALLBACK_LINHA',
          vendaBaseOverride: lineAverage.average,
          linhaBase: linhaFamiliaNova,
          refsComparaveis: lineAverage.referenceCount
        });
        return;
      }

      const groupAverage = getGroupSubgroupReferenceAverage(rows, grupo, subgrupo);
      if (groupAverage.average <= 0) return;

      mapping.set(key, {
        grupoHist: grupo,
        subgrupoHist: subgrupo,
        histSubgrupos: [subgrupo],
        matchTipo: 'FALLBACK_GRUPO_SUBGRUPO',
        vendaBaseOverride: groupAverage.average,
        refsComparaveis: groupAverage.referenceCount
      });
    });

    const mappingsByHistoricalSource = new Map();
    novosSubgrupos.forEach((subgrupo) => {
      const key = `${grupo}|${subgrupo}`;
      const mapped = mapping.get(key);
      if (!mapped || !mapped.histSubgrupos || mapped.histSubgrupos.length !== 1) return;
      if (mapped.vendaBaseOverride !== undefined && mapped.matchTipo !== 'DEPARA_SUBGRUPO') return;

      const sourceSubgroup = mapped.histSubgrupos[0];
      if (!histTotals.has(sourceSubgroup)) return;
      const sourceKey = `${mapped.grupoHist}|${sourceSubgroup}`;
      if (!mappingsByHistoricalSource.has(sourceKey)) mappingsByHistoricalSource.set(sourceKey, []);
      mappingsByHistoricalSource.get(sourceKey).push({ key, subgrupo, mapped });
    });

    mappingsByHistoricalSource.forEach((items) => {
      const hasDepara = items.some(item => item.mapped.matchTipo === 'DEPARA_SUBGRUPO');
      if (!hasDepara || items.length <= 1) return;

      const sourceSubgroup = items[0].mapped.histSubgrupos[0];
      const sourceBase = Number(histTotals.get(sourceSubgroup) || 0);
      const totalSkus = items.reduce(
        (sum, item) => sum + Number(skuCounts.get(item.key) || 0),
        0
      );

      items.forEach((item) => {
        const skuCount = Number(skuCounts.get(item.key) || 0);
        const share = totalSkus > 0 ? skuCount / totalSkus : 1 / items.length;
        mapping.set(item.key, {
          ...item.mapped,
          matchTipo: item.mapped.matchTipo === 'DEPARA_SUBGRUPO' ? 'DEPARA_SUBGRUPO_POOL' : `${item.mapped.matchTipo}_POOL`,
          vendaBaseOverride: sourceBase * share
        });
      });
    });
  });

  return mapping;
}

function distributeBySubgroupTarget(skus, targetTotal) {
  return new Map(skus.map(sku => [sku, 0]));
}

function distributeBySizeTargetMap(skus, targetTotal, primarySizeTotals, fallbackSizeTotals = new Map()) {
  const distribuicao = distributeSkusBySizeTarget(
    skus,
    targetTotal,
    targetTotal,
    primarySizeTotals,
    fallbackSizeTotals
  );

  return distribuicao.planoPorSku;
}

function distributeSkusBySkuWeight(skus, targetTotal, vendaBaseTotal, getWeight) {
  const planoPorSku = new Map();
  const vendaBasePorSku = new Map();

  if (skus.length === 0 || targetTotal <= 0) {
    skus.forEach((sku) => {
      planoPorSku.set(sku, 0);
      vendaBasePorSku.set(sku, 0);
    });
    return { planoPorSku, vendaBasePorSku };
  }

  const rows = skus.map(sku => ({
    sku,
    weight: Number(getWeight(sku) || 0)
  }));
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);

  if (totalWeight <= 0) {
    skus.forEach((sku) => {
      planoPorSku.set(sku, 0);
      vendaBasePorSku.set(sku, 0);
    });
    return { planoPorSku, vendaBasePorSku };
  }

  const planoValues = roundToTotal(
    rows,
    row => targetTotal * (row.weight / totalWeight),
    targetTotal
  );

  rows.forEach((row, index) => {
    const base = vendaBaseTotal * (row.weight / totalWeight);
    planoPorSku.set(row.sku, planoValues[index] || 0);
    vendaBasePorSku.set(row.sku, Math.round(base * 100) / 100);
  });

  return { planoPorSku, vendaBasePorSku };
}

function getColorCurveFallbacks(cor) {
  const corKey = normalizeName(cor).toUpperCase();
  if (corKey === 'VANILLA' || corKey === 'VANILIA') {
    return [corKey, 'BRANCO', 'NUDE'];
  }
  return [corKey];
}

function buildReferenceSizeWeightGetter(skus, rows, familiaHist, fallbackSizeTotals = new Map()) {
  const totalsByKey = new Map();
  const refTotalsByKey = new Map();
  const averageTotalsByRefKey = new Map();

  skus.forEach((sku) => {
    const refKey = normalizeName(sku.referencia).toUpperCase();
    const corKey = normalizeName(sku.cor).toUpperCase();

    getColorCurveFallbacks(corKey).forEach((candidateCor) => {
      const key = `${refKey}|${candidateCor}`;
      if (!totalsByKey.has(key)) {
        totalsByKey.set(key, getReferenceColorSizeTotals(rows, familiaHist, refKey, candidateCor));
      }
    });

    if (!refTotalsByKey.has(refKey)) {
      refTotalsByKey.set(refKey, getReferenceSizeTotals(rows, familiaHist, refKey));
    }

    if (!averageTotalsByRefKey.has(refKey)) {
      averageTotalsByRefKey.set(refKey, getReferenceAverageColorSizeTotals(rows, familiaHist, refKey));
    }
  });

  return (sku) => {
    const refKey = normalizeName(sku.referencia).toUpperCase();
    const sizeKey = normalizeName(sku.tamanho).toUpperCase();

    for (const candidateCor of getColorCurveFallbacks(sku.cor)) {
      const totals = totalsByKey.get(`${refKey}|${candidateCor}`);
      const value = Number(totals?.get(sizeKey) || 0);
      if (value > 0) return value;
    }

    const averageTotals = averageTotalsByRefKey.get(refKey);
    const averageValue = Number(averageTotals?.get(sizeKey) || 0);
    if (averageValue > 0) return averageValue;

    const refTotals = refTotalsByKey.get(refKey);
    const refValue = Number(refTotals?.get(sizeKey) || 0);
    if (refValue > 0) return refValue;

    return Number(fallbackSizeTotals.get(sizeKey) || 0);
  };
}

function distributeSkusBySizeTarget(skus, targetTotal, vendaBaseTotal, primarySizeTotals, fallbackSizeTotals = new Map()) {
  const planoPorSku = new Map();
  const vendaBasePorSku = new Map();

  if (skus.length === 0 || targetTotal <= 0) {
    skus.forEach((sku) => {
      planoPorSku.set(sku, 0);
      vendaBasePorSku.set(sku, 0);
    });
    return { planoPorSku, vendaBasePorSku };
  }

  const skusBySize = new Map();
  skus.forEach((sku) => {
    const size = normalizeName(sku.tamanho).toUpperCase();
    if (!skusBySize.has(size)) skusBySize.set(size, []);
    skusBySize.get(size).push(sku);
  });

  const newSizes = [...skusBySize.keys()];
  const primaryWeights = mapHistoricalSizesToNewSizes(newSizes, primarySizeTotals);
  const fallbackWeights = mapHistoricalSizesToNewSizes(newSizes, fallbackSizeTotals);
  const weights = mergeMissingSizeWeights(primaryWeights, fallbackWeights);
  const sizeRows = newSizes.map(size => ({ size, weight: Number(weights.get(size) || 0) }));
  const totalWeight = sizeRows.reduce((sum, row) => sum + row.weight, 0);

  if (totalWeight <= 0) {
    skus.forEach((sku) => {
      planoPorSku.set(sku, 0);
      vendaBasePorSku.set(sku, 0);
    });
    return { planoPorSku, vendaBasePorSku };
  }

  const planoPorTamanho = roundToTotal(
    sizeRows,
    row => targetTotal * (row.weight / totalWeight),
    targetTotal
  );

  sizeRows.forEach((row, index) => {
    const skusSize = skusBySize.get(row.size) || [];
    const planoTamanho = planoPorTamanho[index] || 0;
    const baseTamanho = vendaBaseTotal * (row.weight / totalWeight);
    const planoSkuValues = roundToTotal(
      skusSize,
      () => row.weight > 0 && skusSize.length > 0 ? planoTamanho / skusSize.length : 0,
      planoTamanho
    );

    skusSize.forEach((sku, skuIndex) => {
      planoPorSku.set(sku, planoSkuValues[skuIndex] || 0);
      vendaBasePorSku.set(sku, Math.round((baseTamanho / skusSize.length) * 100) / 100);
    });
  });

  return { planoPorSku, vendaBasePorSku };
}

function buildStoreDistributionFromPlanRows(planoRows, lojasArray, planoPorLojaFallback) {
  const rowsByFamily = new Map();
  planoRows.forEach((row) => {
    if (!rowsByFamily.has(row.familia)) rowsByFamily.set(row.familia, []);
    rowsByFamily.get(row.familia).push(row);
  });

  const result = new Map();
  rowsByFamily.forEach((rows, familia) => {
    const totalPlano = rows.reduce((sum, row) => sum + Number(row.plano || 0), 0);
    const fallback = planoPorLojaFallback.get(familia) || {};
    const totalFallback = lojasArray.reduce((sum, loja) => sum + Number(fallback[loja] || 0), 0);
    const raw = lojasArray.map((loja) => ({
      loja,
      value: totalFallback > 0
        ? totalPlano * (Number(fallback[loja] || 0) / totalFallback)
        : totalPlano / lojasArray.length
    }));
    const values = roundToTotal(raw, row => row.value, totalPlano);
    result.set(familia, values);
  });

  return result;
}

function buildFilterOptions({ lojas, planoRows, meses = fmtMonthPlan.map((row) => row.mes) }) {
  const unique = (key) => Array.from(new Set(planoRows.map((row) => normalizeName(row[key])).filter(Boolean))).sort();
  return {
    empresas: ['TODAS', ...lojas],
    familias: ['TODAS', ...unique('familia')],
    linhas: ['TODAS', ...unique('linha')],
    grupos: ['TODAS', ...unique('grupo')],
    continuidades: ['TODAS', ...unique('continuidade')],
    colecoes: ['TODAS', ...unique('colecao')],
    meses: ['TODOS', ...meses],
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

function buildMonthPlanWithSpecial(totalPlano, specialMonthPlan) {
  const specialTotal = Object.values(specialMonthPlan).reduce((sum, value) => sum + Number(value || 0), 0);
  const genericTotal = Math.max(totalPlano - specialTotal, 0);
  const byMonth = new Map(buildMonthPlan(genericTotal).map(row => [row.mes, row.valor]));

  Object.entries(specialMonthPlan).forEach(([mes, valor]) => {
    byMonth.set(mes, (byMonth.get(mes) || 0) + Number(valor || 0));
  });

  const monthOrder = [
    ...fmtMonthPlan.map(row => row.mes),
    'NOVEMBRO',
    'DEZEMBRO'
  ];

  return monthOrder
    .filter((mes, index, arr) => arr.indexOf(mes) === index)
    .filter(mes => byMonth.has(mes) && byMonth.get(mes) !== 0)
    .map(mes => ({ mes, valor: byMonth.get(mes) || 0 }));
}

// Lojas que devem sempre estar no plano (mesmo sem historico)
// ECOMMERCE com 1.5% baseado em vendas recentes (92 pecas/3 meses)
const LOJAS_OBRIGATORIAS = {
  'ECOMMERCE': 0.015  // 1.5% do plano (baseado em vendas recentes)
};

function ajustarDistribuicaoPortelle(familiaNova, planoPorLoja, planoTotal) {
  if (normalizeName(familiaNova).toUpperCase() !== 'PORTELLE') {
    return planoPorLoja;
  }

  const lojasPermitidas = Object.keys(planoPorLoja).filter(loja => normalizeStoreName(loja).toUpperCase() !== 'TABOSA');
  const totalPermitidoAtual = lojasPermitidas.reduce((sum, loja) => sum + Number(planoPorLoja[loja] || 0), 0);
  const adjusted = { ...planoPorLoja };

  adjusted.TABOSA = 0;

  const values = roundToTotal(
    lojasPermitidas,
    loja => totalPermitidoAtual > 0
      ? planoTotal * (Number(planoPorLoja[loja] || 0) / totalPermitidoAtual)
      : planoTotal / lojasPermitidas.length,
    planoTotal
  );

  lojasPermitidas.forEach((loja, index) => {
    adjusted[loja] = values[index] || 0;
  });

  return adjusted;
}

// Funcao principal: constroi dashboard a partir das vendas do cache
// usando SKUs do Excel e regras de de-para
export function buildDashboardFromSales(rows, { grupoSubgrupoMap = {}, specialBaseRows = [] } = {}) {
  // Carregar SKUs do Excel e de-para
  const skusExcel = loadSkusVerao27();
  const depara = loadDeparaFamilias();
  const historicalFamilyLineMap = buildHistoricalFamilyLineMap(depara);

  console.log('[dashboardBuilder] SKUs do Excel:', skusExcel.length);
  console.log('[dashboardBuilder] Linhas de venda do cache:', rows.length);
  // DEBUG: Verificar se rows tem grupo/subgrupo
  if (rows.length > 0) {
    console.log('[dashboardBuilder] Exemplo row[0]:', {
      familia: rows[0].familia,
      grupo: rows[0].grupo,
      subgrupo: rows[0].subgrupo
    });
  }

  // Agrupar vendas por familia historica e loja
  const vendasPorFamiliaLoja = {};
  const vendasPorFamiliaRef = {};
  const historicoVendasData = [];
  // NOVO: Agregar vendas por familia+grupo+subgrupo+loja para distribuicao granular
  const vendasPorFamiliaGrupoSubgrupoLoja = {};
  const vendasPorFamiliaGrupoSubgrupo = {};
  // NOVO: Agregar vendas por grupo e subgrupo para gráficos
  const vendasPorGrupo = {};
  const vendasPorSubgrupo = {};
  const lojas = new Set();
  const specialRowsByFamily = new Map();
  const specialMonthPlan = {};

  for (const row of rows) {
    const loja = normalizeStoreName(row.empresa);
    const familia = normalizeName(row.familia).toUpperCase();
    if (SPECIAL_INVERNO26_FAMILIES.has(familia)) continue;
    const grupo = normalizeName(row.grupo).toUpperCase();
    const subgrupo = normalizeName(row.subgrupo).toUpperCase();
    lojas.add(loja);

    const keyFL = `${familia}|${loja}`;
    vendasPorFamiliaLoja[keyFL] = (vendasPorFamiliaLoja[keyFL] || 0) + Number(row.venda || 0);
    const venda = Number(row.venda || 0);

    // NOVO: Por familia+grupo+subgrupo+loja
    const keyFGSL = `${familia}|${grupo}|${subgrupo}|${loja}`;
    vendasPorFamiliaGrupoSubgrupoLoja[keyFGSL] = (vendasPorFamiliaGrupoSubgrupoLoja[keyFGSL] || 0) + Number(row.venda || 0);
    const keyFGS = `${familia}|${grupo}|${subgrupo}`;
    vendasPorFamiliaGrupoSubgrupo[keyFGS] = (vendasPorFamiliaGrupoSubgrupo[keyFGS] || 0) + Number(row.venda || 0);

    // NOVO: Agregar vendas por grupo e subgrupo (para gráficos de vendas 2025)
    vendasPorGrupo[grupo] = (vendasPorGrupo[grupo] || 0) + venda;
    vendasPorSubgrupo[subgrupo] = (vendasPorSubgrupo[subgrupo] || 0) + venda;

    // Tambem por referencia/cor/tamanho para distribuicao detalhada
    const ref = normalizeName(row.referencia, row.idproduto);
    const cor = normalizeName(row.cor).toUpperCase();
    const tam = normalizeName(row.tamanho).toUpperCase();

    historicoVendasData.push({
      empresa: loja,
      familia,
      grupo,
      subgrupo,
      ref,
      cor,
      tam,
      valor: venda
    });

    const keyFR = `${familia}|${ref}|${cor}|${tam}`;
    if (!vendasPorFamiliaRef[keyFR]) {
      vendasPorFamiliaRef[keyFR] = {
        familia,
        ref,
        cor,
        tam,
        grupo: grupo,
        subgrupo: subgrupo,
        classificacao: normalizeName(row.classificacao),
        continuidade: normalizeName(row.continuidade),
        venda: 0
      };
    }
    vendasPorFamiliaRef[keyFR].venda += Number(row.venda || 0);
  }

  for (const row of specialBaseRows) {
    const loja = normalizeStoreName(row.empresa);
    const familia = normalizeName(row.familia).toUpperCase();
    if (!SPECIAL_INVERNO26_FAMILIES.has(familia) && !SPECIAL_INVERNO26_CURVE_FAMILIES.has(familia)) continue;

    const grupo = normalizeName(row.grupo).toUpperCase();
    const subgrupo = normalizeName(row.subgrupo).toUpperCase();
    const venda = Number(row.venda || 0);
    lojas.add(loja);

    if (!specialRowsByFamily.has(familia)) specialRowsByFamily.set(familia, []);
    specialRowsByFamily.get(familia).push(row);

    const keyFL = `${familia}|${loja}`;
    vendasPorFamiliaLoja[keyFL] = (vendasPorFamiliaLoja[keyFL] || 0) + venda;

    const keyFGSL = `${familia}|${grupo}|${subgrupo}|${loja}`;
    vendasPorFamiliaGrupoSubgrupoLoja[keyFGSL] = (vendasPorFamiliaGrupoSubgrupoLoja[keyFGSL] || 0) + venda;
    const keyFGS = `${familia}|${grupo}|${subgrupo}`;
    vendasPorFamiliaGrupoSubgrupo[keyFGS] = (vendasPorFamiliaGrupoSubgrupo[keyFGS] || 0) + venda;

    vendasPorGrupo[grupo] = (vendasPorGrupo[grupo] || 0) + venda;
    vendasPorSubgrupo[subgrupo] = (vendasPorSubgrupo[subgrupo] || 0) + venda;

    const ref = normalizeName(row.referencia, row.idproduto);
    const cor = normalizeName(row.cor).toUpperCase();
    const tam = normalizeName(row.tamanho).toUpperCase();

    historicoVendasData.push({
      empresa: loja,
      familia,
      grupo,
      subgrupo,
      ref,
      cor,
      tam,
      valor: venda,
      baseOrigem: 'INVERNO 26',
      mesOrigem: Number(row.mes_origem || 0)
    });

    const keyFR = `${familia}|${ref}|${cor}|${tam}`;
    if (!vendasPorFamiliaRef[keyFR]) {
      vendasPorFamiliaRef[keyFR] = {
        familia,
        ref,
        cor,
        tam,
        grupo,
        subgrupo,
        classificacao: normalizeName(row.classificacao),
        continuidade: normalizeName(row.continuidade),
        venda: 0
      };
    }
    vendasPorFamiliaRef[keyFR].venda += venda;
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
  const planoPorLojaFallback = new Map();
  const skusPorFamilia = {};

  // Agrupar SKUs do Excel por familia
  for (const sku of skusExcel) {
    const grupoSubgrupo = getSkuGrupoSubgrupo(sku, grupoSubgrupoMap);
    const enrichedSku = {
      ...sku,
      grupo: grupoSubgrupo.grupo,
      subgrupo: grupoSubgrupo.subgrupo
    };

    if (!skusPorFamilia[enrichedSku.familia]) {
      skusPorFamilia[enrichedSku.familia] = [];
    }
    skusPorFamilia[enrichedSku.familia].push(enrichedSku);
  }

  const familiasProcessadas = new Set();

  for (const familiaNova of Object.keys(skusPorFamilia)) {
    const familiaHist = getFamiliaHistorica(familiaNova);
    const temDePara = ehDePara(familiaNova);
    const familiaKey = normalizeName(familiaNova).toUpperCase();
    const specialRowsFamilia = specialRowsByFamily.get(familiaKey) || [];
    const usaBaseInverno26 = SPECIAL_INVERNO26_FAMILIES.has(familiaKey) && specialRowsFamilia.length > 0;
    const usaCurvaInverno26 = SPECIAL_INVERNO26_CURVE_FAMILIES.has(familiaKey) && specialRowsFamilia.length > 0;

    // Buscar vendas da familia historica
    const vendasPorLoja = {};
    let vendaTotalFamilia = 0;

    for (const loja of lojasArray) {
      const key = `${usaBaseInverno26 ? familiaKey : familiaHist}|${loja}`;
      const venda = vendasPorFamiliaLoja[key] || 0;
      vendasPorLoja[loja] = venda;
      vendaTotalFamilia += venda;
    }

    // Calcular plano usando regras
    const resultado = usaBaseInverno26
      ? {
          plano: Math.round(vendaTotalFamilia * (1 + CRESCIMENTO_PADRAO)),
          regra: 'base_inverno26',
          baseEspecial: vendaTotalFamilia,
          crescimento: CRESCIMENTO_PADRAO,
          obs: 'Base Inverno 26 jan-jun/2026 + 10%, aberta por grupo/subgrupo/tamanho/loja'
        }
      : calcularPlanoFamilia(familiaNova, vendaTotalFamilia);
    const planoTotal = resultado.plano;

    if (usaBaseInverno26) {
      const monthBase = {};
      specialRowsFamilia.forEach((row) => {
        const mesPlano = SPECIAL_MONTH_DEPARA[Number(row.mes_origem || 0)];
        if (!mesPlano) return;
        monthBase[mesPlano] = (monthBase[mesPlano] || 0) + Number(row.venda || 0);
      });

      const monthRows = Object.entries(monthBase).map(([mes, base]) => ({ mes, base }));
      const monthValues = roundToTotal(
        monthRows,
        row => row.base * (1 + CRESCIMENTO_PADRAO),
        planoTotal
      );
      monthRows.forEach((row, index) => {
        specialMonthPlan[row.mes] = (specialMonthPlan[row.mes] || 0) + (monthValues[index] || 0);
      });
    }

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

    planoPorLoja = ajustarDistribuicaoPortelle(familiaNova, planoPorLoja, planoTotal);
    planoPorLojaFallback.set(familiaNova, planoPorLoja);

    // Para familias com base_especial, SEMPRE usar a base especial para exibicao
    // Isso garante que PORTELLE, LACE, RENDAS, etc mostrem a base correta
    let vendasParaExibir = vendasPorLoja;
    if (resultado.regra === 'base_especial' && resultado.baseEspecial && !usaBaseInverno26) {
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
    const matchPorSku = new Map();
    let planoPorSku = new Map();
    let vendaBasePorSku = new Map();
    const regraFamiliaTravaTotal = ['base_especial', 'fixo', 'cap'].includes(resultado.regra);

    if (regraFamiliaTravaTotal) {
      const rowsBaseFamilia = (usaBaseInverno26 || usaCurvaInverno26) ? specialRowsFamilia : rows;
      const baseTotalSku = resultado.baseEspecial !== undefined ? resultado.baseEspecial : vendaTotalFamilia;
      const primarySizeTotals = getFamilySizeTotals(rowsBaseFamilia, usaBaseInverno26 ? familiaKey : familiaHist);
      const fallbackSizeTotals = getLineSizeTotals(rowsBaseFamilia, getLinha(familiaNova), historicalFamilyLineMap);
      const getReferenceWeight = buildReferenceSizeWeightGetter(
        skusFamilia,
        rowsBaseFamilia,
        (usaBaseInverno26 || usaCurvaInverno26) ? familiaKey : familiaHist,
        primarySizeTotals.size > 0 ? primarySizeTotals : fallbackSizeTotals
      );
      const hasCurve = skusFamilia.some(sku => getReferenceWeight(sku) > 0);
      const distribuicao = hasCurve
        ? distributeSkusBySkuWeight(skusFamilia, planoTotal, baseTotalSku, getReferenceWeight)
        : {
          planoPorSku: new Map(skusFamilia.map(sku => [sku, 0])),
          vendaBasePorSku: new Map(skusFamilia.map(sku => [sku, 0]))
        };
      const matchTipoTrava = hasCurve
        ? `${resultado.regra.toUpperCase()}_CURVA`
        : `${resultado.regra.toUpperCase()}_SEM_CURVA`;

      planoPorSku = distribuicao.planoPorSku;
      vendaBasePorSku = distribuicao.vendaBasePorSku;
      skusFamilia.forEach((sku) => {
        matchPorSku.set(sku, {
          grupoHist: sku.grupo,
          subgrupoHist: sku.subgrupo,
          matchTipo: matchTipoTrava
        });
      });
    } else {
      const rowsBaseFamilia = (usaBaseInverno26 || usaCurvaInverno26) ? specialRowsFamilia : rows;
      const vendasGrupoSubgrupoBase = vendasPorFamiliaGrupoSubgrupo;
      const subgroupMapping = buildSubgroupMapping(
        skusFamilia,
        vendasGrupoSubgrupoBase,
        (usaBaseInverno26 || usaCurvaInverno26) ? familiaKey : familiaHist,
        rowsBaseFamilia,
        familiaNova,
        historicalFamilyLineMap
      );
      const skusPorGrupoSubgrupo = {};

      skusFamilia.forEach((sku) => {
        const key = `${sku.grupo}|${sku.subgrupo}`;
        if (!skusPorGrupoSubgrupo[key]) {
          skusPorGrupoSubgrupo[key] = [];
        }
        skusPorGrupoSubgrupo[key].push(sku);
      });

      let planoAlocadoSubgrupos = 0;
      let vendaBaseAlocadaSubgrupos = 0;
      const gruposSemBase = [];

      Object.entries(skusPorGrupoSubgrupo).forEach(([key, skusGrupoSubgrupo]) => {
        const [grupo, subgrupo] = key.split('|');
        const mapped = subgroupMapping.get(key) || {
          grupoHist: grupo,
          subgrupoHist: subgrupo,
          matchTipo: 'SEM_MATCH'
        };
        const histKey = `${usaBaseInverno26 ? familiaKey : familiaHist}|${mapped.grupoHist}|${mapped.subgrupoHist}`;
        const vendaBaseSubgrupo = mapped.vendaBaseOverride !== undefined
          ? Number(mapped.vendaBaseOverride || 0)
          : Number(vendasPorFamiliaGrupoSubgrupo[histKey] || 0);

        if (vendaBaseSubgrupo <= 0) {
          gruposSemBase.push({ key, skus: skusGrupoSubgrupo, mapped });
          return;
        }

        const planoSubgrupo = Math.ceil(vendaBaseSubgrupo * (1 + CRESCIMENTO_PADRAO));
        vendaBaseAlocadaSubgrupos += vendaBaseSubgrupo;
        const histSubgrupos = mapped.histSubgrupos || String(mapped.subgrupoHist || subgrupo).split(' + ');
        let primarySizeTotals;
        if (mapped.matchTipo === 'FALLBACK_LINHA') {
          primarySizeTotals = getLineSubgroupSizeTotals(rowsBaseFamilia, mapped.linhaBase || getLinha(familiaNova), grupo, subgrupo, historicalFamilyLineMap);
        } else if (mapped.matchTipo === 'FALLBACK_GRUPO_SUBGRUPO') {
          primarySizeTotals = getGroupSubgroupSizeTotals(
            rowsBaseFamilia,
            grupo,
            subgrupo,
            skusGrupoSubgrupo.map(sku => sku.tamanho)
          );
        } else {
          primarySizeTotals = getFamilySubgroupSizeTotals(rowsBaseFamilia, (usaBaseInverno26 || usaCurvaInverno26) ? familiaKey : familiaHist, mapped.grupoHist || grupo, histSubgrupos);
        }
        const fallbackSizeTotals = getFamilyGroupSizeTotals(rowsBaseFamilia, (usaBaseInverno26 || usaCurvaInverno26) ? familiaKey : familiaHist, mapped.grupoHist || grupo);
        const distribuicao = distributeSkusBySizeTarget(
          skusGrupoSubgrupo,
          planoSubgrupo,
          vendaBaseSubgrupo,
          primarySizeTotals,
          fallbackSizeTotals
        );
        planoAlocadoSubgrupos += planoSubgrupo;

        skusGrupoSubgrupo.forEach((sku) => {
          planoPorSku.set(sku, distribuicao.planoPorSku.get(sku) || 0);
          vendaBasePorSku.set(sku, distribuicao.vendaBasePorSku.get(sku) || 0);
          matchPorSku.set(sku, mapped);
        });
      });

      const planoRestanteSemBase = Math.max(planoTotal - planoAlocadoSubgrupos, 0);
      const vendaBaseRestanteSemBase = Math.max(vendaTotalFamilia - vendaBaseAlocadaSubgrupos, 0);
      const skusSemBase = gruposSemBase.flatMap(group => group.skus);
      const rowsBaseSemBase = (usaBaseInverno26 || usaCurvaInverno26) ? specialRowsFamilia : rows;
      const primarySemBase = getFamilySizeTotals(rowsBaseSemBase, (usaBaseInverno26 || usaCurvaInverno26) ? familiaKey : familiaHist);
      const fallbackSemBase = getLineSizeTotals(rowsBaseSemBase, getLinha(familiaNova), historicalFamilyLineMap);
      const getReferenceWeight = buildReferenceSizeWeightGetter(
        skusSemBase,
        rowsBaseSemBase,
        (usaBaseInverno26 || usaCurvaInverno26) ? familiaKey : familiaHist,
        primarySemBase.size > 0 ? primarySemBase : fallbackSemBase
      );
      const hasReferenceWeights = skusSemBase.some(sku => getReferenceWeight(sku) > 0);
      const distribuicaoSemBasePonderada = hasReferenceWeights
        ? distributeSkusBySkuWeight(
          skusSemBase,
          planoRestanteSemBase,
          vendaBaseRestanteSemBase,
          getReferenceWeight
        )
        : null;
      const distribuicaoSemBase = distribuicaoSemBasePonderada
        ? distribuicaoSemBasePonderada.planoPorSku
        : primarySemBase.size > 0 || fallbackSemBase.size > 0
          ? distributeBySizeTargetMap(skusSemBase, planoRestanteSemBase, primarySemBase, fallbackSemBase)
          : distributeBySubgroupTarget(skusSemBase, planoRestanteSemBase);
      const vendaBaseSkuSemBase = skusSemBase.length > 0
        ? Math.round((vendaBaseRestanteSemBase / skusSemBase.length) * 100) / 100
        : 0;
      gruposSemBase.forEach(({ skus, mapped }) => {
        skus.forEach((sku) => {
          planoPorSku.set(sku, distribuicaoSemBase.get(sku) || 0);
          vendaBasePorSku.set(
            sku,
            distribuicaoSemBasePonderada
              ? distribuicaoSemBasePonderada.vendaBasePorSku.get(sku) || 0
              : vendaBaseSkuSemBase
          );
          matchPorSku.set(sku, mapped);
        });
      });
    }

    if (skusFamilia.length > 0) {
      for (const sku of skusFamilia) {
        const planoSku = planoPorSku.get(sku) || 0;
        const vendaBaseSku = vendaBasePorSku.get(sku) || 0;
        const matchSubgrupo = matchPorSku.get(sku) || {};

        planoRows.push({
          colecao: 'VERAO 27',
          familia: familiaNova,
          grupo: sku.grupo,
          subgrupo: sku.subgrupo,
          ref: sku.referencia,
          cor: sku.cor,
          tam: sku.tamanho,
          codProduto: sku.codProduto,
          linha: sku.linha || getLinha(familiaNova),
          continuidade: sku.continuidade,
          vendaBase: vendaBaseSku,
          percCor: '100.0%',
          plano: planoSku,
          temDepara: temDePara ? 'SIM' : 'NAO',
          temPercentual: resultado.regra !== 'padrao' ? 'SIM' : 'NAO',
          familiaHist: familiaHist,
          grupoHist: matchSubgrupo.grupoHist || sku.grupo,
          subgrupoHist: matchSubgrupo.subgrupoHist || sku.subgrupo,
          matchSubgrupo: matchSubgrupo.matchTipo || 'SEM_MATCH'
        });
      }
    }
  }

  const planoPorLojaCalculado = buildStoreDistributionFromPlanRows(planoRows, lojasArray, planoPorLojaFallback);
  familiasDashboard.forEach((familia) => {
    familia.plano2026 = planoPorLojaCalculado.get(familia.nome) || familia.plano2026;
  });

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

  const mesProducaoData = buildMonthPlanWithSpecial(totalPlano, specialMonthPlan);
  const mesesPlano = mesProducaoData.map(row => row.mes);

  return {
    meta: {
      origem: 'banco',
      regra: 'SKUs do Excel Verao 27 + de-para familias + regras especiais',
      geradoEm: new Date().toISOString(),
      familiasProcessadas: familiasDashboard.length,
      skusProcessados: planoRows.length
    },
    filterOptions: buildFilterOptions({ lojas: lojasArray, planoRows, meses: mesesPlano }),
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
    // Usar vendas reais do período anterior (já têm grupo/subgrupo do banco)
    grupoData2025: Object.entries(vendasPorGrupo)
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor),
    familiaData: groupSum(planoRows, 'familia'),
    familiaData2025: groupSum(planoRows, 'familia', 'vendaBase'),
    linhaData: groupSum(planoRows, 'linha'),
    linhaData2025: groupSum(planoRows, 'linha', 'vendaBase'),
    subgrupoData: groupSum(planoRows, 'subgrupo'),
    // Usar vendas reais do período anterior (já têm grupo/subgrupo do banco)
    subgrupoData2025: Object.entries(vendasPorSubgrupo)
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor),
    refData: groupSum(planoRows, 'ref'),
    refData2025: groupSum(planoRows, 'ref', 'vendaBase'),
    mesProducaoData,
    mesVenda2025Data: buildMonthPlan(totalVenda),
    historicoVendasData,
    planoEdicaoLimitadaData: planoRows,
    comparativoLojasData: {
      lojas: lojasArray,
      familias: familiasDashboard.map(f => ({
        nome: f.nome,
        vendas2025: f.vendas2025,
        plano2026: f.plano2026
      })),
      // NOVO: Vendas por familia+grupo+subgrupo+loja para distribuicao granular no PCP
      vendasPorFamiliaGrupoSubgrupoLoja: vendasPorFamiliaGrupoSubgrupoLoja,
      historicoVendasData
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
