import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, X, Expand, Minimize2, Calculator, Download } from 'lucide-react';
import { exportComparativoLojas, exportComparativoDetalhado } from '../utils/exportExcel';
import { hasFilterValue, matchesFilterValue } from '../utils/filterUtils';

// Lojas excluídas para famílias de tamanhos maiores (PLUS)
const LOJAS_EXCLUIDAS_TAM_MAIOR = ['DOM LUIS', 'NORTH JOQUEI', 'JOKEY', 'ECOMMERCE'];
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

// Verifica se a família é de tamanhos maiores (PLUS)
const ehFamiliaTamanhoMaior = (familia) => {
  const familiaUpper = String(familia).toUpperCase().trim();
  return familiaUpper.includes('PLUS');
};

// Verifica se a loja está excluída para tamanhos maiores
const lojaExcluidaTamanhoMaior = (loja) => {
  const lojaUpper = String(loja).toUpperCase().trim();
  return LOJAS_EXCLUIDAS_TAM_MAIOR.some(excl => lojaUpper.includes(excl.toUpperCase()));
};

const ehPortelle = (familia) => String(familia || '').toUpperCase().trim() === 'PORTELLE';

const lojaPequenaPortelle = (loja) => {
  const lojaUpper = String(loja || '').toUpperCase().trim();
  return LOJAS_PEQUENAS_PORTELLE.some(excl => lojaUpper.includes(excl.toUpperCase()));
};

const lojaSemPortelle = (loja) => String(loja || '').toUpperCase().trim() === 'TABOSA';

const corBloqueadaPortelle = (cor) => String(cor || '').toUpperCase().trim() !== 'PRETO';

// Formatador de números
const fmt = (v, dec = 0) => Number(v || 0).toLocaleString('pt-BR', {
  minimumFractionDigits: dec,
  maximumFractionDigits: dec,
});

const soma = (valores = []) => valores.reduce((acc, valor) => acc + (Number(valor) || 0), 0);

const addLojaTotals = (target, source = {}) => {
  Object.entries(source).forEach(([loja, valor]) => {
    target[loja] = (target[loja] || 0) + Number(valor || 0);
  });
};

const getFamiliaDisplayName = (familia) => {
  if (familia === 'CONFORT VANILLA') {
    return 'BASICOS';
  }
  return familia;
};

const aplicarArredondamentoRegra = (valor) => {
  if (valor <= 0) return 0;
  if (valor < 1) return 1;
  if (valor < 1.5) return 1;
  if (valor < 2) return 2;
  return Math.floor(valor);
};

const descreverRegraBase = (item) => {
  const regraFamilia = String(item.regraAplicada || 'padrao').toUpperCase();
  const match = String(item.matchSubgrupo || 'SEM_MATCH').toUpperCase();

  if (match.includes('PREFIXO_70')) return 'PLUS: prefixo 70';
  if (match.includes('POOL_MEDIA_REFERENCIAS')) return 'Pool media refs';
  if (match.includes('POOL')) return 'Pool/fallback';
  if (match.includes('DEPARA')) return 'De-para subgrupo';
  if (match.includes('BASE_ESPECIAL')) return 'Base especial';
  if (match.includes('EXATO')) return regraFamilia !== 'PADRAO' ? `${regraFamilia} + match exato` : 'Match exato';
  if (match.includes('SEM_MATCH')) return 'Sem match';
  return match;
};

const ComparativeMatrix = ({ data, filters = {}, familiaLinhaMap = {}, planoEdicaoLimitadaData = [] }) => {
  const { lojas, familias: familiasOriginal } = data;
  const [expanded, setExpanded] = useState({});
  const [modalData, setModalData] = useState(null);

  // Toggle expansão
  const toggleExpand = (key, e) => {
    if (e) e.stopPropagation();
    setExpanded(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Filtrar famílias baseado nos filtros selecionados
  const familiasFiltradas = useMemo(() => {
    let resultado = [...familiasOriginal];

    // Filtrar por família
    if (hasFilterValue(filters.familia)) {
      resultado = resultado.filter(f => matchesFilterValue(f.nome, filters.familia));
    }

    // Filtrar por linha (usando mapeamento família→linha)
    if (hasFilterValue(filters.linha)) {
      resultado = resultado.filter(f => {
        const linhaDoItem = familiaLinhaMap[f.nome] || '';
        return matchesFilterValue(linhaDoItem, filters.linha);
      });
    }

    return resultado;
  }, [familiasOriginal, filters, familiaLinhaMap]);

  // Filtrar lojas baseado no filtro de empresa
  const lojasFiltradas = useMemo(() => {
    if (hasFilterValue(filters.empresa)) {
      const selectedStores = lojas.filter(loja => matchesFilterValue(loja, filters.empresa));
      if (selectedStores.length > 0) return selectedStores;
    }
    return lojas;
  }, [lojas, filters.empresa]);

  // Índices das lojas filtradas
  const lojasIndices = useMemo(() => {
    return lojasFiltradas.map(loja => lojas.indexOf(loja));
  }, [lojas, lojasFiltradas]);

  const isLojaFiltrada = lojasFiltradas.length !== lojas.length;

  const planoFiltradoMatriz = useMemo(() => {
    return planoEdicaoLimitadaData.filter(item => (
      item.colecao === 'VERAO 27' &&
      matchesFilterValue(item.familia, filters.familia) &&
      matchesFilterValue(familiaLinhaMap[item.familia], filters.linha) &&
      matchesFilterValue(item.grupo, filters.grupo) &&
      matchesFilterValue(item.ref, filters.referencia, 'includes')
    ));
  }, [planoEdicaoLimitadaData, filters, familiaLinhaMap]);

  const planoSkuPorFamilia = useMemo(() => {
    return planoFiltradoMatriz
      .reduce((acc, item) => {
        const familia = item.familia || 'OUTROS';
        acc[familia] = (acc[familia] || 0) + (item.plano || 0);
        return acc;
      }, {});
  }, [planoFiltradoMatriz]);

  const planoLojaPorFamilia = useMemo(() => {
    return planoFiltradoMatriz.reduce((acc, item) => {
      const familia = item.familia || 'OUTROS';
      if (!acc[familia]) acc[familia] = {};
      addLojaTotals(acc[familia], item.planoDistribuidoLojas || {});
      return acc;
    }, {});
  }, [planoFiltradoMatriz]);

  // Usar valores originais do JSON (sem redução - plano definido pelo Cairo)
  const familiasComPlano = useMemo(
    () => familiasFiltradas
      .filter(familia => (planoSkuPorFamilia[familia.nome] || 0) > 0),
    [familiasFiltradas, planoSkuPorFamilia]
  );

  const familias = familiasComPlano.map(familia => ({
    ...familia,
    plano2026Original: familia.plano2026,
    plano2026: lojas.map(loja => planoLojaPorFamilia[familia.nome]?.[loja] ?? familia.plano2026[lojas.indexOf(loja)] ?? 0)
  }));

  // Esta matriz compara o plano contra a base propria de cada familia/loja.
  // Familias com venda historica, mas sem plano 2026, ficam fora desta comparacao.
  const baseSemPlano = null;

  // Calcular participação de cada loja na família (baseado no plano2026)
  const getParticipacaoLojasNaFamilia = (familia) => {
    const totalFamilia = lojasIndices.reduce((s, idx) => s + (familia.plano2026[idx] || 0), 0);
    if (totalFamilia === 0) return {};

    const participacao = {};
    lojasIndices.forEach((lojaIdx, i) => {
      const loja = lojasFiltradas[i];
      participacao[loja] = (familia.plano2026[lojaIdx] || 0) / totalFamilia;
    });
    return participacao;
  };

  // Distribuir valor proporcionalmente usando a regra de arredondamento do plano
  const distribuirProporcional = (total, participacao, lojasValidas) => {
    if (total === 0 || lojasValidas.length === 0) return {};

    // Recalcular participação só para lojas válidas
    const totalPart = lojasValidas.reduce((s, l) => s + (participacao[l] || 0), 0);
    if (totalPart === 0) {
      // Se não há participação, dividir igualmente
      const porLoja = Math.floor(total / lojasValidas.length);
      const resto = total - (porLoja * lojasValidas.length);
      const result = {};
      lojasValidas.forEach((l, i) => {
        result[l] = porLoja + (i < resto ? 1 : 0);
      });
      return result;
    }

    const result = {};
    const restos = [];
    let soma = 0;

    lojasValidas.forEach(loja => {
      const partNorm = (participacao[loja] || 0) / totalPart;
      const valorExato = total * partNorm;
      const valorArredondado = aplicarArredondamentoRegra(valorExato);
      result[loja] = valorArredondado;
      soma += valorArredondado;
      restos.push({ loja, resto: valorExato - Math.floor(valorExato) });
    });

    // Se ainda faltar quantidade, distribuir o resto usando largest remainder.
    // Se a regra de minimo arredondou para cima, mantem a protecao de 1 peca.
    let falta = total - soma;
    if (falta > 0) {
      restos.sort((a, b) => b.resto - a.resto);
      for (let i = 0; i < falta && i < restos.length; i++) {
        result[restos[i].loja] += 1;
      }
    }

    return result;
  };

  // Buscar SKUs de uma família agrupados por ref > cor > tam
  const getSkusHierarquia = (familiaName) => {
    const skus = planoFiltradoMatriz
      .filter(item => item.familia === familiaName);

    const refs = {};
    skus.forEach(sku => {
      if (!refs[sku.ref]) {
        refs[sku.ref] = { cores: {}, total: 0, lojas: {} };
      }
      if (!refs[sku.ref].cores[sku.cor]) {
        refs[sku.ref].cores[sku.cor] = { tamanhos: {}, total: 0, lojas: {} };
      }
      const lojasSku = sku.planoDistribuidoLojas || {};
      refs[sku.ref].cores[sku.cor].tamanhos[sku.tam] = {
        total: sku.plano,
        lojas: lojasSku
      };
      refs[sku.ref].cores[sku.cor].total += sku.plano;
      refs[sku.ref].total += sku.plano;
      addLojaTotals(refs[sku.ref].lojas, lojasSku);
      addLojaTotals(refs[sku.ref].cores[sku.cor].lojas, lojasSku);
    });

    return refs;
  };

  // Gerar todas as chaves de expansão
  const getAllExpandKeys = useMemo(() => {
    const keys = {};
    familias.forEach(familia => {
      const famKey = `fam_${familia.nome}`;
      keys[famKey] = true;

      const skusHierarquia = getSkusHierarquia(familia.nome);
      Object.entries(skusHierarquia).forEach(([refName, refData]) => {
        const refKey = `ref_${familia.nome}_${refName}`;
        keys[refKey] = true;

        Object.entries(refData.cores).forEach(([corName]) => {
          const corKey = `cor_${familia.nome}_${refName}_${corName}`;
          keys[corKey] = true;
        });
      });
    });
    return keys;
  }, [familias]);

  const expandAll = () => setExpanded(getAllExpandKeys);
  const collapseAll = () => setExpanded({});
  const isAllExpanded = Object.keys(expanded).length >= Object.keys(getAllExpandKeys).length;

  // Calcular totais gerais (apenas para lojas filtradas)
  const totalGeral = lojasIndices.map((lojaIdx) => ({
    total2025: familias.reduce((sum, f) => sum + (f.vendas2025[lojaIdx] || 0), 0) + (baseSemPlano?.vendas2025[lojaIdx] || 0),
    total2026: familias.reduce((sum, f) => sum + (f.plano2026[lojaIdx] || 0), 0)
  }));

  const totalGeralSum2025 = totalGeral.reduce((s, t) => s + t.total2025, 0);
  const totalGeralSum2026 = isLojaFiltrada
    ? totalGeral.reduce((s, t) => s + t.total2026, 0)
    : familias.reduce((sum, familia) => sum + (planoSkuPorFamilia[familia.nome] || 0), 0);

  const diagnosticoPercentuais = useMemo(() => {
    const pct = (valor, base) => (base > 0 ? ((valor - base) / base) * 100 : 0);

    return familias.map((familia) => {
      const rowsFamilia = planoFiltradoMatriz.filter(item => item.familia === familia.nome);
      const baseComparativo = lojasIndices.reduce((sum, lojaIdx) => sum + Number(familia.vendas2025[lojaIdx] || 0), 0);
      const baseSku = rowsFamilia.reduce((sum, item) => sum + Number(item.vendaBase || 0), 0);
      const planoSku = rowsFamilia.reduce((sum, item) => sum + Number(item.planoOriginal ?? item.plano ?? 0), 0);
      const planoFinal = isLojaFiltrada
        ? rowsFamilia.reduce(
          (sum, item) => sum + lojasFiltradas.reduce(
            (storeSum, loja) => storeSum + Number(item.planoDistribuidoLojas?.[loja] || 0),
            0
          ),
          0
        )
        : rowsFamilia.reduce((sum, item) => sum + Number(item.plano || 0), 0);
      const diferencaBase = baseSku - baseComparativo;
      const impactoLoja = planoFinal - planoSku;
      const tiposMatch = rowsFamilia.reduce((acc, item) => {
        const tipo = item.matchSubgrupo || 'SEM INFO';
        acc[tipo] = (acc[tipo] || 0) + 1;
        return acc;
      }, {});
      const principalMatch = Object.entries(tiposMatch)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
      const refResumo = Object.values(rowsFamilia.reduce((acc, item) => {
        const ref = item.ref || 'SEM REF';
        if (!acc[ref]) {
          acc[ref] = {
            ref,
            grupo: item.grupo || '-',
            subgrupo: item.subgrupo || '-',
            match: item.matchSubgrupo || '-',
            base: 0,
            sku: 0,
            final: 0,
            lojasComUm: 0
          };
        }

        const finalSku = Number(item.plano || 0);
        const skuOriginal = Number(item.planoOriginal ?? item.plano ?? 0);
        acc[ref].base += Number(item.vendaBase || 0);
        acc[ref].sku += skuOriginal;
        acc[ref].final += finalSku;
        acc[ref].lojasComUm += lojasFiltradas.filter(loja => Number(item.planoDistribuidoLojas?.[loja] || 0) === 1).length;
        return acc;
      }, {}));
      const topRefsImpacto = refResumo
        .map(ref => ({ ...ref, impacto: ref.final - ref.sku }))
        .sort((a, b) => Math.abs(b.impacto) - Math.abs(a.impacto))
        .slice(0, 3);
      const lojasComUm = rowsFamilia.reduce(
        (sum, item) => sum + lojasFiltradas.filter(loja => Number(item.planoDistribuidoLojas?.[loja] || 0) === 1).length,
        0
      );
      const corResumo = Object.values(rowsFamilia.reduce((acc, item) => {
        const cor = item.cor || 'SEM COR';
        if (!acc[cor]) acc[cor] = { cor, plano: 0 };
        acc[cor].plano += Number(item.plano || 0);
        return acc;
      }, {})).sort((a, b) => b.plano - a.plano);
      const regrasBase = Object.entries(rowsFamilia.reduce((acc, item) => {
        const regra = descreverRegraBase(item);
        const impactoSku = Math.abs(Number(item.planoOriginal ?? item.plano ?? 0) - Number(item.vendaBase || 0));
        acc[regra] = (acc[regra] || 0) + Math.max(impactoSku, 1);
        return acc;
      }, {})).sort((a, b) => b[1] - a[1]);

      let motivo = 'Dentro da base';
      if (Math.abs(diferencaBase) > Math.max(10, baseComparativo * 0.02)) {
        motivo = diferencaBase > 0 ? 'Base/fallback acima' : 'Base/fallback abaixo';
      } else if (impactoLoja > Math.max(10, planoSku * 0.02)) {
        motivo = 'Loja/minimos';
      } else if (impactoLoja < -Math.max(10, planoSku * 0.02)) {
        motivo = 'Ajuste loja abaixo';
      }

      const pctSku = pct(planoSku, baseComparativo);
      const pctFinal = pct(planoFinal, baseComparativo);
      const pctNaturalSku = pct(planoSku, baseSku);
      let regraPrincipal = regrasBase[0]?.[0] || principalMatch;
      if (impactoLoja > Math.max(10, planoSku * 0.02) && lojasComUm > 0) {
        regraPrincipal = `Minimo/arred. loja (${fmt(lojasComUm)} cel. = 1)`;
      } else if (Math.abs(diferencaBase) > Math.max(10, baseComparativo * 0.02)) {
        regraPrincipal = `Base: ${regraPrincipal}`;
      }

      return {
        familia: familia.nome,
        baseComparativo,
        baseSku,
        diferencaBase,
        planoSku,
        planoFinal,
        impactoLoja,
        pctSku,
        pctFinal,
        impactoBasePp: pctSku - pctNaturalSku,
        impactoLojaPp: pctFinal - pctSku,
        motivo,
        principalMatch,
        regraPrincipal,
        lojasComUm,
        topRefsImpacto,
        corResumo
      };
    }).sort((a, b) => Math.abs(b.pctFinal) - Math.abs(a.pctFinal));
  }, [familias, planoFiltradoMatriz, lojasIndices, lojasFiltradas, isLojaFiltrada]);

  // Abrir modal de memória de cálculo
  const openModal = (familia, lojaIdx, e) => {
    e.stopPropagation();
    const loja = lojas[lojaIdx];
    const val2025 = familia.vendas2025[lojaIdx];
    const val2026 = familia.plano2026[lojaIdx];
    const val2026Original = familia.plano2026Original?.[lojaIdx] || val2026;
    const percentual = val2025 > 0 ? ((val2026 - val2025) / val2025) * 100 : 0;
    const diferenca = val2026 - val2025;
    const foiAjustado = false;

    const skusDetalhados = planoEdicaoLimitadaData
      .filter(item => (
        item.familia === familia.nome &&
        item.colecao === 'VERAO 27' &&
        matchesFilterValue(item.grupo, filters.grupo) &&
        matchesFilterValue(item.ref, filters.referencia, 'includes')
      ))
      .map(item => ({
        ref: item.ref,
        cor: item.cor,
        tam: item.tam,
        grupo: item.grupo,
        plano: item.plano
      }));

    const totalPlanoDetalhado = skusDetalhados.reduce((sum, s) => sum + s.plano, 0);

    setModalData({
      familia: familia.nome,
      loja,
      val2025,
      val2026,
      val2026Original,
      percentual,
      diferenca,
      foiAjustado,
      skusDetalhados,
      totalPlanoDetalhado
    });
  };

  const closeModal = () => setModalData(null);

  // Renderizar célula de valor
  const renderValorCell = (familia, lojaIdx, bgClass = '') => {
    const val2025 = familia.vendas2025[lojaIdx];
    const val2026 = familia.plano2026[lojaIdx];
    const percentual = val2025 > 0 ? ((val2026 - val2025) / val2025) * 100 : 0;
    const foiAjustado = false;

    return (
      <>
        <td className={`px-2 py-2 text-right font-mono tabular-nums text-gray-600 border-l border-gray-200 text-xs ${bgClass}`}>
          {fmt(val2025)}
        </td>
        <td className={`px-2 py-2 text-right font-mono tabular-nums text-xs ${bgClass} ${foiAjustado ? 'bg-amber-50 text-amber-800' : 'text-gray-800'}`}>
          {fmt(val2026)}
          {foiAjustado && <span className="text-amber-500 ml-0.5">*</span>}
        </td>
        <td
          className={`px-2 py-2 text-right font-mono tabular-nums text-xs cursor-pointer hover:bg-gray-100 transition-colors ${bgClass} ${percentual >= 0 ? 'text-emerald-700' : 'text-red-600'}`}
          onClick={(e) => openModal(familia, lojaIdx, e)}
          title="Clique para ver memória de cálculo"
        >
          <span className="inline-flex items-center gap-0.5">
            {percentual > 0 ? '+' : ''}{percentual.toFixed(1)}%
            <Calculator size={10} className="text-gray-400" />
          </span>
        </td>
      </>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-[#B3838C] border-b border-[#A05565]">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-white text-sm font-bold uppercase tracking-wide">
              Comparativo Família × Lojas
            </h3>
            <p className="text-white/70 text-[10px] mt-0.5">Base de cálculo vs Plano 2026 | Clique no % para memória de cálculo</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportComparativoLojas([...familias, baseSemPlano].filter(Boolean), lojasFiltradas, 'comparativo_familia_lojas', lojas)}
              className="flex items-center gap-1 px-2 py-1 bg-white/20 hover:bg-white/30 text-white text-[11px] rounded transition-colors border border-white/30"
              title="Exportar resumo por família"
            >
              <Download size={12} />
              Resumo
            </button>
            <button
              onClick={() => exportComparativoDetalhado(
                planoFiltradoMatriz,
                data,
                'plano_detalhado_pcp',
                { lojasVisiveis: lojasFiltradas }
              )}
              className="flex items-center gap-1 px-2 py-1 bg-teal-600 hover:bg-teal-500 text-white text-[11px] rounded transition-colors border border-teal-400"
              title="Exportar nível SKU detalhado para PCP"
            >
              <Download size={12} />
              PCP (SKU)
            </button>
            <button
              onClick={isAllExpanded ? collapseAll : expandAll}
              className="flex items-center gap-1 px-2 py-1 bg-white/20 hover:bg-white/30 text-white text-[11px] rounded transition-colors border border-white/30"
            >
              {isAllExpanded ? <Minimize2 size={12} /> : <Expand size={12} />}
              {isAllExpanded ? 'Recolher' : 'Expandir'}
            </button>
            <span className="text-[10px] text-white/90 bg-white/20 px-2 py-1 rounded border border-white/30">
              Base comparável
            </span>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-auto max-h-[70vh]">
        <table className="min-w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-20 bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600 sticky left-0 bg-gray-100 z-30 min-w-[200px] border-b border-gray-200">
                Hierarquia
              </th>
              {lojasFiltradas.map((loja, idx) => (
                <th key={idx} colSpan="3" className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-600 border-l border-gray-200 border-b border-gray-200">
                  <div className="truncate max-w-[100px]" title={loja}>{loja}</div>
                </th>
              ))}
              <th colSpan="3" className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-gray-700 border-l-2 border-gray-300 bg-gray-200 border-b border-gray-200">
                Total
              </th>
            </tr>
            <tr className="bg-gray-50">
              <th className="px-3 py-1.5 text-left text-[10px] text-gray-500 sticky left-0 bg-gray-50 z-30 border-b border-gray-200"></th>
              {lojasFiltradas.map((_, idx) => (
                <React.Fragment key={idx}>
                  <th className="px-2 py-1.5 text-right text-[10px] text-gray-500 border-l border-gray-200 border-b border-gray-200">Base</th>
                  <th className="px-2 py-1.5 text-right text-[10px] text-gray-500 border-b border-gray-200">2026</th>
                  <th className="px-2 py-1.5 text-right text-[10px] text-gray-500 border-b border-gray-200">%</th>
                </React.Fragment>
              ))}
              <th className="px-2 py-1.5 text-right text-[10px] text-gray-600 font-medium border-l-2 border-gray-300 bg-gray-200 border-b border-gray-200">Base</th>
              <th className="px-2 py-1.5 text-right text-[10px] text-gray-600 font-medium bg-gray-200 border-b border-gray-200">2026</th>
              <th className="px-2 py-1.5 text-right text-[10px] text-gray-600 font-medium bg-gray-200 border-b border-gray-200">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {familias.map((familia, famIdx) => {
              const famKey = `fam_${familia.nome}`;
              const isFamExpanded = expanded[famKey];
              // Calcular totais apenas para lojas filtradas
              const totalFam2025 = lojasIndices.reduce((s, idx) => s + (familia.vendas2025[idx] || 0), 0);
              const totalFam2026 = isLojaFiltrada
                ? lojasIndices.reduce((s, idx) => s + (familia.plano2026[idx] || 0), 0)
                : (planoSkuPorFamilia[familia.nome] || 0);
              const totalFamPct = totalFam2025 > 0 ? ((totalFam2026 - totalFam2025) / totalFam2025) * 100 : 0;
              const skusHierarquia = isFamExpanded ? getSkusHierarquia(familia.nome) : {};
              const rowBg = famIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50';

              return (
                <React.Fragment key={famIdx}>
                  {/* Linha da Família */}
                  <tr
                    className={`${rowBg} hover:bg-gray-50 cursor-pointer transition-colors`}
                    onClick={(e) => toggleExpand(famKey, e)}
                  >
                    <td className={`px-3 py-2 font-semibold text-gray-800 sticky left-0 z-10 min-w-[200px] ${famIdx % 2 === 0 ? 'bg-white' : 'bg-[#f9fafb]'}`}>
                      <div className="flex items-center gap-2">
                        {isFamExpanded ? <ChevronDown size={14} className="text-[#B3838C]" /> : <ChevronRight size={14} className="text-gray-400" />}
                        <span className="text-xs font-bold uppercase">{getFamiliaDisplayName(familia.nome)}</span>
                      </div>
                    </td>
                    {lojasIndices.map((lojaIdx, i) => (
                      <React.Fragment key={i}>
                        {renderValorCell(familia, lojaIdx, rowBg)}
                      </React.Fragment>
                    ))}
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-xs font-bold text-gray-700 border-l-2 border-gray-300 bg-gray-100">
                      {fmt(totalFam2025)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-xs font-bold text-gray-800 bg-gray-100">
                      {fmt(totalFam2026)}
                    </td>
                    <td className={`px-2 py-2 text-right font-mono tabular-nums text-xs font-bold bg-gray-100 ${totalFamPct >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {totalFamPct > 0 ? '+' : ''}{totalFamPct.toFixed(1)}%
                    </td>
                  </tr>

                  {/* Referências */}
                  {isFamExpanded && Object.entries(skusHierarquia).map(([refName, refData], refIdx) => {
                    const refKey = `ref_${familia.nome}_${refName}`;
                    const isRefExpanded = expanded[refKey];
                    const isTamMaior = ehFamiliaTamanhoMaior(familia.nome);
                    const isPortelle = ehPortelle(familia.nome);
                    // Participação de cada loja na família
                    // Lojas válidas (excluindo proibidas para tam. maior)
                    const lojasValidas = lojasFiltradas.filter(loja =>
                      (!isTamMaior || !lojaExcluidaTamanhoMaior(loja)) &&
                      (!isPortelle || !lojaSemPortelle(loja))
                    );
                    // Distribuição proporcional da referência
                    const distRef = refData.lojas || {};

                    return (
                      <React.Fragment key={refIdx}>
                        <tr
                          className="bg-slate-100 hover:bg-slate-200 cursor-pointer transition-colors"
                          onClick={(e) => toggleExpand(refKey, e)}
                        >
                          <td className="px-3 py-1.5 sticky left-0 bg-slate-100 z-10 min-w-[200px]">
                            <div className="flex items-center gap-1.5 pl-4">
                              {isRefExpanded ? <ChevronDown size={12} className="text-slate-600" /> : <ChevronRight size={12} className="text-slate-400" />}
                              <span className="text-[11px] font-semibold text-slate-700">{refName}</span>
                            </div>
                          </td>
                          {lojasFiltradas.map((loja, i) => {
                            const lojaExcluida =
                              (isTamMaior && lojaExcluidaTamanhoMaior(loja)) ||
                              (isPortelle && lojaSemPortelle(loja));
                            return (
                              <React.Fragment key={i}>
                                <td className="px-2 py-1.5 text-right text-[10px] text-gray-400 border-l border-slate-200 bg-slate-100">—</td>
                                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[10px] text-slate-700 bg-slate-100">
                                  {lojaExcluida ? '—' : fmt(distRef[loja] || 0)}
                                </td>
                                <td className="px-2 py-1.5 text-right text-[10px] text-gray-400 bg-slate-100">—</td>
                              </React.Fragment>
                            );
                          })}
                          <td colSpan="2" className="px-2 py-1.5 text-right font-mono tabular-nums text-[11px] font-semibold text-slate-800 border-l-2 border-slate-300 bg-slate-200">
                            {fmt(refData.total)} un
                          </td>
                          <td className="px-2 py-1.5 text-right text-[10px] text-slate-600 bg-slate-200">
                            {Object.keys(refData.cores).length} cor
                          </td>
                        </tr>

                        {/* Cores */}
                        {isRefExpanded && Object.entries(refData.cores).map(([corName, corData], corIdx) => {
                          const corKey = `cor_${familia.nome}_${refName}_${corName}`;
                          const isCorExpanded = expanded[corKey];
                          const lojasValidasCor = lojasValidas.filter(loja =>
                            !isPortelle ||
                            (!lojaSemPortelle(loja) && (!corBloqueadaPortelle(corName) || !lojaPequenaPortelle(loja)))
                          );
                          // Distribuição proporcional da cor
                          const distCor = corData.lojas || {};

                          return (
                            <React.Fragment key={corIdx}>
                              <tr
                                className="bg-violet-50 hover:bg-violet-100 cursor-pointer transition-colors"
                                onClick={(e) => toggleExpand(corKey, e)}
                              >
                                <td className="px-3 py-1.5 sticky left-0 bg-violet-50 z-10 min-w-[200px]">
                                  <div className="flex items-center gap-1.5 pl-8">
                                    {isCorExpanded ? <ChevronDown size={10} className="text-violet-600" /> : <ChevronRight size={10} className="text-violet-400" />}
                                    <span className="text-[10px] text-violet-700">{corName}</span>
                                  </div>
                                </td>
                                {lojasFiltradas.map((loja, i) => {
                                  const lojaExcluida =
                                    (isTamMaior && lojaExcluidaTamanhoMaior(loja)) ||
                                    (isPortelle && (lojaSemPortelle(loja) || (corBloqueadaPortelle(corName) && lojaPequenaPortelle(loja))));
                                  return (
                                    <React.Fragment key={i}>
                                      <td className="px-2 py-1.5 text-right text-[10px] text-gray-400 border-l border-violet-100 bg-violet-50">—</td>
                                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[10px] text-violet-700 bg-violet-50">
                                        {lojaExcluida ? '—' : fmt(distCor[loja] || 0)}
                                      </td>
                                      <td className="px-2 py-1.5 text-right text-[10px] text-gray-400 bg-violet-50">—</td>
                                    </React.Fragment>
                                  );
                                })}
                                <td colSpan="2" className="px-2 py-1.5 text-right font-mono tabular-nums text-[10px] text-violet-800 border-l-2 border-violet-200 bg-violet-100">
                                  {fmt(corData.total)} un
                                </td>
                                <td className="px-2 py-1.5 text-right text-[10px] text-violet-600 bg-violet-100">
                                  {Object.keys(corData.tamanhos).length} tam
                                </td>
                              </tr>

                              {/* Tamanhos */}
                              {isCorExpanded && Object.entries(corData.tamanhos).map(([tamName, tamData], tamIdx) => {
                                // Distribuição proporcional do tamanho (SKU)
                                const tamValor = Number(tamData?.total || 0);
                                const distTam = tamData?.lojas || {};
                                return (
                                  <tr key={tamIdx} className="bg-teal-50 hover:bg-teal-100 transition-colors">
                                    <td className="px-3 py-1 sticky left-0 bg-teal-50 z-10 min-w-[200px]">
                                      <div className="flex items-center gap-1.5 pl-12">
                                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                                        <span className="text-[10px] text-teal-700 font-medium">{tamName}</span>
                                      </div>
                                    </td>
                                    {lojasFiltradas.map((loja, i) => {
                                      const lojaExcluida =
                                        (isTamMaior && lojaExcluidaTamanhoMaior(loja)) ||
                                        (isPortelle && (lojaSemPortelle(loja) || (corBloqueadaPortelle(corName) && lojaPequenaPortelle(loja))));
                                      return (
                                        <React.Fragment key={i}>
                                          <td className="px-2 py-1 text-right text-[10px] text-gray-400 border-l border-teal-100 bg-teal-50">—</td>
                                          <td className="px-2 py-1 text-right font-mono tabular-nums text-[10px] text-teal-700 bg-teal-50">
                                            {lojaExcluida ? '—' : fmt(distTam[loja] || 0)}
                                          </td>
                                          <td className="px-2 py-1 text-right text-[10px] text-gray-400 bg-teal-50">—</td>
                                        </React.Fragment>
                                      );
                                    })}
                                    <td colSpan="2" className="px-2 py-1 text-right font-mono tabular-nums text-[10px] text-teal-800 border-l-2 border-teal-200 bg-teal-100/60">
                                      {fmt(tamValor)} un
                                    </td>
                                    <td className="px-2 py-1 text-right bg-teal-100/60">
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-teal-200 text-teal-800">
                                        SKU
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}

            {baseSemPlano && (
              <tr className="bg-amber-50 font-semibold">
                <td className="px-3 py-2 text-amber-900 sticky left-0 bg-amber-50 z-10 min-w-[200px]">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase">{baseSemPlano.nome}</span>
                    <span className="text-[10px] text-amber-700 font-normal">{baseSemPlano.familias}</span>
                  </div>
                </td>
                {lojasIndices.map((lojaIdx, idx) => (
                  <React.Fragment key={idx}>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-xs text-amber-800 border-l border-amber-100">
                      {fmt(baseSemPlano.vendas2025[lojaIdx])}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-xs text-gray-400">
                      —
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-xs text-gray-400">
                      —
                    </td>
                  </React.Fragment>
                ))}
                <td className="px-2 py-2 text-right font-mono tabular-nums text-xs font-bold text-amber-900 border-l-2 border-amber-200 bg-amber-100">
                  {fmt(lojasIndices.reduce((total, lojaIdx) => total + (baseSemPlano.vendas2025[lojaIdx] || 0), 0))}
                </td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-xs text-gray-400 bg-amber-100">
                  —
                </td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-xs text-gray-400 bg-amber-100">
                  —
                </td>
              </tr>
            )}

            {/* Total Geral */}
            <tr className="bg-[#585858] font-bold sticky bottom-0">
              <td className="px-3 py-2 text-white sticky left-0 bg-[#585858] z-10 uppercase tracking-wide text-[11px]">
                Total Geral
              </td>
              {totalGeral.map((total, idx) => {
                const pct = total.total2025 > 0 ? ((total.total2026 - total.total2025) / total.total2025) * 100 : 0;
                return (
                  <React.Fragment key={idx}>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-[11px] text-gray-300 border-l border-gray-600">
                      {fmt(total.total2025)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-[11px] text-white">
                      {fmt(total.total2026)}
                    </td>
                    <td className={`px-2 py-2 text-right font-mono tabular-nums text-[11px] ${pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                    </td>
                  </React.Fragment>
                );
              })}
              <td className="px-2 py-2 text-right font-mono tabular-nums text-xs text-white border-l-2 border-gray-500">
                {fmt(totalGeralSum2025)}
              </td>
              <td className="px-2 py-2 text-right font-mono tabular-nums text-xs text-white font-bold">
                {fmt(totalGeralSum2026)}
              </td>
              <td className={`px-2 py-2 text-right font-mono tabular-nums text-xs font-bold ${totalGeralSum2025 > 0 && ((totalGeralSum2026 - totalGeralSum2025) / totalGeralSum2025) * 100 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totalGeralSum2025 > 0 ? `${((totalGeralSum2026 - totalGeralSum2025) / totalGeralSum2025) * 100 > 0 ? '+' : ''}${(((totalGeralSum2026 - totalGeralSum2025) / totalGeralSum2025) * 100).toFixed(1)}%` : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Rodapé/Legenda */}
      <div className="border-t border-gray-200 bg-white">
        <div className="px-4 py-3 border-b border-gray-100">
          <h4 className="text-xs font-bold uppercase tracking-wide text-gray-700">Diagnostico do aumento</h4>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Decompoe o percentual entre base construida, plano SKU e plano final por loja.
          </p>
        </div>
        <div className="overflow-auto max-h-[360px]">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="border-b border-gray-200">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-gray-500">Familia</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase text-gray-500">Base comp.</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase text-gray-500">Base SKU</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase text-gray-500">Delta base</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase text-gray-500">Plano SKU</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase text-gray-500">% SKU</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase text-gray-500">Plano final</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase text-gray-500">% final</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase text-gray-500">Impacto loja</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase text-gray-500">PP loja</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase text-gray-500">Cel. 1</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-gray-500">Refs que puxam</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-gray-500">Mix cor</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-gray-500">Regra principal</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-gray-500">Motivo</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-gray-500">Match principal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {diagnosticoPercentuais.map((row, idx) => {
                const topCores = row.corResumo.slice(0, 4);
                return (
                  <tr key={row.familia} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'}>
                    <td className="px-3 py-2 font-semibold text-gray-800">{getFamiliaDisplayName(row.familia)}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-gray-700">{fmt(row.baseComparativo)}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-gray-700">{fmt(row.baseSku, 1)}</td>
                    <td className={`px-2 py-2 text-right font-mono tabular-nums ${row.diferencaBase >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {row.diferencaBase > 0 ? '+' : ''}{fmt(row.diferencaBase, 1)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-gray-700">{fmt(row.planoSku)}</td>
                    <td className={`px-2 py-2 text-right font-mono tabular-nums ${row.pctSku >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {row.pctSku > 0 ? '+' : ''}{row.pctSku.toFixed(1)}%
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums font-semibold text-gray-900">{fmt(row.planoFinal)}</td>
                    <td className={`px-2 py-2 text-right font-mono tabular-nums font-semibold ${row.pctFinal >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {row.pctFinal > 0 ? '+' : ''}{row.pctFinal.toFixed(1)}%
                    </td>
                    <td className={`px-2 py-2 text-right font-mono tabular-nums ${row.impactoLoja >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {row.impactoLoja > 0 ? '+' : ''}{fmt(row.impactoLoja)}
                    </td>
                    <td className={`px-2 py-2 text-right font-mono tabular-nums ${row.impactoLojaPp >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {row.impactoLojaPp > 0 ? '+' : ''}{row.impactoLojaPp.toFixed(1)}pp
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-gray-700">{fmt(row.lojasComUm)}</td>
                    <td className="px-3 py-2 min-w-[180px]">
                      <div className="space-y-0.5">
                        {row.topRefsImpacto.map(ref => (
                          <div key={ref.ref} className="text-[10px] text-gray-700">
                            <span className="font-mono font-semibold text-gray-900">{ref.ref}</span>
                            <span className={`ml-1 font-mono ${ref.impacto >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                              {ref.impacto > 0 ? '+' : ''}{fmt(ref.impacto)}
                            </span>
                            <span className="ml-1 text-gray-400">{ref.grupo}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 min-w-[180px]">
                      <div className="space-y-0.5">
                        {topCores.map(cor => {
                          const pctCor = row.planoFinal > 0 ? (cor.plano / row.planoFinal) * 100 : 0;
                          return (
                            <div key={cor.cor} className="text-[10px] text-gray-700">
                              <span className="font-semibold text-gray-900">{cor.cor}</span>
                              <span className="ml-1 font-mono text-gray-500">{fmt(cor.plano)} / {pctCor.toFixed(0)}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-2 min-w-[160px] text-[10px] font-semibold text-gray-800">
                      {row.regraPrincipal}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                        {row.motivo}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[10px] text-gray-500">{row.principalMatch}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-[10px] text-gray-500 flex flex-wrap items-center gap-4">
        <span className="font-semibold text-gray-600">Legenda:</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-white border border-gray-300 rounded-sm"></span> Família</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-slate-100 border border-slate-300 rounded-sm"></span> Referência</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-violet-100 border border-violet-300 rounded-sm"></span> Cor</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-teal-100 border border-teal-300 rounded-sm"></span> SKU</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-100 border border-amber-300 rounded-sm"></span> Base propria da familia/loja</span>
      </div>

      {/* Modal de Memória de Cálculo */}
      {modalData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[85vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do Modal */}
            <div className="px-4 py-3 border-b border-gray-200 bg-teal-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator size={16} className="text-teal-700" />
                <div>
                  <h3 className="text-sm font-semibold text-teal-800">Memória de Cálculo</h3>
                  <p className="text-xs text-teal-600">{modalData.familia} - {modalData.loja}</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Conteúdo do Modal */}
            <div className="p-4 max-h-[55vh] overflow-auto">
              {/* Indicadores */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="text-[11px] text-gray-500">Base cálculo</div>
                  <div className="text-lg font-bold font-mono text-gray-900">{fmt(modalData.val2025)}</div>
                </div>
                <div className={`rounded-lg border px-3 py-2 ${modalData.foiAjustado ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className={`text-[11px] ${modalData.foiAjustado ? 'text-amber-600' : 'text-gray-500'}`}>
                    Plano 2026 {modalData.foiAjustado && '(Ajust.)'}
                  </div>
                  <div className={`text-lg font-bold font-mono ${modalData.foiAjustado ? 'text-amber-800' : 'text-gray-900'}`}>
                    {fmt(modalData.val2026)}
                  </div>
                  {modalData.foiAjustado && (
                    <div className="text-[10px] text-amber-600">Original: {fmt(modalData.val2026Original)}</div>
                  )}
                </div>
                <div className={`rounded-lg border px-3 py-2 ${modalData.percentual >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                  <div className={`text-[11px] ${modalData.percentual >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Crescimento</div>
                  <div className={`text-lg font-bold font-mono ${modalData.percentual >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {modalData.percentual > 0 ? '+' : ''}{modalData.percentual.toFixed(1)}%
                  </div>
                  <div className={`text-[10px] ${modalData.percentual >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {modalData.diferenca > 0 ? '+' : ''}{fmt(modalData.diferenca)} un
                  </div>
                </div>
              </div>

              {/* Fórmula */}
              <div className="bg-gray-100 rounded-lg p-3 mb-4 border border-gray-200">
                <p className="text-[11px] text-gray-600 font-medium mb-1">Fórmula:</p>
                <div className="bg-white rounded p-2 font-mono text-xs border border-gray-200">
                  <p className="text-gray-700">Crescimento = ((Plano - Base) / Base) × 100</p>
                  <p className="text-gray-500 mt-1">= (({modalData.val2026} - {modalData.val2025}) / {modalData.val2025}) × 100</p>
                  <p className={`font-semibold mt-1 ${modalData.percentual >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    = {modalData.percentual > 0 ? '+' : ''}{modalData.percentual.toFixed(2)}%
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-3 mb-4 border border-blue-200">
                <p className="text-blue-900 text-xs font-semibold">Como esta base foi montada</p>
                <p className="text-blue-800 text-[11px] mt-1">
                  Esta matriz usa a base propria de cada familia em cada loja. Assim, uma regra manual em uma familia,
                  como a reducao de PORTELLE para 400 pecas, nao altera o percentual das outras familias.
                </p>
                <p className="text-blue-700 text-[11px] mt-1">
                  Portanto, esta célula compara base {fmt(modalData.val2025)} contra plano {fmt(modalData.val2026)}.
                </p>
              </div>

              {/* Alerta de Limite */}
              {modalData.foiAjustado && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                  <p className="text-amber-800 text-xs font-semibold">Ajuste de +10% desativado</p>
                  <p className="text-amber-700 text-[11px] mt-1">
                    Plano original: <strong>{fmt(modalData.val2026Original)}</strong> → Ajustado: <strong>{fmt(modalData.val2026)}</strong>
                  </p>
                  <p className="text-amber-600 text-[10px] mt-1">
                    O plano definido pelo Cairo é exibido sem redução automática.
                  </p>
                </div>
              )}

              {/* SKUs */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-3 py-2 border-b border-gray-200">
                  <h4 className="text-xs font-semibold text-gray-700">Composição do Plano 2026</h4>
                  <p className="text-[10px] text-gray-500">{modalData.skusDetalhados.length} SKUs</p>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-gray-600">Ref</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-gray-600">Cor</th>
                        <th className="px-3 py-1.5 text-center text-[10px] font-semibold text-gray-600">Tam</th>
                        <th className="px-3 py-1.5 text-center text-[10px] font-semibold text-gray-600">Grupo</th>
                        <th className="px-3 py-1.5 text-right text-[10px] font-semibold text-gray-600">Plano</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {modalData.skusDetalhados.map((sku, idx) => (
                        <tr key={idx} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'} hover:bg-gray-50`}>
                          <td className="px-3 py-1.5 text-[10px] text-gray-700 font-mono">{sku.ref}</td>
                          <td className="px-3 py-1.5 text-[10px] text-gray-600">{sku.cor}</td>
                          <td className="px-3 py-1.5 text-[10px] text-center">
                            <span className="bg-gray-200 px-1.5 py-0.5 rounded text-gray-700">{sku.tam}</span>
                          </td>
                          <td className="px-3 py-1.5 text-[10px] text-center text-gray-500">{sku.grupo}</td>
                          <td className="px-3 py-1.5 text-[10px] text-right font-mono tabular-nums font-semibold text-gray-800">{fmt(sku.plano)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                      <tr>
                        <td colSpan="4" className="px-3 py-2 text-xs font-bold text-gray-700">
                          Total ({modalData.skusDetalhados.length} SKUs)
                        </td>
                        <td className="px-3 py-2 text-xs text-right font-mono tabular-nums font-bold text-gray-800">
                          {fmt(modalData.totalPlanoDetalhado)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer do Modal */}
            <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 text-right">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-xs font-semibold bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComparativeMatrix;
