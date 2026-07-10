import fs from 'fs';
import path from 'path';
import pkg from 'xlsx';
const XLSX = pkg;

let SKUS_VERAO_27 = null;

// Le o Excel verao 26.xlsx e retorna os SKUs do Verao 27
export function loadSkusVerao27() {
  if (SKUS_VERAO_27) return SKUS_VERAO_27;

  const excelPath = path.resolve(process.cwd(), 'verão 26.xlsx');

  if (!fs.existsSync(excelPath)) {
    console.warn('[excelReader] verao 26.xlsx nao encontrado em:', excelPath);
    SKUS_VERAO_27 = [];
    return SKUS_VERAO_27;
  }

  console.log('[excelReader] Lendo Excel:', excelPath);

  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Converter para JSON, pulando a primeira linha (cabecalho esta na linha 2)
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Encontrar o cabecalho (linha que tem 'FAMILIA')
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    if (rawData[i] && rawData[i].some(cell => String(cell).toUpperCase().includes('FAMILIA'))) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = rawData[headerRowIdx].map(h => String(h || '').trim());
  const dataRows = rawData.slice(headerRowIdx + 1);

  // Mapear colunas
  const colMap = {};
  headers.forEach((h, idx) => {
    const hUpper = h.toUpperCase();
    if (hUpper.includes('COLEC') || hUpper === 'COLEÇÃO') colMap.colecao = idx;
    if (hUpper === 'LINHA') colMap.linha = idx;
    if (hUpper === 'FAMILIA') colMap.familia = idx;
    if (hUpper === 'CONTINUIDADE') colMap.continuidade = idx;
    if (hUpper.includes('COD') && hUpper.includes('PRODUTO')) colMap.codProduto = idx;
    if (hUpper === 'REFERENCIA' || hUpper === 'REFERÊNCIA') colMap.referencia = idx;
    if (hUpper.includes('DESCRIC') || hUpper === 'DESCRIÇÃO') colMap.descricao = idx;
    if (hUpper === 'COR') colMap.cor = idx;
    if (hUpper === 'TAMANHO') colMap.tamanho = idx;
  });

  console.log('[excelReader] Colunas mapeadas:', colMap);

  SKUS_VERAO_27 = dataRows
    .filter(row => row && row.length > 0 && row[colMap.familia])
    .map(row => ({
      colecao: String(row[colMap.colecao] || 'VERAO 26/27').trim(),
      linha: String(row[colMap.linha] || '').trim().toUpperCase(),
      familia: String(row[colMap.familia] || '').trim().toUpperCase(),
      continuidade: String(row[colMap.continuidade] || '').trim().toUpperCase(),
      codProduto: String(row[colMap.codProduto] || '').trim(),
      referencia: String(row[colMap.referencia] || '').trim(),
      descricao: String(row[colMap.descricao] || '').trim(),
      cor: String(row[colMap.cor] || '').trim().toUpperCase(),
      tamanho: String(row[colMap.tamanho] || '').trim().toUpperCase()
    }));

  console.log('[excelReader] SKUs carregados:', SKUS_VERAO_27.length);

  return SKUS_VERAO_27;
}

// Agrupa SKUs por familia
export function getSkusPorFamilia() {
  const skus = loadSkusVerao27();
  const byFamilia = {};

  for (const sku of skus) {
    if (!byFamilia[sku.familia]) {
      byFamilia[sku.familia] = [];
    }
    byFamilia[sku.familia].push(sku);
  }

  return byFamilia;
}

// Retorna lista de familias unicas
export function getFamiliasVerao27() {
  const skus = loadSkusVerao27();
  return [...new Set(skus.map(s => s.familia))].sort();
}

// Retorna resumo por familia e continuidade
export function getResumoFamilias() {
  const skus = loadSkusVerao27();
  const resumo = {};

  for (const sku of skus) {
    const key = sku.familia;
    if (!resumo[key]) {
      resumo[key] = {
        familia: sku.familia,
        linha: sku.linha,
        totalSkus: 0,
        continuidades: {}
      };
    }
    resumo[key].totalSkus++;
    resumo[key].continuidades[sku.continuidade] = (resumo[key].continuidades[sku.continuidade] || 0) + 1;
  }

  return Object.values(resumo).sort((a, b) => b.totalSkus - a.totalSkus);
}

// Limpa cache (util para recarregar)
export function clearCache() {
  SKUS_VERAO_27 = null;
}
