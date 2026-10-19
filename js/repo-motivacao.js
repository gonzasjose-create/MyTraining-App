// Motivação: metas e marcos, check-in semanal, pausas e streaks/consistência.
// O progresso das metas é SEMPRE calculado a partir dos registos (sessões e avaliações).
import { todos, um, inserir, atualizar, executar, gravarAgora } from './db.js';
import { epley } from './calc.js';
import { obterCliente } from './repo.js';
import { inicioSemana, somarDias, diasEntre } from './analise.js';
import { TESTES_AEROBIOS } from './catalogos.js';
import { hojeISO } from './util.js';

// ====================================================================== Metas
const TIPOS_RECORDE = ['e1rm', 'carga', 'reps']; // conta o melhor registo; os outros contam o valor mais recente

// Linha temporal de valores para o tipo de meta: [{ data, valor }] por ordem de data.
// Nota: nas metas de teste aeróbio, a coluna "perimetro" guarda o id do teste (ex.: corrida_3km).
export function linhaTemporal(m) {
  const c = m.cliente_id;
  let pts = [];
  if (TIPOS_RECORDE.includes(m.tipo)) {
    const series = todos(
      `SELECT s.data, y.carga_kg, y.reps FROM sessao_series y JOIN sessao_exercicios x ON x.id = y.sessao_exercicio_id
       JOIN sessoes s ON s.id = x.sessao_id WHERE s.cliente_id = ? AND x.exercicio_id = ? AND s.estado = 'realizada'
       AND y.estado = 'feita' AND y.qualidade >= 1`,
      [c, m.exercicio_id]
    );
    const testes = todos(
      `SELECT a.data, t.carga_kg, t.reps FROM avaliacao_testes t JOIN avaliacoes a ON a.id = t.avaliacao_id
       JOIN exercicios e ON e.nome = t.variante WHERE a.cliente_id = ? AND e.id = ? AND t.qualidade >= 1 AND t.lado IS NULL`,
      [c, m.exercicio_id]
    );
    for (const r of [...series, ...testes]) {
      const v = m.tipo === 'e1rm' ? epley(r.carga_kg, r.reps)?.valor : m.tipo === 'carga' ? (r.reps >= 1 ? r.carga_kg : null) : r.reps;
      if (v != null && v > 0) pts.push({ data: r.data, valor: v });
    }
  } else {
    const avs = todos(
      `SELECT a.id, a.data, cp.peso_kg, cp.massa_gorda_pct, r.teste, r.tempo_seg, r.distancia_m
       FROM avaliacoes a LEFT JOIN avaliacao_composicao cp ON cp.avaliacao_id = a.id
       LEFT JOIN avaliacao_resistencia r ON r.avaliacao_id = a.id WHERE a.cliente_id = ?`,
      [c]
    );
    for (const a of avs) {
      let v = null;
      if (m.tipo === 'peso') v = a.peso_kg;
      if (m.tipo === 'mg_pct') v = a.massa_gorda_pct;
      if (m.tipo === 'teste_aerobio' && a.teste === m.perimetro) v = TESTES_AEROBIOS[a.teste]?.tipo === 'tempo' ? a.tempo_seg : a.distancia_m;
      if (m.tipo === 'perimetro')
        v = um('SELECT valor_cm FROM avaliacao_perimetros WHERE avaliacao_id = ? AND perimetro = ? AND (lado IS ? OR lado = ?)', [a.id, m.perimetro, m.lado || null, m.lado || ''])?.valor_cm;
      if (v != null) pts.push({ data: a.data, valor: v });
    }
  }
  return pts.sort((a, b) => a.data.localeCompare(b.data));
}

// Valor atual: o melhor registo (força/reps) ou o mais recente (corpo e testes).
export function valorAtual(m, pts = linhaTemporal(m)) {
  if (!pts.length) return null;
  if (TIPOS_RECORDE.includes(m.tipo)) return Math.max(...pts.map((p) => p.valor));
  return pts[pts.length - 1].valor;
}

// Progresso 0–1, marcos atingidos (com data) e data em que a meta foi atingida.
export function progressoMeta(m) {
  const pts = linhaTemporal(m);
  const atual = valorAtual(m, pts);
  const sobe = m.valor_alvo >= m.valor_inicial;
  const passa = (v, alvo) => (sobe ? v >= alvo : v <= alvo);
  const primeiraData = (alvo) => pts.find((p) => p.data >= m.data_inicio && passa(p.valor, alvo))?.data ?? null;
  const total = m.valor_alvo - m.valor_inicial;
  const prog = atual == null || total === 0 ? 0 : Math.min(1, Math.max(0, (atual - m.valor_inicial) / total));
  const marcos = JSON.parse(m.marcos || '[]').map((v) => ({ valor: v, atingido: primeiraData(v) }));
  return { atual, progresso: prog, atingida: atual != null && passa(atual, m.valor_alvo) ? primeiraData(m.valor_alvo) ?? hojeISO() : null, marcos, pts, sobe };
}

export const listarMetas = (clienteId, { incluirArquivadas = false } = {}) =>
  todos(
    `SELECT m.*, e.nome AS exercicio_nome FROM metas m LEFT JOIN exercicios e ON e.id = m.exercicio_id
     WHERE m.cliente_id = ? ${incluirArquivadas ? '' : "AND m.estado = 'ativa'"} ORDER BY m.estado, m.data_alvo IS NULL, m.data_alvo, m.id`,
    [clienteId]
  );
export const guardarMeta = (dados, id = null) => { const r = id ? (atualizar('metas', id, dados), id) : inserir('metas', dados); gravarAgora(); return r; };
export const apagarMeta = (id) => executar('DELETE FROM metas WHERE id = ?', [id]);

// ====================================================================== Check-in semanal
export const checkinSemana = (clienteId, semana = inicioSemana(hojeISO())) =>
  um('SELECT * FROM checkins WHERE cliente_id = ? AND semana = ?', [clienteId, semana]);
export const listarCheckins = (clienteId, n = 12) =>
  todos('SELECT * FROM checkins WHERE cliente_id = ? ORDER BY semana DESC LIMIT ?', [clienteId, n]);

export function guardarCheckin(clienteId, d) {
  const semana = inicioSemana(d.data);
  const existente = checkinSemana(clienteId, semana);
  const dados = { cliente_id: clienteId, semana, data: d.data, sono: d.sono, energia: d.energia, dor: d.dor, alimentacao: d.alimentacao, notas: d.notas || null, origem: d.origem || 'presencial' };
  existente ? atualizar('checkins', existente.id, dados) : inserir('checkins', dados);
  gravarAgora();
}
export const apagarCheckin = (id) => executar('DELETE FROM checkins WHERE id = ?', [id]);

// Interpreta a resposta do cliente no WhatsApp.
// Aceita "4 3 1 5 dormi mal" (ordem: sono, energia, dor, alimentação) ou com nomes:
// "sono 4, energia 3, dor 1, alimentação 5 — dormi mal".
export function interpretarCheckin(texto) {
  const t = (texto || '').trim();
  if (!t) return null;
  const res = {};
  let resto = t;
  const rotulos = { sono: /sono\s*[:=]?\s*([1-5])/i, energia: /energia\s*[:=]?\s*([1-5])/i, dor: /dor(?:es)?\s*[:=]?\s*([1-5])/i, alimentacao: /alimenta[cç][aã]o\s*[:=]?\s*([1-5])/i };
  for (const [k, re] of Object.entries(rotulos)) {
    const m = resto.match(re);
    if (m) { res[k] = +m[1]; resto = resto.replace(m[0], ' '); }
  }
  // Sem rótulos: os primeiros números 1–5 isolados, pela ordem combinada.
  const ordem = ['sono', 'energia', 'dor', 'alimentacao'].filter((k) => res[k] == null);
  if (ordem.length) {
    const nums = [...resto.matchAll(/(?<![\d/])([1-5])(?![\d/])/g)];
    for (const k of ordem) {
      const n = nums.shift();
      if (!n) break;
      res[k] = +n[1];
      resto = resto.replace(n[0], ' ');
    }
  }
  const notas = resto.replace(/[,;:.\-–—|]+/g, ' ').replace(/check-?in/i, '').replace(/\s+/g, ' ').trim();
  return { ...res, notas: notas || null, completo: ['sono', 'energia', 'dor', 'alimentacao'].every((k) => res[k] != null) };
}

export const PERGUNTA_CHECKIN =
  'Check-in da semana 💪 Responde com 4 números de 1 a 5: sono, energia, dor (1 = nenhuma), alimentação. ' +
  'Podes acrescentar uma nota. Ex.: 4 3 1 5 dormi mal na terça';

// ====================================================================== Pausas e consistência
export const listarPausas = (clienteId) => todos('SELECT * FROM pausas WHERE cliente_id = ? ORDER BY data_inicio DESC', [clienteId]);
export const guardarPausa = (dados, id = null) => (id ? atualizar('pausas', id, dados) : inserir('pausas', dados));
export const apagarPausa = (id) => executar('DELETE FROM pausas WHERE id = ?', [id]);

// Semanas desde a 1.ª sessão do cliente, com o estado de cada uma:
// cumprida (sessões ≥ frequência combinada) · falhada · pausa (justificada: não conta nem quebra) · em_curso.
// Por decisão do treinador, faltas não penalizam além de não contarem como presença.
export function semanasConsistencia(clienteId) {
  const c = obterCliente(clienteId);
  const freq = c.frequencia_semanal || 1;
  const sess = todos("SELECT data FROM sessoes WHERE cliente_id = ? AND estado = 'realizada' ORDER BY data", [clienteId]);
  if (!sess.length) return { freq, semanas: [] };
  const pausas = listarPausas(clienteId);
  const hoje = hojeISO();
  const atual = inicioSemana(hoje);
  const semanas = [];
  for (let s = inicioSemana(sess[0].data); s <= atual; s = somarDias(s, 7)) {
    const fim = somarDias(s, 6);
    const n = sess.filter((x) => x.data >= s && x.data <= fim).length;
    // Semana em pausa se a pausa cobrir pelo menos 4 dos 7 dias.
    const diasPausa = pausas.reduce((a, p) => {
      const ini = p.data_inicio > s ? p.data_inicio : s, f = p.data_fim < fim ? p.data_fim : fim;
      return a + Math.max(0, diasEntre(ini, f) + 1);
    }, 0);
    const estado = n >= freq ? 'cumprida' : diasPausa >= 4 ? 'pausa' : s === atual ? 'em_curso' : 'falhada';
    semanas.push({ inicio: s, sessoes: n, estado, pausa: diasPausa >= 4 });
  }
  return { freq, semanas };
}

export function consistencia(clienteId) {
  const { freq, semanas } = semanasConsistencia(clienteId);
  // Streak atual: semanas cumpridas seguidas até agora (pausas e a semana em curso não quebram).
  let streak = 0;
  for (let i = semanas.length - 1; i >= 0; i--) {
    const e = semanas[i].estado;
    if (e === 'cumprida') streak++;
    else if (e === 'pausa' || e === 'em_curso') continue;
    else break;
  }
  let melhor = 0, corrida = 0;
  for (const w of semanas) {
    if (w.estado === 'cumprida') melhor = Math.max(melhor, ++corrida);
    else if (w.estado === 'falhada') corrida = 0;
  }
  // Score (últimas 8 semanas completas, sem pausas): sessões feitas (até ao combinado) ÷ combinadas.
  const elegiveis = semanas.filter((w) => w.estado !== 'pausa' && w.estado !== 'em_curso').slice(-8);
  const score = elegiveis.length ? Math.round((elegiveis.reduce((a, w) => a + Math.min(w.sessoes, freq), 0) / (elegiveis.length * freq)) * 100) : null;
  return { freq, semanas, streak, melhor, score, nSemanasScore: elegiveis.length };
}
