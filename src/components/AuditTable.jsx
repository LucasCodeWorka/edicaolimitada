import React, { useState, useMemo } from 'react';
import { hasFilterValue, matchesFilterValue } from '../utils/filterUtils';

/**
 * Tabela de Conferência/Auditoria
 * Mostra memória de cálculo completa: Família, REF, Cor, Tam, Venda Base 2025, Plano 2026
 */
const AuditTable = ({ data = [], filters = {} }) => {
  const [sortConfig, setSortConfig] = useState({ key: 'plano', direction: 'desc' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailFocus, setDetailFocus] = useState('base');

  const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  const parsePercent = (value) => {
    if (!value || value === '-') return null;
    const text = String(value).trim();
    if (text.includes('/')) {
      const [num, den] = text.split('/').map(part => Number(part.replace(',', '.')));
      return Number.isFinite(num) && Number.isFinite(den) && den !== 0 ? num / den : null;
    }
    const parsed = Number(text.replace('%', '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed / 100 : null;
  };

  const getClassification = (item) => {
    const familia = String(item.familia || '').toUpperCase();
    const familiaHist = item.familiaHist || item.familia || '-';

    const special = {
      'LOVE APPEAL': {
        tipo: 'Base especial',
        criterio: 'familia com base propria fora do de-para padrao',
        origem: 'vendas do 1o semestre de 2026 da propria familia LOVE APPEAL',
      },
      'NOIVAS': {
        tipo: 'Base especial',
        criterio: 'familia com base propria fora do de-para padrao',
        origem: 'vendas do 1o semestre de 2026 da propria familia NOIVAS',
      },
      'LACE': {
        tipo: 'Base especial',
        criterio: 'familia com base manual',
        origem: 'base manual cadastrada para LACE',
      },
      'CONFORT VANILLA': {
        tipo: 'Base especial',
        criterio: 'produtos com classificacao CONFORT na dproduto, usando a venda da cor BRANCO convertida para VANILINA',
        origem: 'branco-confort.csv: 4.855 un de BRANCO, convertido para plano de 2 meses (2/6 = 1.618 un)',
      },
      'PORTELLE': {
        tipo: 'Regra especial',
        criterio: 'familia de maior valor com limite manual de plano',
        origem: 'historico de MARINE reduzido proporcionalmente para 400 pecas',
      },
    };

    if (special[familia]) {
      return special[familia];
    }

    if (item.temDepara === 'SIM' && familiaHist !== item.familia) {
      return {
        tipo: 'De-para',
        criterio: 'familia nova sem historico direto suficiente',
        origem: `historico da familia ${familiaHist}`,
      };
    }

    return {
      tipo: 'Continuidade',
      criterio: 'familia mantida com historico proprio',
      origem: `historico da propria familia ${item.familia}`,
    };
  };

  const getMemory = (item) => {
    const vendaBase = Number(item.vendaBase) || 0;
    const perc = parsePercent(item.percCor);
    const esperado = perc === null ? null : Math.round(vendaBase * perc);
    const diferenca = esperado === null ? null : (Number(item.plano || 0) - esperado);

    return {
      vendaBase,
      perc,
      esperado,
      diferenca,
      classification: getClassification(item),
      percentRule: item.temPercentual === 'SIM'
        ? 'Classificacao do percentual: percentual configurado. A cor deste SKU tem uma participacao definida na configuracao da familia/referencia.'
        : 'Classificacao do percentual: percentual padrao. Como nao existe percentual especifico configurado, foi usada a divisao padrao entre as cores disponiveis.',
      deparaRule: item.temDepara === 'SIM'
        ? `De-para ativo: base historica lida em ${item.familiaHist || item.familia}.`
        : 'Sem de-para: base lida diretamente na familia atual.',
    };
  };

  // Filtrar dados
  const dadosFiltrados = useMemo(() => {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return [];
    }
    let resultado = [...data];

    // Filtro por família
    if (hasFilterValue(filters.familia)) {
      resultado = resultado.filter(item => matchesFilterValue(item.familia, filters.familia));
    }

    // Filtro por linha
    if (hasFilterValue(filters.linha)) {
      resultado = resultado.filter(item => matchesFilterValue(item.linha, filters.linha));
    }

    // Filtro por grupo
    if (hasFilterValue(filters.grupo)) {
      resultado = resultado.filter(item => matchesFilterValue(item.grupo, filters.grupo));
    }

    if (hasFilterValue(filters.referencia)) {
      resultado = resultado.filter(item => matchesFilterValue(item.ref, filters.referencia, 'includes'));
    }

    // Filtro por busca
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      resultado = resultado.filter(item =>
        item.familia.toLowerCase().includes(term) ||
        item.ref.toLowerCase().includes(term) ||
        item.cor.toLowerCase().includes(term) ||
        item.familiaHist.toLowerCase().includes(term)
      );
    }

    return resultado;
  }, [data, filters, searchTerm]);

  // Ordenar dados
  const dadosOrdenados = useMemo(() => {
    const sorted = [...dadosFiltrados];
    sorted.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      // Tratar números
      if (sortConfig.key === 'plano' || sortConfig.key === 'vendaBase') {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [dadosFiltrados, sortConfig]);

  // Totais
  const totais = useMemo(() => {
    const totalPlano = dadosFiltrados.reduce((s, i) => s + i.plano, 0);
    const totalVendaBase = dadosFiltrados.reduce((s, i) => s + (i.vendaBase || 0), 0);
    return { totalPlano, totalVendaBase };
  }, [dadosFiltrados]);

  // Handler de ordenação
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Ícone de ordenação
  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-600 ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-[#B3838C] px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Conferência / Memória de Cálculo</h3>
            <p className="text-[10px] text-white/80">
              {dadosFiltrados.length} SKUs | Venda Base: {totais.totalVendaBase.toLocaleString('pt-BR')} | Plano 2026: {totais.totalPlano.toLocaleString('pt-BR')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-2 py-1 text-xs rounded border border-white/30 bg-white/10 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-white/50 w-40"
            />
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div className="bg-gray-50 px-4 py-2 border-b text-[10px] text-gray-600">
        <span className="font-semibold">Legenda:</span>
        <span className="ml-2">Venda Base = histórico usado para projeção |</span>
        <span className="ml-1">% Cor = percentual aplicado por cor |</span>
        <span className="ml-1">Família Hist = família usada no de-para</span>
      </div>

      {/* Tabela */}
      <div className="overflow-auto max-h-[60vh]">
        <table className="min-w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-gray-100">
            <tr>
              <th
                onClick={() => handleSort('familia')}
                className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 cursor-pointer hover:bg-gray-200 whitespace-nowrap"
              >
                Família <SortIcon columnKey="familia" />
              </th>
              <th
                onClick={() => handleSort('familiaHist')}
                className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 cursor-pointer hover:bg-gray-200 whitespace-nowrap"
              >
                Fam. Histórica <SortIcon columnKey="familiaHist" />
              </th>
              <th
                onClick={() => handleSort('ref')}
                className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 cursor-pointer hover:bg-gray-200 whitespace-nowrap"
              >
                REF <SortIcon columnKey="ref" />
              </th>
              <th
                onClick={() => handleSort('grupo')}
                className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 cursor-pointer hover:bg-gray-200 whitespace-nowrap"
              >
                Grupo <SortIcon columnKey="grupo" />
              </th>
              <th
                onClick={() => handleSort('subgrupo')}
                className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 cursor-pointer hover:bg-gray-200 whitespace-nowrap"
              >
                Subgrupo <SortIcon columnKey="subgrupo" />
              </th>
              <th
                onClick={() => handleSort('cor')}
                className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 cursor-pointer hover:bg-gray-200 whitespace-nowrap"
              >
                Cor <SortIcon columnKey="cor" />
              </th>
              <th
                onClick={() => handleSort('tam')}
                className="px-2 py-2 text-center text-[10px] font-semibold text-gray-600 cursor-pointer hover:bg-gray-200 whitespace-nowrap"
              >
                Tam <SortIcon columnKey="tam" />
              </th>
              <th
                onClick={() => handleSort('vendaBase')}
                className="px-2 py-2 text-right text-[10px] font-semibold text-gray-600 cursor-pointer hover:bg-gray-200 whitespace-nowrap bg-blue-50"
              >
                Venda Base <SortIcon columnKey="vendaBase" />
              </th>
              <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-600 whitespace-nowrap bg-blue-50">
                % Cor
              </th>
              <th
                onClick={() => handleSort('plano')}
                className="px-2 py-2 text-right text-[10px] font-semibold text-gray-600 cursor-pointer hover:bg-gray-200 whitespace-nowrap bg-green-50"
              >
                Plano 2026 <SortIcon columnKey="plano" />
              </th>
              <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-600 whitespace-nowrap">
                De-Para
              </th>
              <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-600 whitespace-nowrap">
                % Config
              </th>
            </tr>
          </thead>
          <tbody>
            {dadosOrdenados.map((item, idx) => {
              const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
              const vendaBase = item.vendaBase || 0;
              const percCor = item.percCor || '-';

              // Calcular se o valor bate (vendaBase * percCor = plano)
              let calculoOk = true;
              if (vendaBase > 0 && percCor !== '-') {
                const percNum = parseFloat(percCor.replace('%', '')) / 100;
                const esperado = Math.round(vendaBase * percNum);
                calculoOk = Math.abs(esperado - item.plano) <= 1; // tolerância de 1 unidade
              }

              return (
                <tr key={idx} className={`${rowBg} hover:bg-yellow-50 transition-colors`}>
                  <td className="px-2 py-1.5 font-medium text-gray-800 whitespace-nowrap">
                    {item.familia}
                  </td>
                  <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">
                    <span className={item.familia === item.familiaHist ? 'text-gray-400 italic' : 'text-[#B3838C] font-medium'}>
                      {item.familia === item.familiaHist ? '(igual)' : item.familiaHist}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-gray-700 whitespace-nowrap">
                    {item.ref}
                  </td>
                  <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">
                    {item.grupo}
                  </td>
                  <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap text-[10px]">
                    {item.subgrupo}
                  </td>
                  <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">
                    {item.cor}
                  </td>
                  <td className="px-2 py-1.5 text-center font-mono text-gray-600 whitespace-nowrap">
                    {item.tam}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-blue-700 whitespace-nowrap bg-blue-50/50">
                    <button
                      type="button"
                      onClick={() => {
                        setDetailFocus('base');
                        setSelectedItem(item);
                      }}
                      className="underline decoration-dotted underline-offset-2 hover:text-blue-900 hover:bg-blue-100 rounded px-1"
                      title="Clique para ver a memoria de calculo da venda base"
                    >
                      {vendaBase.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-center font-mono text-gray-600 whitespace-nowrap bg-blue-50/50">
                    {percCor}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono tabular-nums font-bold whitespace-nowrap bg-green-50/50 ${calculoOk ? 'text-green-700' : 'text-orange-600'}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setDetailFocus('plano');
                        setSelectedItem(item);
                      }}
                      className="underline decoration-dotted underline-offset-2 hover:text-green-900 hover:bg-green-100 rounded px-1"
                      title="Clique para ver como o plano foi calculado"
                    >
                      {item.plano.toLocaleString('pt-BR')}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] ${item.temDepara === 'SIM' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {item.temDepara}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] ${item.temPercentual === 'SIM' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                      {item.temPercentual}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* Totais */}
          <tfoot className="sticky bottom-0 bg-gray-200">
            <tr className="font-bold">
              <td colSpan="7" className="px-2 py-2 text-right text-gray-700">
                TOTAL ({dadosFiltrados.length} SKUs):
              </td>
              <td className="px-2 py-2 text-right font-mono tabular-nums text-blue-800 bg-blue-100">
                {totais.totalVendaBase.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
              </td>
              <td className="px-2 py-2 bg-blue-100"></td>
              <td className="px-2 py-2 text-right font-mono tabular-nums text-green-800 bg-green-100">
                {totais.totalPlano.toLocaleString('pt-BR')}
              </td>
              <td colSpan="2" className="px-2 py-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Resumo por Família */}
      <div className="border-t bg-gray-50 p-3">
        <h4 className="text-xs font-semibold text-gray-700 mb-2">Resumo por Família:</h4>
        <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 text-[10px]">
          {Object.entries(
            dadosFiltrados.reduce((acc, item) => {
              if (!acc[item.familia]) {
                acc[item.familia] = { vendaBase: 0, plano: 0, familiaHist: item.familiaHist };
              }
              acc[item.familia].vendaBase += item.vendaBase || 0;
              acc[item.familia].plano += item.plano;
              return acc;
            }, {})
          )
            .sort((a, b) => b[1].plano - a[1].plano)
            .map(([familia, dados]) => (
              <div key={familia} className="bg-white rounded p-1.5 border shadow-sm">
                <div className="font-semibold text-gray-800 truncate" title={familia}>{familia}</div>
                <div className="text-gray-500">
                  <span className="text-[#B3838C]">← {dados.familiaHist !== familia ? dados.familiaHist : 'igual'}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-blue-600">V: {Math.round(dados.vendaBase).toLocaleString('pt-BR')}</span>
                  <span className="text-green-600 font-bold">P: {dados.plano.toLocaleString('pt-BR')}</span>
                </div>
              </div>
            ))}
        </div>
      </div>

      {selectedItem && (() => {
        const memory = getMemory(selectedItem);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setSelectedItem(null)}
          >
            <div
              className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#B3838C] px-4 py-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {detailFocus === 'plano' ? 'Memoria do Plano 2026' : 'Memoria da Venda Base'}
                  </h3>
                  <p className="text-[11px] text-white/80">
                    {selectedItem.familia} | REF {selectedItem.ref} | {selectedItem.cor} | Tam {selectedItem.tam}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="text-white/80 hover:text-white text-xl leading-none"
                >
                  &times;
                </button>
              </div>

              <div className="p-4 overflow-auto max-h-[calc(85vh-64px)] space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-blue-600">Venda Base</div>
                    <div className="text-lg font-bold font-mono text-blue-900">{fmt(memory.vendaBase, 2)}</div>
                  </div>
                  <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500">% Cor</div>
                    <div className="text-lg font-bold font-mono text-gray-800">{selectedItem.percCor || '-'}</div>
                  </div>
                  <div className="rounded border border-green-200 bg-green-50 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-green-600">Plano 2026</div>
                    <div className="text-lg font-bold font-mono text-green-900">{fmt(selectedItem.plano)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded border border-purple-200 bg-purple-50 px-3 py-2">
                    <div className="text-purple-600 font-semibold">Classificacao do caso</div>
                    <div className="font-bold text-purple-900 mt-0.5">{memory.classification.tipo}</div>
                  </div>
                  <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <div className="text-emerald-600 font-semibold">Origem da base</div>
                    <div className="font-bold text-emerald-900 mt-0.5">{memory.classification.origem}</div>
                  </div>
                  <div className="rounded border border-sky-200 bg-sky-50 px-3 py-2">
                    <div className="text-sky-600 font-semibold">Regra da cor</div>
                    <div className="font-bold text-sky-900 mt-0.5">{selectedItem.temPercentual === 'SIM' ? 'Percentual configurado' : 'Percentual padrao'}</div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">
                    Passo a passo da Venda Base
                  </div>
                  <div className="p-3 text-xs text-gray-700 space-y-3">
                    <div className="flex gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-800 text-white text-[10px]">1</span>
                      <p>
                        Primeiro classificamos a linha como <strong>{memory.classification.tipo}</strong>, porque {memory.classification.criterio}.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-800 text-white text-[10px]">2</span>
                      <p>
                        Com essa classificacao, a base de consulta passa a ser: <strong>{memory.classification.origem}</strong>.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-800 text-white text-[10px]">3</span>
                      <p>{memory.deparaRule}</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-700 text-white text-[10px]">=</span>
                      <p>
                        Portanto, depois de aplicar a classificacao, a origem historica e o recorte deste SKU, a <strong>Venda Base</strong> chegou em <strong>{fmt(memory.vendaBase, 2)}</strong>.
                      </p>
                    </div>
                    <p>
                      Recorte do SKU: familia <strong>{selectedItem.familia}</strong>, referencia <strong>{selectedItem.ref}</strong>, cor <strong>{selectedItem.cor}</strong>, tamanho <strong>{selectedItem.tam}</strong>, grupo <strong>{selectedItem.grupo}</strong>.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">
                    Passo a passo do Plano 2026
                  </div>
                  <div className="p-3 text-xs text-gray-700 space-y-2">
                    <div className="flex gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-800 text-white text-[10px]">1</span>
                      <p>
                        Partimos da Venda Base ja calculada: <strong>{fmt(memory.vendaBase, 2)}</strong>.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-800 text-white text-[10px]">2</span>
                      <p>{memory.percentRule}</p>
                    </div>
                    {memory.perc === null ? (
                      <p>Nao ha percentual de cor registrado para este SKU, entao a formula direta nao pode ser conferida nesta linha.</p>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-800 text-white text-[10px]">3</span>
                          <p>
                            Aplicamos o percentual da cor <strong>{selectedItem.cor}</strong>: <strong>{(memory.perc * 100).toFixed(1)}%</strong>.
                          </p>
                        </div>
                        <div className="bg-white rounded border border-gray-200 p-2 font-mono text-[11px]">
                          Plano calculado = Venda Base x % Cor<br />
                          Plano calculado = {fmt(memory.vendaBase, 2)} x {(memory.perc * 100).toFixed(1)}%<br />
                          Plano calculado = {fmt(memory.esperado)} un
                        </div>
                        <p>
                          Portanto, o plano chega em <strong>{fmt(memory.esperado)}</strong> unidade(s) antes da conferencia final. O plano gravado e <strong>{fmt(selectedItem.plano)}</strong>. A diferenca contra a formula e <strong>{fmt(memory.diferenca)}</strong> unidade(s), normalmente por arredondamento ou ajuste final do plano.
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">
                    Regras marcadas no dado
                  </div>
                  <div className="p-3 grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-gray-500">Familia atual:</span> <span className="font-semibold text-gray-800">{selectedItem.familia}</span></div>
                    <div><span className="text-gray-500">Familia historica:</span> <span className="font-semibold text-gray-800">{selectedItem.familiaHist || '-'}</span></div>
                    <div><span className="text-gray-500">Tem de-para:</span> <span className="font-semibold text-gray-800">{selectedItem.temDepara || '-'}</span></div>
                    <div><span className="text-gray-500">Tem % configurado:</span> <span className="font-semibold text-gray-800">{selectedItem.temPercentual || '-'}</span></div>
                    <div><span className="text-gray-500">Grupo:</span> <span className="font-semibold text-gray-800">{selectedItem.grupo || '-'}</span></div>
                    <div><span className="text-gray-500">Subgrupo:</span> <span className="font-semibold text-gray-800">{selectedItem.subgrupo || '-'}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default AuditTable;
