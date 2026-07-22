import React, { useMemo } from 'react';
import { Download } from 'lucide-react';
import { exportMapeamentoFamilias } from '../utils/exportExcel';
import { hasFilterValue, matchesFilterValue } from '../utils/filterUtils';

// Formatador de n\u00fameros
const fmt = (v, dec = 0) => Number(v || 0).toLocaleString('pt-BR', {
  minimumFractionDigits: dec,
  maximumFractionDigits: dec,
});

const FamilyMappingTable = ({ data, filters = {}, familiaLinhaMap = {} }) => {
  const { lojas, familias } = data;

  // Filtrar fam\u00edlias baseado nos filtros
  const familiasFiltradas = useMemo(() => {
    let resultado = [...familias];

    if (hasFilterValue(filters.familia)) {
      resultado = resultado.filter(f => matchesFilterValue(f.familiaAtual, filters.familia));
    }

    if (hasFilterValue(filters.linha)) {
      resultado = resultado.filter(f => {
        const linha = familiaLinhaMap[f.familiaAtual] || '';
        return matchesFilterValue(linha, filters.linha);
      });
    }

    return resultado;
  }, [familias, filters, familiaLinhaMap]);

  // Filtrar lojas
  const lojasFiltradas = useMemo(() => {
    if (hasFilterValue(filters.empresa)) {
      const selectedStores = lojas.filter(loja => matchesFilterValue(loja, filters.empresa));
      if (selectedStores.length > 0) return selectedStores;
    }
    return lojas;
  }, [lojas, filters.empresa]);

  // \u00cdndices das lojas filtradas
  const lojasIndices = useMemo(() => {
    return lojasFiltradas.map(loja => lojas.indexOf(loja));
  }, [lojas, lojasFiltradas]);

  // Calcular totais gerais
  const totaisGerais = useMemo(() => {
    const total2025 = familiasFiltradas.reduce((sum, f) => {
      return sum + lojasIndices.reduce((s, i) => s + (f.vendas2025[i] || 0), 0);
    }, 0);
    const total2026 = familiasFiltradas.reduce((sum, f) => {
      return sum + lojasIndices.reduce((s, i) => s + (f.plano2026[i] || 0), 0);
    }, 0);
    return { total2025, total2026 };
  }, [familiasFiltradas, lojasIndices]);

  const familiasOrdenadas = useMemo(() => (
    [...familiasFiltradas].sort((a, b) => {
      const totalA = lojasIndices.reduce((s, i) => s + (a.plano2026[i] || 0), 0);
      const totalB = lojasIndices.reduce((s, i) => s + (b.plano2026[i] || 0), 0);
      return totalB - totalA || String(a.familiaAtual).localeCompare(String(b.familiaAtual));
    })
  ), [familiasFiltradas, lojasIndices]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-[#6B8E7B] px-4 py-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">De-Para Famílias</h3>
          <p className="text-[10px] text-white/80">Verão 27 → Base Histórica (Verão 26)</p>
        </div>
        <div className="flex items-center gap-3 text-white/90 text-[10px]">
          <button
            onClick={() => exportMapeamentoFamilias(familiasFiltradas, lojasFiltradas, 'mapeamento_familias', lojas)}
            className="flex items-center gap-1 px-2 py-1 bg-white/20 hover:bg-white/30 text-white text-[11px] rounded transition-colors border border-white/30"
            title="Exportar para Excel"
          >
            <Download size={12} />
            Excel
          </button>
          <span>{familiasFiltradas.length} fam\u00edlias</span>
          <span className="font-mono">Total: {fmt(totaisGerais.total2026)} un</span>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-auto max-h-[50vh]">
        <table className="min-w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-20 bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600 sticky left-0 bg-gray-100 z-30 min-w-[140px] border-b border-gray-200">
                Fam\u00edlia Atual
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600 sticky left-[140px] bg-gray-100 z-30 min-w-[140px] border-r border-gray-300 border-b border-gray-200">
                Fam\u00edlia Anterior
              </th>
              {lojasFiltradas.map((loja, idx) => (
                <th key={idx} colSpan="2" className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-600 border-l border-gray-200 border-b border-gray-200">
                  <div className="truncate max-w-[80px]" title={loja}>{loja}</div>
                </th>
              ))}
              <th colSpan="2" className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-gray-700 border-l-2 border-gray-300 bg-gray-200 border-b border-gray-200">
                Total
              </th>
            </tr>
            <tr className="bg-gray-50">
              <th className="px-3 py-1.5 sticky left-0 bg-gray-50 z-30 border-b border-gray-200"></th>
              <th className="px-3 py-1.5 sticky left-[140px] bg-gray-50 z-30 border-r border-gray-300 border-b border-gray-200"></th>
              {lojasFiltradas.map((_, idx) => (
                <React.Fragment key={idx}>
                  <th className="px-2 py-1.5 text-right text-[10px] text-gray-500 border-l border-gray-200 border-b border-gray-200">2025</th>
                  <th className="px-2 py-1.5 text-right text-[10px] text-gray-500 border-b border-gray-200">2026</th>
                </React.Fragment>
              ))}
              <th className="px-2 py-1.5 text-right text-[10px] text-gray-600 font-medium border-l-2 border-gray-300 bg-gray-200 border-b border-gray-200">2025</th>
              <th className="px-2 py-1.5 text-right text-[10px] text-gray-600 font-medium bg-gray-200 border-b border-gray-200">2026</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {familiasOrdenadas.map((familia, idx) => {
              const total2025 = lojasIndices.reduce((s, i) => s + (familia.vendas2025[i] || 0), 0);
              const total2026 = lojasIndices.reduce((s, i) => s + (familia.plano2026[i] || 0), 0);
              const isContinuidade = familia.familiaAtual === familia.familiaAnterior;
              const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';

              return (
                <tr key={idx} className={`${rowBg} hover:bg-sky-50 transition-colors`}>
                  <td className={`px-3 py-2 font-semibold text-gray-800 sticky left-0 z-10 min-w-[140px] ${rowBg}`}>
                    <span className="text-xs font-bold uppercase">{familia.familiaAtual}</span>
                  </td>
                  <td className={`px-3 py-2 sticky left-[140px] z-10 border-r border-gray-300 min-w-[140px] ${rowBg}`}>
                    <span className={isContinuidade ? 'text-gray-500 text-xs' : 'text-[#B3838C] font-medium text-xs'}>
                      {familia.familiaAnterior}
                    </span>
                  </td>
                  {lojasIndices.map((lojaIdx, i) => (
                    <React.Fragment key={i}>
                      <td className="px-2 py-2 text-right font-mono tabular-nums text-[11px] text-gray-600 border-l border-gray-200">
                        {familia.vendas2025[lojaIdx] > 0 ? fmt(familia.vendas2025[lojaIdx]) : '\u2014'}
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums text-[11px] text-gray-800 font-medium">
                        {familia.plano2026[lojaIdx] > 0 ? fmt(familia.plano2026[lojaIdx]) : '\u2014'}
                      </td>
                    </React.Fragment>
                  ))}
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-xs font-bold text-gray-700 border-l-2 border-gray-300 bg-gray-100">
                    {fmt(total2025)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-xs font-bold text-gray-800 bg-gray-100">
                    {fmt(total2026)}
                  </td>
                </tr>
              );
            })}
            {/* Linha de totais */}
            <tr className="bg-[#6B8E7B]/10 font-bold">
              <td className="px-3 py-2 text-xs text-gray-800 sticky left-0 z-10 bg-[#6B8E7B]/10" colSpan="2">
                TOTAL GERAL
              </td>
              {lojasIndices.map((lojaIdx, i) => {
                const lojaTotal2025 = familiasFiltradas.reduce((s, f) => s + (f.vendas2025[lojaIdx] || 0), 0);
                const lojaTotal2026 = familiasFiltradas.reduce((s, f) => s + (f.plano2026[lojaIdx] || 0), 0);
                return (
                  <React.Fragment key={i}>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-[11px] text-gray-700 border-l border-gray-200">
                      {fmt(lojaTotal2025)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-[11px] text-gray-800">
                      {fmt(lojaTotal2026)}
                    </td>
                  </React.Fragment>
                );
              })}
              <td className="px-2 py-2 text-right font-mono tabular-nums text-xs text-gray-700 border-l-2 border-gray-300 bg-[#6B8E7B]/20">
                {fmt(totaisGerais.total2025)}
              </td>
              <td className="px-2 py-2 text-right font-mono tabular-nums text-xs text-gray-800 bg-[#6B8E7B]/20">
                {fmt(totaisGerais.total2026)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FamilyMappingTable;
