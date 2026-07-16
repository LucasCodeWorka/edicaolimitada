export const ALL_VALUES = new Set(['TODAS', 'TODOS']);

export const normalizeFilterValue = (value) => String(value || '').trim().toUpperCase();

export const getSelectedValues = (filterValue) => {
  if (Array.isArray(filterValue)) {
    return filterValue
      .map(value => String(value || '').trim())
      .filter(value => value && !ALL_VALUES.has(normalizeFilterValue(value)));
  }

  const value = String(filterValue || '').trim();
  return value && !ALL_VALUES.has(normalizeFilterValue(value)) ? [value] : [];
};

export const hasFilterValue = (filterValue) => getSelectedValues(filterValue).length > 0;

export const matchesFilterValue = (value, filterValue, mode = 'equals') => {
  const selected = getSelectedValues(filterValue);
  if (selected.length === 0) return true;

  const valueText = normalizeFilterValue(value);
  return selected.some((selectedValue) => {
    const selectedText = normalizeFilterValue(selectedValue);
    return mode === 'includes'
      ? valueText.includes(selectedText)
      : valueText === selectedText;
  });
};
