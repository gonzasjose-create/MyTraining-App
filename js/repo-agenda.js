// Agenda semanal. Usa a MESMA tabela de sessões (estado 'agendada'): marcar, remarcar, falta,
// cancelar e iniciar treino atuam sempre sobre a mesma linha.
import { todos, um, inserir, atualizar, transacao, gravarAgora } from './db.js';
import { def } from './repo.js';
import { sugerirSessaoPlano, semanaDoPlano, atualizarSessao } from './repo-sessoes.js';
import { obterPlano } from './repo-planos.js';
import { DEFINICOES_PADRAO } from './catalogos.js';
import { somarDias, inicioSemana } from './analise.js';
import { hojeISO } from './util.js';

export const cfgAgenda = () => ({ ...DEFINICOES_PADRAO.agenda, ...def('agenda') });
const minutosDe = (iso) => (iso ? +iso.slice(11, 13) * 60 + +iso.slice(14, 16) : null);

// Sessões de uma semana (segunda a domingo), todas as do cliente ativo e de todos os estados.
export function sessoesSemana(segunda) {
  return todos(
    `SELECT s.*, c.nome AS cliente_nome, ps.nome AS plano_sessao_nome FROM sessoes s
     JOIN clientes c ON c.id = s.cliente_id LEFT JOIN plano_sessoes ps ON ps.id = s.plano_sessao_id
     WHERE s.data BETWEEN ? AND ? ORDER BY s.data, s.hora_inicio`,
    [segunda, somarDias(segunda, 6)]
  );
}

// Reavaliações previstas (última avaliação + intervalo). Em atraso → aparecem hoje.
export function reavaliacoesPrevistas() {
  const hoje = hojeISO();
  return todos(
    `SELECT c.id AS cliente_id, c.nome AS cliente_nome, c.intervalo_reavaliacao_semanas AS sem,
       (SELECT MAX(data) FROM avaliacoes a WHERE a.cliente_id = c.id) AS ultima,
       (SELECT COUNT(*) FROM sessoes s WHERE s.cliente_id = c.id AND s.tipo = 'reavaliacao' AND s.estado = 'agendada') AS marcada
     FROM clientes c WHERE c.ativo = 1`
  )
    .filter((r) => r.ultima)
    .map((r) => {
      const prevista = somarDias(r.ultima, r.sem * 7);
      return { ...r, prevista, atraso: prevista < hoje, dia: prevista < hoje ? hoje : prevista };
    });
}

// Sobreposição com outra sessão (de qualquer cliente) — o treinador só está num sítio de cada vez.
export function conflitos(data, hora, duracaoMin, excluirId = null) {
  const ini = minutosDe(`${data}T${hora}`);
  const fim = ini + duracaoMin;
  return todos(
    `SELECT s.*, c.nome AS cliente_nome FROM sessoes s JOIN clientes c ON c.id = s.cliente_id
     WHERE s.data = ? AND s.id <> ? AND s.estado IN ('agendada','em_curso','realizada') AND s.hora_inicio IS NOT NULL`,
    [data, excluirId ?? 0]
  ).filter((s) => {
    const a = minutosDe(s.hora_inicio), b = a + Math.round((s.duracao_seg || cfgAgenda().duracao_padrao_min * 60) / 60);
    return a < fim && ini < b;
  });
}

// Marca uma sessão (e opcionalmente repete-a nas semanas seguintes).
// Se for treino do plano ativo, liga-a à sessão do plano e à semana certa dessa data.
export function agendar({ cliente_id, data, hora, duracao_min, tipo, plano_sessao_id = null, notas = null, repetir = 0 }) {
  const ids = [];
  transacao(() => {
    for (let k = 0; k <= repetir; k++) {
      const d = somarDias(data, k * 7);
      let plano_id = null, semana = null, psId = null;
      if (tipo === 'treino') {
        const sug = sugerirSessaoPlano(cliente_id, d, { contarAgendadas: true });
        if (sug?.plano) {
          plano_id = sug.plano.id;
          semana = semanaDoPlano(sug.plano, d);
          psId = plano_sessao_id ?? sug.sugerida?.id ?? null;
        }
      }
      ids.push(inserir('sessoes', {
        cliente_id, data: d, hora_inicio: `${d}T${hora}:00`, duracao_seg: duracao_min * 60,
        tipo: tipo === 'treino' && !psId ? 'livre' : tipo, estado: 'agendada',
        plano_id, plano_sessao_id: psId, semana, desconta_pacote: tipo === 'reavaliacao' ? 0 : 1, notas,
      }));
    }
  });
  gravarAgora();
  return ids;
}

// Remarcar: guarda a data/hora ORIGINAL (a primeira) em remarcada_de.
export function remarcar(id, data, hora, duracao_min) {
  const s = um('SELECT * FROM sessoes WHERE id = ?', [id]);
  const dados = { data, hora_inicio: `${data}T${hora}:00`, duracao_seg: duracao_min * 60, remarcada_de: s.remarcada_de ?? s.hora_inicio };
  // Se for do plano, atualiza a semana do plano para a nova data.
  if (s.plano_id) {
    const p = obterPlano(s.plano_id);
    if (p) dados.semana = semanaDoPlano(p, data);
  }
  atualizar('sessoes', id, dados);
  gravarAgora();
}

export const marcarFalta = (id, { desconta = false, motivo = null } = {}) =>
  atualizarSessao(id, { estado: 'faltou', desconta_pacote: desconta ? 1 : 0, motivo_falta: motivo });
export const cancelar = (id) => atualizarSessao(id, { estado: 'cancelada', desconta_pacote: 0 });

// Carga do dia: nº de sessões (sem canceladas/faltas) e horas.
export function cargaDia(sessoes) {
  const validas = sessoes.filter((s) => ['agendada', 'em_curso', 'realizada'].includes(s.estado));
  const horas = validas.reduce((a, s) => a + (s.duracao_seg || cfgAgenda().duracao_padrao_min * 60), 0) / 3600;
  const cfg = cfgAgenda();
  return { n: validas.length, horas, sobrecarregado: validas.length > cfg.max_sessoes_dia || horas > cfg.max_horas_dia, livre: validas.length === 0 };
}

// Próxima sessão agendada do cliente para hoje (para "Iniciar treino" usar a marcação).
export const agendadaHoje = (clienteId) =>
  um("SELECT * FROM sessoes WHERE cliente_id = ? AND data = ? AND estado = 'agendada' ORDER BY hora_inicio LIMIT 1", [clienteId, hojeISO()]);

export { inicioSemana, somarDias };
