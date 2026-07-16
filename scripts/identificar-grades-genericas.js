import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildComparativoDetalhadoRows } from '../src/utils/exportExcel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const inputPath = path.join(projectRoot, 'dados_reais.json');

const lojas = [
  'BARRA',
  'DOM LUIS',
  'ECOMMERCE',
  'IGUATEMI',
  'INTIMATES',
  'MARAPONGA',
  'MORUMBI',
  'NORTH',
  'NORTH JOQUEI',
  'PARANGABA',
  'PORTO ALEGRE',
  'RIO MAR',
  'RIO MAR RECIFE',
  'RIOMAR KENNEDY',
  'SALVADOR',
  'TABOSA'
];

function csvEscape(value) {
  const text = String(value ?? '');
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filename, rows, columns) {
  const content = [
    columns.join(';'),
    ...rows.map(row => columns.map(column => csvEscape(row[column])).join(';'))
  ].join('\n');

  fs.writeFileSync(path.join(projectRoot, filename), content, 'utf8');
}

function sortSizes(tamanhos) {
  return [...new Set(tamanhos.map(String))]
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
}

function findSkuLevelSuspects(planoRows) {
  const groups = new Map();

  planoRows.forEach((row) => {
    const key = [row.familia, row.ref, row.cor].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  const suspects = [];
  groups.forEach((items, key) => {
    const byValue = new Map();

    items.forEach((row) => {
      const value = Number(row.plano || 0);
      if (value <= 0) return;
      if (!byValue.has(value)) byValue.set(value, []);
      byValue.get(value).push(row.tam);
    });

    byValue.forEach((tamanhos, value) => {
      const uniqueSizes = sortSizes(tamanhos);
      if (uniqueSizes.length < 3) return;
      const [familia, ref, cor] = key.split('|');
      suspects.push({
        familia,
        ref,
        cor,
        loja: '',
        valor: value,
        qtd_tamanhos: uniqueSizes.length,
        tamanhos: uniqueSizes.join(',')
      });
    });
  });

  return suspects;
}

function findStoreLevelSuspects(pcpRows) {
  const groups = new Map();
  const sample = pcpRows[0] || {};
  const familiaKey = Object.keys(sample).find(key => key.startsWith('Fam'));
  const referenciaKey = Object.keys(sample).find(key => key.startsWith('Refer'));

  pcpRows.forEach((row) => {
    const key = [row[familiaKey], row[referenciaKey], row.Cor].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  const suspects = [];
  groups.forEach((items, key) => {
    lojas.forEach((loja) => {
      const byValue = new Map();

      items.forEach((row) => {
        const value = Number(row[loja] || 0);
        if (value <= 0) return;
        if (!byValue.has(value)) byValue.set(value, []);
        byValue.get(value).push(row.Tamanho);
      });

      byValue.forEach((tamanhos, value) => {
        const uniqueSizes = sortSizes(tamanhos);
        if (uniqueSizes.length < 3) return;
        const [familia, ref, cor] = key.split('|');
        suspects.push({
          familia,
          ref,
          cor,
          loja,
          valor: value,
          qtd_tamanhos: uniqueSizes.length,
          tamanhos: uniqueSizes.join(',')
        });
      });
    });
  });

  return suspects;
}

function sortSuspects(a, b) {
  return a.familia.localeCompare(b.familia)
    || a.ref.localeCompare(b.ref)
    || a.cor.localeCompare(b.cor)
    || a.loja.localeCompare(b.loja)
    || b.qtd_tamanhos - a.qtd_tamanhos;
}

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const planoRows = data.planoEdicaoLimitadaData || [];
const pcpRows = buildComparativoDetalhadoRows(planoRows, data.comparativoLojasData || {});

const skuSuspects = findSkuLevelSuspects(planoRows).sort(sortSuspects);
const storeSuspects = findStoreLevelSuspects(pcpRows).sort(sortSuspects);
const columns = ['familia', 'ref', 'cor', 'loja', 'valor', 'qtd_tamanhos', 'tamanhos'];

writeCsv('grades-genericas-sku.csv', skuSuspects, columns);
writeCsv('grades-genericas-loja.csv', storeSuspects, columns);

console.log(`SKU suspects: ${skuSuspects.length}`);
console.log(`Store suspects: ${storeSuspects.length}`);
console.log('Generated: grades-genericas-sku.csv');
console.log('Generated: grades-genericas-loja.csv');
