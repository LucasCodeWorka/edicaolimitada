import fs from 'fs';
import { query } from '../server/db.js';

const refs = process.argv.slice(2);
const referencias = refs.length > 0 ? refs : ['503503', '503810'];
const startDate = process.env.START_DATE || '2025-07-01';
const endDate = process.env.END_DATE || '2025-12-31';

function csvValue(value) {
  const text = String(value ?? '');
  if (/[",\n;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeCsv(file, rows, headers) {
  const lines = [
    headers.join(';'),
    ...rows.map(row => headers.map(header => csvValue(row[header])).join(';'))
  ];
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
}

const result = await query(`
  with vendas as (
    select v.idempresa,
           max(e.empresa) as empresa,
           v.idproduto,
           sum(v.qt_liquida)::numeric as venda
    from public.mv_vendas_qtd v
    left join public."dEMPRESA" e on e.idempresa = v.idempresa
    where v.idempresa <> 1
      and v.data >= $1::date
      and v.data < ($2::date + interval '1 day')
      and f_dic_prd_nivel(v.idproduto, 'CD'::bpchar) = any($3::text[])
    group by v.idempresa, v.idproduto
    having sum(v.qt_liquida) <> 0
  )
  select f_dic_prd_nivel(v.idproduto, 'CD'::bpchar) as referencia,
         v.idproduto::text as idproduto,
         v.empresa,
         v.venda::float as venda,
         max(g.nm_produto) as produto,
         max(g.ds_cor) as cor,
         max(g.ds_tamanho) as tamanho,
         max(c20.ds_classificacao) as marca,
         max(c21.ds_classificacao) as colecao,
         max(c23.ds_classificacao) as classificacao,
         max(c24.ds_classificacao) as familia,
         max(c25.ds_classificacao) as grupo,
         max(c26.ds_classificacao) as subgrupo,
         max(c802.ds_classificacao) as continuidade
  from vendas v
  left join public.vr_prd_prdgrade g on g.cd_produto = v.idproduto
  left join public.prd_produtoclas pc20 on pc20.cd_produto = v.idproduto and pc20.cd_tipoclas = 20
  left join public.prd_classificacao c20 on c20.cd_tipoclas = pc20.cd_tipoclas and trim(c20.cd_classificacao) = trim(pc20.cd_classificacao)
  left join public.prd_produtoclas pc21 on pc21.cd_produto = v.idproduto and pc21.cd_tipoclas = 21
  left join public.prd_classificacao c21 on c21.cd_tipoclas = pc21.cd_tipoclas and trim(c21.cd_classificacao) = trim(pc21.cd_classificacao)
  left join public.prd_produtoclas pc23 on pc23.cd_produto = v.idproduto and pc23.cd_tipoclas = 23
  left join public.prd_classificacao c23 on c23.cd_tipoclas = pc23.cd_tipoclas and trim(c23.cd_classificacao) = trim(pc23.cd_classificacao)
  left join public.prd_produtoclas pc24 on pc24.cd_produto = v.idproduto and pc24.cd_tipoclas = 24
  left join public.prd_classificacao c24 on c24.cd_tipoclas = pc24.cd_tipoclas and trim(c24.cd_classificacao) = trim(pc24.cd_classificacao)
  left join public.prd_produtoclas pc25 on pc25.cd_produto = v.idproduto and pc25.cd_tipoclas = 25
  left join public.prd_classificacao c25 on c25.cd_tipoclas = pc25.cd_tipoclas and trim(c25.cd_classificacao) = trim(pc25.cd_classificacao)
  left join public.prd_produtoclas pc26 on pc26.cd_produto = v.idproduto and pc26.cd_tipoclas = 26
  left join public.prd_classificacao c26 on c26.cd_tipoclas = pc26.cd_tipoclas and trim(c26.cd_classificacao) = trim(pc26.cd_classificacao)
  left join public.prd_produtoclas pc802 on pc802.cd_produto = v.idproduto and pc802.cd_tipoclas = 802
  left join public.prd_classificacao c802 on c802.cd_tipoclas = pc802.cd_tipoclas and trim(c802.cd_classificacao) = trim(pc802.cd_classificacao)
  group by v.idproduto, v.empresa, v.venda
  order by referencia, colecao, cor, tamanho, empresa
`, [startDate, endDate, referencias]);

const rows = result.rows;
const resumoMap = new Map();
for (const row of rows) {
  const key = `${row.referencia}|${row.colecao}|${row.familia}|${row.grupo}|${row.subgrupo}|${row.continuidade}`;
  const current = resumoMap.get(key) || {
    referencia: row.referencia,
    colecao: row.colecao,
    familia: row.familia,
    grupo: row.grupo,
    subgrupo: row.subgrupo,
    continuidade: row.continuidade,
    venda: 0,
    cores: new Set(),
    tamanhos: new Set()
  };
  current.venda += Number(row.venda || 0);
  current.cores.add(row.cor);
  current.tamanhos.add(row.tamanho);
  resumoMap.set(key, current);
}

const resumo = [...resumoMap.values()].map(row => ({
  referencia: row.referencia,
  colecao: row.colecao,
  familia: row.familia,
  grupo: row.grupo,
  subgrupo: row.subgrupo,
  continuidade: row.continuidade,
  venda: row.venda,
  cores: [...row.cores].sort().join(', '),
  tamanhos: [...row.tamanhos].sort().join(', ')
})).sort((a, b) => a.referencia.localeCompare(b.referencia) || b.venda - a.venda);

writeCsv('vendas-referencias-periodo-detalhe.csv', rows, [
  'referencia', 'idproduto', 'empresa', 'venda', 'produto', 'cor', 'tamanho',
  'marca', 'colecao', 'classificacao', 'familia', 'grupo', 'subgrupo', 'continuidade'
]);
writeCsv('vendas-referencias-periodo-resumo.csv', resumo, [
  'referencia', 'colecao', 'familia', 'grupo', 'subgrupo', 'continuidade', 'venda', 'cores', 'tamanhos'
]);

console.log(JSON.stringify({
  startDate,
  endDate,
  referencias,
  linhas: rows.length,
  totalVenda: rows.reduce((sum, row) => sum + Number(row.venda || 0), 0),
  resumo
}, null, 2));
