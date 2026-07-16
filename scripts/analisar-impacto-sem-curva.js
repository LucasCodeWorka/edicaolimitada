import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../server/db.js';
import {
  getCachedPlanningRows,
  getGrupoSubgrupoProdutos,
  getSpecialFamilyBaseRows
} from '../server/cacheRepository.js';
import { loadSkusVerao27 } from '../server/excelReader.js';
import { buildDashboardFromSales } from '../server/dashboardBuilder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

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

function keyOf(row) {
  return [
    row.familia,
    row.ref,
    row.cor,
    row.grupo,
    row.subgrupo
  ].join('|');
}

function summarize(rows, key) {
  const grouped = new Map();

  rows.forEach((row) => {
    const name = row[key] || 'SEM INFO';
    if (!grouped.has(name)) {
      grouped.set(name, {
        [key]: name,
        referencias: new Set(),
        skus: 0,
        plano_perdido: 0,
        venda_base_perdida: 0
      });
    }

    const item = grouped.get(name);
    item.referencias.add(row.ref);
    item.skus += 1;
    item.plano_perdido += Number(row.plano || 0);
    item.venda_base_perdida += Number(row.vendaBase || 0);
  });

  return [...grouped.values()]
    .map(item => ({
      ...item,
      referencias: item.referencias.size,
      plano_perdido: Math.round(item.plano_perdido),
      venda_base_perdida: Math.round(item.venda_base_perdida * 100) / 100
    }))
    .sort((a, b) => b.plano_perdido - a.plano_perdido || b.skus - a.skus);
}

function rowPlanKey(row) {
  return [
    row.familia,
    row.ref,
    row.cor,
    row.tam
  ].join('|');
}

function findGenericSizeSuspects(planoRows) {
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

    byValue.forEach((sizes, value) => {
      const uniqueSizes = [...new Set(sizes.map(String))].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
      if (uniqueSizes.length < 3) return;
      const [familia, ref, cor] = key.split('|');
      suspects.push({
        familia,
        ref,
        cor,
        valor: value,
        qtd_tamanhos: uniqueSizes.length,
        tamanhos: uniqueSizes.join(',')
      });
    });
  });

  return suspects;
}

function summarizePlanDiff(oldRows, newRows) {
  const oldByKey = new Map(oldRows.map(row => [rowPlanKey(row), row]));
  const newByKey = new Map(newRows.map(row => [rowPlanKey(row), row]));
  const changed = [];

  newByKey.forEach((newRow, key) => {
    const oldRow = oldByKey.get(key);
    if (!oldRow) return;

    const oldPlano = Number(oldRow.plano || 0);
    const newPlano = Number(newRow.plano || 0);
    if (oldPlano === newPlano) return;

    changed.push({
      familia: newRow.familia,
      ref: newRow.ref,
      cor: newRow.cor,
      tam: newRow.tam,
      grupo: newRow.grupo,
      subgrupo: newRow.subgrupo,
      plano_antigo: oldPlano,
      plano_novo: newPlano,
      diferenca: newPlano - oldPlano,
      matchSubgrupo: newRow.matchSubgrupo || ''
    });
  });

  return changed.sort((a, b) =>
    a.familia.localeCompare(b.familia)
    || a.ref.localeCompare(b.ref)
    || a.cor.localeCompare(b.cor)
    || String(a.tam).localeCompare(String(b.tam), undefined, { numeric: true })
  );
}

try {
  const rows = await getCachedPlanningRows();
  if (rows.length === 0) {
    console.error('Cache vazio. Execute POST /api/cache/refresh antes da analise.');
    process.exitCode = 1;
  } else {
    const skusExcel = loadSkusVerao27();
    const codProdutosPlano = skusExcel
      .map(sku => sku.codProduto)
      .filter(cod => cod && cod !== '');
    const grupoSubgrupoMap = await getGrupoSubgrupoProdutos(codProdutosPlano);
    const specialBaseRows = await getSpecialFamilyBaseRows();
    const dashboard = buildDashboardFromSales(rows, { grupoSubgrupoMap, specialBaseRows });
    const planoRows = dashboard.planoEdicaoLimitadaData || [];
    const oldDataPath = path.join(projectRoot, 'dados_reais.json');
    const oldPlanoRows = fs.existsSync(oldDataPath)
      ? JSON.parse(fs.readFileSync(oldDataPath, 'utf8')).planoEdicaoLimitadaData || []
      : [];

    const semCurva = planoRows
      .filter(row => String(row.matchSubgrupo || '').includes('SEM_CURVA'))
      .map(row => ({
        familia: row.familia,
        ref: row.ref,
        cor: row.cor,
        tam: row.tam,
        grupo: row.grupo,
        subgrupo: row.subgrupo,
        continuidade: row.continuidade,
        matchSubgrupo: row.matchSubgrupo,
        vendaBase: Number(row.vendaBase || 0),
        plano: Number(row.plano || 0)
      }));

    const refsSemCurva = new Set(semCurva.map(row => `${row.familia}|${row.ref}`));
    const refCorSemCurva = new Set(semCurva.map(row => `${row.familia}|${row.ref}|${row.cor}`));
    const totalPlanoSemCurva = semCurva.reduce((sum, row) => sum + Number(row.plano || 0), 0);
    const totalBaseSemCurva = semCurva.reduce((sum, row) => sum + Number(row.vendaBase || 0), 0);
    const laceSemCurva = semCurva.filter(row => row.familia === 'LACE');
    const laceRefs = new Set(laceSemCurva.map(row => row.ref));

    const detalhes = semCurva.sort((a, b) =>
      a.familia.localeCompare(b.familia)
      || a.ref.localeCompare(b.ref)
      || a.cor.localeCompare(b.cor)
      || String(a.tam).localeCompare(String(b.tam), undefined, { numeric: true })
    );
    const resumoFamilia = summarize(semCurva, 'familia');
    const resumoGrupo = summarize(semCurva, 'grupo');
    const oldGenericSuspects = findGenericSizeSuspects(oldPlanoRows);
    const newGenericSuspects = findGenericSizeSuspects(planoRows);
    const oldGenericLace = oldGenericSuspects.filter(row => row.familia === 'LACE');
    const newGenericLace = newGenericSuspects.filter(row => row.familia === 'LACE');
    const planDiff = summarizePlanDiff(oldPlanoRows, planoRows);
    const diffRefs = new Set(planDiff.map(row => `${row.familia}|${row.ref}`));
    const diffRefCores = new Set(planDiff.map(row => `${row.familia}|${row.ref}|${row.cor}`));
    const diffLace = planDiff.filter(row => row.familia === 'LACE');
    const diffLaceRefs = new Set(diffLace.map(row => row.ref));
    const diffByFamily = summarize(planDiff.map(row => ({
      familia: row.familia,
      ref: row.ref,
      plano: Math.abs(row.diferenca),
      vendaBase: 0
    })), 'familia');

    writeCsv('impacto-sem-curva-detalhe.csv', detalhes, [
      'familia',
      'ref',
      'cor',
      'tam',
      'grupo',
      'subgrupo',
      'continuidade',
      'matchSubgrupo',
      'vendaBase',
      'plano'
    ]);
    writeCsv('impacto-sem-curva-familia.csv', resumoFamilia, [
      'familia',
      'referencias',
      'skus',
      'plano_perdido',
      'venda_base_perdida'
    ]);
    writeCsv('impacto-sem-curva-grupo.csv', resumoGrupo, [
      'grupo',
      'referencias',
      'skus',
      'plano_perdido',
      'venda_base_perdida'
    ]);
    writeCsv('impacto-plano-diferencas.csv', planDiff, [
      'familia',
      'ref',
      'cor',
      'tam',
      'grupo',
      'subgrupo',
      'plano_antigo',
      'plano_novo',
      'diferenca',
      'matchSubgrupo'
    ]);
    writeCsv('impacto-plano-familia.csv', diffByFamily, [
      'familia',
      'referencias',
      'skus',
      'plano_perdido',
      'venda_base_perdida'
    ]);
    writeCsv('impacto-grades-genericas-antes.csv', oldGenericSuspects, [
      'familia',
      'ref',
      'cor',
      'valor',
      'qtd_tamanhos',
      'tamanhos'
    ]);
    writeCsv('impacto-grades-genericas-depois.csv', newGenericSuspects, [
      'familia',
      'ref',
      'cor',
      'valor',
      'qtd_tamanhos',
      'tamanhos'
    ]);

    const topFamilias = resumoFamilia
      .slice(0, 20)
      .map(row => `${row.familia}: refs=${row.referencias}, skus=${row.skus}, plano=${row.plano_perdido}`)
      .join('\n');

    console.log(JSON.stringify({
      cacheRows: rows.length,
      planoRows: planoRows.length,
      semCurva: {
        skus: semCurva.length,
        referencias: refsSemCurva.size,
        referenciaCores: refCorSemCurva.size,
        plano: Math.round(totalPlanoSemCurva),
        vendaBase: Math.round(totalBaseSemCurva * 100) / 100
      },
      lace: {
        skus: laceSemCurva.length,
        referencias: laceRefs.size,
        plano: Math.round(laceSemCurva.reduce((sum, row) => sum + Number(row.plano || 0), 0)),
        refs: [...laceRefs].sort()
      },
      comparacaoComArquivoAntigo: {
        linhasAntigas: oldPlanoRows.length,
        skusComPlanoAlterado: planDiff.length,
        referenciasComPlanoAlterado: diffRefs.size,
        referenciaCoresComPlanoAlterado: diffRefCores.size,
        lace: {
          skusComPlanoAlterado: diffLace.length,
          referenciasComPlanoAlterado: diffLaceRefs.size,
          refs: [...diffLaceRefs].sort()
        },
        gradesGenericasSku: {
          antes: oldGenericSuspects.length,
          depois: newGenericSuspects.length,
          laceAntes: oldGenericLace.length,
          laceDepois: newGenericLace.length
        }
      },
      arquivos: [
        'impacto-sem-curva-detalhe.csv',
        'impacto-sem-curva-familia.csv',
        'impacto-sem-curva-grupo.csv',
        'impacto-plano-diferencas.csv',
        'impacto-plano-familia.csv',
        'impacto-grades-genericas-antes.csv',
        'impacto-grades-genericas-depois.csv'
      ]
    }, null, 2));

    console.log('\nTop familias impactadas:\n' + topFamilias);
    console.log('\nTop familias com plano alterado:\n' + diffByFamily
      .slice(0, 20)
      .map(row => `${row.familia}: refs=${row.referencias}, skus=${row.skus}, soma_abs_dif=${row.plano_perdido}`)
      .join('\n'));
  }
} finally {
  await pool.end().catch(() => {});
}
