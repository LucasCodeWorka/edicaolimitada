import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Filter, RotateCcw, Search, X } from 'lucide-react';
import { getSelectedValues } from '../utils/filterUtils';

const getOptionLabel = (key, value) => {
  if (key === 'familia' && value === 'CONFORT VANILLA') {
    return 'CONFORT';
  }
  return value;
};

const emptyFilters = {
  empresa: 'TODAS',
  familia: 'TODAS',
  linha: 'TODAS',
  grupo: 'TODAS',
  continuidade: 'TODAS',
  colecao: 'TODAS',
  mes: 'TODOS',
  referencia: 'TODAS'
};

const MultiSelectFilter = ({ filterKey, label, options = [], value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = getSelectedValues(value);
  const selectedSet = new Set(selected);
  const allLabel = options[0] || (filterKey === 'mes' ? 'TODOS' : 'TODAS');

  const visibleOptions = useMemo(() => {
    const term = search.trim().toUpperCase();
    return options
      .filter(option => option !== 'TODAS' && option !== 'TODOS')
      .filter(option => !term || getOptionLabel(filterKey, option).toUpperCase().includes(term));
  }, [filterKey, options, search]);

  const toggleOption = (option) => {
    const next = selectedSet.has(option)
      ? selected.filter(item => item !== option)
      : [...selected, option];
    onChange(filterKey, next.length ? next : allLabel);
  };

  const clear = () => {
    onChange(filterKey, allLabel);
    setSearch('');
  };

  const selectAll = () => {
    const allOptions = options.filter(option => option !== 'TODAS' && option !== 'TODOS');
    onChange(filterKey, allOptions.length ? allOptions : allLabel);
  };

  const summary = selected.length === 0
    ? allLabel
    : selected.length === 1
      ? getOptionLabel(filterKey, selected[0])
      : `${selected.length} selecionados`;

  return (
    <div className="relative flex flex-col">
      <label className="text-[10px] font-semibold text-[#585858] mb-1 uppercase tracking-wide">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className="min-w-[130px] max-w-[180px] border border-gray-300 rounded px-2 py-1.5 text-xs text-[#1D1D1D] bg-white focus:outline-none focus:ring-1 focus:ring-[#B3838C] focus:border-[#B3838C] flex items-center justify-between gap-2"
        title={selected.length ? selected.map(item => getOptionLabel(filterKey, item)).join(', ') : allLabel}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown size={13} className="text-gray-500 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-64 bg-white border border-gray-200 rounded-md shadow-lg p-2">
          <div className="flex items-center gap-1.5 border border-gray-200 rounded px-2 py-1 mb-2">
            <Search size={12} className="text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar"
              className="w-full text-xs outline-none"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={clear}
                className="text-[11px] text-[#B3838C] font-semibold hover:underline"
              >
                Todas
              </button>
              <button
                type="button"
                onClick={selectAll}
                className="text-[11px] text-[#B3838C] font-semibold hover:underline"
              >
                Selecionar todas
              </button>
            </div>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={clear}
                className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700"
              >
                <X size={11} />
                Limpar
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-auto">
            {visibleOptions.map(option => (
              <button
                type="button"
                key={option}
                onClick={() => toggleOption(option)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs hover:bg-gray-50"
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                  selectedSet.has(option) ? 'bg-[#B3838C] border-[#B3838C] text-white' : 'border-gray-300'
                }`}>
                  {selectedSet.has(option) && <Check size={11} />}
                </span>
                <span className="truncate">{getOptionLabel(filterKey, option)}</span>
              </button>
            ))}
            {visibleOptions.length === 0 && (
              <div className="px-2 py-3 text-xs text-gray-500">Nenhum resultado</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const FilterBar = ({ filters, setFilters, options }) => {
  const handleChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(emptyFilters);
  };

  const filterConfigs = [
    { key: 'empresa', label: 'Empresa', options: options.empresas },
    { key: 'familia', label: 'Familia', options: options.familias },
    { key: 'linha', label: 'Linha', options: options.linhas },
    { key: 'grupo', label: 'Grupo', options: options.grupos },
    { key: 'referencia', label: 'Referencia', options: options.referencias },
    { key: 'colecao', label: 'Colecao', options: options.colecoes },
    { key: 'mes', label: 'Mes', options: options.meses },
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 pr-4 border-r border-gray-200">
          <Filter size={14} className="text-[#B3838C]" />
          <span className="text-[11px] font-semibold text-[#585858] uppercase tracking-wide">Filtros</span>
        </div>

        {filterConfigs.map(({ key, label, options: opts }) => (
          <MultiSelectFilter
            key={key}
            filterKey={key}
            label={label}
            options={opts || []}
            value={filters[key]}
            onChange={handleChange}
          />
        ))}

        <button
          onClick={resetFilters}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors ml-auto"
        >
          <RotateCcw size={12} />
          Limpar
        </button>
      </div>
    </div>
  );
};

export default FilterBar;
