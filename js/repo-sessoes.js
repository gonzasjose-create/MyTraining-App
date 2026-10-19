// Registo de sessões — ÚNICA fonte de verdade do realizado.
// O registo manual (depois da sessão) e o Modo Treino (em tempo real) usam estas mesmas funções.
import { todos, um, escalar, executar, inserir, atualizar, transacao, gravarAgora } from './db.js';
import { obterPlano } from './repo-planos.js';
import { pacoteParaData } from './repo-pacotes.js';
import { textoPrescricao } from './progressao.js';
import { epley } from './calc.js';
import { hojeISO } from './util.js';

// ---------------------------------------------------------------- Tempo
const p2 = (n) => String(n).padStart(2, '0');
// Data/hora local em ISO sem fuso (o browser interpreta-a como hora local).
export function agoraLocal(d = new Date()) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}
// Tempo decorrido calculado SEMPRE a partir da hora de início (sobrevive a recarregar/fechar a app).
export function decorridoSeg(s, agora = Date.now()) {
  if (!s.hora_inicio) return s.duracao_seg || 0;
  if (s.estado !== 'em_curso') return s.duracao_seg ?? 0;
  const fim = s.pausado_desde ? new Date(s.pausado_desde).getTime() : agora;
  return Math.max(0, Math.round((fim - new Date(s.hora_inicio).getTime()) / 1000) - (s.pausa_seg || 0));
}
const diaSemanaISO = (iso) => ((new Date(iso + 'T12:00:00').getDay() + 6) % 7) + 1; // 1 = segunda

// ---------------------------------------------------------------- Sessão do plano para hoje
export function planoAtivo(clienteId) {
  return um("SELECT id FROM planos WHERE cliente_id = ? AND estado = 'ativo' ORDER BY data_inicio DESC LIMIT 1", [clienteId]);
}
export function semanaDoPlano(plano, data) {
  if (!plano.data_inicio) return 1;
  const dias = Math.floor((new Date(data + 'T12:00:00') - new Date(plano.data_inicio + 'T12:00:00')) / 864e5);
  return Math.min(Math.max(Math.floor(dias / 7) + 1, 1), plano.num_semanas);
}
// Sugere a sessão planeada: a do dia da semana, senão a primeira ainda não feita nesta semana.
// contarAgendadas: ao MARCAR sessões, as já agendadas também "ocupam" a sessão do plano.
export function sugerirSessaoPlano(clienteId, data = hojeISO(), { contarAgendadas = false } = {}) {
  const pa = planoAtivo(clienteId);
  if (!pa) return null;
  const plano = obterPlano(pa.id);
  if (!plano.sessoes.length) return { plano, semana: 1, sugerida: null, feitas: [] };
  const semana = semanaDoPlano(plano, data);
  const estados = contarAgendadas ? "('realizada','em_curso','agendada')" : "('realizada','em_curso')";
  const feitas = todos(
    `SELECT plano_sessao_id FROM sessoes WHERE plano_id = ? AND semana = ? AND estado IN ${estados}`,
    [plano.id, semana]
  ).map((r) => r.plano_sessao_id);
  const dia = diaSemanaISO(data);
  const porFazer = plano.sessoes.filter((s) => !feitas.includes(s.id));
  const sugerida = porFazer.find((s) => s.dia_semana === dia) || porFazer[0] || plano.sessoes[0];
  return { plano, semana, sugerida, feitas };
}

// ---------------------------------------------------------------- Criar sessões
export function sessaoEmCurso() {
  return um(
    `SELECT s.*, c.nome AS cliente_nome FROM sessoes s JOIN clientes c ON c.id = s.cliente_id WHERE s.estado = 'em_curso'`
  );
}

// Mesma pessoa, mesmo dia, mesma hora de início → provável duplicado.
export function sessaoDuplicada(clienteId, data, hora, excluirId = null) {
  if (!hora) return null;
  return um(
    `SELECT id FROM sessoes WHERE cliente_id = ? AND data = ? AND substr(hora_inicio, 12, 2) = ? AND id <> ?
     AND estado <> 'cancelada'`,
    [clienteId, data, hora.slice(0, 2), excluirId ?? 0]
  );
}

// Cria exercícios e séries a partir da prescrição da semana (planeado copiado + realizado pré-preenchido).
function gerarDoPlano(sessaoId, planoId, planoSessaoId, semana, { marcarFeitas = false } = {}) {
  const plano = obterPlano(planoId);
  const ps = plano?.sessoes.find((s) => s.id === planoSessaoId);
  if (!ps) return;
  ps.exercicios.forEach((pe, i) => {
    const sexId = inserir('sessao_exercicios', {
      sessao_id: sessaoId, exercicio_id: pe.exercicio_id, plano_exercicio_id: pe.id, ordem: i, estado: marcarFeitas ? 'feito' : 'pendente',
    });
    const pr = pe.presc[semana] || {};
    const est = marcarFeitas ? 'feita' : 'pendente';
    if (pe.tipo_registo === 'resistencia') {
      const dur = pr.duracao_min ? pr.duracao_min * 60 : pr.int_repeticoes ? pr.int_repeticoes * ((pr.int_trabalho_seg || 0) + (pr.int_recuperacao_seg || 0)) : null;
      inserir('sessao_series', {
        sessao_exercicio_id: sexId, n: 1, estado: est, plan_texto: textoPrescricao(pr, pe, pe.metodo),
        duracao_seg: dur, distancia_m: pr.distancia_m ?? null, plan_rpe: pr.rpe ?? null,
      });
      return;
    }
    for (let n = 1; n <= (pr.series || 1); n++)
      inserir('sessao_series', {
        sessao_exercicio_id: sexId, n, estado: est,
        plan_carga_kg: pr.carga_kg ?? null, plan_reps: pr.reps_min ?? null, plan_rpe: pr.rpe ?? null, plan_rir: pr.rir ?? null, plan_descanso_seg: pr.descanso_seg ?? null,
        carga_kg: pr.carga_kg ?? null, reps: pr.reps_min ?? null, rpe: pr.rpe ?? null, rir: pr.rir ?? null,
      });
  });
}

// Atribui (ou retira) o pacote conforme estado e interruptor "descontar".
function atribuirPacote(sessaoId) {
  const s = um('SELECT * FROM sessoes WHERE id = ?', [sessaoId]);
  const conta = s.desconta_pacote && ['realizada', 'faltou'].includes(s.estado);
  if (!conta) return executar('UPDATE sessoes SET pacote_id = NULL WHERE id = ?', [sessaoId]);
  const { pacote } = pacoteParaData(s.cliente_id, s.data, s.id);
  // Mantém o pacote atual se ainda for válido; senão usa o disponível; sem pacote → não desconta.
  const atual = s.pacote_id && pacote && s.pacote_id === pacote.id ? s.pacote_id : pacote?.id ?? null;
  executar('UPDATE sessoes SET pacote_id = ?, desconta_pacote = ? WHERE id = ?', [atual, atual ? 1 : 0, sessaoId]);
}

// Modo Treino: inicia uma sessão em curso (só uma de cada vez).
export function iniciarSessao({ cliente_id, tipo, plano_id = null, plano_sessao_id = null, semana = null }) {
  const ativa = sessaoEmCurso();
  if (ativa) throw new Error(`Já há um treino em curso (${ativa.cliente_nome}). Retoma-o ou termina-o primeiro.`);
  const agora = agoraLocal();
  const id = transacao(() => {
    const sid = inserir('sessoes', {
      cliente_id, data: agora.slice(0, 10), hora_inicio: agora, tipo, estado: 'em_curso',
      plano_id, plano_sessao_id, semana, desconta_pacote: tipo === 'reavaliacao' ? 0 : 1,
    });
    if (tipo === 'treino' && plano_id && plano_sessao_id) gerarDoPlano(sid, plano_id, plano_sessao_id, semana);
    return sid;
  });
  gravarAgora();
  return id;
}

// Modo Treino a partir de uma sessão AGENDADA: a mesma linha passa a "em curso" (não se cria outra).
// "escolha" permite trocar o tipo/sessão do plano no momento de iniciar.
export function iniciarSessaoAgendada(id, escolha = {}) {
  const ativa = sessaoEmCurso();
  if (ativa) throw new Error(`Já há um treino em curso (${ativa.cliente_nome}). Retoma-o ou termina-o primeiro.`);
  const s = um('SELECT * FROM sessoes WHERE id = ?', [id]);
  if (!s || s.estado !== 'agendada') throw new Error('Esta sessão já não está agendada.');
  const agora = agoraLocal();
  const d = { tipo: s.tipo, plano_id: s.plano_id, plano_sessao_id: s.plano_sessao_id, semana: s.semana, ...escolha };
  transacao(() => {
    atualizar('sessoes', id, {
      estado: 'em_curso', data: agora.slice(0, 10), hora_inicio: agora, duracao_seg: null, pausa_seg: 0, pausado_desde: null,
      tipo: d.tipo, plano_id: d.plano_id, plano_sessao_id: d.plano_sessao_id, semana: d.semana,
      desconta_pacote: d.tipo === 'reavaliacao' ? 0 : 1,
      agendada_para: s.hora_inicio ?? `${s.data}T00:00:00`,
    });
    executar('DELETE FROM sessao_exercicios WHERE sessao_id = ?', [id]);
    if (d.tipo === 'treino' && d.plano_id && d.plano_sessao_id) gerarDoPlano(id, d.plano_id, d.plano_sessao_id, d.semana);
  });
  gravarAgora();
  return id;
}

// Registo manual (depois da sessão): realizada, falta ou cancelada.
export function registarSessao(d) {
  const id = transacao(() => {
    const sid = inserir('sessoes', {
      cliente_id: d.cliente_id, data: d.data, hora_inicio: d.hora ? `${d.data}T${d.hora}:00` : null,
      hora_fim: d.hora && d.duracao_min ? agoraLocal(new Date(new Date(`${d.data}T${d.hora}:00`).getTime() + d.duracao_min * 60000)) : null,
      duracao_seg: d.duracao_min ? Math.round(d.duracao_min * 60) : null,
      tipo: d.tipo, estado: d.estado, plano_id: d.plano_id, plano_sessao_id: d.plano_sessao_id, semana: d.semana,
      desconta_pacote: d.desconta_pacote ? 1 : 0, motivo_falta: d.motivo_falta, notas: d.notas,
      rpe_sessao: d.rpe_sessao ?? null,
    });
    if (d.estado === 'realizada' && d.tipo === 'treino' && d.plano_id && d.plano_sessao_id)
      gerarDoPlano(sid, d.plano_id, d.plano_sessao_id, d.semana, { marcarFeitas: true });
    atribuirPacote(sid);
    return sid;
  });
  return id;
}

// ---------------------------------------------------------------- Ler
export function obterSessao(id) {
  const s = um(
    `SELECT s.*, c.nome AS cliente_nome, ps.nome AS plano_sessao_nome, p.nome AS plano_nome, pc.nome AS pacote_nome
     FROM sessoes s JOIN clientes c ON c.id = s.cliente_id
     LEFT JOIN plano_sessoes ps ON ps.id = s.plano_sessao_id LEFT JOIN planos p ON p.id = s.plano_id
     LEFT JOIN pacotes pc ON pc.id = s.pacote_id WHERE s.id = ?`,
    [id]
  );
  if (!s) return null;
  s.exercicios = todos(
    `SELECT sx.*, e.nome, e.tipo_registo, e.unidade_ritmo, e.grupo_muscular, ea.nome AS substituido_nome,
       pe.metodo, pe.notas AS notas_plano
     FROM sessao_exercicios sx JOIN exercicios e ON e.id = sx.exercicio_id
     LEFT JOIN exercicios ea ON ea.id = sx.substitui_exercicio_id
     LEFT JOIN plano_exercicios pe ON pe.id = sx.plano_exercicio_id
     WHERE sx.sessao_id = ? ORDER BY sx.ordem, sx.id`,
    [id]
  );
  const series = todos(
    `SELECT ss.* FROM sessao_series ss JOIN sessao_exercicios sx ON sx.id = ss.sessao_exercicio_id
     WHERE sx.sessao_id = ? ORDER BY ss.n, ss.id`,
    [id]
  );
  const etiq = todos('SELECT * FROM sessao_etiquetas WHERE sessao_id = ?', [id]);
  for (const e of s.exercicios) {
    e.series = series.filter((x) => x.sessao_exercicio_id === e.id);
    e.etiquetas = etiq.filter((x) => x.sessao_exercicio_id === e.id && !x.serie_id).map((x) => x.etiqueta);
    for (const x of e.series) x.etiquetas = etiq.filter((t) => t.serie_id === x.id).map((t) => t.etiqueta);
  }
  s.etiquetas = etiq.filter((x) => !x.sessao_exercicio_id && !x.serie_id).map((x) => x.etiqueta);
  return s;
}

export function listarSessoesCliente(clienteId, q = '') {
  const filtro = q.trim()
    ? `AND (s.notas LIKE ?1 OR EXISTS (SELECT 1 FROM sessao_etiquetas t WHERE t.sessao_id = s.id AND t.etiqueta LIKE ?1)
         OR EXISTS (SELECT 1 FROM sessao_exercicios x LEFT JOIN sessao_series y ON y.sessao_exercicio_id = x.id
                    JOIN exercicios e ON e.id = x.exercicio_id
                    WHERE x.sessao_id = s.id AND (x.notas LIKE ?1 OR y.notas LIKE ?1 OR y.dor_local LIKE ?1 OR e.nome LIKE ?1)))`
    : '';
  return todos(
    `SELECT s.*, ps.nome AS plano_sessao_nome,
       (SELECT COUNT(*) FROM sessao_series y JOIN sessao_exercicios x ON x.id = y.sessao_exercicio_id WHERE x.sessao_id = s.id AND y.estado = 'feita') AS series_feitas,
       (SELECT COUNT(*) FROM sessao_series y JOIN sessao_exercicios x ON x.id = y.sessao_exercicio_id WHERE x.sessao_id = s.id) AS series_total,
       (SELECT COUNT(*) FROM sessao_series y JOIN sessao_exercicios x ON x.id = y.sessao_exercicio_id WHERE x.sessao_id = s.id AND y.dor = 1) AS series_dor,
       (SELECT group_concat(DISTINCT etiqueta) FROM sessao_etiquetas t WHERE t.sessao_id = s.id) AS etiquetas
     FROM sessoes s LEFT JOIN plano_sessoes ps ON ps.id = s.plano_sessao_id
     WHERE s.cliente_id = ?2 ${filtro} ORDER BY s.data DESC, s.hora_inicio DESC, s.id DESC`,
    q.trim() ? [`%${q.trim()}%`, clienteId] : [null, clienteId]
  );
}

// ---------------------------------------------------------------- Referências: última sessão e melhor registo
// Melhor 1RM estimado (Epley) com qualidade técnica 1 ou 2, no mesmo exercício (= mesma variante),
// em sessões realizadas e nos testes de avaliação dessa variante.
export function historicoExercicio(clienteId, exercicioId, excluirSessaoId = null) {
  const ex = um('SELECT nome FROM exercicios WHERE id = ?', [exercicioId]);
  const series = todos(
    `SELECT y.*, s.data, s.id AS sessao_id FROM sessao_series y
     JOIN sessao_exercicios x ON x.id = y.sessao_exercicio_id JOIN sessoes s ON s.id = x.sessao_id
     WHERE s.cliente_id = ? AND x.exercicio_id = ? AND s.estado = 'realizada' AND y.estado = 'feita' AND s.id <> ?
     ORDER BY s.data DESC, s.hora_inicio DESC, y.n`,
    [clienteId, exercicioId, excluirSessaoId ?? 0]
  );
  const ultimaId = series[0]?.sessao_id;
  const ultima = ultimaId ? { data: series[0].data, series: series.filter((x) => x.sessao_id === ultimaId) } : null;

  let melhor = null;
  const considerar = (carga, reps, data, fonte) => {
    const r = epley(carga, reps);
    if (r && (!melhor || r.valor > melhor.valor)) melhor = { valor: r.valor, carga, reps, data, fonte };
  };
  for (const x of series) if (x.qualidade >= 1) considerar(x.carga_kg, x.reps, x.data, 'sessão');
  const testes = todos(
    `SELECT t.carga_kg, t.reps, a.data FROM avaliacao_testes t JOIN avaliacoes a ON a.id = t.avaliacao_id
     WHERE a.cliente_id = ? AND t.variante = ? AND t.qualidade >= 1 AND t.carga_kg IS NOT NULL`,
    [clienteId, ex?.nome]
  );
  for (const t of testes) considerar(t.carga_kg, t.reps, t.data, 'avaliação');
  return { ultima, melhor };
}

// ---------------------------------------------------------------- Alterações (cada uma é gravada de imediato)
const gravado = (r) => (gravarAgora(), r);

export function atualizarSerie(id, campos) {
  atualizar('sessao_series', id, campos);
  return gravado();
}
export function concluirSerie(id, campos) {
  return gravado(transacao(() => {
    atualizar('sessao_series', id, { ...campos, estado: 'feita', concluida_em: agoraLocal() });
    atualizarEstadoExercicio(escalar('SELECT sessao_exercicio_id FROM sessao_series WHERE id = ?', [id]));
  }));
}
export function saltarSerie(id) {
  return gravado(transacao(() => {
    atualizar('sessao_series', id, { estado: 'saltada' });
    atualizarEstadoExercicio(escalar('SELECT sessao_exercicio_id FROM sessao_series WHERE id = ?', [id]));
  }));
}
export function reabrirSerie(id) {
  return gravado(transacao(() => {
    atualizar('sessao_series', id, { estado: 'pendente', concluida_em: null });
    atualizarEstadoExercicio(escalar('SELECT sessao_exercicio_id FROM sessao_series WHERE id = ?', [id]));
  }));
}
function atualizarEstadoExercicio(sexId) {
  const r = um(
    `SELECT COUNT(*) AS total, SUM(estado = 'pendente') AS pend, SUM(estado = 'feita') AS feitas FROM sessao_series WHERE sessao_exercicio_id = ?`,
    [sexId]
  );
  const estado = r.total && !r.pend ? (r.feitas ? 'feito' : 'saltado') : 'pendente';
  executar('UPDATE sessao_exercicios SET estado = ? WHERE id = ?', [estado, sexId]);
}

// Série extra: copia a última série (planeado e realizado).
export function adicionarSerie(sexId) {
  const ult = um('SELECT * FROM sessao_series WHERE sessao_exercicio_id = ? ORDER BY n DESC LIMIT 1', [sexId]);
  const n = (ult?.n || 0) + 1;
  return gravado(transacao(() => {
    const id = inserir('sessao_series', {
      sessao_exercicio_id: sexId, n,
      carga_kg: ult?.carga_kg ?? null, reps: ult?.reps ?? null, rpe: ult?.rpe ?? null, rir: ult?.rir ?? null,
      plan_descanso_seg: ult?.plan_descanso_seg ?? null, duracao_seg: ult?.duracao_seg ?? null,
    });
    atualizarEstadoExercicio(sexId);
    return id;
  }));
}
export function apagarSerie(id) {
  const sexId = escalar('SELECT sessao_exercicio_id FROM sessao_series WHERE id = ?', [id]);
  return gravado(transacao(() => {
    executar('DELETE FROM sessao_series WHERE id = ?', [id]);
    todos('SELECT id FROM sessao_series WHERE sessao_exercicio_id = ? ORDER BY n, id', [sexId]).forEach((r, i) =>
      executar('UPDATE sessao_series SET n = ? WHERE id = ?', [i + 1, r.id])
    );
    atualizarEstadoExercicio(sexId);
  }));
}
export function saltarExercicio(sexId) {
  return gravado(transacao(() => {
    executar("UPDATE sessao_series SET estado = 'saltada' WHERE sessao_exercicio_id = ? AND estado = 'pendente'", [sexId]);
    atualizarEstadoExercicio(sexId);
  }));
}

// Exercício fora do plano: 1 série, pré-preenchida com a melhor série da última sessão (se houver).
export function adicionarExercicioSessao(sessaoId, exercicioId) {
  const s = um('SELECT cliente_id FROM sessoes WHERE id = ?', [sessaoId]);
  const { ultima } = historicoExercicio(s.cliente_id, exercicioId, sessaoId);
  const ref = ultima?.series.reduce((m, x) => (!m || (x.carga_kg || 0) > (m.carga_kg || 0) ? x : m), null);
  const ordem = (escalar('SELECT MAX(ordem) FROM sessao_exercicios WHERE sessao_id = ?', [sessaoId]) ?? -1) + 1;
  return gravado(transacao(() => {
    const sexId = inserir('sessao_exercicios', { sessao_id: sessaoId, exercicio_id: exercicioId, ordem });
    inserir('sessao_series', { sessao_exercicio_id: sexId, n: 1, carga_kg: ref?.carga_kg ?? null, reps: ref?.reps ?? null, rpe: ref?.rpe ?? null, duracao_seg: ref?.duracao_seg ?? null });
    return sexId;
  }));
}
// Substituição: guarda o exercício original; mantém as séries (reps/RPE) e limpa a carga das pendentes.
export function substituirExercicio(sexId, novoExercicioId) {
  const sx = um('SELECT * FROM sessao_exercicios WHERE id = ?', [sexId]);
  return gravado(transacao(() => {
    atualizar('sessao_exercicios', sexId, { exercicio_id: novoExercicioId, substitui_exercicio_id: sx.substitui_exercicio_id ?? sx.exercicio_id });
    executar("UPDATE sessao_series SET carga_kg = NULL WHERE sessao_exercicio_id = ? AND estado = 'pendente'", [sexId]);
  }));
}
export const moverExercicioSessao = (sexId, dir) => {
  const sx = um('SELECT * FROM sessao_exercicios WHERE id = ?', [sexId]);
  const ids = todos('SELECT id FROM sessao_exercicios WHERE sessao_id = ? ORDER BY ordem, id', [sx.sessao_id]).map((r) => r.id);
  const i = ids.indexOf(sexId), j = i + dir;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  transacao(() => ids.forEach((x, k) => executar('UPDATE sessao_exercicios SET ordem = ? WHERE id = ?', [k, x])));
  gravarAgora();
};
export const apagarExercicioSessao = (sexId) => gravado(executar('DELETE FROM sessao_exercicios WHERE id = ?', [sexId]));
export const notaExercicio = (sexId, notas) => gravado(atualizar('sessao_exercicios', sexId, { notas: notas || null }));

export function alternarEtiqueta(sessaoId, etiqueta, { sexId = null, serieId = null } = {}) {
  const existe = escalar(
    'SELECT id FROM sessao_etiquetas WHERE sessao_id = ? AND etiqueta = ? AND sessao_exercicio_id IS ? AND serie_id IS ?',
    [sessaoId, etiqueta, sexId, serieId]
  );
  if (existe) executar('DELETE FROM sessao_etiquetas WHERE id = ?', [existe]);
  else inserir('sessao_etiquetas', { sessao_id: sessaoId, etiqueta, sessao_exercicio_id: sexId, serie_id: serieId });
  gravarAgora();
  return !existe;
}

// ---------------------------------------------------------------- Cronómetro da sessão
export function pausarSessao(id) {
  executar('UPDATE sessoes SET pausado_desde = ? WHERE id = ? AND pausado_desde IS NULL', [agoraLocal(), id]);
  gravarAgora();
}
export function retomarSessao(id) {
  const s = um('SELECT * FROM sessoes WHERE id = ?', [id]);
  if (!s.pausado_desde) return;
  const pausa = Math.round((Date.now() - new Date(s.pausado_desde).getTime()) / 1000);
  executar('UPDATE sessoes SET pausa_seg = pausa_seg + ?, pausado_desde = NULL WHERE id = ?', [Math.max(0, pausa), id]);
  gravarAgora();
}
export const atualizarSessao = (id, dados) => {
  atualizar('sessoes', id, dados);
  if (['estado', 'desconta_pacote', 'data'].some((k) => k in dados)) atribuirPacote(id);
  gravarAgora();
};
export const ligarAvaliacao = (sessaoId, avaliacaoId) => atualizarSessao(sessaoId, { avaliacao_id: avaliacaoId });

// ---------------------------------------------------------------- Resumo e fim
export function resumoSessao(s) {
  let feitas = 0, total = 0, volume = 0, rpeSoma = 0, rpeN = 0;
  const prs = [];
  for (const e of s.exercicios) {
    const { melhor } = e.tipo_registo === 'resistencia' ? { melhor: null } : historicoExercicio(s.cliente_id, e.exercicio_id, s.id);
    let melhorAqui = null;
    for (const x of e.series) {
      total++;
      if (x.estado !== 'feita') continue;
      feitas++;
      if (x.carga_kg && x.reps) volume += x.carga_kg * x.reps;
      if (x.rpe) { rpeSoma += x.rpe; rpeN++; }
      const r = x.qualidade >= 1 ? epley(x.carga_kg, x.reps) : null;
      if (r && melhor && r.valor > melhor.valor && (!melhorAqui || r.valor > melhorAqui.valor)) melhorAqui = { ...r, carga: x.carga_kg, reps: x.reps };
    }
    if (melhorAqui) prs.push({ exercicio: e.nome, ...melhorAqui, anterior: melhor.valor });
  }
  const notas = [
    s.notas && { onde: 'Sessão', texto: s.notas },
    ...s.exercicios.flatMap((e) => [
      e.notas && { onde: e.nome, texto: e.notas },
      ...e.series.filter((x) => x.notas || x.dor).map((x) => ({ onde: `${e.nome} · série ${x.n}`, texto: [x.dor ? `Dor${x.dor_local ? ` (${x.dor_local})` : ''}` : '', x.notas].filter(Boolean).join(' — ') })),
    ]),
  ].filter(Boolean);
  return { duracao: decorridoSeg(s), feitas, total, volume: Math.round(volume), prs, rpeMedio: rpeN ? Math.round((rpeSoma / rpeN) * 10) / 10 : null, notas };
}

// Termina o treino: grava como realizada (presença), tempo final e pacote.
export function terminarSessao(id, dados) {
  const s = um('SELECT * FROM sessoes WHERE id = ?', [id]);
  if (s.pausado_desde) retomarSessao(id);
  const s2 = um('SELECT * FROM sessoes WHERE id = ?', [id]);
  transacao(() => {
    // Séries que ficaram por fazer contam como saltadas (feitas vs planeadas fica correto).
    executar(
      `UPDATE sessao_series SET estado = 'saltada' WHERE estado = 'pendente'
       AND sessao_exercicio_id IN (SELECT id FROM sessao_exercicios WHERE sessao_id = ?)`,
      [id]
    );
    todos('SELECT id FROM sessao_exercicios WHERE sessao_id = ?', [id]).forEach((r) => atualizarEstadoExercicio(r.id));
    atualizar('sessoes', id, {
      ...dados, estado: 'realizada', hora_fim: agoraLocal(), duracao_seg: decorridoSeg(s2),
      desconta_pacote: dados.desconta_pacote ? 1 : 0,
    });
    atribuirPacote(id);
  });
  gravarAgora();
}
export const apagarSessao = (id) => gravado(executar('DELETE FROM sessoes WHERE id = ?', [id]));

// "Cancelar treino" no Modo Treino: se veio de uma marcação, volta a ficar agendada na hora original
// (sem o registo feito); senão é apagado.
export function cancelarTreinoEmCurso(id) {
  const s = um('SELECT * FROM sessoes WHERE id = ?', [id]);
  if (!s?.agendada_para) return apagarSessao(id);
  transacao(() => {
    executar('DELETE FROM sessao_exercicios WHERE sessao_id = ?', [id]);
    atualizar('sessoes', id, {
      estado: 'agendada', data: s.agendada_para.slice(0, 10), hora_inicio: s.agendada_para, agendada_para: null,
      duracao_seg: 3600, pausa_seg: 0, pausado_desde: null,
    });
  });
  gravarAgora();
  return 'reagendada';
}

// Séries realizadas de um exercício do plano numa semana (usado pela progressão sugerida).
export function realizadoPlanoExercicio(peId, semana) {
  return todos(
    `SELECT y.carga_kg, y.reps, y.rpe, y.qualidade FROM sessao_series y
     JOIN sessao_exercicios x ON x.id = y.sessao_exercicio_id JOIN sessoes s ON s.id = x.sessao_id
     WHERE x.plano_exercicio_id = ? AND s.semana = ? AND s.estado = 'realizada' AND y.estado = 'feita'
       AND x.substitui_exercicio_id IS NULL`,
    [peId, semana]
  );
}
