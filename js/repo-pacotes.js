// Pacotes e pagamentos. A app NÃO processa pagamentos nem guarda dados de cartões:
// apenas regista manualmente o que foi pago.
import { todos, um, escalar, executar, inserir, atualizar } from './db.js';
import { def } from './repo.js';
import { DEFINICOES_PADRAO } from './catalogos.js';
import { hojeISO } from './util.js';

export const cfgAlertas = () => ({ ...DEFINICOES_PADRAO.alertas_pacote, ...def('alertas_pacote') });
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
export const somarDias = (iso, n) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------- Tipos de pacote (definições)
export const listarTiposPacote = ({ incluirInativos = false } = {}) =>
  todos(`SELECT * FROM tipos_pacote ${incluirInativos ? '' : 'WHERE ativo = 1'} ORDER BY nome COLLATE NOCASE`);
export const guardarTipoPacote = (dados, id = null) => (id ? (atualizar('tipos_pacote', id, dados), id) : inserir('tipos_pacote', dados));

// ---------------------------------------------------------------- Pacotes do cliente
// Usadas = sessões realizadas (ou faltas marcadas para descontar) atribuídas ao pacote.
const SQL_USADAS = `(SELECT COUNT(*) FROM sessoes s WHERE s.pacote_id = p.id AND s.desconta_pacote = 1
                     AND s.estado IN ('realizada','faltou'))`;

function estado(p, hoje = hojeISO()) {
  const restantes = p.sessoes_contratadas - p.usadas;
  return {
    ...p,
    restantes,
    esgotado: restantes <= 0,
    expirado: p.data_validade < hoje,
    futuro: p.data_inicio > hoje,
    diasParaExpirar: diasEntre(hoje, p.data_validade),
  };
}

export const listarPacotes = (clienteId) =>
  todos(`SELECT p.*, ${SQL_USADAS} AS usadas FROM pacotes p WHERE p.cliente_id = ? ORDER BY p.data_inicio DESC, p.id DESC`, [clienteId]).map((p) => estado(p));

export const obterPacote = (id) => {
  const p = um(`SELECT p.*, ${SQL_USADAS} AS usadas FROM pacotes p WHERE p.id = ?`, [id]);
  return p ? estado(p) : null;
};

// Pacote a usar numa sessão: válido nessa data e com sessões disponíveis (o mais antigo primeiro).
// "excluirSessaoId" permite reavaliar uma sessão já atribuída sem a contar duas vezes.
export function pacoteParaData(clienteId, data, excluirSessaoId = null) {
  const ps = todos(
    `SELECT p.*, (SELECT COUNT(*) FROM sessoes s WHERE s.pacote_id = p.id AND s.desconta_pacote = 1
                  AND s.estado IN ('realizada','faltou') AND s.id <> ?) AS usadas
     FROM pacotes p WHERE p.cliente_id = ? AND p.data_inicio <= ? AND p.data_validade >= ?
     ORDER BY p.data_inicio, p.id`,
    [excluirSessaoId ?? 0, clienteId, data, data]
  ).map((p) => estado(p, data));
  return { pacote: ps.find((p) => !p.esgotado) || null, todosEsgotados: ps.length > 0 && ps.every((p) => p.esgotado) };
}

// Pacote atual do cliente (para mostrar): válido hoje, senão o mais recente.
export function pacoteAtual(clienteId) {
  const ps = listarPacotes(clienteId);
  return ps.find((p) => !p.expirado && !p.futuro && !p.esgotado) || ps[0] || null;
}

export const guardarPacote = (dados, id = null) => (id ? (atualizar('pacotes', id, dados), id) : inserir('pacotes', dados));
export const apagarPacote = (id) => executar('DELETE FROM pacotes WHERE id = ?', [id]);
export const sessoesDoPacote = (id) => escalar(`SELECT COUNT(*) FROM sessoes WHERE pacote_id = ?`, [id]);

// Alertas de renovação (nunca aparecem no modo cliente nem nos PDF).
export function alertaPacote(clienteId) {
  const cfg = cfgAlertas();
  const p = pacoteAtual(clienteId);
  if (!p) return { nivel: 'alerta', texto: 'Sem pacote' };
  if (p.expirado) return { nivel: 'alerta', texto: `Pacote expirou a ${p.data_validade.split('-').reverse().join('/')}` };
  if (p.esgotado) return { nivel: 'alerta', texto: 'Pacote esgotado' };
  if (p.restantes <= cfg.sessoes_restantes) return { nivel: 'aviso', texto: `Restam ${p.restantes} sessão(ões)` };
  if (p.diasParaExpirar <= cfg.dias_validade) return { nivel: 'aviso', texto: `Pacote expira em ${p.diasParaExpirar} dia(s)` };
  return null;
}

// ---------------------------------------------------------------- Pagamentos
export const listarPagamentos = (clienteId) =>
  todos(
    `SELECT pg.*, p.nome AS pacote_nome FROM pagamentos pg LEFT JOIN pacotes p ON p.id = pg.pacote_id
     WHERE pg.cliente_id = ? ORDER BY pg.data DESC, pg.id DESC`,
    [clienteId]
  );
export const guardarPagamento = (dados, id = null) => (id ? (atualizar('pagamentos', id, dados), id) : inserir('pagamentos', dados));
export const apagarPagamento = (id) => executar('DELETE FROM pagamentos WHERE id = ?', [id]);

// Resumo de um mês (aaaa-mm): pagamentos por estado e método, e sessões realizadas.
export function resumoMensal(mes) {
  const pags = todos(
    `SELECT pg.*, c.nome AS cliente_nome FROM pagamentos pg JOIN clientes c ON c.id = pg.cliente_id
     WHERE substr(pg.data, 1, 7) = ? ORDER BY pg.data, pg.id`,
    [mes]
  );
  const soma = (f) => pags.filter(f).reduce((s, p) => s + p.valor, 0);
  const porMetodo = {};
  for (const p of pags.filter((x) => x.estado === 'pago')) porMetodo[p.metodo] = (porMetodo[p.metodo] || 0) + p.valor;
  const sessoes = um(
    `SELECT SUM(estado = 'realizada') AS realizadas, SUM(estado = 'faltou') AS faltas
     FROM sessoes WHERE substr(data, 1, 7) = ?`,
    [mes]
  );
  // Pendentes de qualquer mês (para não esquecer cobranças antigas).
  const pendentesTotais = todos(
    `SELECT pg.*, c.nome AS cliente_nome FROM pagamentos pg JOIN clientes c ON c.id = pg.cliente_id
     WHERE pg.estado = 'pendente' ORDER BY pg.data`
  );
  return { pags, pago: soma((p) => p.estado === 'pago'), pendente: soma((p) => p.estado === 'pendente'), porMetodo, sessoes, pendentesTotais };
}
