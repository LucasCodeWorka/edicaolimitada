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
 * Exporta nível detalhado (SKU) do comparativo para Excel - para PCP
 * Usa a participação GERAL de cada loja (baseada no total de vendas 2025)
 * @param {Array} planoData - Dados do plano (planoEdicaoLimitadaData)
 * @param {Object} comparativoData - Dados do comparativo com participação por loja
 * @param {string} filename - Nome do arquivo
 */
export const exportComparativoDetalhado = (planoData, comparativoData, filename = 'plano_detalhado_pcp') => {
  const { lojas, familias } = comparativoData;

  // Lojas excluídas para famílias PLUS
  const LOJAS_EXCLUIDAS_TAM_MAIOR = ['DOM LUIS', 'NORTH JOQUEI', 'ECOMMERCE'];
  const FAMILIAS_CONFORT_DOIS_MESES = ['KISS ME', 'KISS ME PLUS'];
  const MESES_CONFORT = ['JULHO', 'AGOSTO'];

  const ehFamiliaTamanhoMaior = (familia) => {
    const familiaUpper = String(familia).toUpperCase().trim();
    return familiaUpper.includes('PLUS');
  };

  const ehConfortDoisMeses = (familia) => {
    const familiaUpper = String(familia).toUpperCase().trim();
    return FAMILIAS_CONFORT_DOIS_MESES.includes(familiaUpper);
  };

  const dividirEquivalenteEmDoisMeses = (quantidade) => {
    const total = Number(quantidade) || 0;
    const primeiroMes = Math.ceil(total / 2);
    return [primeiroMes, total - primeiroMes];
  };

  const distribuirPorReferencia = (total, referenciaPorLoja) => {
    const totalInteiro = Math.round(Number(total) || 0);
    const totalReferencia = Object.values(referenciaPorLoja).reduce((s, v) => s + (Number(v) || 0), 0);
    const resultado = {};

    if (totalInteiro <= 0 || totalReferencia <= 0) {
      lojasPCP.forEach(loja => {
        resultado[loja] = 0;
      });
      return resultado;
    }

    const restos = [];
    lojasPCP.forEach(loja => {
      const valorExato = totalInteiro * ((Number(referenciaPorLoja[loja]) || 0) / totalReferencia);
      const valorFloor = Math.floor(valorExato);
      resultado[loja] = valorFloor;
      restos.push({ loja, resto: valorExato - valorFloor });
    });

    let falta = totalInteiro - Object.values(resultado).reduce((s, v) => s + v, 0);
    restos.sort((a, b) => b.resto - a.resto);
    for (let i = 0; i < falta && i < restos.length; i++) {
      resultado[restos[i].loja] += 1;
    }

    return resultado;
  };

  const lojaExcluidaTamanhoMaior = (loja) => {
    const lojaUpper = String(loja).toUpperCase().trim();
    return LOJAS_EXCLUIDAS_TAM_MAIOR.some(excl => lojaUpper.includes(excl.toUpperCase()));
  };

  // Participação GERAL de cada loja baseada no comparativo atual.

  const lojasPCP = [
    'MARAPONGA', 'IGUATEMI', 'PORTO ALEGRE', 'BARRA', 'SALVADOR', 'RIO MAR RECIFE',
    'MORUMBI', 'PARANGABA', 'DOM LUIS', 'NORTH', 'NORTH JOQUEI', 'ECOMMERCE', 'TABOSA',
    'RIOMAR KENNEDY', 'INTIMATES'
  ];

  const vendasPorLoja = lojasPCP.reduce((acc, loja) => {
    const lojaIdx = lojas.indexOf(loja);
    acc[loja] = lojaIdx >= 0
      ? familias.reduce((sum, fam) => sum + (fam.vendas2025[lojaIdx] || 0), 0)
      : 0;
    return acc;
  }, {});

  const totalGeral = Object.values(vendasPorLoja).reduce((s, v) => s + v, 0);
  const participacaoPorLoja = {};
  Object.keys(vendasPorLoja).forEach(loja => {
    participacaoPorLoja[loja] = vendasPorLoja[loja] / totalGeral;
  });

  // Filtrar apenas VERAO 27
  const skusVerao27 = planoData.filter(item => item.colecao === 'VERAO 27');
  const planoConfortDoisMesesPorSku = {};
  const skusConfort = skusVerao27
    .map((sku, idx) => ({ sku, idx }))
    .filter(item => ehConfortDoisMeses(item.sku.familia));

  const totalConfortOriginal = skusConfort.reduce((sum, item) => sum + (Number(item.sku.plano) || 0), 0);
  const totalConfortDoisMeses = Math.round(totalConfortOriginal * (2 / 6));
  const valoresConfort = skusConfort.map(item => {
    const valorExato = totalConfortOriginal > 0
      ? ((Number(item.sku.plano) || 0) / totalConfortOriginal) * totalConfortDoisMeses
      : 0;

    return {
      idx: item.idx,
      valor: Math.floor(valorExato),
      resto: valorExato - Math.floor(valorExato),
    };
  });

  let faltaConfort = totalConfortDoisMeses - valoresConfort.reduce((sum, item) => sum + item.valor, 0);
  valoresConfort.sort((a, b) => b.resto - a.resto);
  for (let i = 0; i < faltaConfort && i < valoresConfort.length; i++) {
    valoresConfort[i].valor += 1;
  }
  valoresConfort.forEach(item => {
    planoConfortDoisMesesPorSku[item.idx] = item.valor;
  });

  const data = [];

  skusVerao27.forEach((sku, skuIdx) => {
    const isTamMaior = ehFamiliaTamanhoMaior(sku.familia);

    const rowBase = {
      'Família': sku.familia,
      'Referência': sku.ref,
      'Cor': sku.cor,
      'Tamanho': sku.tam,
      'Grupo': sku.grupo || '-',
    };

    // Para PLUS, recalcular participação excluindo lojas proibidas
    let participacaoAjustada = { ...participacaoPorLoja };
    if (isTamMaior) {
      // Zerar lojas excluídas e recalcular proporção
      const vendasAjustadas = {};
      let totalAjustado = 0;
      Object.keys(vendasPorLoja).forEach(loja => {
        if (lojaExcluidaTamanhoMaior(loja)) {
          vendasAjustadas[loja] = 0;
        } else {
          vendasAjustadas[loja] = vendasPorLoja[loja];
          totalAjustado += vendasPorLoja[loja];
        }
      });
      Object.keys(vendasAjustadas).forEach(loja => {
        participacaoAjustada[loja] = totalAjustado > 0 ? vendasAjustadas[loja] / totalAjustado : 0;
      });
    }

    // Distribuir usando algoritmo "largest remainder" para garantir soma = total
    const planoTotal = sku.plano;
    const distribuicao = {};
    const restos = [];

    // Passo 1: Calcular floor e resto para cada loja
    lojasPCP.forEach(loja => {
      const lojaExcluida = isTamMaior && lojaExcluidaTamanhoMaior(loja);
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

    // Passo 2: Calcular diferença entre total e soma dos floors
    const somaFloors = Object.values(distribuicao).reduce((s, v) => s + v, 0);
    let falta = planoTotal - somaFloors;

    // Passo 3: Ordenar por maior resto e distribuir as unidades faltantes
    restos.sort((a, b) => b.resto - a.resto);
    for (let i = 0; i < falta && i < restos.length; i++) {
      distribuicao[restos[i].loja] += 1;
    }

    if (ehConfortDoisMeses(sku.familia)) {
      const planoDoisMeses = planoConfortDoisMesesPorSku[skuIdx] || 0;
      const totaisPorMes = dividirEquivalenteEmDoisMeses(planoDoisMeses);

      MESES_CONFORT.forEach((mes, mesIdx) => {
        const rowMes = {
          ...rowBase,
          'Mês Envio': mes,
        };

        const distribuicaoMes = distribuirPorReferencia(totaisPorMes[mesIdx], distribuicao);
        let totalMes = 0;
        lojasPCP.forEach(loja => {
          rowMes[loja] = distribuicaoMes[loja];
          totalMes += rowMes[loja];
        });

        rowMes['Plano Total'] = totalMes;
        data.push(rowMes);
      });
    } else {
      const row = {
        ...rowBase,
        'Mês Envio': 'UNICO',
        'Plano Total': sku.plano,
      };

      // Adicionar coluna para cada loja PCP
      lojasPCP.forEach(loja => {
        row[loja] = distribuicao[loja];
      });

      data.push(row);
    }
  });

  // Ordenar por Família > Referência > Cor > Tamanho
  data.sort((a, b) => {
    if (a['Família'] !== b['Família']) return a['Família'].localeCompare(b['Família']);
    if (a['Referência'] !== b['Referência']) return a['Referência'].localeCompare(b['Referência']);
    if (a['Cor'] !== b['Cor']) return a['Cor'].localeCompare(b['Cor']);
    if (a['Tamanho'] !== b['Tamanho']) return a['Tamanho'].localeCompare(b['Tamanho']);
    return a['Mês Envio'].localeCompare(b['Mês Envio']);
  });

  exportToExcel(data, filename, 'Plano PCP');
};
