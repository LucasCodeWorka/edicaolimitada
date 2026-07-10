import { query } from './db.js';

export const CLASSIFICATION_TYPES = {
  marca: 20,
  colecao: 21,
  classificacao: 23,
  familia: 24,
  grupo: 25,
  subgrupo: 26,
  status: 27,
  mixProducao: 29,
  continuidade: 802
};

export async function getHealth() {
  const result = await query('select now() as now');
  return result.rows[0];
}

export async function getCompanies() {
  const result = await query(`
    select idempresa::text as idempresa,
           empresa,
           suplojas,
           area,
           cidade,
           estado
    from public."dEMPRESA"
    order by empresa
  `);

  return result.rows;
}

export async function getClassificationTypes() {
  const result = await query(`
    select cd_tipoclas::int as tipo,
           count(*)::int as total,
           array_agg(ds_classificacao order by ds_classificacao) filter (where rn <= 10) as exemplos
    from (
      select cd_tipoclas, ds_classificacao,
             row_number() over (partition by cd_tipoclas order by ds_classificacao) as rn
      from public.prd_classificacao
    ) x
    group by cd_tipoclas
    order by cd_tipoclas
  `);

  return result.rows;
}

export async function getSalesSummary({ startDate, endDate, limit = 1000 } = {}) {
  if (!startDate || !endDate) {
    throw new Error('Informe startDate e endDate no formato YYYY-MM-DD.');
  }

  const result = await query(`
    with classificacoes as (
      select pc.cd_produto,
             max(trim(pc.cd_classificacao)) filter (where pc.cd_tipoclas = ${CLASSIFICATION_TYPES.marca}) as idmarca,
             max(c.ds_classificacao) filter (where pc.cd_tipoclas = ${CLASSIFICATION_TYPES.marca}) as marca,
             max(trim(pc.cd_classificacao)) filter (where pc.cd_tipoclas = ${CLASSIFICATION_TYPES.colecao}) as idcolecao,
             max(c.ds_classificacao) filter (where pc.cd_tipoclas = ${CLASSIFICATION_TYPES.colecao}) as colecao,
             max(trim(pc.cd_classificacao)) filter (where pc.cd_tipoclas = ${CLASSIFICATION_TYPES.classificacao}) as idclassificacao,
             max(c.ds_classificacao) filter (where pc.cd_tipoclas = ${CLASSIFICATION_TYPES.classificacao}) as classificacao,
             max(trim(pc.cd_classificacao)) filter (where pc.cd_tipoclas = ${CLASSIFICATION_TYPES.familia}) as idfamilia,
             max(c.ds_classificacao) filter (where pc.cd_tipoclas = ${CLASSIFICATION_TYPES.familia}) as familia,
             max(trim(pc.cd_classificacao)) filter (where pc.cd_tipoclas = ${CLASSIFICATION_TYPES.grupo}) as idgrupo,
             max(c.ds_classificacao) filter (where pc.cd_tipoclas = ${CLASSIFICATION_TYPES.grupo}) as grupo,
             max(trim(pc.cd_classificacao)) filter (where pc.cd_tipoclas = ${CLASSIFICATION_TYPES.subgrupo}) as cd_subgrupo,
             max(c.ds_classificacao) filter (where pc.cd_tipoclas = ${CLASSIFICATION_TYPES.subgrupo}) as subgrupo,
             max(trim(pc.cd_classificacao)) filter (where pc.cd_tipoclas = ${CLASSIFICATION_TYPES.status}) as idstatus,
             max(c.ds_classificacao) filter (where pc.cd_tipoclas = ${CLASSIFICATION_TYPES.status}) as status,
             max(trim(pc.cd_classificacao)) filter (where pc.cd_tipoclas = ${CLASSIFICATION_TYPES.mixProducao}) as idmixproducao,
             max(c.ds_classificacao) filter (where pc.cd_tipoclas = ${CLASSIFICATION_TYPES.mixProducao}) as mixproducao,
             max(trim(pc.cd_classificacao)) filter (where pc.cd_tipoclas = ${CLASSIFICATION_TYPES.continuidade}) as cd_continuidade,
             max(c.ds_classificacao) filter (where pc.cd_tipoclas = ${CLASSIFICATION_TYPES.continuidade}) as continuidade
      from public.prd_produtoclas pc
      join public.prd_classificacao c
        on c.cd_tipoclas = pc.cd_tipoclas
       and trim(c.cd_classificacao) = trim(pc.cd_classificacao)
      where pc.cd_tipoclas in (
        ${CLASSIFICATION_TYPES.marca},
        ${CLASSIFICATION_TYPES.colecao},
        ${CLASSIFICATION_TYPES.classificacao},
        ${CLASSIFICATION_TYPES.familia},
        ${CLASSIFICATION_TYPES.grupo},
        ${CLASSIFICATION_TYPES.subgrupo},
        ${CLASSIFICATION_TYPES.status},
        ${CLASSIFICATION_TYPES.mixProducao},
        ${CLASSIFICATION_TYPES.continuidade}
      )
      group by pc.cd_produto
    )
    select v.idempresa::text as idempresa,
           e.empresa,
           v.idproduto::text as idproduto,
           cl.idmixproducao,
           cl.mixproducao,
           cl.idmarca,
           cl.marca,
           cl.idclassificacao,
           cl.classificacao,
           cl.idcolecao,
           cl.colecao,
           cl.idfamilia,
           cl.familia,
           cl.idgrupo,
           cl.grupo,
           cl.cd_subgrupo,
           cl.subgrupo,
           cl.idstatus,
           cl.status,
           cl.cd_continuidade,
           cl.continuidade,
           f_dic_prd_nivel(v.idproduto, 'CD'::bpchar) as referencia,
           g.nm_produto as produto,
           trim(g.cd_cor) as idcor,
           g.ds_cor as cor,
           g.cd_tamanho::text as idtamanho,
           g.ds_tamanho as tamanho,
           sum(v.qt_liquida)::float as venda
    from public.mv_vendas_qtd v
    left join public."dEMPRESA" e on e.idempresa = v.idempresa
    left join public.vr_prd_prdgrade g on g.cd_produto = v.idproduto
    left join classificacoes cl on cl.cd_produto = v.idproduto
    where v.data >= $1::date
      and v.data < ($2::date + interval '1 day')
      and v.idempresa <> 1
    group by v.idempresa, e.empresa, v.idproduto, f_dic_prd_nivel(v.idproduto, 'CD'::bpchar),
             cl.idmixproducao, cl.mixproducao,
             cl.idmarca, cl.marca, cl.idclassificacao, cl.classificacao, cl.idcolecao,
             cl.colecao, cl.idfamilia, cl.familia, cl.idgrupo, cl.grupo, cl.cd_subgrupo,
             cl.subgrupo, cl.idstatus, cl.status, cl.cd_continuidade, cl.continuidade,
             g.nm_produto, g.cd_cor, g.ds_cor, g.cd_tamanho, g.ds_tamanho
    order by venda desc
    limit $3
  `, [startDate, endDate, limit]);

  return result.rows;
}

export async function getLimitedEditionSalesBase({
  startDate = '2025-07-01',
  endDate = '2025-12-31',
  colecao = 'VERAO 26',
  continuidade = 'EDICAO LIMITADA'
} = {}) {
  const productsResult = await query(`
    select pc21.cd_produto::bigint as cd_produto,
           max(trim(pc20.cd_classificacao)) as idmarca,
           max(c20.ds_classificacao) as marca,
           max(trim(pc21.cd_classificacao)) as idcolecao,
           max(c21.ds_classificacao) as colecao,
           max(trim(pc23.cd_classificacao)) as idclassificacao,
           max(c23.ds_classificacao) as classificacao,
           max(trim(pc24.cd_classificacao)) as idfamilia,
           max(c24.ds_classificacao) as familia,
           max(trim(pc25.cd_classificacao)) as idgrupo,
           max(c25.ds_classificacao) as grupo,
           max(trim(pc26.cd_classificacao)) as cd_subgrupo,
           max(c26.ds_classificacao) as subgrupo,
           max(trim(pc27.cd_classificacao)) as idstatus,
           max(c27.ds_classificacao) as status,
           max(trim(pc29.cd_classificacao)) as idmixproducao,
           max(c29.ds_classificacao) as mixproducao,
           max(trim(pc802.cd_classificacao)) as cd_continuidade,
           max(c802.ds_classificacao) as continuidade,
           f_dic_prd_nivel(pc21.cd_produto, 'CD'::bpchar) as referencia,
           max(g.nm_produto) as produto,
           max(trim(g.cd_cor)) as idcor,
           max(g.ds_cor) as cor,
           max(g.cd_tamanho::text) as idtamanho,
           max(g.ds_tamanho) as tamanho
    from public.prd_produtoclas pc21
    join public.prd_classificacao c21
      on c21.cd_tipoclas = pc21.cd_tipoclas
     and trim(c21.cd_classificacao) = trim(pc21.cd_classificacao)
    join public.prd_produtoclas pc802
      on pc802.cd_produto = pc21.cd_produto
     and pc802.cd_tipoclas = ${CLASSIFICATION_TYPES.continuidade}
    join public.prd_classificacao c802
      on c802.cd_tipoclas = pc802.cd_tipoclas
     and trim(c802.cd_classificacao) = trim(pc802.cd_classificacao)
    left join public.vr_prd_prdgrade g on g.cd_produto = pc21.cd_produto
    left join public.prd_produtoclas pc20 on pc20.cd_produto = pc21.cd_produto and pc20.cd_tipoclas = ${CLASSIFICATION_TYPES.marca}
    left join public.prd_classificacao c20 on c20.cd_tipoclas = pc20.cd_tipoclas and trim(c20.cd_classificacao) = trim(pc20.cd_classificacao)
    left join public.prd_produtoclas pc23 on pc23.cd_produto = pc21.cd_produto and pc23.cd_tipoclas = ${CLASSIFICATION_TYPES.classificacao}
    left join public.prd_classificacao c23 on c23.cd_tipoclas = pc23.cd_tipoclas and trim(c23.cd_classificacao) = trim(pc23.cd_classificacao)
    left join public.prd_produtoclas pc24 on pc24.cd_produto = pc21.cd_produto and pc24.cd_tipoclas = ${CLASSIFICATION_TYPES.familia}
    left join public.prd_classificacao c24 on c24.cd_tipoclas = pc24.cd_tipoclas and trim(c24.cd_classificacao) = trim(pc24.cd_classificacao)
    left join public.prd_produtoclas pc25 on pc25.cd_produto = pc21.cd_produto and pc25.cd_tipoclas = ${CLASSIFICATION_TYPES.grupo}
    left join public.prd_classificacao c25 on c25.cd_tipoclas = pc25.cd_tipoclas and trim(c25.cd_classificacao) = trim(pc25.cd_classificacao)
    left join public.prd_produtoclas pc26 on pc26.cd_produto = pc21.cd_produto and pc26.cd_tipoclas = ${CLASSIFICATION_TYPES.subgrupo}
    left join public.prd_classificacao c26 on c26.cd_tipoclas = pc26.cd_tipoclas and trim(c26.cd_classificacao) = trim(pc26.cd_classificacao)
    left join public.prd_produtoclas pc27 on pc27.cd_produto = pc21.cd_produto and pc27.cd_tipoclas = ${CLASSIFICATION_TYPES.status}
    left join public.prd_classificacao c27 on c27.cd_tipoclas = pc27.cd_tipoclas and trim(c27.cd_classificacao) = trim(pc27.cd_classificacao)
    left join public.prd_produtoclas pc29 on pc29.cd_produto = pc21.cd_produto and pc29.cd_tipoclas = ${CLASSIFICATION_TYPES.mixProducao}
    left join public.prd_classificacao c29 on c29.cd_tipoclas = pc29.cd_tipoclas and trim(c29.cd_classificacao) = trim(pc29.cd_classificacao)
    where pc21.cd_tipoclas = ${CLASSIFICATION_TYPES.colecao}
      and c21.ds_classificacao = $1
      and c802.ds_classificacao = $2
    group by pc21.cd_produto
  `, [colecao, continuidade]);

  if (productsResult.rows.length === 0) {
    return [];
  }

  const productsById = new Map(productsResult.rows.map((row) => [String(row.cd_produto), row]));
  const productIds = productsResult.rows.map((row) => Number(row.cd_produto));

  const salesResult = await query(`
    select v.idempresa::text as idempresa,
           e.empresa,
           v.idproduto::text as idproduto,
           sum(v.qt_liquida)::float as venda
    from public.mv_vendas_qtd v
    left join public."dEMPRESA" e on e.idempresa = v.idempresa
    where v.idempresa <> 1
      and v.idproduto = any($3::bigint[])
      and v.data >= $1::date
      and v.data < ($2::date + interval '1 day')
    group by v.idempresa, e.empresa, v.idproduto
    having sum(v.qt_liquida) <> 0
    order by v.idproduto, e.empresa
  `, [startDate, endDate, productIds]);

  return salesResult.rows.map((sale) => ({
    ...productsById.get(String(sale.idproduto)),
    ...sale
  }));
}
