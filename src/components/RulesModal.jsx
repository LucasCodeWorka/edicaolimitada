import React from 'react';

const RulesModal = ({ isOpen, onClose, dadosAjustados, kpiData, filters }) => {
  if (!isOpen) return null;

  const rules = [
    {
      titulo: 'Limite de Aumento (10%)',
      descricao: 'Plano limitado por família, usando a base da própria família ou do seu de-para.',
      status: 'ativo',
      detalhes: `Plano máximo por família = base × 1,10. Famílias que já estavam abaixo do limite foram mantidas. Plano atual: ${Number(dadosAjustados.kpiAjustado.plano2026).toLocaleString('pt-BR')} un.`
    },
    {
      titulo: 'Mapeamento Família → Linha',
      descricao: 'Cada família de produtos é associada a uma linha (FASHION, LUXE, LOUNGEWEAR).',
      status: 'ativo',
      detalhes: 'FASHION: After Sun, Bloom, Confort Vanilla, Kiss Me, Kiss Me Plus, Lovely, Wishes | LUXE: Aqualume, Flor do Oceano, Love Appeal, Noivas, Portelle | LOUNGEWEAR: Cetim, Lace, Viscow'
    },
    {
      titulo: 'Distribuição por Loja',
      descricao: 'Vendas são distribuídas proporcionalmente entre as 15 lojas baseado no histórico de 2025.',
      status: 'ativo',
      detalhes: 'Lojas: Maraponga, Iguatemi, Porto Alegre, Barra, Salvador, Rio Mar Recife, Morumbi, Parangaba, Dom Luis, North, North Joquei, Ecommerce, Tabosa, Riomar Kennedy, Intimates'
    },
    {
      titulo: 'Distribuição por Mês de Envio',
      descricao: 'Produção distribuída conforme cronograma de envio por família.',
      status: 'ativo',
      detalhes: 'JULHO: Basicos, Kiss Me, Viscow | AGOSTO: Cetim, Love Appeal, Portelle, Bloom, After Sun, Aqualume, Lovely | SETEMBRO: Rendas, Lace, Noivas | OUTUBRO: Wishes, Flor do Oceano'
    },
    {
      titulo: 'Tamanhos Maiores - Exclusão de Lojas',
      descricao: 'Famílias de tamanhos maiores (PLUS) não são distribuídas para certas lojas.',
      status: 'ativo',
      detalhes: 'Lojas excluidas: DOM LUIS, NORTH JOQUEI/JOKEY, ECOMMERCE | Grade minima: sutias 48/50 = 1 peca; calcinhas GG/XG = 1 peca | Excecao KISS ME tamanho maior: somente MARAPONGA'
    },
    {
      titulo: 'Agregação de Dados',
      descricao: 'Os dados são agrupados por múltiplas dimensões para análise.',
      status: 'ativo',
      detalhes: 'Dimensões: Grupo, Subgrupo, Família, Linha, Referência'
    },
    {
      titulo: 'Filtros Interativos',
      descricao: 'Todos os gráficos e KPIs respondem aos filtros selecionados.',
      status: Object.values(filters).some(v => v !== 'TODAS' && v !== 'TODOS') ? 'aplicado' : 'nao-aplicado',
      detalhes: 'Filtros disponíveis: Empresa, Família, Linha, Grupo, Coleção, Mês, Referência'
    },
    {
      titulo: 'Estimativa Proporcional',
      descricao: 'Quando filtros são aplicados, a venda 2025 é estimada proporcionalmente.',
      status: 'ativo',
      detalhes: 'A matriz comparativa usa a base própria de cada família/loja; regras manuais de uma família não alteram o percentual das demais.'
    },
    {
      titulo: 'Mapeamento Família Nova → Histórica (De-Para)',
      descricao: 'As famílias da nova coleção (Verão 27) buscam dados históricos de famílias equivalentes do Verão 26.',
      status: 'info',
      detalhes: 'BLOOM ← SORRENTINA | AQUALUME ← BELLA | LOVELY ← BREEZE | AFTER SUN ← MARINE | PORTELLE ← MARINE (limite manual de 400 peças) | FLOR DO OCEANO ← DELICATTI | Famílias com dados manuais: LOVE APPEAL, NOIVAS, LACE, CONFORT VANILLA'
    },
    {
      titulo: 'Famílias com Base Especial',
      descricao: 'Algumas famílias usam bases de dados específicas ao invés do mapeamento histórico padrão.',
      status: 'info',
      detalhes: 'LOVE APPEAL: 1º semestre 2026 (1.785 un) | NOIVAS: 1º semestre 2026 (1.499 un) | CONFORT VANILLA: BRANCO CONFORT 4.855 un convertido para VANILINA e reduzido para 2/6 = 1.618 un | LACE: dados manuais (127 un) | PORTELLE: plano reduzido proporcionalmente para 400 peças'
    },
    {
      titulo: 'Regras PCP Aplicadas',
      descricao: 'Regras específicas definidas pelo PCP para distribuição correta.',
      status: 'ativo',
      detalhes: 'WISHES LUMIAR: distribuida | NOIVAS refs 603086, 606786: incluidas | CINTA LIGA 606775 incluida | CETIM: tamanhos M e G garantidos | Tamanhos maiores: excluidos de DOM LUIS, NORTH JOQUEI/JOKEY, ECOMMERCE, com minimo 1 nos tamanhos alvo | PORTELLE: lojas pequenas recebem somente cor PRETO'
    }
  ];

  const getStatusBadge = (status) => {
    switch (status) {
      case 'aplicado':
        return <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-800 border border-amber-200">APLICADO</span>;
      case 'ativo':
        return <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-green-100 text-green-800 border border-green-200">ATIVO</span>;
      case 'nao-necessario':
        return <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-gray-100 text-gray-600 border border-gray-200">NÃO NECESSÁRIO</span>;
      case 'nao-aplicado':
        return <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-gray-100 text-gray-500 border border-gray-200">INATIVO</span>;
      case 'info':
        return <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-100 text-blue-800 border border-blue-200">INFO</span>;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden mx-4">
        {/* Header */}
        <div className="bg-[#B3838C] px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Regras Aplicadas</h2>
            <p className="text-xs text-white/80">Análise das regras de negócio do dashboard</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-80px)]">
          {/* Resumo */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Resumo do Plano</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Plano 2026</p>
                <p className="text-lg font-bold text-[#B3838C] font-mono">
                  {Number(dadosAjustados.kpiAjustado.plano2026).toLocaleString('pt-BR')}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Venda 2025</p>
                <p className="text-lg font-bold text-gray-700 font-mono">
                  {Number(dadosAjustados.kpiAjustado.venda2025).toLocaleString('pt-BR')}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Aumento</p>
                <p className="text-lg font-bold text-green-600 font-mono">
                  +{dadosAjustados.aumentoAjustado}%
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Fator Redução</p>
                <p className="text-lg font-bold text-gray-700 font-mono">
                  {(dadosAjustados.fatorReducao * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          {/* Lista de Regras */}
          <div className="space-y-4">
            {rules.map((rule, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4 hover:border-[#B3838C]/30 transition-colors">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h4 className="text-sm font-semibold text-gray-800">{rule.titulo}</h4>
                  {getStatusBadge(rule.status)}
                </div>
                <p className="text-xs text-gray-600 mb-2">{rule.descricao}</p>
                <div className="bg-gray-50 rounded px-3 py-2">
                  <p className="text-[11px] text-gray-500 font-mono">{rule.detalhes}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Legenda */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <h4 className="text-xs font-semibold text-gray-600 mb-2">Legenda dos Status:</h4>
            <div className="flex flex-wrap gap-3 text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span className="text-gray-600">APLICADO - Regra em uso com ajustes</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span className="text-gray-600">ATIVO - Regra sempre em uso</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                <span className="text-gray-600">INATIVO/NÃO NECESSÁRIO - Sem efeito atual</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span className="text-gray-600">INFO - Informação sobre comportamento do sistema</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RulesModal;
