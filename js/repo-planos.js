// Biblioteca de exercícios e planos/blocos de treino (acesso a dados e regras).
import { todos, um, escalar, executar, inserir, atualizar, transacao } from './db.js';
import { def, verificarContraindicacao } from './repo.js';
import { DEFINICOES_PADRAO } from './catalogos.js';
import { CAMPOS_PRESCRICAO, sugerirSeguintes, iguais } from './progressao.js';

export const cfgProgressao = () => ({ ...DEFINICOES_PADRAO.progressao, ...def('progressao') });

// ====================== Biblioteca ======================
export function listarBiblioteca({ incluirInativos = false } = {}) {
  return todos(
    `SELECT e.*, p.nome AS padrao_nome,
       (SELECT COUNT(*) FROM plano_exercicios pe WHERE pe.exercicio_id = e.id) AS usos,
       (SELECT COUNT(*) FROM exercicio_alternativas a WHERE a.exercicio_id = e.id) AS n_alternativas
     FROM exercicios e LEFT JOIN padroes_movimento p ON p.id = e.padrao_id
     ${incluirInativos ? '' : 'WHERE e.ativo = 1'}
     ORDER BY e.nome COLLATE NOCASE`
  );
}
export function obterExercicio(id) {
  const e = um('SELECT * FROM exercicios WHERE id = ?', [id]);
  if (e) e.alternativas = todos('SELECT alternativa_id FROM exercicio_alternativas WHERE exercicio_id = ?', [id]).map((r) => r.alternativa_id);
  return e;
}
export const gruposMusculares = () =>
  todos('SELECT DISTINCT grupo_muscular AS g FROM exercicios WHERE grupo_muscular IS NOT NULL ORDER BY 1').map((r) => r.g);

export function guardarExercicio(dados, alternativas, id = null) {
  return transacao(() => {
    if (id) atualizar('exercicios', id, dados);
    else id = inserir('exercicios', dados);
    executar('DELETE FROM exercicio_alternativas WHERE exercicio_id = ?', [id]);
    for (const a of alternativas) if (a !== id) executar('INSERT OR IGNORE INTO exercicio_alternativas VALUES (?, ?)', [id, a]);
    return id;
  });
}
// Exercícios usados em planos não se apagam (perdia-se o histórico): ficam inativos.
export function removerExercicio(id) {
  const usos = escalar('SELECT COUNT(*) FROM plano_exercicios WHERE exercicio_id = ?', [id]);
  if (usos) {
    atualizar('exercicios', id, { ativo: 0 });
    return 'desativado';
  }
  executar('DELETE FROM contraindicacoes WHERE exercicio_id = ?', [id]);
  executar('DELETE FROM exercicios WHERE id = ?', [id]);
  return 'apagado';
}
export const criarPadrao = (nome) => inserir('padroes_movimento', { nome });

// ====================== Planos ======================
export const listarPlanos = (clienteId) =>
  todos(
    `SELECT p.*, (SELECT COUNT(*) FROM plano_sessoes s WHERE s.plano_id = p.id) AS n_sessoes
     FROM planos p WHERE p.cliente_id = ? ORDER BY CASE p.estado WHEN 'ativo' THEN 0 WHEN 'rascunho' THEN 1 ELSE 2 END, p.data_inicio DESC`,
    [clienteId]
  );
export const listarTemplates = () =>
  todos(
    `SELECT p.*, (SELECT COUNT(*) FROM plano_sessoes s WHERE s.plano_id = p.id) AS n_sessoes
     FROM planos p WHERE p.cliente_id IS NULL ORDER BY p.nome COLLATE NOCASE`
  );
// Planos de outros clientes (para duplicar).
export const listarPlanosTodos = () =>
  todos(
    `SELECT p.id, p.nome, p.num_semanas, c.nome AS cliente_nome FROM planos p
     JOIN clientes c ON c.id = p.cliente_id ORDER BY c.nome, p.data_inicio DESC`
  );

// Plano completo: semanas, sessões, exercícios e prescrições por semana.
export function obterPlano(id) {
  const plano = um('SELECT * FROM planos WHERE id = ?', [id]);
  if (!plano) return null;
  plano.semanas = todos('SELECT * FROM plano_semanas WHERE plano_id = ? ORDER BY semana', [id]);
  plano.sessoes = todos('SELECT * FROM plano_sessoes WHERE plano_id = ? ORDER BY ordem, id', [id]);
  const exs = todos(
    `SELECT pe.*, e.nome, e.tipo_registo, e.unidade_ritmo, e.grupo_muscular, e.padrao_id, e.ativo AS ex_ativo
     FROM plano_exercicios pe JOIN exercicios e ON e.id = pe.exercicio_id
     JOIN plano_sessoes s ON s.id = pe.sessao_id WHERE s.plano_id = ? ORDER BY pe.ordem, pe.id`,
    [id]
  );
  const presc = todos(
    `SELECT pp.* FROM plano_prescricoes pp JOIN plano_exercicios pe ON pe.id = pp.plano_exercicio_id
     JOIN plano_sessoes s ON s.id = pe.sessao_id WHERE s.plano_id = ?`,
    [id]
  );
  for (const e of exs) {
    e.params = JSON.parse(e.params || '{}');
    e.presc = {};
  }
  const porId = Object.fromEntries(exs.map((e) => [e.id, e]));
  for (const p of presc) porId[p.plano_exercicio_id].presc[p.semana] = p;
  for (const s of plano.sessoes) s.exercicios = exs.filter((e) => e.sessao_id === s.id);
  return plano;
}

export function criarPlano({ cliente_id = null, nome, objetivo = null, data_inicio = null, num_semanas, deload_ultima = true, notas = null }) {
  return transacao(() => {
    const id = inserir('planos', { cliente_id, nome, objetivo, data_inicio, num_semanas, notas });
    for (let s = 1; s <= num_semanas; s++)
      inserir('plano_semanas', { plano_id: id, semana: s, deload: deload_ultima && s === num_semanas && num_semanas > 1 ? 1 : 0 });
    return id;
  });
}

// Atualiza dados do plano; se mudar o nº de semanas, cria/remove semanas (e prescrições a mais).
export function atualizarPlano(id, dados) {
  transacao(() => {
    const antes = escalar('SELECT num_semanas FROM planos WHERE id = ?', [id]);
    atualizar('planos', id, { ...dados, atualizado_em: new Date().toISOString() });
    const n = dados.num_semanas ?? antes;
    if (n > antes) for (let s = antes + 1; s <= n; s++) inserir('plano_semanas', { plano_id: id, semana: s, deload: 0 });
    if (n < antes) {
      executar('DELETE FROM plano_semanas WHERE plano_id = ? AND semana > ?', [id, n]);
      executar(
        `DELETE FROM plano_prescricoes WHERE semana > ? AND plano_exercicio_id IN
         (SELECT pe.id FROM plano_exercicios pe JOIN plano_sessoes s ON s.id = pe.sessao_id WHERE s.plano_id = ?)`,
        [n, id]
      );
    }
  });
}

// Só um plano ativo por cliente: ativar um conclui os outros ativos.
export function definirEstado(id, estado) {
  return transacao(() => {
    const p = um('SELECT cliente_id FROM planos WHERE id = ?', [id]);
    let concluidos = 0;
    if (estado === 'ativo' && p.cliente_id)
      concluidos = executar("UPDATE planos SET estado = 'concluido' WHERE cliente_id = ? AND estado = 'ativo' AND id <> ?", [p.cliente_id, id]).alteradas;
    atualizar('planos', id, { estado });
    return concluidos;
  });
}
export const apagarPlano = (id) => executar('DELETE FROM planos WHERE id = ?', [id]);
export const definirSemana = (planoId, semana, dados) =>
  executar('UPDATE plano_semanas SET deload = ?, foco = ? WHERE plano_id = ? AND semana = ?', [dados.deload ? 1 : 0, dados.foco || null, planoId, semana]);

// ---------- Sessões ----------
export function adicionarSessao(planoId, dados) {
  const ordem = (escalar('SELECT MAX(ordem) FROM plano_sessoes WHERE plano_id = ?', [planoId]) ?? -1) + 1;
  return inserir('plano_sessoes', { plano_id: planoId, ordem, ...dados });
}
export const atualizarSessao = (id, dados) => atualizar('plano_sessoes', id, dados);
export const apagarSessao = (id) => executar('DELETE FROM plano_sessoes WHERE id = ?', [id]);

// Move um item uma posição (dir = -1 sobe, +1 desce) renumerando a ordem do grupo.
function mover(tabela, campoGrupo, id, dir) {
  transacao(() => {
    const grupo = escalar(`SELECT ${campoGrupo} FROM ${tabela} WHERE id = ?`, [id]);
    const ids = todos(`SELECT id FROM ${tabela} WHERE ${campoGrupo} = ? ORDER BY ordem, id`, [grupo]).map((r) => r.id);
    const i = ids.indexOf(id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    ids.forEach((x, k) => executar(`UPDATE ${tabela} SET ordem = ? WHERE id = ?`, [k, x]));
  });
}
export const moverSessao = (id, dir) => mover('plano_sessoes', 'plano_id', id, dir);
export const moverExercicio = (id, dir) => mover('plano_exercicios', 'sessao_id', id, dir);

// ---------- Exercícios do plano e prescrições ----------
export function adicionarExercicioPlano(sessaoId, { exercicio_id, metodo, params, notas }) {
  const ordem = (escalar('SELECT MAX(ordem) FROM plano_exercicios WHERE sessao_id = ?', [sessaoId]) ?? -1) + 1;
  return inserir('plano_exercicios', { sessao_id: sessaoId, exercicio_id, ordem, metodo, params: JSON.stringify(params || {}), notas });
}
export const atualizarExercicioPlano = (id, { metodo, params, notas }) =>
  atualizar('plano_exercicios', id, { metodo, params: JSON.stringify(params || {}), notas });
export const trocarExercicio = (id, novoExercicioId) => atualizar('plano_exercicios', id, { exercicio_id: novoExercicioId });
export const apagarExercicioPlano = (id) => executar('DELETE FROM plano_exercicios WHERE id = ?', [id]);

export function gravarPrescricao(peId, semana, p) {
  const vals = CAMPOS_PRESCRICAO.map((c) => p[c] ?? null);
  executar(
    `INSERT INTO plano_prescricoes (plano_exercicio_id, semana, ${CAMPOS_PRESCRICAO.join(',')})
     VALUES (?, ?, ${CAMPOS_PRESCRICAO.map(() => '?').join(',')})
     ON CONFLICT(plano_exercicio_id, semana) DO UPDATE SET ${CAMPOS_PRESCRICAO.map((c) => `${c} = excluded.${c}`).join(', ')}`,
    [peId, semana, ...vals]
  );
}

export const limparSemanasSeguintes = (peId, semana) =>
  executar('DELETE FROM plano_prescricoes WHERE plano_exercicio_id = ? AND semana > ?', [peId, semana]);

// Preenche só as semanas SEM prescrição a seguir à semana-âncora (nunca apaga trabalho feito).
export function preencherSemanasVazias(planoId, peId, semanaAncora) {
  const plano = obterPlano(planoId);
  const pe = plano.sessoes.flatMap((s) => s.exercicios).find((e) => e.id === peId);
  const ancora = pe?.presc[semanaAncora];
  if (!ancora) return 0;
  const sug = sugerirSeguintes(ancora, semanaAncora, plano.semanas, pe.tipo_registo, pe.metodo, pe.params, cfgProgressao());
  let n = 0;
  transacao(() => {
    for (const [s, p] of Object.entries(sug)) if (!pe.presc[s]) { gravarPrescricao(peId, +s, p); n++; }
  });
  return n;
}

// Sugestões para todas as semanas após a âncora, só onde a sugestão difere do que existe.
export function sugestoesPlano(plano, semanaAncora) {
  const cfg = cfgProgressao();
  const lista = [];
  for (const s of plano.sessoes)
    for (const pe of s.exercicios) {
      const ancora = pe.presc[semanaAncora];
      if (!ancora) continue;
      // Usa o realizado da semana-âncora (sessões registadas), se existir.
      const realizado = plano.cliente_id
        ? todos(
            `SELECT y.carga_kg, y.reps, y.rpe, y.qualidade FROM sessao_series y
             JOIN sessao_exercicios x ON x.id = y.sessao_exercicio_id JOIN sessoes ss ON ss.id = x.sessao_id
             WHERE x.plano_exercicio_id = ? AND ss.semana = ? AND ss.estado = 'realizada' AND y.estado = 'feita'
               AND x.substitui_exercicio_id IS NULL`,
            [pe.id, semanaAncora]
          )
        : [];
      const sug = sugerirSeguintes(ancora, semanaAncora, plano.semanas, pe.tipo_registo, pe.metodo, pe.params, cfg, realizado);
      for (const [sem, p] of Object.entries(sug))
        if (!iguais(pe.presc[sem], p)) lista.push({ sessao: s, pe, semana: +sem, atual: pe.presc[sem] || null, sugerida: p, motivo: p._motivo || null });
    }
  return lista.sort((a, b) => a.semana - b.semana);
}

// Duplica um plano completo (para outro cliente ou como template).
export function duplicarPlano(origemId, { cliente_id = null, nome, data_inicio = null }) {
  const o = obterPlano(origemId);
  return transacao(() => {
    const id = inserir('planos', {
      cliente_id, nome, objetivo: o.objetivo, data_inicio, num_semanas: o.num_semanas, origem_id: o.id, notas: o.notas,
    });
    for (const s of o.semanas) inserir('plano_semanas', { plano_id: id, semana: s.semana, deload: s.deload, foco: s.foco });
    for (const s of o.sessoes) {
      const sid = inserir('plano_sessoes', { plano_id: id, ordem: s.ordem, nome: s.nome, dia_semana: s.dia_semana, notas: s.notas });
      for (const e of s.exercicios) {
        const peId = inserir('plano_exercicios', {
          sessao_id: sid, exercicio_id: e.exercicio_id, ordem: e.ordem, metodo: e.metodo, params: JSON.stringify(e.params), notas: e.notas,
        });
        for (const [sem, p] of Object.entries(e.presc)) gravarPrescricao(peId, +sem, p);
      }
    }
    return id;
  });
}

// Contraindicações dos exercícios de um plano de cliente (templates não têm cliente → sem avisos).
export function avisosPlano(plano) {
  if (!plano.cliente_id) return {};
  const avisos = {};
  for (const s of plano.sessoes)
    for (const pe of s.exercicios) {
      const r = verificarContraindicacao(plano.cliente_id, pe.exercicio_id);
      if (r.contraindicado) avisos[pe.id] = r;
    }
  return avisos;
}

// Volume da semana: séries por grupo muscular e minutos de resistência.
export function volumeSemana(plano, semana) {
  const grupos = {};
  let minutos = 0;
  for (const s of plano.sessoes)
    for (const pe of s.exercicios) {
      const p = pe.presc[semana];
      if (!p) continue;
      if (pe.tipo_registo === 'resistencia') {
        minutos += p.duracao_min || (p.int_repeticoes ? (p.int_repeticoes * ((p.int_trabalho_seg || 0) + (p.int_recuperacao_seg || 0))) / 60 : 0);
      } else if (p.series) {
        const g = pe.grupo_muscular || 'Outro';
        grupos[g] = (grupos[g] || 0) + p.series;
      }
    }
  return { grupos, minutos: Math.round(minutos) };
}
