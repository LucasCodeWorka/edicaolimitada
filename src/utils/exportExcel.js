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
    'Plano Original': item.planoOriginal || item.QTD_PROJETADA || 0,
    'Plano Final': item.plano || 0,
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

/**
 * Exporta nível detalhado (SKU) do comparativo para Excel - para PCP
 * Usa participação por FAMILIA + GRUPO + SUBGRUPO quando disponível
 * @param {Array} planoData - Dados do plano (planoEdicaoLimitadaData)
 * @param {Object} comparativoData - Dados do comparativo com participação por loja
 * @param {string} filename - Nome do arquivo
 * @version 2026-07-13T12:26 - Corrigido lojasPCP para incluir RIO MAR
 */
export const exportComparativoDetalhado = (planoData, comparativoData, filename = 'plano_detalhado_pcp') => {
  const { lojas, familias, vendasPorFamiliaGrupoSubgrupoLoja } = comparativoData;

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
  const LOJAS_EXCLUIDAS_TAM_MAIOR = ['DOM LUIS', 'NORTH JOQUEI', 'ECOMMERCE'];
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

  const lojaExcluidaTamanhoMaior = (loja) => {
    const lojaUpper = String(loja).toUpperCase().trim();
    return LOJAS_EXCLUIDAS_TAM_MAIOR.some(excl => lojaUpper.includes(excl.toUpperCase()));
  };

  const ehPortelleNaoPreto = (sku) => {
    return String(sku.familia || '').toUpperCase().trim() === 'PORTELLE'
      && String(sku.cor || '').toUpperCase().trim() !== 'PRETO';
  };

  const lojaPequenaPortelle = (loja) => {
    const lojaUpper = String(loja).toUpperCase().trim();
    return LOJAS_PEQUENAS_PORTELLE.some(excl => lojaUpper.includes(excl.toUpperCase()));
  };

  // Usar lojas exatamente como vêm da API
  const lojasPCP = [
    'BARRA', 'DOM LUIS', 'ECOMMERCE', 'IGUATEMI', 'INTIMATES', 'MARAPONGA',
    'MORUMBI', 'NORTH', 'NORTH JOQUEI', 'PARANGABA', 'PORTO ALEGRE',
    'RIO MAR', 'RIO MAR RECIFE', 'RIOMAR KENNEDY', 'SALVADOR', 'TABOSA'
  ];

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

  const data = [];
  let skusComGranular = 0;
  let skusComFamilia = 0;
  let skusComGeral = 0;

  skusVerao27.forEach(sku => {
    const isTamMaior = ehFamiliaTamanhoMaior(sku.familia);
    const familiaKey = String(sku.familia).toUpperCase().trim();
    const familiaHist = getFamiliaHistorica(familiaKey);
    const grupo = String(sku.grupo || '').toUpperCase().trim();
    const subgrupo = String(sku.subgrupo || '').toUpperCase().trim();

    const row = {
      'Família': sku.familia,
      'Referência': sku.ref,
      'Cor': sku.cor,
      'Tamanho': sku.tam,
      'Grupo': sku.grupo || '-',
      'Subgrupo': sku.subgrupo || '-',
      'Plano Total': sku.plano,
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
    if (isTamMaior || ehPortelleNaoPreto(sku)) {
      const vendasAjustadas = {};
      let totalAjustado = 0;
      lojasPCP.forEach(loja => {
        const lojaExcluida =
          (isTamMaior && lojaExcluidaTamanhoMaior(loja)) ||
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
    const planoTotal = sku.plano;
    const distribuicao = {};
    const restos = [];

    lojasPCP.forEach(loja => {
      const lojaExcluida =
        (isTamMaior && lojaExcluidaTamanhoMaior(loja)) ||
        (ehPortelleNaoPreto(sku) && lojaPequenaPortelle(loja));

      if (lojaExcluida) {
        distribuicao[loja] = 0;
      } else {
        const valorExato = planoTotal * participacaoAjustada[loja];
        const valorFloor = Math.floor(valorExato);
        const resto = valorExato - valorFloor;
        distribuicao[loja] = valorFloor;
        restos.push({ loja, resto });
      }
    });

    const somaFloors = Object.values(distribuicao).reduce((s, v) => s + v, 0);
    let falta = planoTotal - somaFloors;

    restos.sort((a, b) => b.resto - a.resto);
    for (let i = 0; i < falta && i < restos.length; i++) {
      distribuicao[restos[i].loja] += 1;
    }

    lojasPCP.forEach(loja => {
      row[loja] = distribuicao[loja];
    });

    // Adicionar coluna de debug (pode remover depois)
    row['Fonte Participação'] = fonteParticipacao;

    data.push(row);
  });

  console.log(`[exportPCP] Distribuição: ${skusComGranular} SKUs com granular (fam+grupo+subgrupo), ${skusComFamilia} com família, ${skusComGeral} com geral`);

  // Ordenar por Família > Referência > Cor > Tamanho
  data.sort((a, b) => {
    if (a['Família'] !== b['Família']) return a['Família'].localeCompare(b['Família']);
    if (a['Referência'] !== b['Referência']) return a['Referência'].localeCompare(b['Referência']);
    if (a['Cor'] !== b['Cor']) return a['Cor'].localeCompare(b['Cor']);
    return a['Tamanho'].localeCompare(b['Tamanho']);
  });

  exportToExcel(data, filename, 'Plano PCP');
};
