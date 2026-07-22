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
const SPECIAL_2026_BASE_FAMILIES = new Set(['CETIM', 'BREEZE']);
const SPECIAL_MONTH_DEPARA = {
  1: 'JULHO',
  2: 'AGOSTO',
  3: 'SETEMBRO',
  4: 'OUTUBRO',
  5: 'NOVEMBRO',
  6: 'DEZEMBRO'
};

const SPECIAL_SUBGROUP_DEPARA = {
  'LOVE APPEAL|CALCA|CALCINHA STRING': 'CALCINHA FIO DENTAL',
  'KISS ME|TOP|TOP': 'SUTIA CROPPED',
  'KISS ME|TOP|SEM INFO': 'SUTIA CROPPED'
};

const LOVE_APPEAL_ALLOWED_SIZES = {
  CALCA: new Set(['M', 'G']),
  SUTIA: new Set(['42', '44'])
};

const SPECIAL_COLOR_MAP = {
  VISCOW: {
    PEAR: 'VERDINHO',
    LISTRADO: 'LOSTRADO'
  }
};

const SPECIAL_FAMILY_COLOR_TARGETS = {
  VISCOW: {
    VERDINHO: 0.50,
    LOSTRADO: 0.50
  }
};

const SPECIAL_REFERENCE_SOURCE_OVERRIDES = {
  'FLOR DO OCEANO|603483': {
    familiaHist: 'DELICATTI',
    refHist: '503439',
    matchTipo: 'REF_HISTORICA_503439'
  }
};

function getSpecialReferenceSourceOverride(familiaNova, sku) {
  const key = `${normalizeName(familiaNova).toUpperCase()}|${normalizeName(sku?.referencia).toUpperCase()}`;
  return SPECIAL_REFERENCE_SOURCE_OVERRIDES[key] || null;
}

function getDisplayColor(familia, cor) {
  const familiaKey = normalizeName(familia).toUpperCase();
  const corKey = normalizeName(cor).toUpperCase();
  return SPECIAL_COLOR_MAP[familiaKey]?.[corKey] || cor;
}

function isContinuidadadeEdicaoLimitada(continuidade) {
  return normalizeName(continuidade).toUpperCase() === 'EDICAO LIMITADA';
}

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

function applySpecialFamilyColorTargets(planoRows) {
  Object.entries(SPECIAL_FAMILY_COLOR_TARGETS).forEach(([familia, targets]) => {
    const familyRows = planoRows.filter(row => normalizeName(row.familia).toUpperCase() === familia);
    if (familyRows.length === 0) return;

    const targetColors = Object.keys(targets);
    const rowsByColor = new Map();
    targetColors.forEach(color => rowsByColor.set(color, []));

    familyRows.forEach((row) => {
      const color = normalizeName(row.cor).toUpperCase();
      if (!rowsByColor.has(color)) return;
      rowsByColor.get(color).push(row);
    });

    if (targetColors.some(color => (rowsByColor.get(color) || []).length === 0)) return;

    const totalPlano = familyRows.reduce((sum, row) => sum + Number(row.plano || 0), 0);
    const totalBase = familyRows.reduce((sum, row) => sum + Number(row.vendaBase || 0), 0);
    const colorPlanValues = roundToTotal(
      targetColors,
      color => totalPlano * Number(targets[color] || 0),
      totalPlano
    );

    targetColors.forEach((color, colorIndex) => {
      const colorRows = rowsByColor.get(color) || [];
      const targetPlan = colorPlanValues[colorIndex] || 0;
      const targetBase = totalBase * Number(targets[color] || 0);
      const currentPlan = colorRows.reduce((sum, row) => sum + Number(row.plano || 0), 0);
      const currentBase = colorRows.reduce((sum, row) => sum + Number(row.vendaBase || 0), 0);
      const planValues = roundToTotal(
        colorRows,
        row => currentPlan > 0
          ? targetPlan * (Number(row.plano || 0) / currentPlan)
          : targetPlan / colorRows.length,
        targetPlan
      );

      colorRows.forEach((row, index) => {
        row.plano = planValues[index] || 0;
        const base = currentBase > 0
          ? targetBase * (Number(row.vendaBase || 0) / currentBase)
          : targetBase / colorRows.length;
        row.vendaBase = Math.round(base * 100) / 100;
      });
    });
  });
}

function getLargeSizeSet(grupo) {
  const grupoKey = normalizeName(grupo).toUpperCase();
  if (grupoKey.includes('SUTIA')) return new Set(['48', '50']);
  if (grupoKey.includes('CALCA')) return new Set(['GG', 'EG', 'XG']);
  return new Set();
}

function isLargeOnlyHistoricalSubgroup(rows, familiaHist, grupo, subgrupo) {
  const largeSizes = getLargeSizeSet(grupo);
  if (largeSizes.size === 0) return false;

  const sizeTotals = getFamilySubgroupSizeTotals(rows, familiaHist, grupo, [subgrupo]);
  const positiveSizes = [...sizeTotals.entries()]
    .filter(([, total]) => Number(total || 0) > 0)
    .map(([size]) => normalizeName(size).toUpperCase());

  return positiveSizes.length > 0 && positiveSizes.every(size => largeSizes.has(size));
}

function targetHasRegularSizes(skus, grupo) {
  const largeSizes = getLargeSizeSet(grupo);
  if (largeSizes.size === 0) return false;

  return skus.some(sku => {
    const size = normalizeName(sku.tamanho).toUpperCase();
    return size && !largeSizes.has(size);
  });
}

function canUseResidualSubgroupMapping(rows, familiaHist, grupo, novoSubgrupo, historicoSubgrupo, skusFamilia) {
  const skusNovoSubgrupo = skusFamilia.filter(sku => (
    normalizeName(sku.grupo).toUpperCase() === normalizeName(grupo).toUpperCase() &&
    normalizeName(sku.subgrupo).toUpperCase() === normalizeName(novoSubgrupo).toUpperCase()
  ));

  if (!targetHasRegularSizes(skusNovoSubgrupo, grupo)) return true;
  return !isLargeOnlyHistoricalSubgroup(rows, familiaHist, grupo, historicoSubgrupo);
}

function rebalanceRegularReferenceLargeSizes(planoRows) {
  const rowsByReferenceColor = new Map();

  planoRows.forEach((row) => {
    if (!isContinuidadadeEdicaoLimitada(row.continuidade)) return;
    if (normalizeName(row.ref).toUpperCase().startsWith('70')) return;

    const largeSizes = getLargeSizeSet(row.grupo);
    if (!largeSizes.has(normalizeName(row.tam).toUpperCase())) return;

    const key = [
      normalizeName(row.familia).toUpperCase(),
      normalizeName(row.ref).toUpperCase(),
      normalizeName(row.cor).toUpperCase(),
      normalizeName(row.grupo).toUpperCase()
    ].join('|');

    if (!rowsByReferenceColor.has(key)) {
      rowsByReferenceColor.set(key, planoRows.filter(candidate => (
        normalizeName(candidate.familia).toUpperCase() === normalizeName(row.familia).toUpperCase() &&
        normalizeName(candidate.ref).toUpperCase() === normalizeName(row.ref).toUpperCase() &&
        normalizeName(candidate.cor).toUpperCase() === normalizeName(row.cor).toUpperCase() &&
        normalizeName(candidate.grupo).toUpperCase() === normalizeName(row.grupo).toUpperCase()
      )));
    }
  });

  rowsByReferenceColor.forEach((rows) => {
    const largeSizes = getLargeSizeSet(rows[0]?.grupo);
    const normalRows = rows.filter(row => !largeSizes.has(normalizeName(row.tam).toUpperCase()));
    const largeRows = rows.filter(row => largeSizes.has(normalizeName(row.tam).toUpperCase()));
    if (normalRows.length === 0 || largeRows.length === 0) return;

    const minNormal = Math.min(...normalRows.map(row => Number(row.plano || 0)).filter(value => value > 0));
    if (!Number.isFinite(minNormal) || minNormal <= 0) return;

    let excessoPlano = 0;
    let excessoBase = 0;

    largeRows.forEach((row) => {
      const planoAtual = Number(row.plano || 0);
      if (planoAtual <= minNormal) return;

      const novoPlano = minNormal;
      const ratio = planoAtual > 0 ? novoPlano / planoAtual : 0;
      excessoPlano += planoAtual - novoPlano;
      excessoBase += Number(row.vendaBase || 0) * (1 - ratio);
      row.plano = novoPlano;
      row.vendaBase = Math.round(Number(row.vendaBase || 0) * ratio * 100) / 100;
    });

    if (excessoPlano <= 0) return;

    const normalTotal = normalRows.reduce((sum, row) => sum + Number(row.plano || 0), 0);
    const planoValues = roundToTotal(
      normalRows,
      row => Number(row.plano || 0) + (normalTotal > 0 ? excessoPlano * (Number(row.plano || 0) / normalTotal) : excessoPlano / normalRows.length),
      normalTotal + excessoPlano
    );

    normalRows.forEach((row, index) => {
      const planoAntes = Number(row.plano || 0);
      const planoDepois = planoValues[index] || 0;
      row.plano = planoDepois;
      row.vendaBase = Math.round((Number(row.vendaBase || 0) + (excessoBase * (normalTotal > 0 ? planoAntes / normalTotal : 1 / normalRows.length))) * 100) / 100;
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

function roundPositiveToAtLeastOne(items, getValue, targetTotal) {
  const prepared = items.map((item, index) => ({
    item,
    index,
    raw: Number(getValue(item) || 0)
  }));
  const positiveRows = prepared.filter(row => row.raw > 0);

  if (positiveRows.length === 0 || targetTotal <= 0) {
    return items.map(() => 0);
  }

  const totalPositiveRaw = positiveRows.reduce((sum, row) => sum + row.raw, 0);
  if (totalPositiveRaw <= 0) {
    return items.map(() => 0);
  }

  if (targetTotal < positiveRows.length) {
    const values = new Map(positiveRows.map(row => [row.index, 1]));
    return items.map((item, index) => values.get(index) || 0);
  }

  const extraTarget = targetTotal - positiveRows.length;
  const preparedExtra = positiveRows.map(row => {
    const rawExtra = extraTarget * (row.raw / totalPositiveRaw);
    const baseExtra = Math.floor(rawExtra);
    return {
      ...row,
      base: 1 + baseExtra,
      fraction: rawExtra - baseExtra
    };
  });

  let remaining = targetTotal - preparedExtra.reduce((sum, row) => sum + row.base, 0);
  preparedExtra.sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const values = new Map();
  preparedExtra.forEach((row, index) => {
    values.set(row.index, row.base + (index < remaining ? 1 : 0));
  });

  return items.map((item, index) => values.get(index) || 0);
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

function buildFamilyGroupSubgroupTotals(rows, familiaKey) {
  const totals = {};
  const family = normalizeName(familiaKey).toUpperCase();

  rows.forEach((row) => {
    if (normalizeName(row.familia).toUpperCase() !== family) return;

    const grupo = normalizeName(row.grupo).toUpperCase();
    const subgrupo = normalizeName(row.subgrupo).toUpperCase();
    const key = `${family}|${grupo}|${subgrupo}`;
    totals[key] = (totals[key] || 0) + Number(row.venda || 0);
  });

  return totals;
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

function getHistoricalReferenceStats(rows, familiaHist, grupo, subgrupos) {
  const familiaKey = normalizeName(familiaHist).toUpperCase();
  const grupoKey = normalizeName(grupo).toUpperCase();
  const subgrupoSet = new Set(subgrupos.map(subgrupo => normalizeName(subgrupo).toUpperCase()));
  const totalsByRef = new Map();
  const skuKeysByRef = new Map();

  rows.forEach((row) => {
    if (normalizeName(row.familia).toUpperCase() !== familiaKey) return;
    if (normalizeName(row.grupo).toUpperCase() !== grupoKey) return;
    if (!subgrupoSet.has(normalizeName(row.subgrupo).toUpperCase())) return;

    const ref = normalizeName(row.referencia, row.idproduto).toUpperCase();
    if (!ref || ref === 'SEM INFO') return;

    totalsByRef.set(ref, (totalsByRef.get(ref) || 0) + Number(row.venda || 0));
    if (!skuKeysByRef.has(ref)) skuKeysByRef.set(ref, new Set());
    skuKeysByRef.get(ref).add(`${normalizeName(row.cor).toUpperCase()}|${normalizeName(row.tamanho).toUpperCase()}`);
  });

  const positiveRefs = [...totalsByRef.entries()]
    .filter(([, total]) => Number(total || 0) > 0)
    .map(([ref]) => ref);
  const total = positiveRefs.reduce((sum, ref) => sum + Number(totalsByRef.get(ref) || 0), 0);
  const totalSkuCount = positiveRefs.reduce((sum, ref) => sum + Number(skuKeysByRef.get(ref)?.size || 0), 0);

  return {
    total,
    referenceCount: positiveRefs.length,
    average: positiveRefs.length > 0 ? total / positiveRefs.length : 0,
    averageSkuCount: positiveRefs.length > 0 ? totalSkuCount / positiveRefs.length : 0
  };
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

function getFallbackLineKeys(linha) {
  const linhaKey = normalizeName(linha).toUpperCase();
  if (linhaKey.includes('+')) {
    return linhaKey.split('+').map(value => normalizeName(value).toUpperCase()).filter(Boolean);
  }
  if (linhaKey === 'LUXE' || linhaKey === 'FASHION') {
    return ['LUXE', 'FASHION'];
  }
  return [linhaKey];
}

function rowMatchesAnyLine(row, lineKeys, historicalFamilyLineMap) {
  return lineKeys.some(linhaKey => rowMatchesLine(row, linhaKey, historicalFamilyLineMap));
}

function getLineSubgroupTotals(rows, linha, grupo, historicalFamilyLineMap) {
  const totals = new Map();
  const linhaKeys = getFallbackLineKeys(linha);
  const grupoKey = normalizeName(grupo).toUpperCase();

  rows.forEach((row) => {
    if (!rowMatchesAnyLine(row, linhaKeys, historicalFamilyLineMap)) return;

    const rowGrupo = normalizeName(row.grupo).toUpperCase();
    if (rowGrupo !== grupoKey) return;

    const subgrupo = normalizeName(row.subgrupo).toUpperCase();
    totals.set(subgrupo, (totals.get(subgrupo) || 0) + Number(row.venda || 0));
  });

  return totals;
}

function getLineGroupSubgroupReferenceAverage(rows, linha, grupo, subgrupo, historicalFamilyLineMap) {
  const linhaKeys = getFallbackLineKeys(linha);
  const grupoKey = normalizeName(grupo).toUpperCase();
  const subgrupoKey = normalizeName(subgrupo).toUpperCase();
  const totalsByRef = new Map();
  const skuKeysByRef = new Map();

  rows.forEach((row) => {
    if (!rowMatchesAnyLine(row, linhaKeys, historicalFamilyLineMap)) return;
    if (normalizeName(row.grupo).toUpperCase() !== grupoKey) return;
    if (normalizeName(row.subgrupo).toUpperCase() !== subgrupoKey) return;

    const ref = normalizeName(row.referencia, row.idproduto).toUpperCase();
    if (!ref || ref === 'SEM INFO') return;
    totalsByRef.set(ref, (totalsByRef.get(ref) || 0) + Number(row.venda || 0));

    if (!skuKeysByRef.has(ref)) skuKeysByRef.set(ref, new Set());
    skuKeysByRef.get(ref).add(`${normalizeName(row.cor).toUpperCase()}|${normalizeName(row.tamanho).toUpperCase()}`);
  });

  const positiveTotals = [...totalsByRef.values()].filter(value => value > 0);
  if (positiveTotals.length === 0) {
    return { average: 0, referenceCount: 0, total: 0, averageSkuCount: 0 };
  }

  const total = positiveTotals.reduce((sum, value) => sum + value, 0);
  const positiveRefs = [...totalsByRef.entries()].filter(([, value]) => value > 0).map(([ref]) => ref);
  const totalSkuCount = positiveRefs.reduce((sum, ref) => sum + Number(skuKeysByRef.get(ref)?.size || 0), 0);
  return {
    average: total / positiveTotals.length,
    referenceCount: positiveTotals.length,
    total,
    averageSkuCount: positiveRefs.length > 0 ? totalSkuCount / positiveRefs.length : 0
  };
}

function getGroupSubgroupReferenceAverage(rows, grupo, subgrupo) {
  const grupoKey = normalizeName(grupo).toUpperCase();
  const subgrupoKey = normalizeName(subgrupo).toUpperCase();
  const totalsByRef = new Map();
  const skuKeysByRef = new Map();

  rows.forEach((row) => {
    if (normalizeName(row.grupo).toUpperCase() !== grupoKey) return;
    if (normalizeName(row.subgrupo).toUpperCase() !== subgrupoKey) return;

    const ref = normalizeName(row.referencia, row.idproduto).toUpperCase();
    if (!ref || ref === 'SEM INFO') return;
    totalsByRef.set(ref, (totalsByRef.get(ref) || 0) + Number(row.venda || 0));

    if (!skuKeysByRef.has(ref)) skuKeysByRef.set(ref, new Set());
    skuKeysByRef.get(ref).add(`${normalizeName(row.cor).toUpperCase()}|${normalizeName(row.tamanho).toUpperCase()}`);
  });

  const positiveTotals = [...totalsByRef.values()].filter(value => value > 0);
  if (positiveTotals.length === 0) {
    return { average: 0, referenceCount: 0, total: 0, averageSkuCount: 0 };
  }

  const total = positiveTotals.reduce((sum, value) => sum + value, 0);
  const positiveRefs = [...totalsByRef.entries()].filter(([, value]) => value > 0).map(([ref]) => ref);
  const totalSkuCount = positiveRefs.reduce((sum, ref) => sum + Number(skuKeysByRef.get(ref)?.size || 0), 0);
  return {
    average: total / positiveTotals.length,
    referenceCount: positiveTotals.length,
    total,
    averageSkuCount: positiveRefs.length > 0 ? totalSkuCount / positiveRefs.length : 0
  };
}

function getPrefixReferenceAverage(rows, grupo, subgrupo, prefix) {
  const grupoKey = normalizeName(grupo).toUpperCase();
  const subgrupoKey = normalizeName(subgrupo).toUpperCase();
  const prefixKey = String(prefix || '');
  const totalsByRef = new Map();

  rows.forEach((row) => {
    if (normalizeName(row.grupo).toUpperCase() !== grupoKey) return;
    if (subgrupoKey && normalizeName(row.subgrupo).toUpperCase() !== subgrupoKey) return;

    const ref = normalizeName(row.referencia, row.idproduto).toUpperCase();
    if (!ref.startsWith(prefixKey)) return;
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

function isNumericSize(size) {
  const value = normalizeName(size).toUpperCase();
  const numeric = Number(value.replace(',', '.'));
  return Number.isFinite(numeric);
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

function getReferenceTotal(rows, familiaHist, referencia) {
  const familiaKey = normalizeName(familiaHist).toUpperCase();
  const refKey = normalizeName(referencia).toUpperCase();

  return rows.reduce((sum, row) => {
    const rowRef = normalizeName(row.referencia, row.idproduto).toUpperCase();
    if (normalizeName(row.familia).toUpperCase() !== familiaKey) return sum;
    if (rowRef !== refKey) return sum;
    return sum + Number(row.venda || 0);
  }, 0);
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
  const linhaKeys = getFallbackLineKeys(linha);

  rows.forEach((row) => {
    if (!rowMatchesAnyLine(row, linhaKeys, historicalFamilyLineMap)) return;
    addSizeTotal(totals, row.tamanho, row.venda);
  });

  return totals;
}

function getLineSubgroupSizeTotals(rows, linha, grupo, subgrupo, historicalFamilyLineMap) {
  const totals = new Map();
  const linhaKeys = getFallbackLineKeys(linha);
  const grupoKey = normalizeName(grupo).toUpperCase();
  const subgrupoKey = normalizeName(subgrupo).toUpperCase();

  rows.forEach((row) => {
    if (!rowMatchesAnyLine(row, linhaKeys, historicalFamilyLineMap)) return;
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

function getPrefixGroupSubgroupSizeTotals(rows, grupo, subgrupo, prefix, allowedSizes = null) {
  const totals = new Map();
  const grupoKey = normalizeName(grupo).toUpperCase();
  const subgrupoKey = normalizeName(subgrupo).toUpperCase();
  const prefixKey = String(prefix || '');
  const allowedSizeSet = allowedSizes
    ? new Set(allowedSizes.map(size => normalizeName(size).toUpperCase()))
    : null;

  rows.forEach((row) => {
    if (normalizeName(row.grupo).toUpperCase() !== grupoKey) return;
    if (subgrupoKey && normalizeName(row.subgrupo).toUpperCase() !== subgrupoKey) return;

    const ref = normalizeName(row.referencia, row.idproduto).toUpperCase();
    if (!ref.startsWith(prefixKey)) return;
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

  const newSizeSet = new Set(sortedNewSizes);
  sortedHistoricalSizes.forEach((historicalSize) => {
    if (!newSizeSet.has(historicalSize)) return;
    mapped.set(historicalSize, (mapped.get(historicalSize) || 0) + Number(historicalSizeTotals.get(historicalSize) || 0));
  });

  sortedHistoricalSizes.forEach((historicalSize) => {
    if (newSizeSet.has(historicalSize)) return;

    const historicalIsNumeric = isNumericSize(historicalSize);
    const compatibleNewSizes = sortedNewSizes.filter(size => isNumericSize(size) === historicalIsNumeric);
    const compatibleRanks = compatibleNewSizes.map(sizeRank);
    const historicalRank = sizeRank(historicalSize);
    const minRank = Math.min(...compatibleRanks);
    const maxRank = Math.max(...compatibleRanks);
    if (!compatibleNewSizes.length || historicalRank < minRank || historicalRank > maxRank) return;

    const targetSize = compatibleNewSizes
      .map(size => ({ size, distance: Math.abs(sizeRank(size) - sizeRank(historicalSize)) }))
      .sort((a, b) => a.distance - b.distance || sizeRank(a.size) - sizeRank(b.size))[0]?.size;

    if (!targetSize) return;
    mapped.set(targetSize, (mapped.get(targetSize) || 0) + Number(historicalSizeTotals.get(historicalSize) || 0));
  });

  const mappedTotal = [...mapped.values()].reduce((sum, value) => sum + Number(value || 0), 0);
  const hasMixedSizeTypes = sortedNewSizes.some(isNumericSize) !== sortedHistoricalSizes.some(isNumericSize);
  if (mappedTotal <= 0 && hasMixedSizeTypes) {
    sortedHistoricalSizes.forEach((historicalSize, index) => {
      const targetSize = sortedNewSizes[Math.min(index, sortedNewSizes.length - 1)];
      if (!targetSize) return;
      mapped.set(targetSize, (mapped.get(targetSize) || 0) + Number(historicalSizeTotals.get(historicalSize) || 0));
    });
  }

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

function extendMissingEdgeSizeWeights(weights) {
  const result = new Map(weights);
  const sortedSizes = sortSizes([...result.keys()]);
  const positiveIndexes = sortedSizes
    .map((size, index) => ({ size, index, value: Number(result.get(size) || 0) }))
    .filter(row => row.value > 0);

  if (positiveIndexes.length === 0) return result;

  const firstPositive = positiveIndexes[0];
  for (let index = firstPositive.index - 1, step = 1; index >= 0; index -= 1, step += 1) {
    const size = sortedSizes[index];
    if (Number(result.get(size) || 0) > 0) continue;
    result.set(size, firstPositive.value * Math.pow(0.5, step));
  }

  const lastPositive = positiveIndexes[positiveIndexes.length - 1];
  for (let index = lastPositive.index + 1, step = 1; index < sortedSizes.length; index += 1, step += 1) {
    const size = sortedSizes[index];
    if (Number(result.get(size) || 0) > 0) continue;
    result.set(size, lastPositive.value * Math.pow(0.5, step));
  }

  return result;
}

function capEdgeSizeWeights(weights) {
  const result = new Map(weights);
  const sortedSizes = sortSizes([...result.keys()]);
  const positiveSizes = sortedSizes.filter(size => Number(result.get(size) || 0) > 0);

  if (positiveSizes.length < 2) return result;

  const firstSize = positiveSizes[0];
  const secondSize = positiveSizes[1];
  const firstCap = Number(result.get(secondSize) || 0) * 0.5;
  if (firstCap > 0) {
    result.set(firstSize, Math.min(Number(result.get(firstSize) || 0), firstCap));
  }

  const lastSize = positiveSizes[positiveSizes.length - 1];
  const previousSize = positiveSizes[positiveSizes.length - 2];
  const lastCap = Number(result.get(previousSize) || 0) * 0.5;
  if (lastCap > 0) {
    result.set(lastSize, Math.min(Number(result.get(lastSize) || 0), lastCap));
  }

  return result;
}

function getExtendedSizeWeight(sizeTotals, size, allSizes, { preferDirect = true } = {}) {
  const sizeKey = normalizeName(size).toUpperCase();
  const direct = Number(sizeTotals.get(sizeKey) || 0);
  if (preferDirect && direct > 0) return direct;

  const candidateSizes = [...new Set([...allSizes, sizeKey].map(value => normalizeName(value).toUpperCase()))];
  const extended = extendMissingEdgeSizeWeights(mapHistoricalSizesToNewSizes(candidateSizes, sizeTotals));
  const weighted = preferDirect ? extended : capEdgeSizeWeights(extended);
  return Number(weighted.get(sizeKey) || 0);
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

    if (
      novosSobra.length === 1 &&
      historicosSobra.length === 1 &&
      canUseResidualSubgroupMapping(rows, familiaHist, grupo, novosSobra[0], historicosSobra[0], skusFamilia)
    ) {
      mapping.set(`${grupo}|${novosSobra[0]}`, {
        grupoHist: grupo,
        subgrupoHist: historicosSobra[0],
        histSubgrupos: [historicosSobra[0]],
        matchTipo: 'SOBRA_UNICA'
      });
      return;
    }

    const historicosSobraCompativeis = historicosSobra.filter(historicoSubgrupo => (
      novosSobra.some(novoSubgrupo => (
        canUseResidualSubgroupMapping(rows, familiaHist, grupo, novoSubgrupo, historicoSubgrupo, skusFamilia)
      ))
    ));

    if (novosSobra.length > 0 && historicosSobraCompativeis.length > 0) {
      const baseHistoricaRestante = historicosSobraCompativeis.reduce(
        (sum, subgrupo) => sum + Number(histTotals.get(subgrupo) || 0),
        0
      );
      const sourceReferenceStats = getHistoricalReferenceStats(rows, familiaHist, grupo, historicosSobraCompativeis);
      const refsNovasSobra = new Set(
        skusFamilia
          .filter(sku => normalizeName(sku.grupo).toUpperCase() === normalizeName(grupo).toUpperCase())
          .filter(sku => novosSobra.includes(sku.subgrupo))
          .map(sku => normalizeName(sku.referencia).toUpperCase())
          .filter(ref => ref && ref !== 'SEM INFO')
      );
      const basePool = sourceReferenceStats.average > 0
        ? Math.min(baseHistoricaRestante, sourceReferenceStats.average * Math.max(refsNovasSobra.size, 1))
        : baseHistoricaRestante;
      const totalSkusSobra = novosSobra.reduce(
        (sum, subgrupo) => sum + Number(skuCounts.get(`${grupo}|${subgrupo}`) || 0),
        0
      );

      novosSobra.forEach((subgrupo) => {
        const skuCount = Number(skuCounts.get(`${grupo}|${subgrupo}`) || 0);
        const participacaoSku = totalSkusSobra > 0 ? skuCount / totalSkusSobra : 1 / novosSobra.length;

        mapping.set(`${grupo}|${subgrupo}`, {
          grupoHist: grupo,
          subgrupoHist: historicosSobraCompativeis.join(' + '),
          histSubgrupos: historicosSobraCompativeis,
          matchTipo: 'POOL_MEDIA_REFERENCIAS',
          vendaBaseOverride: basePool * participacaoSku,
          refsComparaveis: sourceReferenceStats.referenceCount,
          fatorSku: sourceReferenceStats.referenceCount > 0
            ? Math.min(1, Math.max(refsNovasSobra.size, 1) / sourceReferenceStats.referenceCount)
            : 1
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
      const skuCountNovo = Number(skuCounts.get(key) || 0);
      const linhaBaseFallback = getFallbackLineKeys(linhaFamiliaNova).join('+');

      if (lineAverage.average > 0) {
        const fatorSku = lineAverage.averageSkuCount > 0 && skuCountNovo > 0
          ? Math.min(1, skuCountNovo / lineAverage.averageSkuCount)
          : 1;
        mapping.set(key, {
          grupoHist: grupo,
          subgrupoHist: subgrupo,
          histSubgrupos: [subgrupo],
          matchTipo: 'FALLBACK_LINHA',
          vendaBaseOverride: lineAverage.average * fatorSku,
          linhaBase: linhaBaseFallback,
          refsComparaveis: lineAverage.referenceCount,
          fatorSku
        });
        return;
      }

      const groupAverage = getGroupSubgroupReferenceAverage(rows, grupo, subgrupo);
      if (groupAverage.average <= 0) return;

      const fatorSku = groupAverage.averageSkuCount > 0 && skuCountNovo > 0
        ? Math.min(1, skuCountNovo / groupAverage.averageSkuCount)
        : 1;
      mapping.set(key, {
        grupoHist: grupo,
        subgrupoHist: subgrupo,
        histSubgrupos: [subgrupo],
        matchTipo: 'FALLBACK_GRUPO_SUBGRUPO',
        vendaBaseOverride: groupAverage.average * fatorSku,
        refsComparaveis: groupAverage.referenceCount,
        fatorSku
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

  const planoValues = roundPositiveToAtLeastOne(
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
  const sizesByRef = new Map();

  skus.forEach((sku) => {
    const refKey = normalizeName(sku.referencia).toUpperCase();
    const corKey = normalizeName(sku.cor).toUpperCase();
    const sizeKey = normalizeName(sku.tamanho).toUpperCase();

    if (!sizesByRef.has(refKey)) sizesByRef.set(refKey, new Set());
    sizesByRef.get(refKey).add(sizeKey);

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
    const allRefSizes = [...(sizesByRef.get(refKey) || new Set([sizeKey]))];

    for (const candidateCor of getColorCurveFallbacks(sku.cor)) {
      const totals = totalsByKey.get(`${refKey}|${candidateCor}`);
      const value = getExtendedSizeWeight(totals || new Map(), sizeKey, allRefSizes);
      if (value > 0) return value;
    }

    const averageTotals = averageTotalsByRefKey.get(refKey);
    const averageValue = getExtendedSizeWeight(averageTotals || new Map(), sizeKey, allRefSizes);
    if (averageValue > 0) return averageValue;

    const refTotals = refTotalsByKey.get(refKey);
    const refValue = getExtendedSizeWeight(refTotals || new Map(), sizeKey, allRefSizes);
    if (refValue > 0) return refValue;

    return getExtendedSizeWeight(fallbackSizeTotals, sizeKey, allRefSizes, { preferDirect: false });
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
  const weights = mergeMissingSizeWeights(extendMissingEdgeSizeWeights(primaryWeights), fallbackWeights);
  const sizeRows = newSizes.map(size => ({ size, weight: Number(weights.get(size) || 0) }));
  const totalWeight = sizeRows.reduce((sum, row) => sum + row.weight, 0);

  if (totalWeight <= 0) {
    skus.forEach((sku) => {
      planoPorSku.set(sku, 0);
      vendaBasePorSku.set(sku, 0);
    });
    return { planoPorSku, vendaBasePorSku };
  }

  const planoPorTamanho = roundPositiveToAtLeastOne(
    sizeRows,
    row => targetTotal * (row.weight / totalWeight),
    targetTotal
  );

  sizeRows.forEach((row, index) => {
    const skusSize = skusBySize.get(row.size) || [];
    const planoTamanho = planoPorTamanho[index] || 0;
    const baseTamanho = vendaBaseTotal * (row.weight / totalWeight);
    const planoSkuValues = roundPositiveToAtLeastOne(
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
export function buildDashboardFromSales(rows, { grupoSubgrupoMap = {}, specialBaseRows = [], curve2026Rows = [] } = {}) {
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
  const curveRowsByFamily = new Map();
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

  for (const row of curve2026Rows) {
    const familia = normalizeName(row.familia).toUpperCase();
    if (!SPECIAL_2026_BASE_FAMILIES.has(familia)) continue;

    const colecao = normalizeName(row.colecao).toUpperCase();
    const continuidade = normalizeName(row.continuidade, '').toUpperCase();
    const useRow =
      (familia === 'CETIM' && colecao === 'INVERNO 26' && continuidade === 'EDICAO LIMITADA') ||
      (familia === 'BREEZE' && colecao === 'VERAO 26' && continuidade === 'PERMANENTE');

    if (!useRow) continue;
    if (!curveRowsByFamily.has(familia)) curveRowsByFamily.set(familia, []);
    curveRowsByFamily.get(familia).push(row);
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
    const curveRowsFamilia = curveRowsByFamily.get(familiaKey) || [];
    const usaBaseInverno26 = SPECIAL_INVERNO26_FAMILIES.has(familiaKey) && specialRowsFamilia.length > 0;
    const usaCurvaInverno26 = SPECIAL_INVERNO26_CURVE_FAMILIES.has(familiaKey) && specialRowsFamilia.length > 0;
    const usaBase2026 = SPECIAL_2026_BASE_FAMILIES.has(familiaKey) && curveRowsFamilia.length > 0;
    const usaCurva2026 = usaBase2026;
    const usaCurvaEspecial = usaBaseInverno26 || usaCurvaInverno26 || usaCurva2026;

    // Buscar vendas da familia historica
    const vendasPorLoja = {};
    let vendaTotalFamilia = 0;

    if (usaBase2026) {
      for (const loja of lojasArray) {
        vendasPorLoja[loja] = 0;
      }

      curveRowsFamilia.forEach((row) => {
        const loja = normalizeStoreName(row.empresa);
        const venda = Number(row.venda || 0);
        vendasPorLoja[loja] = (vendasPorLoja[loja] || 0) + venda;
        vendaTotalFamilia += venda;
      });
    } else {
      for (const loja of lojasArray) {
        const key = `${usaBaseInverno26 ? familiaKey : familiaHist}|${loja}`;
        const venda = vendasPorFamiliaLoja[key] || 0;
        vendasPorLoja[loja] = venda;
        vendaTotalFamilia += venda;
      }
    }

    // Calcular plano usando regras
    const resultado = usaBaseInverno26 || usaBase2026
      ? {
          plano: Math.round(vendaTotalFamilia * (1 + CRESCIMENTO_PADRAO)),
          regra: usaBase2026 ? 'base_2026' : 'base_inverno26',
          baseEspecial: vendaTotalFamilia,
          crescimento: CRESCIMENTO_PADRAO,
          obs: usaBase2026
            ? 'Base 2026 sem crescimento, aberta por grupo/subgrupo/tamanho/loja'
            : 'Base Inverno 26 jan-jun/2026 sem crescimento, aberta por grupo/subgrupo/tamanho/loja'
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
      const rowsBaseFamilia = usaCurva2026 ? curveRowsFamilia : (usaBaseInverno26 || usaCurvaInverno26) ? specialRowsFamilia : rows;
      const baseTotalSku = resultado.baseEspecial !== undefined ? resultado.baseEspecial : vendaTotalFamilia;
      const primarySizeTotals = getFamilySizeTotals(rowsBaseFamilia, usaCurvaEspecial ? familiaKey : familiaHist);
      const fallbackSizeTotals = getLineSizeTotals(rowsBaseFamilia, getLinha(familiaNova), historicalFamilyLineMap);
      const getReferenceWeight = buildReferenceSizeWeightGetter(
        skusFamilia,
        rowsBaseFamilia,
        usaCurvaEspecial ? familiaKey : familiaHist,
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
      const rowsBaseFamilia = usaCurva2026 ? curveRowsFamilia : (usaBaseInverno26 || usaCurvaInverno26) ? specialRowsFamilia : rows;
      const vendasGrupoSubgrupoBase = usaBase2026
        ? buildFamilyGroupSubgroupTotals(rowsBaseFamilia, familiaKey)
        : vendasPorFamiliaGrupoSubgrupo;
      const subgroupMapping = buildSubgroupMapping(
        skusFamilia,
        vendasGrupoSubgrupoBase,
        usaCurvaEspecial ? familiaKey : familiaHist,
        rowsBaseFamilia,
        familiaNova,
        historicalFamilyLineMap
      );
      const skusPorGrupoSubgrupo = {};

      skusFamilia.forEach((sku) => {
        const prefixoProduto = normalizeName(sku.referencia, '').toUpperCase().startsWith('70')
          ? 'PREFIXO_70'
          : 'NORMAL';
        const sourceOverride = getSpecialReferenceSourceOverride(familiaNova, sku);
        const refSourceKey = sourceOverride ? `|REF_${normalizeName(sku.referencia).toUpperCase()}` : '';
        const key = `${sku.grupo}|${sku.subgrupo}|${prefixoProduto}${refSourceKey}`;
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
        const mappingKey = `${grupo}|${subgrupo}`;
        let mapped = subgroupMapping.get(mappingKey) || {
          grupoHist: grupo,
          subgrupoHist: subgrupo,
          matchTipo: 'SEM_MATCH'
        };
        const sourceOverride = skusGrupoSubgrupo
          .map(sku => getSpecialReferenceSourceOverride(familiaNova, sku))
          .find(Boolean);

        if (sourceOverride) {
          const refTotal = getReferenceTotal(rowsBaseFamilia, sourceOverride.familiaHist, sourceOverride.refHist);
          if (refTotal > 0) {
            mapped = {
              ...mapped,
              grupoHist: grupo,
              subgrupoHist: subgrupo,
              histSubgrupos: [subgrupo],
              matchTipo: sourceOverride.matchTipo,
              refHist: sourceOverride.refHist,
              vendaBaseOverride: refTotal
            };
          }
        }

        const usaRegraPrefixo70 = skusGrupoSubgrupo.some((sku) => (
          normalizeName(sku.referencia, '').toUpperCase().startsWith('70')
        ));

        if (!sourceOverride && usaRegraPrefixo70 && !usaCurvaEspecial) {
          const mediaSubgrupo70 = getPrefixReferenceAverage(rowsBaseFamilia, grupo, subgrupo, '70');
          const mediaGrupo70 = mediaSubgrupo70.average > 0
            ? mediaSubgrupo70
            : getPrefixReferenceAverage(rowsBaseFamilia, grupo, '', '70');

          if (mediaGrupo70.average > 0) {
            mapped = {
              ...mapped,
              grupoHist: grupo,
              subgrupoHist: mediaSubgrupo70.average > 0 ? subgrupo : grupo,
              histSubgrupos: mediaSubgrupo70.average > 0 ? [subgrupo] : [],
              matchTipo: mediaSubgrupo70.average > 0 ? 'PREFIXO_70_SUBGRUPO' : 'PREFIXO_70_GRUPO',
              vendaBaseOverride: mediaGrupo70.average,
              refsComparaveis: mediaGrupo70.referenceCount
            };
          }
        }

        const histKey = `${(usaBaseInverno26 || usaBase2026) ? familiaKey : familiaHist}|${mapped.grupoHist}|${mapped.subgrupoHist}`;
        const vendaBaseSubgrupo = mapped.vendaBaseOverride !== undefined
          ? Number(mapped.vendaBaseOverride || 0)
          : Number(vendasGrupoSubgrupoBase[histKey] || 0);

        if (vendaBaseSubgrupo <= 0) {
          gruposSemBase.push({ key, skus: skusGrupoSubgrupo, mapped });
          return;
        }

        const planoSubgrupo = Math.ceil(vendaBaseSubgrupo * (1 + CRESCIMENTO_PADRAO));
        vendaBaseAlocadaSubgrupos += vendaBaseSubgrupo;
        const histSubgrupos = mapped.histSubgrupos || String(mapped.subgrupoHist || subgrupo).split(' + ');
        let primarySizeTotals;
        if (mapped.matchTipo === 'PREFIXO_70_SUBGRUPO') {
          primarySizeTotals = getPrefixGroupSubgroupSizeTotals(
            rowsBaseFamilia,
            grupo,
            subgrupo,
            '70',
            skusGrupoSubgrupo.map(sku => sku.tamanho)
          );
        } else if (mapped.matchTipo === 'PREFIXO_70_GRUPO') {
          primarySizeTotals = getPrefixGroupSubgroupSizeTotals(
            rowsBaseFamilia,
            grupo,
            '',
            '70',
            skusGrupoSubgrupo.map(sku => sku.tamanho)
          );
        } else if (mapped.matchTipo === 'FALLBACK_LINHA') {
          primarySizeTotals = getLineSubgroupSizeTotals(rowsBaseFamilia, mapped.linhaBase || getLinha(familiaNova), grupo, subgrupo, historicalFamilyLineMap);
        } else if (mapped.matchTipo === 'FALLBACK_GRUPO_SUBGRUPO') {
          primarySizeTotals = getGroupSubgroupSizeTotals(
            rowsBaseFamilia,
            grupo,
            subgrupo,
            skusGrupoSubgrupo.map(sku => sku.tamanho)
          );
        } else if (mapped.refHist) {
          primarySizeTotals = getReferenceSizeTotals(rowsBaseFamilia, sourceOverride?.familiaHist || familiaHist, mapped.refHist);
        } else {
          primarySizeTotals = getFamilySubgroupSizeTotals(rowsBaseFamilia, usaCurvaEspecial ? familiaKey : familiaHist, mapped.grupoHist || grupo, histSubgrupos);
        }
        const fallbackSizeTotals = getFamilyGroupSizeTotals(rowsBaseFamilia, usaCurvaEspecial ? familiaKey : familiaHist, mapped.grupoHist || grupo);
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
      const rowsBaseSemBase = usaCurva2026 ? curveRowsFamilia : (usaBaseInverno26 || usaCurvaInverno26) ? specialRowsFamilia : rows;
      const primarySemBase = getFamilySizeTotals(rowsBaseSemBase, usaCurvaEspecial ? familiaKey : familiaHist);
      const fallbackSemBase = getLineSizeTotals(rowsBaseSemBase, getLinha(familiaNova), historicalFamilyLineMap);
      const getReferenceWeight = buildReferenceSizeWeightGetter(
        skusSemBase,
        rowsBaseSemBase,
        usaCurvaEspecial ? familiaKey : familiaHist,
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
          cor: getDisplayColor(familiaNova, sku.cor),
          tam: sku.tamanho,
          codProduto: sku.codProduto,
          linha: sku.linha || getLinha(familiaNova),
          continuidade: sku.continuidade,
          vendaBase: vendaBaseSku,
          percCor: '100.0%',
          plano: planoSku,
          temDepara: temDePara ? 'SIM' : 'NAO',
          temPercentual: resultado.regra !== 'padrao' ? 'SIM' : 'NAO',
          regraAplicada: resultado.regra,
          familiaHist: familiaHist,
          grupoHist: matchSubgrupo.grupoHist || sku.grupo,
          subgrupoHist: matchSubgrupo.subgrupoHist || sku.subgrupo,
          refHist: matchSubgrupo.refHist || '',
          matchSubgrupo: matchSubgrupo.matchTipo || 'SEM_MATCH'
        });
      }
    }
  }

  rebalanceRegularReferenceLargeSizes(planoRows);
  applySpecialFamilyColorTargets(planoRows);

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
