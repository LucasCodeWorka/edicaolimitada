import React, { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Filter, Search, Target, XCircle } from 'lucide-react';

const normalize = (value, fallback = '') => String(value || fallback).trim().toUpperCase();

const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('pt-BR', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
});

const pct = (value, digits = 1) => `${fmt(Number(value || 0) * 100, digits)}%`;

const getStores = (data = []) => {
  const first = data.find(item => item.planoDistribuidoLojas);
  return first ? Object.keys(first.planoDistribuidoLojas) : [];
};

const isJoquei = (loja) => normalize(loja).includes('JOQUEI') || normalize(loja).includes('JOKEY');
const isExcludedPlusStore = (loja) => ['DOM LUIS', 'ECOMMERCE'].includes(normalize(loja)) || isJoquei(loja);
const isPlusFamily = (familia) => normalize(familia).includes('PLUS');

const getTargetSizeType = (item) => {
  const grupo = normalize(item.grupo);
  const tam = normalize(item.tam);

  if (grupo.includes('SUTIA') && ['48', '50'].includes(tam)) return 'tam_maior_sutia';
  if (grupo.includes('CALCA') && ['GG', 'XG'].includes(tam)) return 'tam_maior_calca';
  if (normalize(item.familia) === 'LOVE APPEAL' && grupo.includes('SUTIA') && ['42', '44'].includes(tam)) return 'love_appeal';
  if (normalize(item.familia) === 'LOVE APPEAL' && grupo.includes('CALCA') && ['M', 'G'].includes(tam)) return 'love_appeal';

  return '';
};

const getZeroReason = (item, loja, value) => {
  const plano = Number(item.plano || 0);
  const original = Number(item.planoOriginal ?? item.plano ?? 0);
  const familia = normalize(item.familia);
  const cor = normalize(item.cor);
  const targetType = getTargetSizeType(item);

  if (value > 0) return '-';
  if (plano <= 0 || original <= 0) return 'Plano do SKU ja esta zerado';
  if (isPlusFamily(familia) && isExcludedPlusStore(loja)) return 'Loja bloqueada para tamanhos maiores';
  if (familia === 'KISS ME' && targetType && normalize(loja) !== 'MARAPONGA') return 'Excecao KISS ME tamanho maior: somente Maraponga';
  if (familia === 'PORTELLE' && normalize(loja) === 'TABOSA') return 'PORTELLE nao envia para Tabosa';
  if (familia === 'PORTELLE' && cor !== 'PRETO' && ['DOM LUIS', 'ECOMMERCE', 'INTIMATES', 'MORUMBI', 'NORTH', 'NORTH JOQUEI', 'PARANGABA', 'RIOMAR KENNEDY', 'TABOSA'].includes(normalize(loja))) {
    return 'PORTELLE loja pequena recebe somente PRETO';
  }
  if (Number(item.vendaBase || 0) <= 0) return 'Sem base historica para este SKU';

  return 'Peso da loja baixo ou arredondamento consumiu a quantidade';
};

const groupBy = (rows, getKey) => {
  const map = new Map();
  rows.forEach(row => {
    const key = getKey(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
};

const sum = (rows, getValue) => rows.reduce((acc, row) => acc + Number(getValue(row) || 0), 0);

const PlanAnalysis = ({ data = [], historicoVendasData = [], filters = {} }) => {
  const [activeView, setActiveView] = useState('zeros');
  const [search, setSearch] = useState('');
  const [zeroReason, setZeroReason] = useState('TODOS');
  const [minConcentration, setMinConcentration] = useState(0.6);
  const lojas = useMemo(() => getStores(data), [data]);

  const filteredData = useMemo(() => {
    let rows = [...data];

    if (filters.familia && filters.familia !== 'TODAS') rows = rows.filter(item => item.familia === filters.familia);
    if (filters.grupo && filters.grupo !== 'TODAS') rows = rows.filter(item => item.grupo === filters.grupo);
    if (filters.referencia && filters.referencia !== 'TODAS') rows = rows.filter(item => String(item.ref || '').includes(filters.referencia));
    if (filters.empresa && filters.empresa !== 'TODAS') {
      rows = rows.filter(item => Number(item.planoDistribuidoLojas?.[filters.empresa] || 0) > 0);
    }

    if (search.trim()) {
      const term = normalize(search);
      rows = rows.filter(item => [item.familia, item.ref, item.cor, item.tam, item.grupo, item.subgrupo]
        .some(value => normalize(value).includes(term)));
    }

    return rows;
  }, [data, filters, search]);

  const analysis = useMemo(() => {
    const totalPlano = sum(filteredData, item => item.plano);
    const totalOriginal = sum(filteredData, item => item.planoOriginal ?? item.plano);
    const totalSkus = filteredData.length;
    const skusZerados = filteredData.filter(item => Number(item.plano || 0) <= 0);
    const zeroCells = [];

    filteredData.forEach(item => {
      lojas.forEach(loja => {
        const value = Number(item.planoDistribuidoLojas?.[loja] || 0);
        if (value !== 0) return;

        const motivo = getZeroReason(item, loja, value);
        if (zeroReason !== 'TODOS' && motivo !== zeroReason) return;

        zeroCells.push({
          familia: item.familia,
          ref: item.ref,
          cor: item.cor,
          tam: item.tam,
          grupo: item.grupo,
          subgrupo: item.subgrupo,
          loja,
          plano: Number(item.plano || 0),
          vendaBase: Number(item.vendaBase || 0),
          motivo
        });
      });
    });

    const byReason = [...groupBy(zeroCells, row => row.motivo)]
      .map(([motivo, rows]) => ({ motivo, qtd: rows.length }))
      .sort((a, b) => b.qtd - a.qtd);

    const refRows = [];
    groupBy(filteredData, item => `${item.familia}|${item.ref}`).forEach((rows, key) => {
      const lojasTotal = {};
      lojas.forEach(loja => {
        lojasTotal[loja] = sum(rows, item => item.planoDistribuidoLojas?.[loja]);
      });

      const refTotal = Object.values(lojasTotal).reduce((acc, value) => acc + Number(value || 0), 0);
      const [lojaLider, valorLider] = Object.entries(lojasTotal).sort((a, b) => b[1] - a[1])[0] || ['-', 0];
      const share = refTotal > 0 ? valorLider / refTotal : 0;
      const [familia, ref] = key.split('|');

      refRows.push({
        familia,
        ref,
        total: refTotal,
        lojaLider,
        valorLider,
        share,
        lojasZeradas: Object.values(lojasTotal).filter(value => Number(value || 0) === 0).length
      });
    });

    const concentratedRefs = refRows
      .filter(row => row.total > 0 && row.share >= minConcentration)
      .sort((a, b) => b.share - a.share || b.total - a.total);

    const sizeRows = [];
    groupBy(filteredData, item => `${item.familia}|${item.ref}`).forEach((rows, key) => {
      const planBySize = {};
      const baseBySize = {};

      rows.forEach(item => {
        const size = normalize(item.tam, 'SEM TAM');
        planBySize[size] = (planBySize[size] || 0) + Number(item.plano || 0);
        baseBySize[size] = (baseBySize[size] || 0) + Number(item.vendaBase || 0);
      });

      const totalPlan = Object.values(planBySize).reduce((acc, value) => acc + value, 0);
      const totalBase = Object.values(baseBySize).reduce((acc, value) => acc + value, 0);
      if (totalPlan <= 0 || totalBase <= 0) return;

      const sizes = Array.from(new Set([...Object.keys(planBySize), ...Object.keys(baseBySize)]));
      const details = sizes.map(size => {
        const planShare = totalPlan > 0 ? Number(planBySize[size] || 0) / totalPlan : 0;
        const baseShare = totalBase > 0 ? Number(baseBySize[size] || 0) / totalBase : 0;
        return {
          size,
          plan: Number(planBySize[size] || 0),
          base: Number(baseBySize[size] || 0),
          planShare,
          baseShare,
          delta: planShare - baseShare
        };
      }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

      const topPlan = [...details].sort((a, b) => b.planShare - a.planShare)[0];
      const topBase = [...details].sort((a, b) => b.baseShare - a.baseShare)[0];
      const maxDelta = details[0]?.delta || 0;
      const [familia, ref] = key.split('|');

      sizeRows.push({
        familia,
        ref,
        totalPlan,
        totalBase,
        topPlan,
        topBase,
        maxDelta,
        mismatch: topPlan?.size !== topBase?.size,
        details
      });
    });

    const sizeAlerts = sizeRows
      .filter(row => row.mismatch || Math.abs(row.maxDelta) >= 0.15)
      .sort((a, b) => Math.abs(b.maxDelta) - Math.abs(a.maxDelta));

    return {
      totalPlano,
      totalOriginal,
      totalSkus,
      skusZerados,
      zeroCells,
      byReason,
      refRows: refRows.sort((a, b) => b.total - a.total),
      concentratedRefs,
      sizeAlerts
    };
  }, [filteredData, lojas, minConcentration, zeroReason]);

  const reasonOptions = useMemo(() => ['TODOS', ...analysis.byReason.map(row => row.motivo)], [analysis.byReason]);

  const views = [
    { id: 'zeros', label: 'Zeros', icon: XCircle },
    { id: 'sizes', label: 'Tamanhos', icon: BarChart3 },
    { id: 'concentration', label: 'Concentracao', icon: Target },
    { id: 'refs', label: 'Referencias', icon: Filter }
  ];

  return (
    <section className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-[#585858] px-4 py-3 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Analise do Plano</h3>
          <p className="text-[10px] text-white/75">Validacao de zeros, representatividade de tamanhos e concentracao por loja</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/60" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar familia, ref, cor..."
            className="w-56 rounded border border-white/20 bg-white/10 py-1.5 pl-7 pr-2 text-[11px] text-white placeholder-white/50 outline-none focus:border-white/60"
          />
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 p-4 border-b border-gray-100 bg-gray-50">
        <Metric title="Plano final" value={fmt(analysis.totalPlano)} />
        <Metric title="SKUs analisados" value={fmt(analysis.totalSkus)} />
        <Metric title="SKUs zerados" value={fmt(analysis.skusZerados.length)} tone={analysis.skusZerados.length ? 'danger' : 'ok'} />
        <Metric title="Celulas loja zeradas" value={fmt(analysis.zeroCells.length)} tone={analysis.zeroCells.length ? 'warn' : 'ok'} />
        <Metric title="Refs concentradas" value={fmt(analysis.concentratedRefs.length)} tone={analysis.concentratedRefs.length ? 'warn' : 'ok'} />
      </div>

      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {views.map(view => {
            const Icon = view.icon;
            const active = activeView === view.id;
            return (
              <button
                key={view.id}
                onClick={() => setActiveView(view.id)}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[11px] font-semibold border transition-colors ${
                  active
                    ? 'bg-[#B3838C] text-white border-[#B3838C]'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <Icon size={13} />
                {view.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {activeView === 'zeros' && (
            <select
              value={zeroReason}
              onChange={(event) => setZeroReason(event.target.value)}
              className="rounded border border-gray-200 px-2 py-1.5 text-[11px] text-gray-700"
            >
              {reasonOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          )}

          {activeView === 'concentration' && (
            <label className="flex items-center gap-2 text-[11px] text-gray-600">
              Concentracao minima
              <select
                value={minConcentration}
                onChange={(event) => setMinConcentration(Number(event.target.value))}
                className="rounded border border-gray-200 px-2 py-1.5 text-[11px] text-gray-700"
              >
                <option value={0.5}>50%</option>
                <option value={0.6}>60%</option>
                <option value={0.7}>70%</option>
                <option value={0.8}>80%</option>
              </select>
            </label>
          )}
        </div>
      </div>

      {activeView === 'zeros' && <ZerosView rows={analysis.zeroCells} byReason={analysis.byReason} />}
      {activeView === 'sizes' && <SizesView rows={analysis.sizeAlerts} />}
      {activeView === 'concentration' && <ConcentrationView rows={analysis.concentratedRefs} />}
      {activeView === 'refs' && <RefsView rows={analysis.refRows} />}
    </section>
  );
};

const Metric = ({ title, value, tone = 'neutral' }) => {
  const toneClass = {
    neutral: 'text-gray-900 bg-white border-gray-200',
    ok: 'text-emerald-800 bg-emerald-50 border-emerald-200',
    warn: 'text-amber-800 bg-amber-50 border-amber-200',
    danger: 'text-rose-800 bg-rose-50 border-rose-200'
  }[tone];

  return (
    <div className={`rounded border px-3 py-2 ${toneClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{title}</div>
      <div className="text-lg font-bold leading-tight">{value}</div>
    </div>
  );
};

const EmptyState = ({ text }) => (
  <div className="p-8 text-center text-xs text-gray-500">{text}</div>
);

const ZerosView = ({ rows, byReason }) => (
  <div className="grid grid-cols-[280px_1fr] min-h-[360px]">
    <div className="border-r border-gray-100 p-4 bg-gray-50">
      <h4 className="text-xs font-semibold text-gray-700 mb-3">Motivos dos zeros</h4>
      <div className="space-y-2">
        {byReason.slice(0, 10).map(row => (
          <div key={row.motivo} className="flex items-center justify-between gap-3 rounded border border-gray-200 bg-white px-3 py-2">
            <span className="text-[11px] text-gray-700 leading-snug">{row.motivo}</span>
            <span className="text-xs font-bold text-gray-900">{fmt(row.qtd)}</span>
          </div>
        ))}
      </div>
    </div>
    <div className="overflow-auto max-h-[520px]">
      {rows.length === 0 ? (
        <EmptyState text="Nenhum zero encontrado para o filtro atual." />
      ) : (
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-gray-100 text-[10px] text-gray-600">
            <tr>
              <Th>Familia</Th>
              <Th>Ref</Th>
              <Th>Cor</Th>
              <Th>Tam</Th>
              <Th>Loja</Th>
              <Th align="right">Plano SKU</Th>
              <Th>Motivo</Th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 500).map((row, index) => (
              <tr key={`${row.ref}-${row.cor}-${row.tam}-${row.loja}-${index}`} className="border-t border-gray-100 hover:bg-rose-50/40">
                <Td>{row.familia}</Td>
                <Td>{row.ref}</Td>
                <Td>{row.cor}</Td>
                <Td>{row.tam}</Td>
                <Td>{row.loja}</Td>
                <Td align="right">{fmt(row.plano)}</Td>
                <Td>{row.motivo}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  </div>
);

const SizesView = ({ rows }) => (
  <div className="overflow-auto max-h-[520px]">
    {rows.length === 0 ? (
      <EmptyState text="Nenhuma divergencia relevante de tamanho encontrada." />
    ) : (
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 bg-gray-100 text-[10px] text-gray-600">
          <tr>
            <Th>Familia</Th>
            <Th>Ref</Th>
            <Th>Tam lider base</Th>
            <Th>Tam lider plano</Th>
            <Th align="right">Maior delta</Th>
            <Th>Memoria por tamanho</Th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 300).map(row => (
            <tr key={`${row.familia}-${row.ref}`} className="border-t border-gray-100 hover:bg-amber-50/50">
              <Td>{row.familia}</Td>
              <Td>{row.ref}</Td>
              <Td>{row.topBase?.size} ({pct(row.topBase?.baseShare)})</Td>
              <Td>{row.topPlan?.size} ({pct(row.topPlan?.planShare)})</Td>
              <Td align="right" className={Math.abs(row.maxDelta) >= 0.25 ? 'text-rose-700 font-semibold' : ''}>{pct(row.maxDelta)}</Td>
              <Td>
                <div className="flex flex-wrap gap-1.5">
                  {row.details.map(detail => (
                    <span key={detail.size} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700">
                      {detail.size}: base {pct(detail.baseShare, 0)} / plano {pct(detail.planShare, 0)}
                    </span>
                  ))}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

const ConcentrationView = ({ rows }) => (
  <div className="overflow-auto max-h-[520px]">
    {rows.length === 0 ? (
      <EmptyState text="Nenhuma referencia acima do limite de concentracao selecionado." />
    ) : (
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 bg-gray-100 text-[10px] text-gray-600">
          <tr>
            <Th>Familia</Th>
            <Th>Ref</Th>
            <Th align="right">Total</Th>
            <Th>Loja lider</Th>
            <Th align="right">Qtd loja lider</Th>
            <Th align="right">% na loja lider</Th>
            <Th align="right">Lojas zeradas</Th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 300).map(row => (
            <tr key={`${row.familia}-${row.ref}`} className="border-t border-gray-100 hover:bg-amber-50/50">
              <Td>{row.familia}</Td>
              <Td>{row.ref}</Td>
              <Td align="right">{fmt(row.total)}</Td>
              <Td>{row.lojaLider}</Td>
              <Td align="right">{fmt(row.valorLider)}</Td>
              <Td align="right" className="font-semibold text-amber-800">{pct(row.share)}</Td>
              <Td align="right">{fmt(row.lojasZeradas)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

const RefsView = ({ rows }) => (
  <div className="overflow-auto max-h-[520px]">
    <table className="min-w-full text-xs">
      <thead className="sticky top-0 bg-gray-100 text-[10px] text-gray-600">
        <tr>
          <Th>Familia</Th>
          <Th>Ref</Th>
          <Th align="right">Total</Th>
          <Th>Loja lider</Th>
          <Th align="right">% loja lider</Th>
          <Th align="right">Lojas zeradas</Th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 500).map(row => (
          <tr key={`${row.familia}-${row.ref}`} className="border-t border-gray-100 hover:bg-gray-50">
            <Td>{row.familia}</Td>
            <Td>{row.ref}</Td>
            <Td align="right">{fmt(row.total)}</Td>
            <Td>{row.lojaLider}</Td>
            <Td align="right">{pct(row.share)}</Td>
            <Td align="right">{fmt(row.lojasZeradas)}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Th = ({ children, align = 'left' }) => (
  <th className={`px-2 py-2 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</th>
);

const Td = ({ children, align = 'left', className = '' }) => (
  <td className={`px-2 py-1.5 text-gray-700 ${align === 'right' ? 'text-right tabular-nums' : 'text-left'} ${className}`}>{children}</td>
);

export default PlanAnalysis;
