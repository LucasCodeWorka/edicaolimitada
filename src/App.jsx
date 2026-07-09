import React, { useState, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import KpiCard from './components/KpiCard';
import FilterBar from './components/FilterBar';
import HorizontalBarChart from './components/HorizontalBarChart';
import MonthlyProductionChart from './components/MonthlyProductionChart';
import ComparativeMatrix from './components/ComparativeMatrix';
import RulesModal from './components/RulesModal';
import FamilyMappingTable from './components/FamilyMappingTable';
import AuditTable from './components/AuditTable';
import {
  filterOptions,
  kpiData,
  mesProducaoData,
  planoEdicaoLimitadaData,
  comparativoLojasData,
  mapeamentoFamiliasData,
  grupoData2025,
  familiaData2025,
  linhaData2025,
  subgrupoData2025,
  refData2025
} from '../data';

// Mapeamento de Família para Linha (baseado nos dados do CSV)
const FAMILIA_LINHA_MAP = {
  'AFTER SUN': 'FASHION',
  'AQUALUME': 'LUXE',
  'BLOOM': 'FASHION',
  'CETIM': 'LOUNGEWEAR',
  'CONFORT VANILLA': 'FASHION',  // Adicionado - base cor Branco CONFORT
  'FLOR DO OCEANO': 'LUXE',
  'KISS ME': 'FASHION',
  'KISS ME PLUS': 'FASHION',
  'LACE': 'LOUNGEWEAR',
  'LOVE APPEAL': 'LUXE',
  'LOVELY': 'FASHION',
  'NOIVAS': 'LUXE',
  'PORTELLE': 'LUXE',
  'VISCOW': 'LOUNGEWEAR',
  'WISHES': 'FASHION'
};

// Formatador de números
const fmt = (v, dec = 0) => Number(v || 0).toLocaleString('pt-BR', {
  minimumFractionDigits: dec,
  maximumFractionDigits: dec,
});

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [fontSize, setFontSize] = useState(100);
  const [filters, setFilters] = useState({
    empresa: 'TODAS',
    familia: 'TODAS',
    linha: 'TODAS',
    grupo: 'TODAS',
    continuidade: 'TODAS',
    colecao: 'TODAS',
    mes: 'TODOS',
    referencia: 'TODAS'
  });

  // Filtrar os dados do plano baseado nos filtros selecionados
  const dadosFiltrados = useMemo(() => {
    let dados = [...planoEdicaoLimitadaData];

    // Filtrar por família
    if (filters.familia !== 'TODAS') {
      dados = dados.filter(item => item.familia === filters.familia);
    }

    // Filtrar por grupo
    if (filters.grupo !== 'TODAS') {
      dados = dados.filter(item => item.grupo === filters.grupo);
    }

    // Filtrar por coleção
    if (filters.colecao !== 'TODAS') {
      dados = dados.filter(item => item.colecao === filters.colecao);
    }

    // Filtrar por linha (usando mapeamento família→linha)
    if (filters.linha !== 'TODAS') {
      dados = dados.filter(item => {
        const linhaDoItem = FAMILIA_LINHA_MAP[item.familia] || '';
        return linhaDoItem === filters.linha;
      });
    }

    // Filtrar por referência
    if (filters.referencia !== 'TODAS') {
      dados = dados.filter(item => item.ref && item.ref.includes(filters.referencia));
    }

    return dados;
  }, [filters]);

  // Calcular KPIs baseado nos dados filtrados
  const kpiFiltrado = useMemo(() => {
    const totalPlano = dadosFiltrados.reduce((sum, item) => sum + (item.plano || 0), 0);

    // Se não há filtros ativos, usa os dados originais
    const isFiltered = filters.familia !== 'TODAS' ||
                       filters.grupo !== 'TODAS' ||
                       filters.colecao !== 'TODAS' ||
                       filters.linha !== 'TODAS' ||
                       filters.referencia !== 'TODAS';

    if (!isFiltered) {
      return kpiData;
    }

    // Estimativa proporcional da venda 2025 baseada no filtro
    const proporcao = totalPlano / kpiData.plano2026;
    const vendaEstimada = Math.round(kpiData.venda2025 * proporcao);

    return {
      plano2026: totalPlano,
      venda2025: vendaEstimada
    };
  }, [dadosFiltrados, filters]);

  // Calcular dados agregados baseado nos dados filtrados
  const dadosAgregados = useMemo(() => {
    // Agrupar por grupo
    const porGrupo = dadosFiltrados.reduce((acc, item) => {
      const key = (item.grupo && item.grupo.trim()) || 'OUTROS';
      if (!acc[key]) acc[key] = 0;
      acc[key] += item.plano || 0;
      return acc;
    }, {});
    const grupoAgg = Object.entries(porGrupo)
      .filter(([nome]) => nome && nome.trim())
      .map(([nome, valor]) => ({ nome: nome.trim(), valor }))
      .sort((a, b) => b.valor - a.valor);

    // Agrupar por família
    const porFamilia = dadosFiltrados.reduce((acc, item) => {
      const key = (item.familia && item.familia.trim()) || 'OUTROS';
      if (!acc[key]) acc[key] = 0;
      acc[key] += item.plano || 0;
      return acc;
    }, {});
    const familiaAgg = Object.entries(porFamilia)
      .filter(([nome]) => nome && nome.trim())
      .map(([nome, valor]) => ({ nome: nome.trim(), valor }))
      .sort((a, b) => b.valor - a.valor);

    // Agrupar por referência
    const porRef = dadosFiltrados.reduce((acc, item) => {
      const key = (item.ref && item.ref.trim()) || 'OUTROS';
      if (!acc[key]) acc[key] = 0;
      acc[key] += item.plano || 0;
      return acc;
    }, {});
    const refAgg = Object.entries(porRef)
      .filter(([nome]) => nome && nome.trim())
      .map(([nome, valor]) => ({ nome: nome.trim(), valor }))
      .sort((a, b) => b.valor - a.valor);

    // Agrupar por linha (usando mapeamento família→linha)
    const porLinha = dadosFiltrados.reduce((acc, item) => {
      const key = FAMILIA_LINHA_MAP[item.familia] || 'OUTROS';
      if (!acc[key]) acc[key] = 0;
      acc[key] += item.plano || 0;
      return acc;
    }, {});
    const linhaAgg = Object.entries(porLinha)
      .filter(([nome]) => nome && nome.trim())
      .map(([nome, valor]) => ({ nome: nome.trim(), valor }))
      .sort((a, b) => b.valor - a.valor);

    // Agrupar por subgrupo
    const porSubgrupo = dadosFiltrados.reduce((acc, item) => {
      const key = (item.subgrupo && item.subgrupo.trim()) || 'OUTROS';
      if (!acc[key]) acc[key] = 0;
      acc[key] += item.plano || 0;
      return acc;
    }, {});
    const subgrupoAgg = Object.entries(porSubgrupo)
      .filter(([nome]) => nome && nome.trim())
      .map(([nome, valor]) => ({ nome: nome.trim(), valor }))
      .sort((a, b) => b.valor - a.valor);

    return { grupoAgg, familiaAgg, refAgg, linhaAgg, subgrupoAgg };
  }, [dadosFiltrados]);

  // Usar valores originais (sem redução - plano definido pelo Cairo)
  const dadosAjustados = useMemo(() => {
    const venda2025 = kpiFiltrado.venda2025;
    const plano2026Original = kpiFiltrado.plano2026;

    // SEM redução - usar valores originais do plano
    const plano2026Ajustado = plano2026Original;
    const fatorReducao = 1;

    const ajustarValor = (valor) => Math.round(valor * fatorReducao);

    return {
      kpiAjustado: {
        plano2026: plano2026Ajustado,
        venda2025: venda2025,
        plano2026Original: plano2026Original
      },
      grupoAjustado: dadosAgregados.grupoAgg.map(item => ({
        ...item,
        valor: ajustarValor(item.valor)
      })),
      familiaAjustado: dadosAgregados.familiaAgg.map(item => ({
        ...item,
        valor: ajustarValor(item.valor)
      })),
      linhaAjustado: dadosAgregados.linhaAgg.map(item => ({
        ...item,
        valor: ajustarValor(item.valor)
      })),
      refAjustado: dadosAgregados.refAgg.map(item => ({
        ...item,
        valor: ajustarValor(item.valor)
      })),
      subgrupoAjustado: dadosAgregados.subgrupoAgg.map(item => ({
        ...item,
        valor: ajustarValor(item.valor)
      })),
      mesAjustado: mesProducaoData.map(item => ({
        ...item,
        valor: ajustarValor(item.valor)
      })),
      planoAjustado: dadosFiltrados.map(item => ({
        ...item,
        plano: ajustarValor(item.plano)
      })),
      fatorReducao,
      aumentoOriginal: venda2025 > 0 ? ((plano2026Original - venda2025) / venda2025 * 100).toFixed(1) : '0.0',
      aumentoAjustado: venda2025 > 0 ? ((plano2026Ajustado - venda2025) / venda2025 * 100).toFixed(1) : '0.0'
    };
  }, [kpiFiltrado, dadosAgregados, dadosFiltrados]);

  // Verificar se há filtros ativos
  const hasActiveFilters = filters.familia !== 'TODAS' ||
                           filters.grupo !== 'TODAS' ||
                           filters.colecao !== 'TODAS' ||
                           filters.linha !== 'TODAS' ||
                           filters.referencia !== 'TODAS' ||
                           filters.empresa !== 'TODAS' ||
                           filters.mes !== 'TODOS';

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        zoom={zoom}
        setZoom={setZoom}
        fontSize={fontSize}
        setFontSize={setFontSize}
      />

      {/* Main Content */}
      <div
        className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-20' : 'ml-64'}`}
        style={{
          fontSize: `${fontSize}%`,
          zoom: `${zoom}%`
        }}
      >
        {/* Header */}
        <header className="bg-[#B3838C] shadow-sm px-6 py-3 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-white">Plano de Produção</h1>
            <p className="text-xs text-white/80">Edição Limitada - Verão 2027</p>
          </div>
          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <span className="inline-flex items-center px-2.5 py-1 rounded text-[10px] font-semibold bg-sky-100 text-sky-800 border border-sky-200">
                Filtros ativos
              </span>
            )}
            {dadosAjustados.fatorReducao < 1 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                Aumento máx. 10% aplicado
              </span>
            )}
            <button
              onClick={() => setShowRulesModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white/20 text-white border border-white/30 hover:bg-white/30 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Analisar Regras
            </button>
          </div>
        </header>

        {/* Main */}
        <main className="p-6 space-y-6">
          {/* Filtros */}
          <FilterBar filters={filters} setFilters={setFilters} options={filterOptions} />

          {/* Alerta de ajuste */}
          {dadosAjustados.fatorReducao < 1 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3">
              <svg className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="text-xs text-amber-800">
                <strong>Aumento em relação a 2025:</strong> O plano original tinha aumento de <span className="font-mono">+{dadosAjustados.aumentoOriginal}%</span> sobre 2025.
                Valores ajustados para <span className="font-mono">+{dadosAjustados.aumentoAjustado}%</span> (máximo: 10%).
              </div>
            </div>
          )}

          {/* Resumo do filtro */}
          {hasActiveFilters && (
            <div className="bg-sky-50 border border-sky-200 rounded-lg px-4 py-2 flex items-center justify-between">
              <div className="text-xs text-sky-800">
                <strong>Resultado do filtro:</strong> {fmt(dadosFiltrados.length)} SKUs encontrados |
                Total plano: <span className="font-mono font-bold">{fmt(dadosAjustados.kpiAjustado.plano2026)}</span> peças
              </div>
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            <KpiCard
              label="Plano 2026"
              value={dadosAjustados.kpiAjustado.plano2026}
              type="primary"
            />
            <KpiCard
              label="Venda 2025"
              value={dadosAjustados.kpiAjustado.venda2025}
              type="default"
            />
            <KpiCard
              label="Aumento"
              value={`+${dadosAjustados.aumentoAjustado}%`}
              type="success"
              isPercentage
            />
            <KpiCard
              label="SKUs"
              value={dadosFiltrados.length}
              type="default"
            />
          </div>

          {/* Gráficos de Barras 2026 - 5 em linha */}
          <div className="grid grid-cols-5 gap-5">
            <HorizontalBarChart
              data={dadosAjustados.grupoAjustado}
              title="Por Grupo"
              subtitle="Plano 2026"
            />
            <HorizontalBarChart
              data={dadosAjustados.subgrupoAjustado}
              title="Por Subgrupo"
              subtitle="Plano 2026"
            />
            <HorizontalBarChart
              data={dadosAjustados.familiaAjustado}
              title="Por Família"
              subtitle="Plano 2026"
            />
            <HorizontalBarChart
              data={dadosAjustados.linhaAjustado}
              title="Por Linha"
              subtitle="Plano 2026"
            />
            <HorizontalBarChart
              data={dadosAjustados.refAjustado}
              title="Por Referência"
              subtitle="Plano 2026"
            />
          </div>

          {/* Gráficos de Barras 2025 - 5 em linha */}
          <div className="grid grid-cols-5 gap-5">
            <HorizontalBarChart
              data={grupoData2025}
              title="Por Grupo"
              subtitle="Venda 2025"
            />
            <HorizontalBarChart
              data={subgrupoData2025}
              title="Por Subgrupo"
              subtitle="Venda 2025"
            />
            <HorizontalBarChart
              data={familiaData2025}
              title="Por Família"
              subtitle="Venda 2025"
            />
            <HorizontalBarChart
              data={linhaData2025}
              title="Por Linha"
              subtitle="Venda 2025"
            />
            <HorizontalBarChart
              data={refData2025}
              title="Por Referência"
              subtitle="Venda 2025"
            />
          </div>

          {/* Gráfico Mensal */}
          <MonthlyProductionChart data={dadosAjustados.mesAjustado} />

          {/* Mapeamento de Famílias */}
          <FamilyMappingTable data={mapeamentoFamiliasData} filters={filters} familiaLinhaMap={FAMILIA_LINHA_MAP} />

          {/* Matriz Comparativa */}
          <ComparativeMatrix data={comparativoLojasData} filters={filters} familiaLinhaMap={FAMILIA_LINHA_MAP} />

          {/* Tabela de Conferência / Memória de Cálculo */}
          <AuditTable data={planoEdicaoLimitadaData} filters={filters} />
        </main>
      </div>

      {/* Modal de Regras */}
      <RulesModal
        isOpen={showRulesModal}
        onClose={() => setShowRulesModal(false)}
        dadosAjustados={dadosAjustados}
        kpiData={kpiData}
        filters={filters}
      />
    </div>
  );
}

export default App;
