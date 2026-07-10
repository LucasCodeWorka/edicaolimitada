import pg from 'pg';

const { Client } = pg;

const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000
});

const queries = {
  tiposClassificacao: `
    select cd_tipoclas::text as tipo, count(*)::int as total,
           string_agg(ds_classificacao, ' | ' order by ds_classificacao) as exemplos
    from (
      select cd_tipoclas, ds_classificacao,
             row_number() over (partition by cd_tipoclas order by ds_classificacao) as rn
      from public.prd_classificacao
    ) x
    where rn <= 8
    group by cd_tipoclas
    order by cd_tipoclas
  `,
  produtoClasExemplo: `
    select pc.cd_produto::text, pc.cd_tipoclas::text as tipo,
           trim(pc.cd_classificacao) as cd_classificacao,
           c.ds_classificacao
    from public.prd_produtoclas pc
    join public.prd_classificacao c
      on c.cd_tipoclas = pc.cd_tipoclas
     and trim(c.cd_classificacao) = trim(pc.cd_classificacao)
    where pc.cd_produto in (select cd_produto from public.vr_prd_prdgrade limit 20)
    order by pc.cd_produto, pc.cd_tipoclas
    limit 200
  `,
  vendasSample: `
    select idempresa::text, data, idproduto::text, qt_liquida
    from public.vr_vendas_qtd
    limit 20
  `,
  empresasSample: `
    select idempresa::text, empresa, suplojas, area, cidade, estado
    from public."dEMPRESA"
    order by empresa
    limit 50
  `,
  tabelasPlanejamento: `
    select table_schema, table_name
    from information_schema.tables
    where table_schema = 'public'
      and (
        table_name ilike '%plano%'
        or table_name ilike '%projec%'
        or table_name ilike '%edicao%'
        or table_name ilike '%limit%'
        or table_name ilike '%percent%'
        or table_name ilike '%depara%'
        or table_name ilike '%de_para%'
        or table_name ilike '%familia%'
        or table_name ilike '%produto%'
        or table_name ilike '%venda%'
      )
    order by table_name
  `,
  procurarVendasQtd: `
    select schemaname as table_schema, matviewname as table_name, 'materialized_view' as tipo
    from pg_matviews
    where matviewname ilike '%vendas%qtd%'
    union all
    select table_schema, table_name, table_type as tipo
    from information_schema.tables
    where table_name ilike '%vendas%qtd%'
    order by table_name
  `,
  mvVendasQtdInfo: `
    select min(data) as min_data,
           max(data) as max_data,
           count(*)::int as linhas
    from public.mv_vendas_qtd
  `,
  mvVendasQtdSample: `
    select *
    from public.mv_vendas_qtd
    limit 10
  `,
  empresasResumo: `
    select idempresa::text, empresa, suplojas, area, cidade, estado
    from public."dEMPRESA"
    where idempresa <> 1
    order by empresa
  `,
  continuidadeResumo: `
    select trim(pc.cd_classificacao) as codigo,
           cl.ds_classificacao as continuidade,
           count(*)::int as produtos
    from public.prd_produtoclas pc
    join public.prd_classificacao cl
      on cl.cd_tipoclas = pc.cd_tipoclas
     and trim(cl.cd_classificacao) = trim(pc.cd_classificacao)
    where pc.cd_tipoclas = 802
    group by 1, 2
    order by produtos desc
  `,
  continuidadeEdicaoLimitada: `
    select g.cd_produto::text as idproduto,
           g.nm_produto,
           trim(pc.cd_classificacao) as cd_continuidade,
           cl.ds_classificacao as continuidade
    from public.vr_prd_prdgrade g
    join public.prd_produtoclas pc
      on pc.cd_produto = g.cd_produto
     and pc.cd_tipoclas = 802
    join public.prd_classificacao cl
      on cl.cd_tipoclas = pc.cd_tipoclas
     and trim(cl.cd_classificacao) = trim(pc.cd_classificacao)
    where cl.ds_classificacao ilike '%EDICAO%'
    limit 20
  `,
  vendaVerao26EdicaoLimitada2Sem: `
    with produtos as (
      select pc21.cd_produto
      from public.prd_produtoclas pc21
      join public.prd_classificacao c21
        on c21.cd_tipoclas = pc21.cd_tipoclas
       and trim(c21.cd_classificacao) = trim(pc21.cd_classificacao)
      join public.prd_produtoclas pc802
        on pc802.cd_produto = pc21.cd_produto
       and pc802.cd_tipoclas = 802
      join public.prd_classificacao c802
        on c802.cd_tipoclas = pc802.cd_tipoclas
       and trim(c802.cd_classificacao) = trim(pc802.cd_classificacao)
      where pc21.cd_tipoclas = 21
        and c21.ds_classificacao = 'VERAO 26'
        and c802.ds_classificacao = 'EDICAO LIMITADA'
    )
    select 'VERAO 26' as colecao,
           'EDICAO LIMITADA' as continuidade,
           count(distinct v.idproduto)::int as produtos_com_venda,
           count(*)::int as linhas_venda,
           sum(v.qt_liquida)::float as venda
    from public.vr_vendas_qtd v
    join produtos p on p.cd_produto = v.idproduto
    where v.idempresa <> 1
      and v.data >= date '2025-07-01'
      and v.data < date '2026-01-01'
  `
};

const name = process.argv[2];
if (!queries[name]) {
  console.error(`Consulta invalida. Use: ${Object.keys(queries).join(', ')}`);
  process.exit(1);
}

try {
  await client.connect();
  const result = await client.query(queries[name]);
  console.log(JSON.stringify(result.rows, null, 2));
} finally {
  await client.end().catch(() => {});
}
