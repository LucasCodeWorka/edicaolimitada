import fs from 'fs';
import path from 'path';

// De-para de familias: FAMILIA_NOVA -> FAMILIA_HISTORICO
// Carregado do CSV na raiz do projeto
let DEPARA_FAMILIAS = null;

export function loadDeparaFamilias() {
  if (DEPARA_FAMILIAS) return DEPARA_FAMILIAS;

  const csvPath = [
    path.resolve(process.cwd(), 'de_para_familias.csv'),
    path.resolve(process.cwd(), '..', 'de_para_familias.csv')
  ].find((candidate) => fs.existsSync(candidate));

  if (!csvPath) {
    console.warn('[planningRules] de_para_familias.csv nao encontrado.');
    DEPARA_FAMILIAS = {};
    return DEPARA_FAMILIAS;
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.trim().split('\n').slice(1); // Skip header

  DEPARA_FAMILIAS = {};
  for (const line of lines) {
    const [nova, hist] = line.split(',').map(s => s.trim());
    if (nova && hist) {
      DEPARA_FAMILIAS[nova.toUpperCase()] = hist.toUpperCase();
    }
  }

  console.log('[planningRules] De-para carregado:', Object.keys(DEPARA_FAMILIAS).length, 'familias');
  return DEPARA_FAMILIAS;
}

export function getFamiliaHistorica(familiaNova) {
  const depara = loadDeparaFamilias();
  const key = String(familiaNova || '').toUpperCase().trim();
  return depara[key] || key; // Se nao tiver de-para, usa a propria
}

export function ehDePara(familiaNova) {
  const hist = getFamiliaHistorica(familiaNova);
  return hist !== familiaNova.toUpperCase().trim();
}

// Regras especiais por familia
// Cada regra pode ter:
// - tipo: 'cap' (limite maximo), 'fixo' (valor fixo), 'percentual' (crescimento customizado)
// - valor: o valor da regra
// - obs: observacao para auditoria
export const REGRAS_ESPECIAIS = {
  'PORTELLE': {
    tipo: 'base_especial',
    base: 400,
    crescimento: 0,
    obs: 'Base e plano fixos em 400 pecas'
  },
  'LACE': {
    tipo: 'base_especial',
    base: 909,
    crescimento: 0,
    obs: 'Base NUDE 2o sem 2025 (909), sem crescimento'
  },
  'CONFORT VANILLA': {
    tipo: 'fixo',
    valor: 1618,
    obs: 'Base de 6 meses (4855) / 3 = 1618 (equiv. 2 meses)'
  },
  'NOIVAS': {
    tipo: 'base_especial',
    base: 1706,  // Venda 1o sem 2026 (atualizado)
    crescimento: 0,
    obs: 'Base do 1o semestre 2026, sem crescimento'
  },
  'LOVE APPEAL': {
    tipo: 'fixo',
    valor: 1500,
    obs: 'Plano fixo em 1500 pecas'
  },
  'RENDAS': {
    tipo: 'base_especial',
    base: 1158,
    crescimento: 0,
    obs: 'Venda 2o sem 2025 (1158), sem crescimento'
  }
};

// Regras especiais por FAMILIA + GRUPO
// Chave: 'FAMILIA|GRUPO' (grupo pode ser parcial, ex: CALCA, SUTIA)
export const REGRAS_FAMILIA_GRUPO = {
  'KISS ME|CALCA': {
    tipo: 'fixo',
    valor: 2700,
    obs: 'Calcas KISS ME ajustadas para 2700 pecas'
  },
  'KISS ME|SUTIA': {
    tipo: 'fixo',
    valor: 1300,
    obs: 'Sutias KISS ME ajustadas para 1300 pecas'
  }
};

// Regras especiais por FAMILIA + REFERENCIA
// Chave: 'FAMILIA|REFERENCIA'
export const REGRAS_FAMILIA_REFERENCIA = {
  'WISHES|501004': {
    tipo: 'fixo',
    valor: 1220,
    obs: 'Ref 501004 WISHES ajustada para 1220 pecas'
  },
  'WISHES|501201': {
    tipo: 'fixo',
    valor: 780,
    obs: 'Ref 501201 WISHES ajustada para 780 pecas'
  }
};

// Funcao para buscar regra por familia + grupo
export function getRegraFamiliaGrupo(familia, grupo) {
  const familiaKey = String(familia || '').toUpperCase().trim();
  const grupoKey = String(grupo || '').toUpperCase().trim();

  // Tenta match exato primeiro
  const keyExato = `${familiaKey}|${grupoKey}`;
  if (REGRAS_FAMILIA_GRUPO[keyExato]) {
    return REGRAS_FAMILIA_GRUPO[keyExato];
  }

  // Tenta match parcial (ex: grupo contem CALCA ou SUTIA)
  for (const [key, regra] of Object.entries(REGRAS_FAMILIA_GRUPO)) {
    const [fam, grp] = key.split('|');
    if (familiaKey === fam && grupoKey.includes(grp)) {
      return regra;
    }
  }

  return null;
}

// Funcao para buscar regra por familia + referencia
export function getRegraFamiliaReferencia(familia, referencia) {
  const familiaKey = String(familia || '').toUpperCase().trim();
  // Extrai apenas o codigo numerico da referencia (ex: "501004 - CALCINHA" -> "501004")
  const refKey = String(referencia || '').toUpperCase().trim().split(/[\s\-]/)[0];

  const key = `${familiaKey}|${refKey}`;
  return REGRAS_FAMILIA_REFERENCIA[key] || null;
}

// Crescimento padrao
export const CRESCIMENTO_PADRAO = 0; // sem crescimento

// Calcula o plano para uma familia
export function calcularPlanoFamilia(familia, vendaBase) {
  const familiaUpper = String(familia || '').toUpperCase().trim();
  const regra = REGRAS_ESPECIAIS[familiaUpper];

  if (!regra) {
    // Regra padrao: manter base sem crescimento
    return {
      plano: Math.round(vendaBase * (1 + CRESCIMENTO_PADRAO)),
      regra: 'padrao',
      crescimento: CRESCIMENTO_PADRAO,
      obs: `Crescimento padrao de ${CRESCIMENTO_PADRAO * 100}%`
    };
  }

  switch (regra.tipo) {
    case 'cap': {
      const planoNormal = Math.round(vendaBase * (1 + CRESCIMENTO_PADRAO));
      const planoFinal = Math.min(planoNormal, regra.valor);
      return {
        plano: planoFinal,
        regra: 'cap',
        cap: regra.valor,
        planoOriginal: planoNormal,
        obs: regra.obs
      };
    }

    case 'fixo': {
      return {
        plano: regra.valor,
        regra: 'fixo',
        obs: regra.obs
      };
    }

    case 'percentual': {
      return {
        plano: Math.round(vendaBase * (1 + regra.valor)),
        regra: 'percentual',
        crescimento: regra.valor,
        obs: regra.obs
      };
    }

    case 'base_especial': {
      // Usa base propria (nao do historico) com crescimento
      const crescimento = regra.crescimento !== undefined ? regra.crescimento : CRESCIMENTO_PADRAO;
      return {
        plano: Math.round(regra.base * (1 + crescimento)),
        regra: 'base_especial',
        baseEspecial: regra.base,
        crescimento: crescimento,
        obs: regra.obs
      };
    }

    default:
      return {
        plano: Math.round(vendaBase * (1 + CRESCIMENTO_PADRAO)),
        regra: 'padrao',
        crescimento: CRESCIMENTO_PADRAO,
        obs: 'Regra desconhecida, usando padrao'
      };
  }
}

// Distribui o plano total por loja proporcionalmente a venda historica
export function distribuirPlanoPorLoja(planoTotal, vendasPorLoja) {
  const totalVendas = Object.values(vendasPorLoja).reduce((sum, v) => sum + v, 0);

  if (totalVendas === 0) {
    // Se nao tem venda, distribui igual
    const lojas = Object.keys(vendasPorLoja);
    const perLoja = Math.floor(planoTotal / lojas.length);
    const resto = planoTotal - (perLoja * lojas.length);

    const result = {};
    lojas.forEach((loja, idx) => {
      result[loja] = perLoja + (idx < resto ? 1 : 0);
    });
    return result;
  }

  // Distribui proporcional com arredondamento inteligente
  const lojas = Object.keys(vendasPorLoja);
  const rawValues = lojas.map(loja => ({
    loja,
    raw: (vendasPorLoja[loja] / totalVendas) * planoTotal,
    base: Math.floor((vendasPorLoja[loja] / totalVendas) * planoTotal)
  }));

  // Calcular resto para distribuir
  const baseSum = rawValues.reduce((sum, v) => sum + v.base, 0);
  let remaining = planoTotal - baseSum;

  // Ordenar por fracao decimal decrescente
  rawValues.sort((a, b) => (b.raw - b.base) - (a.raw - a.base));

  const result = {};
  rawValues.forEach((item, idx) => {
    result[item.loja] = item.base + (idx < remaining ? 1 : 0);
  });

  return result;
}

// Mapeamento familia -> linha
export const FAMILIA_LINHA_MAP = {
  'AFTER SUN': 'FASHION',
  'AQUALUME': 'LUXE',
  'BLOOM': 'FASHION',
  'CETIM': 'LOUNGEWEAR',
  'CONFORT VANILLA': 'CONFORT',
  'FLOR DO OCEANO': 'LUXE',
  'KISS ME': 'FASHION',
  'KISS ME PLUS': 'FASHION',
  'LACE': 'LOUNGEWEAR',
  'LOVE APPEAL': 'LUXE',
  'LOVELY': 'FASHION',
  'NOIVAS': 'LUXE',
  'PORTELLE': 'LUXE',
  'VISCOW': 'LOUNGEWEAR',
  'WISHES': 'FASHION',
  'BASICOS': 'CONFORT',
  'BREEZE': 'SOFT',
  'RENDAS': 'LOUNGEWEAR'
};

export function getLinha(familia) {
  return FAMILIA_LINHA_MAP[String(familia || '').toUpperCase().trim()] || 'SEM LINHA';
}
