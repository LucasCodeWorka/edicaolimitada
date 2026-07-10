import { query } from './db.js';
import { CLASSIFICATION_TYPES } from './dashboardRepository.js';

const CACHE_VERSION = 'verao27-edicao-limitada-v1';

export async function ensureCacheTables() {
  await query(`
    create table if not exists public.app_el_cache_runs (
      id bigserial primary key,
      cache_version text not null,
      start_date date not null,
      end_date date not null,
      status text not null,
      message text,
      vendas_rows integer default 0,
      produtos_rows integer default 0,
      created_at timestamp without time zone default now(),
      finished_at timestamp without time zone
    )
  `);

  await query(`
    create table if not exists public.app_el_cache_vendas (
      cache_version text not null,
      start_date date not null,
      end_date date not null,
      idempresa bigint not null,
      empresa text,
      idproduto bigint not null,
      venda numeric not null,
      updated_at timestamp without time zone default now(),
      primary key (cache_version, start_date, end_date, idempresa, idproduto)
    )
  `);

  await query(`
    create table if not exists public.app_el_cache_produtos (
      cache_version text not null,
      idproduto bigint primary key,
      referencia text,
      produto text,
      idcor text,
      cor text,
      idtamanho text,
      tamanho text,
      idmixproducao text,
      mixproducao text,
      idmarca text,
      marca text,
      idclassificacao text,
      classificacao text,
      idcolecao text,
      colecao text,
      idfamilia text,
      familia text,
      idgrupo text,
      grupo text,
      cd_subgrupo text,
      subgrupo text,
      idstatus text,
      status text,
      cd_continuidade text,
      continuidade text,
      updated_at timestamp without time zone default now()
    )
  `);
}

export async function refreshPlanningCache({
  startDate = '2025-07-01',
  endDate = '2025-12-31'
} = {}) {
  await ensureCacheTables();

  const run = await query(`
    insert into public.app_el_cache_runs (cache_version, start_date, end_date, status)
    values ($1, $2::date, $3::date, 'RUNNING')
    returning id
  `, [CACHE_VERSION, startDate, endDate]);

  const runId = run.rows[0].id;

  try {
    await query(`
      delete from public.app_el_cache_vendas
      where cache_version = $1
        and start_date = $2::date
        and end_date = $3::date
    `, [CACHE_VERSION, startDate, endDate]);

    const vendas = await query(`
      insert into public.app_el_cache_vendas (
        cache_version, start_date, end_date, idempresa, empresa, idproduto, venda
      )
      select $1 as cache_version,
             $2::date as start_date,
             $3::date as end_date,
             v.idempresa::bigint,
             max(e.empresa) as empresa,
             v.idproduto::bigint,
             sum(v.qt_liquida)::numeric as venda
      from public.mv_vendas_qtd v
      left join public."dEMPRESA" e on e.idempresa = v.idempresa
      where v.idempresa <> 1
        and v.data >= $2::date
        and v.data < ($3::date + interval '1 day')
      group by v.idempresa, v.idproduto
      having sum(v.qt_liquida) <> 0
      on conflict (cache_version, start_date, end_date, idempresa, idproduto)
      do update set
        empresa = excluded.empresa,
        venda = excluded.venda,
        updated_at = now()
    `, [CACHE_VERSION, startDate, endDate]);

    const produtos = await query(`
      insert into public.app_el_cache_produtos (
        cache_version, idproduto, referencia, produto, idcor, cor, idtamanho, tamanho,
        idmixproducao, mixproducao, idmarca, marca, idclassificacao, classificacao,
        idcolecao, colecao, idfamilia, familia, idgrupo, grupo, cd_subgrupo, subgrupo,
        idstatus, status, cd_continuidade, continuidade
      )
      select $1 as cache_version,
             base.idproduto,
             f_dic_prd_nivel(base.idproduto, 'CD'::bpchar) as referencia,
             max(g.nm_produto) as produto,
             max(trim(g.cd_cor)) as idcor,
             max(g.ds_cor) as cor,
             max(g.cd_tamanho::text) as idtamanho,
             max(g.ds_tamanho) as tamanho,
             max(trim(pc29.cd_classificacao)) as idmixproducao,
             max(c29.ds_classificacao) as mixproducao,
             max(trim(pc20.cd_classificacao)) as idmarca,
             max(c20.ds_classificacao) as marca,
             max(trim(pc23.cd_classificacao)) as idclassificacao,
             max(c23.ds_classificacao) as classificacao,
             max(trim(pc21.cd_classificacao)) as idcolecao,
             max(c21.ds_classificacao) as colecao,
             max(trim(pc24.cd_classificacao)) as idfamilia,
             max(c24.ds_classificacao) as familia,
             max(trim(pc25.cd_classificacao)) as idgrupo,
             max(c25.ds_classificacao) as grupo,
             max(trim(pc26.cd_classificacao)) as cd_subgrupo,
             max(c26.ds_classificacao) as subgrupo,
             max(trim(pc27.cd_classificacao)) as idstatus,
             max(c27.ds_classificacao) as status,
             max(trim(pc802.cd_classificacao)) as cd_continuidade,
             max(c802.ds_classificacao) as continuidade
      from (
        select distinct idproduto
        from public.app_el_cache_vendas
        where cache_version = $1
          and start_date = $2::date
          and end_date = $3::date
      ) base
      left join public.vr_prd_prdgrade g on g.cd_produto = base.idproduto
      left join public.prd_produtoclas pc20 on pc20.cd_produto = base.idproduto and pc20.cd_tipoclas = ${CLASSIFICATION_TYPES.marca}
      left join public.prd_classificacao c20 on c20.cd_tipoclas = pc20.cd_tipoclas and trim(c20.cd_classificacao) = trim(pc20.cd_classificacao)
      left join public.prd_produtoclas pc21 on pc21.cd_produto = base.idproduto and pc21.cd_tipoclas = ${CLASSIFICATION_TYPES.colecao}
      left join public.prd_classificacao c21 on c21.cd_tipoclas = pc21.cd_tipoclas and trim(c21.cd_classificacao) = trim(pc21.cd_classificacao)
      left join public.prd_produtoclas pc23 on pc23.cd_produto = base.idproduto and pc23.cd_tipoclas = ${CLASSIFICATION_TYPES.classificacao}
      left join public.prd_classificacao c23 on c23.cd_tipoclas = pc23.cd_tipoclas and trim(c23.cd_classificacao) = trim(pc23.cd_classificacao)
      left join public.prd_produtoclas pc24 on pc24.cd_produto = base.idproduto and pc24.cd_tipoclas = ${CLASSIFICATION_TYPES.familia}
      left join public.prd_classificacao c24 on c24.cd_tipoclas = pc24.cd_tipoclas and trim(c24.cd_classificacao) = trim(pc24.cd_classificacao)
      left join public.prd_produtoclas pc25 on pc25.cd_produto = base.idproduto and pc25.cd_tipoclas = ${CLASSIFICATION_TYPES.grupo}
      left join public.prd_classificacao c25 on c25.cd_tipoclas = pc25.cd_tipoclas and trim(c25.cd_classificacao) = trim(pc25.cd_classificacao)
      left join public.prd_produtoclas pc26 on pc26.cd_produto = base.idproduto and pc26.cd_tipoclas = ${CLASSIFICATION_TYPES.subgrupo}
      left join public.prd_classificacao c26 on c26.cd_tipoclas = pc26.cd_tipoclas and trim(c26.cd_classificacao) = trim(pc26.cd_classificacao)
      left join public.prd_produtoclas pc27 on pc27.cd_produto = base.idproduto and pc27.cd_tipoclas = ${CLASSIFICATION_TYPES.status}
      left join public.prd_classificacao c27 on c27.cd_tipoclas = pc27.cd_tipoclas and trim(c27.cd_classificacao) = trim(pc27.cd_classificacao)
      left join public.prd_produtoclas pc29 on pc29.cd_produto = base.idproduto and pc29.cd_tipoclas = ${CLASSIFICATION_TYPES.mixProducao}
      left join public.prd_classificacao c29 on c29.cd_tipoclas = pc29.cd_tipoclas and trim(c29.cd_classificacao) = trim(pc29.cd_classificacao)
      left join public.prd_produtoclas pc802 on pc802.cd_produto = base.idproduto and pc802.cd_tipoclas = ${CLASSIFICATION_TYPES.continuidade}
      left join public.prd_classificacao c802 on c802.cd_tipoclas = pc802.cd_tipoclas and trim(c802.cd_classificacao) = trim(pc802.cd_classificacao)
      group by base.idproduto
      on conflict (idproduto)
      do update set
        cache_version = excluded.cache_version,
        referencia = excluded.referencia,
        produto = excluded.produto,
        idcor = excluded.idcor,
        cor = excluded.cor,
        idtamanho = excluded.idtamanho,
        tamanho = excluded.tamanho,
        idmixproducao = excluded.idmixproducao,
        mixproducao = excluded.mixproducao,
        idmarca = excluded.idmarca,
        marca = excluded.marca,
        idclassificacao = excluded.idclassificacao,
        classificacao = excluded.classificacao,
        idcolecao = excluded.idcolecao,
        colecao = excluded.colecao,
        idfamilia = excluded.idfamilia,
        familia = excluded.familia,
        idgrupo = excluded.idgrupo,
        grupo = excluded.grupo,
        cd_subgrupo = excluded.cd_subgrupo,
        subgrupo = excluded.subgrupo,
        idstatus = excluded.idstatus,
        status = excluded.status,
        cd_continuidade = excluded.cd_continuidade,
        continuidade = excluded.continuidade,
        updated_at = now()
    `, [CACHE_VERSION, startDate, endDate]);

    await query(`
      update public.app_el_cache_runs
      set status = 'DONE',
          vendas_rows = $2,
          produtos_rows = $3,
          finished_at = now()
      where id = $1
    `, [runId, vendas.rowCount, produtos.rowCount]);

    return {
      runId,
      cacheVersion: CACHE_VERSION,
      startDate,
      endDate,
      vendasRows: vendas.rowCount,
      produtosRows: produtos.rowCount
    };
  } catch (error) {
    await query(`
      update public.app_el_cache_runs
      set status = 'ERROR',
          message = $2,
          finished_at = now()
      where id = $1
    `, [runId, error.message]);

    throw error;
  }
}

export async function getCachedPlanningRows({
  startDate = '2025-07-01',
  endDate = '2025-12-31',
  colecao = 'VERAO 26',
  continuidade = 'EDICAO LIMITADA'
} = {}) {
  await ensureCacheTables();

  const result = await query(`
    select v.idempresa::text,
           v.empresa,
           v.idproduto::text,
           p.referencia,
           p.produto,
           p.idcor,
           p.cor,
           p.idtamanho,
           p.tamanho,
           p.idmixproducao,
           p.mixproducao,
           p.idmarca,
           p.marca,
           p.idclassificacao,
           p.classificacao,
           p.idcolecao,
           p.colecao,
           p.idfamilia,
           p.familia,
           p.idgrupo,
           p.grupo,
           p.cd_subgrupo,
           p.subgrupo,
           p.idstatus,
           p.status,
           p.cd_continuidade,
           p.continuidade,
           v.venda::float
    from public.app_el_cache_vendas v
    join public.app_el_cache_produtos p on p.idproduto = v.idproduto
    where v.cache_version = $1
      and v.start_date = $2::date
      and v.end_date = $3::date
      and p.colecao = $4
      and p.continuidade = $5
    order by p.familia, p.referencia, p.cor, p.tamanho, v.empresa
  `, [CACHE_VERSION, startDate, endDate, colecao, continuidade]);

  return result.rows;
}

export async function getLatestCacheRun() {
  await ensureCacheTables();

  const result = await query(`
    select *
    from public.app_el_cache_runs
    where cache_version = $1
    order by id desc
    limit 1
  `, [CACHE_VERSION]);

  return result.rows[0] || null;
}
