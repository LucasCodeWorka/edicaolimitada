import * as XLSX from 'xlsx';

/**
 * Exporta dados para Excel
 * @param {Array} data - Array de objetos com os dados
 * @param {string} filename - Nome do arquivo (sem extensão)
 * @param {string} sheetName - Nome da aba
 */
export const exportToExcel = (data, filename, sheetName = 'Dados') => {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${filename}.xlsx`);
};

/**
 * Exporta tabela comparativa (Família x Lojas) para Excel
 */
export const exportComparativoLojas = (familias, lojas, filename = 'comparativo_lojas', lojasOriginais = lojas) => {
  const data = [];

  familias.forEach(fam => {
    const row = {
      'Família': fam.nome,
    };

    const lojaIndices = lojas.map(loja => lojasOriginais.indexOf(loja));

    lojas.forEach((loja, idx) => {
      const origemIdx = lojaIndices[idx];
      row[`${loja} Base`] = origemIdx >= 0 ? fam.vendas2025[origemIdx] || 0 : 0;
      row[`${loja} 2026`] = origemIdx >= 0 ? fam.plano2026[origemIdx] || 0 : 0;
    });

    row['Total Base'] = lojaIndices.reduce((sum, origemIdx) => sum + (origemIdx >= 0 ? fam.vendas2025[origemIdx] || 0 : 0), 0);
    row['Total 2026'] = lojaIndices.reduce((sum, origemIdx) => sum + (origemIdx >= 0 ? fam.plano2026[origemIdx] || 0 : 0), 0);
    row['Var %'] = fam.isBaseSemPlano
      ? '-'
      : row['Total Base'] > 0
      ? ((row['Total 2026'] - row['Total Base']) / row['Total Base'] * 100).toFixed(1) + '%'
      : '-';

    data.push(row);
  });

  exportToExcel(data, filename, 'Comparativo');
};

/**
 * Exporta mapeamento de famílias para Excel
 */
export const exportMapeamentoFamilias = (familias, lojas, filename = 'mapeamento_familias', lojasOriginais = lojas) => {
  const data = [];

  familias.forEach(fam => {
    const row = {
      'Família Atual': fam.familiaAtual,
      'Família Anterior': fam.familiaAnterior,
    };

    const lojaIndices = lojas.map(loja => lojasOriginais.indexOf(loja));

    lojas.forEach((loja, idx) => {
      const origemIdx = lojaIndices[idx];
      row[`${loja} 2025`] = origemIdx >= 0 ? fam.vendas2025[origemIdx] || 0 : 0;
      row[`${loja} 2026`] = origemIdx >= 0 ? fam.plano2026[origemIdx] || 0 : 0;
    });

    row['Total 2025'] = lojaIndices.reduce((sum, origemIdx) => sum + (origemIdx >= 0 ? fam.vendas2025[origemIdx] || 0 : 0), 0);
    row['Total 2026'] = lojaIndices.reduce((sum, origemIdx) => sum + (origemIdx >= 0 ? fam.plano2026[origemIdx] || 0 : 0), 0);

    data.push(row);
  });

  exportToExcel(data, filename, 'Mapeamento');
};

/**
 * Exporta tabela de plano de edição limitada para Excel
 */
export const exportPlanoEdicaoLimitada = (dados, filename = 'plano_edicao_limitada') => {
  const data = dados.map(item => ({
    'Referência': item.ref || item.REF,
    'Cor': item.cor || item.COR,
    'Tamanho': item.tam || item.TAM,
    'Família': item.familia || item.FAMILIA,
    'Grupo': item.grupo || item.GRUPO,
    'Plano Total': item.plano || item.QTD_PROJETADA || 0,
    'Regra Aplicada': item.regraAplicada || '-',
  }));

  exportToExcel(data, filename, 'Plano');
};

/**
 * Exporta dados de gráfico horizontal para Excel
 */
export const exportGraficoData = (dados, titulo, filename) => {
  const data = dados.map(item => ({
    [titulo.replace('Por ', '')]: item.nome,
    'Quantidade': item.valor,
  }));

  exportToExcel(data, filename, titulo);
};

/**
 * De-para de famílias (NOVA -> HISTORICA)
 * Usado para buscar vendas da família histórica quando a família é nova
 */
const DEPARA_FAMILIAS = {
  'BLOOM': 'SORRENTINA',
  'AURORA MARE': 'SICILIA',
  'LOVELY': 'BREEZE',
  'AQUALUME': 'BELLA',
  'PORTELLE': 'MARINE',
  'FLOR DO OCEANO': 'DELICATTI',
  'KISS B': 'KISS ME',
  'LACE 2': 'LACE',
  'AFTER SUN': 'SICILIA'
};

const getFamiliaHistorica = (familia) => {
  const key = String(familia || '').toUpperCase().trim();
  return DEPARA_FAMILIAS[key] || key;
};

const normalizeKey = (value, fallback = '') => String(value || fallback).toUpperCase().trim();

const isLojaJoquei = (loja) => {
  const lojaKey = normalizeKey(loja);
  return lojaKey.includes('JOQUEI');
};

const isContinuidadadePermanente = (continuidade) => {
  const key = normalizeKey(continuidade);
  return key === 'PERMANENTE' || key === 'PERMANENTE COR NOVA';
};

const isContinuidadadeEdicaoLimitada = (continuidade) => normalizeKey(continuidade) === 'EDICAO LIMITADA';

const getLoveAppealAllowedSizes = (sku) => {
  if (normalizeKey(sku.familia) !== 'LOVE APPEAL') return null;

  const grupo = normalizeKey(sku.grupo);
  if (grupo.includes('CALCA')) return new Set(['M', 'G']);
  if (grupo.includes('SUTIA')) return new Set(['42', '44']);

  return null;
};

const isLoveAppealAllowedSku = (sku) => {
  const allowed = getLoveAppealAllowedSizes(sku);
  return !allowed || allowed.has(normalizeKey(sku.tam || sku.tamanho));
};

const stripInternalExportColumns = (rows, lojasVisiveis = null) => {
  const visibleStores = Array.isArray(lojasVisiveis) && lojasVisiveis.length > 0
    ? lojasVisiveis
    : null;
  const metadataColumns = [
    'FamÃƒÂ­lia',
    'FamÃ­lia',
    'ReferÃƒÂªncia',
    'ReferÃªncia',
    'Cor',
    'Tamanho',
    'Grupo',
    'Subgrupo'
  ];
  const internalColumns = new Set([
    ...metadataColumns,
    'Plano Original',
    'Plano Total',
    'Fonte ParticipaÃƒÂ§ÃƒÂ£o',
    'Fonte ParticipaÃ§Ã£o'
  ]);

  return rows.map((row) => {
    const clean = {};

    metadataColumns.forEach((column) => {
      if (Object.prototype.hasOwnProperty.call(row, column)) {
        clean[column] = row[column];
      }
    });

    const storeColumns = visibleStores || Object.keys(row).filter(column => !internalColumns.has(column));
    storeColumns.forEach((loja) => {
      clean[loja] = Number(row[loja] || 0);
    });

    clean['Plano Total'] = storeColumns.reduce((sum, loja) => sum + Number(row[loja] || 0), 0);
    return clean;
  });
};

const roundBusinessValue = (valor) => {
  if (valor < 1) return 1;
  if (valor < 1.5) return 1;
  if (valor < 2) return 2;
  return Math.floor(valor);
};

const distribuirInteiroPorPeso = (items, total, getWeight) => {
  if (!items.length || total <= 0) return new Map(items.map(item => [item, 0]));

  const totalWeight = items.reduce((sum, item) => sum + Number(getWeight(item) || 0), 0);
  const rows = items.map((item, index) => {
    const raw = totalWeight > 0
      ? total * (Number(getWeight(item) || 0) / totalWeight)
      : total / items.length;
    const base = Math.floor(raw);
    return { item, index, base, fraction: raw - base };
  });

  let remaining = total - rows.reduce((sum, row) => sum + row.base, 0);
  rows.sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const result = new Map();
  rows.forEach((row, index) => {
    result.set(row.item, row.base + (index < remaining ? 1 : 0));
  });

  return result;
};

const getTopSizesFromRows = (rows) => {
  const totals = {};
  rows.forEach((row) => {
    if (isLojaJoquei(row.empresa)) return;
    const tam = normalizeKey(row.tam || row.tamanho);
    if (!tam) return;
    totals[tam] = (totals[tam] || 0) + Number(row.valor || row.venda || 0);
  });

  return Object.entries(totals)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([tam]) => tam);
};

const getTopSizesForReference = (refSkus, historicoVendasData = []) => {
  const first = refSkus[0] || {};
  const refKey = normalizeKey(first.ref);
  const ownRows = historicoVendasData.filter(row => normalizeKey(row.ref) === refKey);
  const ownTopSizes = getTopSizesFromRows(ownRows);
  if (ownTopSizes.length > 0) return ownTopSizes;

  const familiaHist = normalizeKey(first.familiaHist || getFamiliaHistorica(first.familia));
  const grupoHist = normalizeKey(first.grupoHist || first.grupo);
  const subgrupoHist = normalizeKey(first.subgrupoHist || first.subgrupo);
  const histSubgrupos = new Set(subgrupoHist.split('+').map(value => normalizeKey(value)).filter(Boolean));

  const sourceRows = historicoVendasData.filter(row => (
    normalizeKey(row.familia) === familiaHist &&
    normalizeKey(row.grupo) === grupoHist &&
    histSubgrupos.has(normalizeKey(row.subgrupo))
  ));

  return getTopSizesFromRows(sourceRows);
};

/**
 * Exporta nível detalhado (SKU) do comparativo para Excel - para PCP
 * Usa participação por FAMILIA + GRUPO + SUBGRUPO quando disponível
 * @param {Array} planoData - Dados do plano (planoEdicaoLimitadaData)
 * @param {Object} comparativoData - Dados do comparativo com participação por loja
 * @param {string} filename - Nome do arquivo
 * @version 2026-07-13T12:26 - Corrigido lojasPCP para incluir RIO MAR
 */
export const buildComparativoDetalhadoRows = (planoData, comparativoData) => {
  const {
    lojas,
    familias,
    vendasPorFamiliaGrupoSubgrupoLoja,
    historicoVendasData = []
  } = comparativoData;

  // DEBUG: Verificar dados recebidos
  console.log('[exportPCP] vendasPorFamiliaGrupoSubgrupoLoja disponivel:', !!vendasPorFamiliaGrupoSubgrupoLoja);
  console.log('[exportPCP] Quantidade de chaves granulares:', vendasPorFamiliaGrupoSubgrupoLoja ? Object.keys(vendasPorFamiliaGrupoSubgrupoLoja).length : 0);

  // DEBUG: Verificar alguns SKUs da AFTER SUN
  const skusAfterSun = planoData.filter(sku => String(sku.familia).toUpperCase().includes('AFTER SUN'));
  if (skusAfterSun.length > 0) {
    console.log('[exportPCP] Primeiro SKU AFTER SUN:', {
      familia: skusAfterSun[0].familia,
      grupo: skusAfterSun[0].grupo,
      subgrupo: skusAfterSun[0].subgrupo,
      codProduto: skusAfterSun[0].codProduto
    });
  }

  // Lojas excluídas para famílias PLUS
  const LOJAS_EXCLUIDAS_TAM_MAIOR = ['DOM LUIS', 'NORTH JOQUEI', 'JOKEY', 'ECOMMERCE'];
  const TAMANHOS_MAIORES_MINIMOS = {
    SUTIA: new Set(['48', '50']),
    CALCA: new Set(['GG', 'XG'])
  };
  const LOJAS_PEQUENAS_PORTELLE = [
    'DOM LUIS',
    'ECOMMERCE',
    'INTIMATES',
    'MORUMBI',
    'NORTH',
    'NORTH JOQUEI',
    'PARANGABA',
    'RIOMAR KENNEDY',
    'TABOSA'
  ];

  const ehFamiliaTamanhoMaior = (familia) => {
    const familiaUpper = String(familia).toUpperCase().trim();
    return familiaUpper.includes('PLUS');
  };

  const ehReferenciaTamanhoMaior = (sku) => {
    return normalizeKey(sku.ref || sku.referencia).startsWith('70');
  };

  const lojaExcluidaTamanhoMaior = (loja) => {
    const lojaUpper = String(loja).toUpperCase().trim();
    return LOJAS_EXCLUIDAS_TAM_MAIOR.some(excl => lojaUpper.includes(excl.toUpperCase()));
  };

  const getTamanhoMaiorMinimoSet = (sku) => {
    const grupoUpper = String(sku.grupo || '').toUpperCase().trim();
    if (grupoUpper.includes('SUTIA')) return TAMANHOS_MAIORES_MINIMOS.SUTIA;
    if (grupoUpper.includes('CALCA')) return TAMANHOS_MAIORES_MINIMOS.CALCA;
    return null;
  };

  const ehSkuTamanhoMaiorMinimo = (sku) => {
    const tamanhosMinimos = getTamanhoMaiorMinimoSet(sku);
    return Boolean(tamanhosMinimos?.has(normalizeKey(sku.tam || sku.tamanho)));
  };

  const ehKissMeTamanhoMaiorExcecao = (sku) => {
    return normalizeKey(sku.familia) === 'KISS ME'
      && isContinuidadadeEdicaoLimitada(sku.continuidade)
      && ehSkuTamanhoMaiorMinimo(sku);
  };

  const ehPortelleNaoPreto = (sku) => {
    return String(sku.familia || '').toUpperCase().trim() === 'PORTELLE'
      && String(sku.cor || '').toUpperCase().trim() !== 'PRETO';
  };

  const ehPortelle = (sku) => {
    return String(sku.familia || '').toUpperCase().trim() === 'PORTELLE';
  };

  const lojaPequenaPortelle = (loja) => {
    const lojaUpper = String(loja).toUpperCase().trim();
    return LOJAS_PEQUENAS_PORTELLE.some(excl => lojaUpper.includes(excl.toUpperCase()));
  };

  const lojaSemPortelle = (loja) => {
    return String(loja || '').toUpperCase().trim() === 'TABOSA';
  };

  // Usar lojas exatamente como vêm da API
  const lojasPCP = [
    'BARRA', 'DOM LUIS', 'ECOMMERCE', 'IGUATEMI', 'INTIMATES', 'MARAPONGA',
    'MORUMBI', 'NORTH', 'NORTH JOQUEI', 'PARANGABA', 'PORTO ALEGRE',
    'RIO MAR', 'RIO MAR RECIFE', 'RIOMAR KENNEDY', 'SALVADOR', 'TABOSA'
  ];

  const planoJaDistribuido = planoData.some(item => item.planoDistribuidoLojas);
  if (planoJaDistribuido) {
    const dataDistribuida = planoData
      .filter(item => item.colecao === 'VERAO 27')
      .map(item => {
        const isTamMaior = ehFamiliaTamanhoMaior(item.familia) || ehReferenciaTamanhoMaior(item);
        const isKissMeTamMaiorExcecao = ehKissMeTamanhoMaiorExcecao(item);
        const isSkuTamMaiorMinimo = ehSkuTamanhoMaiorMinimo(item);
        const aplicaRegraTamMaiorLimitada = isContinuidadadeEdicaoLimitada(item.continuidade)
          && (isTamMaior || isSkuTamMaiorMinimo);
        const row = {
          'FamÃ­lia': item.familia,
          'ReferÃªncia': item.ref,
          'Cor': item.cor,
          'Tamanho': item.tam,
          'Grupo': item.grupo || '-',
          'Subgrupo': item.subgrupo || '-',
          'Plano Original': Number(item.planoOriginal ?? item.plano ?? 0),
          'Plano Total': Number(item.plano || 0),
          'Fonte ParticipaÃ§Ã£o': item.fonteParticipacao || '-'
        };

        lojasPCP.forEach(loja => {
          const lojaBloqueadaTamanhoMaior =
            (aplicaRegraTamMaiorLimitada && lojaExcluidaTamanhoMaior(loja)) ||
            (isKissMeTamMaiorExcecao && normalizeKey(loja) !== 'MARAPONGA');

          if (lojaBloqueadaTamanhoMaior) {
            row[loja] = 0;
            return;
          }

          let value = Number(item.planoDistribuidoLojas?.[loja] || 0);
          if (
            isSkuTamMaiorMinimo &&
            (aplicaRegraTamMaiorLimitada || isKissMeTamMaiorExcecao) &&
            !lojaExcluidaTamanhoMaior(loja) &&
            (!isKissMeTamMaiorExcecao || normalizeKey(loja) === 'MARAPONGA') &&
            value < 1
          ) {
            value = 1;
          }

          row[loja] = value;
        });

        row['Plano Total'] = lojasPCP.reduce((sum, loja) => sum + Number(row[loja] || 0), 0);
        return row;
      });

    dataDistribuida.sort((a, b) => {
      if (a['FamÃ­lia'] !== b['FamÃ­lia']) return a['FamÃ­lia'].localeCompare(b['FamÃ­lia']);
      if (a['ReferÃªncia'] !== b['ReferÃªncia']) return a['ReferÃªncia'].localeCompare(b['ReferÃªncia']);
      if (a['Cor'] !== b['Cor']) return a['Cor'].localeCompare(b['Cor']);
      return a['Tamanho'].localeCompare(b['Tamanho']);
    });

    return dataDistribuida;
  }

  // Criar mapa de participação por família (fallback)
  const participacaoPorFamilia = {};
  familias.forEach(fam => {
    const familiaKey = String(fam.nome).toUpperCase().trim();
    const vendasPorLoja = {};
    let totalFamilia = 0;

    lojasPCP.forEach(loja => {
      const lojaIdx = lojas.indexOf(loja);
      const venda = lojaIdx >= 0 ? (fam.vendas2025[lojaIdx] || 0) : 0;
      vendasPorLoja[loja] = venda;
      totalFamilia += venda;
    });

    const participacao = {};
    lojasPCP.forEach(loja => {
      participacao[loja] = totalFamilia > 0 ? vendasPorLoja[loja] / totalFamilia : 0;
    });

    participacaoPorFamilia[familiaKey] = {
      vendas: vendasPorLoja,
      total: totalFamilia,
      participacao
    };
  });

  // Participação geral (fallback final)
  const vendasGeralPorLoja = lojasPCP.reduce((acc, loja) => {
    const lojaIdx = lojas.indexOf(loja);
    acc[loja] = lojaIdx >= 0
      ? familias.reduce((sum, fam) => sum + (fam.vendas2025[lojaIdx] || 0), 0)
      : 0;
    return acc;
  }, {});

  const totalGeral = Object.values(vendasGeralPorLoja).reduce((s, v) => s + v, 0);
  const participacaoGeral = {};
  Object.keys(vendasGeralPorLoja).forEach(loja => {
    participacaoGeral[loja] = totalGeral > 0 ? vendasGeralPorLoja[loja] / totalGeral : 0;
  });

  // Função para buscar vendas por familia+grupo+subgrupo
  const buscarVendasGranulares = (familiaHist, grupo, subgrupo, debug = false) => {
    if (!vendasPorFamiliaGrupoSubgrupoLoja) return null;

    const familiaKey = String(familiaHist).toUpperCase().trim();
    const grupoKey = String(grupo).toUpperCase().trim();
    const subgrupoKey = String(subgrupo).toUpperCase().trim();

    // DEBUG: Log para SICILIA (de-para de AFTER SUN)
    if (debug || familiaKey === 'SICILIA') {
      console.log(`[buscarVendasGranulares] Buscando: ${familiaKey}|${grupoKey}|${subgrupoKey}`);
    }

    // Tentar chave completa: familia|grupo|subgrupo
    const keyCompleta = `${familiaKey}|${grupoKey}|${subgrupoKey}`;
    let vendas = {};
    let total = 0;

    // Buscar todas as chaves que começam com familia|grupo|subgrupo
    Object.entries(vendasPorFamiliaGrupoSubgrupoLoja).forEach(([key, venda]) => {
      const [fam, grp, sub, loja] = key.split('|');
      if (fam === familiaKey && grp === grupoKey && sub === subgrupoKey) {
        vendas[loja] = (vendas[loja] || 0) + venda;
        total += venda;
      }
    });

    if (total > 0) {
      // DEBUG para SICILIA
      if (familiaKey === 'SICILIA') {
        console.log(`[buscarVendasGranulares] Encontrado! Total: ${total}, Lojas:`, vendas);
      }
      return { vendas, total };
    }

    // Tentar só familia|grupo
    vendas = {};
    total = 0;
    Object.entries(vendasPorFamiliaGrupoSubgrupoLoja).forEach(([key, venda]) => {
      const [fam, grp, , loja] = key.split('|');
      if (fam === familiaKey && grp === grupoKey) {
        vendas[loja] = (vendas[loja] || 0) + venda;
        total += venda;
      }
    });

    if (total > 0) {
      return { vendas, total };
    }

    return null;
  };

  // Filtrar apenas VERAO 27
  const skusVerao27 = planoData.filter(item => item.colecao === 'VERAO 27');
  const skusPorReferencia = skusVerao27.reduce((acc, sku) => {
    const key = `${normalizeKey(sku.familia)}|${normalizeKey(sku.ref)}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(sku);
    return acc;
  }, {});
  const topSizesPorReferencia = {};
  Object.entries(skusPorReferencia).forEach(([key, skusRef]) => {
    topSizesPorReferencia[key] = getTopSizesForReference(skusRef, historicoVendasData);
  });

  const data = [];
  let skusComGranular = 0;
  let skusComFamilia = 0;
  let skusComGeral = 0;

  skusVerao27.forEach(sku => {
    const isTamMaior = ehFamiliaTamanhoMaior(sku.familia) || ehReferenciaTamanhoMaior(sku);
    const isKissMeTamMaiorExcecao = ehKissMeTamanhoMaiorExcecao(sku);
    const isSkuTamMaiorMinimo = ehSkuTamanhoMaiorMinimo(sku);
    const aplicaRegraTamMaiorLimitada = isContinuidadadeEdicaoLimitada(sku.continuidade)
      && (isTamMaior || isSkuTamMaiorMinimo);
    const familiaKey = String(sku.familia).toUpperCase().trim();
    const familiaHist = getFamiliaHistorica(familiaKey);
    const grupo = String(sku.grupo || '').toUpperCase().trim();
    const subgrupo = String(sku.subgrupo || '').toUpperCase().trim();
    const planoOriginalSku = Number(sku.planoOriginal ?? sku.plano ?? 0);

    const row = {
      'Família': sku.familia,
      'Referência': sku.ref,
      'Cor': sku.cor,
      'Tamanho': sku.tam,
      'Grupo': sku.grupo || '-',
      'Subgrupo': sku.subgrupo || '-',
      'Plano Original': planoOriginalSku,
      'Plano Total': planoOriginalSku,
    };

    // Prioridade de busca:
    // 1. Vendas por familiaHist+grupo+subgrupo
    // 2. Vendas por família
    // 3. Vendas gerais
    let vendasBase = null;
    let participacaoBase = null;
    let fonteParticipacao = '';

    // 1. Tentar vendas granulares (familia histórica + grupo + subgrupo)
    if (grupo && grupo !== 'SEM INFO' && grupo !== '-') {
      const vendasGranulares = buscarVendasGranulares(familiaHist, grupo, subgrupo);
      if (vendasGranulares && vendasGranulares.total > 0) {
        vendasBase = vendasGranulares.vendas;
        participacaoBase = {};
        lojasPCP.forEach(loja => {
          participacaoBase[loja] = (vendasBase[loja] || 0) / vendasGranulares.total;
        });
        fonteParticipacao = `${familiaHist}|${grupo}|${subgrupo}`;
        skusComGranular++;
      }
    }

    // 2. Fallback: vendas por família histórica
    if (!participacaoBase) {
      const dadosFamiliaHist = participacaoPorFamilia[familiaHist];
      if (dadosFamiliaHist && dadosFamiliaHist.total > 0) {
        vendasBase = dadosFamiliaHist.vendas;
        participacaoBase = dadosFamiliaHist.participacao;
        fonteParticipacao = familiaHist;
        skusComFamilia++;
      }
    }

    // 3. Fallback final: vendas gerais
    if (!participacaoBase) {
      vendasBase = vendasGeralPorLoja;
      participacaoBase = participacaoGeral;
      fonteParticipacao = 'GERAL';
      skusComGeral++;
    }

    // Para PLUS ou PORTELLE não-preto, recalcular excluindo lojas proibidas
    let participacaoAjustada = { ...participacaoBase };
    if (aplicaRegraTamMaiorLimitada || isKissMeTamMaiorExcecao || ehPortelleNaoPreto(sku)) {
      const vendasAjustadas = {};
      let totalAjustado = 0;
      lojasPCP.forEach(loja => {
        const lojaExcluida =
          (aplicaRegraTamMaiorLimitada && lojaExcluidaTamanhoMaior(loja)) ||
          (isKissMeTamMaiorExcecao && normalizeKey(loja) !== 'MARAPONGA') ||
          (ehPortelle(sku) && lojaSemPortelle(loja)) ||
          (ehPortelleNaoPreto(sku) && lojaPequenaPortelle(loja));

        if (lojaExcluida) {
          vendasAjustadas[loja] = 0;
        } else {
          vendasAjustadas[loja] = vendasBase[loja] || 0;
          totalAjustado += vendasAjustadas[loja];
        }
      });
      lojasPCP.forEach(loja => {
        participacaoAjustada[loja] = totalAjustado > 0 ? vendasAjustadas[loja] / totalAjustado : 0;
      });
    }

    // Distribuir usando algoritmo "largest remainder"
    const planoTotal = planoOriginalSku;
    const distribuicao = {};
    const restos = [];
    const topSizesKey = `${normalizeKey(sku.familia)}|${normalizeKey(sku.ref)}`;
    const topSizesRef = topSizesPorReferencia[topSizesKey] || [];
    const skuEntreTopSizes = topSizesRef.includes(normalizeKey(sku.tam));
    const loveAppealAllowedSku = isLoveAppealAllowedSku(sku);
    const loveAppealSku = normalizeKey(sku.familia) === 'LOVE APPEAL';

    lojasPCP.forEach(loja => {
      const lojaExcluida =
        (aplicaRegraTamMaiorLimitada && lojaExcluidaTamanhoMaior(loja)) ||
        (isKissMeTamMaiorExcecao && normalizeKey(loja) !== 'MARAPONGA') ||
        (ehPortelle(sku) && lojaSemPortelle(loja)) ||
        (ehPortelleNaoPreto(sku) && lojaPequenaPortelle(loja));

      if (lojaExcluida) {
        distribuicao[loja] = 0;
      } else {
        const valorExato = planoTotal * participacaoAjustada[loja];
        const valorArredondado = roundBusinessValue(valorExato);
        const resto = valorExato - Math.floor(valorExato);
        distribuicao[loja] = valorArredondado;
        restos.push({ loja, resto });
      }
    });

    const somaArredondada = Object.values(distribuicao).reduce((s, v) => s + v, 0);
    let falta = planoTotal - somaArredondada;

    if (falta > 0) {
      restos.sort((a, b) => b.resto - a.resto);
      for (let i = 0; i < falta && i < restos.length; i++) {
        distribuicao[restos[i].loja] += 1;
      }
    }

    lojasPCP.forEach(loja => {
      const lojaBloqueadaTamanhoMaior =
        (aplicaRegraTamMaiorLimitada && lojaExcluidaTamanhoMaior(loja)) ||
        (isKissMeTamMaiorExcecao && normalizeKey(loja) !== 'MARAPONGA');

      if (lojaBloqueadaTamanhoMaior) {
        row[loja] = 0;
        return;
      }

      const vendaLojaFonte = Number(vendasBase?.[loja] || 0);
      const deveAplicarMinimoPermanente =
        skuEntreTopSizes &&
        isContinuidadadePermanente(sku.continuidade) &&
        !isLojaJoquei(loja);
      const deveAplicarMinimoEdicaoLimitada =
        skuEntreTopSizes &&
        isContinuidadadeEdicaoLimitada(sku.continuidade) &&
        vendaLojaFonte <= 0 &&
        !isLojaJoquei(loja);

      if ((deveAplicarMinimoPermanente || deveAplicarMinimoEdicaoLimitada) && distribuicao[loja] < 1) {
        distribuicao[loja] = 1;
      }

      if (loveAppealSku && loveAppealAllowedSku && distribuicao[loja] < 2) {
        distribuicao[loja] = 2;
      }

      if (
        isSkuTamMaiorMinimo &&
        (aplicaRegraTamMaiorLimitada || isKissMeTamMaiorExcecao) &&
        isContinuidadadeEdicaoLimitada(sku.continuidade) &&
        !lojaExcluidaTamanhoMaior(loja) &&
        (!isKissMeTamMaiorExcecao || normalizeKey(loja) === 'MARAPONGA') &&
        distribuicao[loja] < 1
      ) {
        distribuicao[loja] = 1;
      }

      row[loja] = distribuicao[loja];
    });

    row['Plano Total'] = lojasPCP.reduce((sum, loja) => sum + Number(row[loja] || 0), 0);

    // Adicionar coluna de debug (pode remover depois)
    row['Fonte Participação'] = fonteParticipacao;

    data.push(row);
  });

  console.log(`[exportPCP] Distribuição: ${skusComGranular} SKUs com granular (fam+grupo+subgrupo), ${skusComFamilia} com família, ${skusComGeral} com geral`);

  // Ordenar por Família > Referência > Cor > Tamanho
  const portelleRows = data.filter(row => normalizeKey(row['FamÃ­lia'] || row['Família']) === 'PORTELLE');
  if (portelleRows.length > 0) {
    const portelleFamilia = familias.find(fam => normalizeKey(fam.nome) === 'PORTELLE');
    const budgetInicial = {};

    lojasPCP.forEach(loja => {
      const lojaIdx = lojas.indexOf(loja);
      budgetInicial[loja] = portelleFamilia && lojaIdx >= 0
        ? Number(portelleFamilia.plano2026[lojaIdx] || 0)
        : 0;
    });

    const targetPortelle = portelleRows.reduce((sum, row) => sum + Number(row['Plano Original'] || row['Plano Total'] || 0), 0);
    const lojasComPortelle = lojasPCP.filter(loja => !lojaSemPortelle(loja));
    const budgetPorLoja = Object.fromEntries(lojasPCP.map(loja => [loja, 0]));
    const budgetDistribuido = distribuirInteiroPorPeso(
      lojasComPortelle,
      targetPortelle,
      loja => budgetInicial[loja] || 0
    );

    lojasComPortelle.forEach(loja => {
      budgetPorLoja[loja] = budgetDistribuido.get(loja) || 0;
    });

    portelleRows.forEach(row => {
      lojasPCP.forEach(loja => {
        row[loja] = 0;
      });
    });

    lojasPCP.forEach(loja => {
      const budgetLoja = budgetPorLoja[loja] || 0;
      if (budgetLoja <= 0) return;

      const linhasElegiveis = lojaPequenaPortelle(loja)
        ? portelleRows.filter(row => normalizeKey(row.Cor) === 'PRETO')
        : portelleRows;

      const distribuicaoLoja = distribuirInteiroPorPeso(
        linhasElegiveis,
        budgetLoja,
        row => Number(row['Plano Original'] || row['Plano Total'] || 0)
      );

      linhasElegiveis.forEach(row => {
        row[loja] = distribuicaoLoja.get(row) || 0;
      });
    });

    portelleRows.forEach(row => {
      row['Plano Total'] = lojasPCP.reduce((sum, loja) => sum + Number(row[loja] || 0), 0);
    });
  }

  data.sort((a, b) => {
    if (a['Família'] !== b['Família']) return a['Família'].localeCompare(b['Família']);
    if (a['Referência'] !== b['Referência']) return a['Referência'].localeCompare(b['Referência']);
    if (a['Cor'] !== b['Cor']) return a['Cor'].localeCompare(b['Cor']);
    return a['Tamanho'].localeCompare(b['Tamanho']);
  });

  return data;
};

export const exportComparativoDetalhado = (planoData, comparativoData, filename = 'plano_detalhado_pcp', options = {}) => {
  const data = stripInternalExportColumns(
    buildComparativoDetalhadoRows(planoData, comparativoData),
    options.lojasVisiveis
  );
  exportToExcel(data, filename, 'Plano PCP');
};
