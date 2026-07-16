import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, pool } from '../server/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const refs = ['601172', '601772', '603022', '603322', '603422'];

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

const sql = `
  with classificacoes as (
    select pc.cd_produto,
           max(c.ds_classificacao) filter (where pc.cd_tipoclas = 21) as colecao,
           max(c.ds_classificacao) filter (where pc.cd_tipoclas = 24) as familia,
           max(c.ds_classificacao) filter (where pc.cd_tipoclas = 25) as grupo,
           max(c.ds_classificacao) filter (where pc.cd_tipoclas = 26) as subgrupo,
           max(c.ds_classificacao) filter (where pc.cd_tipoclas = 802) as continuidade
    from public.prd_produtoclas pc
    join public.prd_classificacao c
      on c.cd_tipoclas = pc.cd_tipoclas
     and trim(c.cd_classificacao) = trim(pc.cd_classificacao)
    where pc.cd_tipoclas in (21, 24, 25, 26, 802)
    group by pc.cd_produto
  )
  select f_dic_prd_nivel(v.idproduto, 'CD'::bpchar) as ref,
         cl.familia,
         cl.colecao,
         cl.continuidade,
         cl.grupo,
         cl.subgrupo,
         g.ds_cor as cor,
         g.ds_tamanho as tamanho,
         e.empresa,
         extract(month from v.data)::int as mes,
         sum(v.qt_liquida)::float as venda
  from public.mv_vendas_qtd v
  left join public."dEMPRESA" e on e.idempresa = v.idempresa
  left join public.vr_prd_prdgrade g on g.cd_produto = v.idproduto
  left join classificacoes cl on cl.cd_produto = v.idproduto
  where v.idempresa <> 1
    and v.data >= date '2026-01-01'
    and v.data < date '2026-07-01'
    and f_dic_prd_nivel(v.idproduto, 'CD'::bpchar) = any($1::text[])
  group by 1,2,3,4,5,6,7,8,9,10
  having sum(v.qt_liquida) <> 0
  order by ref, cor, tamanho, empresa, mes
`;

try {
  const result = await query(sql, [refs]);
  const rows = result.rows;
  const byRef = {};
  const byRefGroup = {};
  const byRefSize = {};

  rows.forEach((row) => {
    const venda = Number(row.venda || 0);
    byRef[row.ref] = (byRef[row.ref] || 0) + venda;

    const groupKey = `${row.ref}|${row.grupo || 'SEM INFO'}|${row.subgrupo || 'SEM INFO'}`;
    byRefGroup[groupKey] = (byRefGroup[groupKey] || 0) + venda;

    const sizeKey = `${row.ref}|${row.tamanho || 'SEM INFO'}`;
    byRefSize[sizeKey] = (byRefSize[sizeKey] || 0) + venda;
  });

  const resumoRef = refs.map(ref => ({
    ref,
    venda_2026_jan_jun: byRef[ref] || 0
  }));

  const resumoGrupo = Object.entries(byRefGroup).map(([key, venda]) => {
    const [ref, grupo, subgrupo] = key.split('|');
    return { ref, grupo, subgrupo, venda };
  }).sort((a, b) => a.ref.localeCompare(b.ref) || b.venda - a.venda);

  const resumoTamanho = Object.entries(byRefSize).map(([key, venda]) => {
    const [ref, tamanho] = key.split('|');
    return { ref, tamanho, venda };
  }).sort((a, b) => a.ref.localeCompare(b.ref) || String(a.tamanho).localeCompare(String(b.tamanho), undefined, { numeric: true }));

  writeCsv('vendas-2026-rendas-detalhe.csv', rows, [
    'ref',
    'familia',
    'colecao',
    'continuidade',
    'grupo',
    'subgrupo',
    'cor',
    'tamanho',
    'empresa',
    'mes',
    'venda'
  ]);
  writeCsv('vendas-2026-rendas-resumo-ref.csv', resumoRef, ['ref', 'venda_2026_jan_jun']);
  writeCsv('vendas-2026-rendas-resumo-grupo.csv', resumoGrupo, ['ref', 'grupo', 'subgrupo', 'venda']);
  writeCsv('vendas-2026-rendas-resumo-tamanho.csv', resumoTamanho, ['ref', 'tamanho', 'venda']);

  console.log(JSON.stringify({
    periodo: '2026-01-01 a 2026-06-30',
    refs,
    linhas: rows.length,
    total: rows.reduce((sum, row) => sum + Number(row.venda || 0), 0),
    resumoRef,
    arquivos: [
      'vendas-2026-rendas-detalhe.csv',
      'vendas-2026-rendas-resumo-ref.csv',
      'vendas-2026-rendas-resumo-grupo.csv',
      'vendas-2026-rendas-resumo-tamanho.csv'
    ]
  }, null, 2));
} finally {
  await pool.end().catch(() => {});
}
