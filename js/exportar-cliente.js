// RGPD — direito de acesso e portabilidade (art.ºs 15.º e 20.º): exporta TODOS os dados pessoais
// de um cliente num ficheiro JSON legível (inclui as notas do treinador sobre ele, que também são
// dados pessoais). Fotografias opcionais (em base64 dentro do mesmo ficheiro).
import { todos, um, fotoLer } from './db.js';
import { def } from './repo.js';

const porCliente = (tabela, id) => todos(`SELECT * FROM ${tabela} WHERE cliente_id = ?`, [id]);
// Os ids mantêm-se: permitem relacionar as tabelas entre si.
const filhos = (tabela, campo, ids) => (ids.length ? todos(`SELECT * FROM ${tabela} WHERE ${campo} IN (${ids.map(() => '?').join(',')})`, ids) : []);

async function base64(blob) {
  const b = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function exportarDadosCliente(clienteId, { incluirFotos = false } = {}) {
  const cliente = um('SELECT * FROM clientes WHERE id = ?', [clienteId]);
  if (!cliente) throw new Error('Cliente não encontrado.');
  const avaliacoes = porCliente('avaliacoes', clienteId);
  const planos = porCliente('planos', clienteId);
  const planoIds = planos.map((p) => p.id);
  const psessoes = filhos('plano_sessoes', 'plano_id', planoIds);
  const pex = filhos('plano_exercicios', 'sessao_id', psessoes.map((s) => s.id));
  const sessoes = porCliente('sessoes', clienteId);
  const sx = filhos('sessao_exercicios', 'sessao_id', sessoes.map((s) => s.id));
  const exercicios = Object.fromEntries(todos('SELECT id, nome FROM exercicios').map((e) => [e.id, e.nome]));
  const fotos = porCliente('fotos', clienteId);

  const dados = {
    _sobre: {
      descricao: 'Exportação de todos os dados pessoais registados sobre o titular (RGPD, art.ºs 15.º e 20.º).',
      responsavel: def('negocio').nome,
      exportado_em: new Date().toISOString(),
      formato: 'JSON. Datas em aaaa-mm-dd. Cargas em kg, perímetros em cm, tempos em segundos.',
    },
    cliente: { ...cliente, variantes: JSON.parse(cliente.variantes || '{}') },
    consentimentos: porCliente('consentimentos', clienteId),
    lesoes: porCliente('lesoes', clienteId),
    contraindicacoes: porCliente('contraindicacoes', clienteId).map((c) => ({ ...c, exercicio: exercicios[c.exercicio_id] ?? null })),
    avaliacoes: avaliacoes.map((a) => ({
      ...a,
      testes: filhos('avaliacao_testes', 'avaliacao_id', [a.id]),
      composicao: filhos('avaliacao_composicao', 'avaliacao_id', [a.id])[0] ?? null,
      perimetros: filhos('avaliacao_perimetros', 'avaliacao_id', [a.id]),
      resistencia: filhos('avaliacao_resistencia', 'avaliacao_id', [a.id])[0] ?? null,
    })),
    planos: planos.map((p) => ({
      ...p,
      semanas: filhos('plano_semanas', 'plano_id', [p.id]),
      sessoes: psessoes.filter((s) => s.plano_id === p.id).map((s) => ({
        ...s,
        exercicios: pex.filter((e) => e.sessao_id === s.id).map((e) => ({
          ...e, exercicio: exercicios[e.exercicio_id], prescricoes: filhos('plano_prescricoes', 'plano_exercicio_id', [e.id]),
        })),
      })),
    })),
    sessoes: sessoes.map((s) => ({
      ...s,
      exercicios: sx.filter((x) => x.sessao_id === s.id).map((x) => ({
        ...x, exercicio: exercicios[x.exercicio_id], series: filhos('sessao_series', 'sessao_exercicio_id', [x.id]),
      })),
      etiquetas: filhos('sessao_etiquetas', 'sessao_id', [s.id]),
    })),
    pacotes: porCliente('pacotes', clienteId),
    pagamentos: porCliente('pagamentos', clienteId),
    checkins: porCliente('checkins', clienteId),
    metas: porCliente('metas', clienteId),
    pausas: porCliente('pausas', clienteId),
    hyrox_simulacoes: porCliente('hyrox_simulacoes', clienteId),
    fotografias: [],
  };
  for (const f of fotos) {
    const reg = { data: f.data, angulo: f.angulo, largura: f.largura, altura: f.altura, notas: f.notas };
    if (incluirFotos) {
      const b = await fotoLer(f.chave);
      if (b) reg.imagem_jpeg_base64 = await base64(b);
    }
    dados.fotografias.push(reg);
  }
  return new TextEncoder().encode(JSON.stringify(dados, null, 2));
}
