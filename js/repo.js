// Acesso aos dados e regras de negócio (sem HTML).
import { todos, um, escalar, executar, inserir, atualizar, transacao, lerDefinicao } from './db.js';
import { TESTES_FORCA, testePorId, infoVariante, DEFINICOES_PADRAO, TESTES_AEROBIOS } from './catalogos.js';
import * as calc from './calc.js';

export const def = (chave) => lerDefinicao(chave, DEFINICOES_PADRAO[chave]);

// ====================== Clientes ======================
function prepCliente(c) {
  if (!c) return null;
  c.variantes = JSON.parse(c.variantes || '{}');
  c.idade = calc.idade(c.data_nascimento);
  return c;
}
export function listarClientes({ incluirInativos = false } = {}) {
  return todos(
    `SELECT c.*,
       (SELECT COUNT(*) FROM lesoes l WHERE l.cliente_id = c.id AND l.estado <> 'resolvida') AS lesoes_ativas,
       (SELECT MAX(data) FROM avaliacoes a WHERE a.cliente_id = c.id) AS ultima_avaliacao,
       (SELECT COUNT(*) FROM avaliacoes a WHERE a.cliente_id = c.id AND a.tipo = 'baseline') AS tem_baseline
     FROM clientes c ${incluirInativos ? '' : 'WHERE c.ativo = 1'}
     ORDER BY c.nome COLLATE NOCASE`
  ).map(prepCliente);
}
export const obterCliente = (id) => prepCliente(um('SELECT * FROM clientes WHERE id = ?', [id]));

export function guardarCliente(dados, id = null) {
  const obj = { ...dados, variantes: JSON.stringify(dados.variantes || {}) };
  if (id) {
    atualizar('clientes', id, { ...obj, atualizado_em: new Date().toISOString() });
    return id;
  }
  return inserir('clientes', obj);
}
export const apagarCliente = (id) => executar('DELETE FROM clientes WHERE id = ?', [id]);

// ====================== Consentimentos ======================
export const listarConsentimentos = (clienteId) =>
  todos('SELECT * FROM consentimentos WHERE cliente_id = ? ORDER BY data DESC, id DESC', [clienteId]);

// Estado atual de cada tipo: o registo mais recente manda; revogado = sem consentimento.
export function estadoConsentimentos(clienteId) {
  const estado = {};
  for (const c of listarConsentimentos(clienteId)) {
    if (estado[c.tipo] !== undefined) continue;
    estado[c.tipo] = c.concedido === 1 && !c.revogado_em ? c : null;
  }
  return estado;
}
export const temConsentimento = (clienteId, tipo) => !!estadoConsentimentos(clienteId)[tipo];

// ====================== Lesões e contraindicações ======================
export const listarLesoes = (clienteId) =>
  todos(
    `SELECT * FROM lesoes WHERE cliente_id = ?
     ORDER BY CASE estado WHEN 'ativa' THEN 0 WHEN 'em_recuperacao' THEN 1 ELSE 2 END, data_inicio DESC`,
    [clienteId]
  );

export const listarContraindicacoes = (clienteId) =>
  todos(
    `SELECT ci.*, e.nome AS exercicio_nome, p.nome AS padrao_nome, l.zona AS lesao_zona
     FROM contraindicacoes ci
     LEFT JOIN exercicios e ON e.id = ci.exercicio_id
     LEFT JOIN padroes_movimento p ON p.id = ci.padrao_id
     LEFT JOIN lesoes l ON l.id = ci.lesao_id
     WHERE ci.cliente_id = ?
     ORDER BY ci.ativa DESC, ci.id DESC`,
    [clienteId]
  );

export const listarPadroes = () => todos('SELECT * FROM padroes_movimento ORDER BY nome');
export const listarExercicios = () =>
  todos(
    `SELECT e.*, p.nome AS padrao_nome FROM exercicios e
     LEFT JOIN padroes_movimento p ON p.id = e.padrao_id
     WHERE e.ativo = 1 ORDER BY e.nome COLLATE NOCASE`
  );

// Verifica se um exercício é contraindicado para o cliente (por exercício ou por padrão)
// e sugere alternativas da biblioteca que NÃO estejam contraindicadas.
// Usado na Fase 2 ao montar/editar planos.
export function verificarContraindicacao(clienteId, exercicioId) {
  const ex = um('SELECT * FROM exercicios WHERE id = ?', [exercicioId]);
  if (!ex) return { contraindicado: false, motivos: [], alternativas: [] };

  const ativas = todos(
    `SELECT ci.*, p.nome AS padrao_nome, l.zona AS lesao_zona, l.estado AS lesao_estado
     FROM contraindicacoes ci
     LEFT JOIN padroes_movimento p ON p.id = ci.padrao_id
     LEFT JOIN lesoes l ON l.id = ci.lesao_id
     WHERE ci.cliente_id = ? AND ci.ativa = 1`,
    [clienteId]
  );
  const bloqueado = (e) => ativas.filter((ci) => ci.exercicio_id === e.id || (ci.padrao_id && ci.padrao_id === e.padrao_id));
  const motivos = bloqueado(ex);
  if (!motivos.length) return { contraindicado: false, motivos: [], alternativas: [] };

  // 1.º alternativas definidas na biblioteca; 2.º outros exercícios do mesmo grupo muscular.
  const candidatos = [
    ...todos(
      `SELECT e.* FROM exercicio_alternativas a JOIN exercicios e ON e.id = a.alternativa_id
       WHERE a.exercicio_id = ? AND e.ativo = 1`,
      [ex.id]
    ),
    ...todos('SELECT * FROM exercicios WHERE grupo_muscular = ? AND id <> ? AND ativo = 1', [ex.grupo_muscular, ex.id]),
  ];
  const vistos = new Set();
  const alternativas = candidatos.filter((e) => {
    if (vistos.has(e.id) || bloqueado(e).length) return false;
    vistos.add(e.id);
    return true;
  });
  return { contraindicado: true, nivel: motivos.some((m) => m.nivel === 'evitar') ? 'evitar' : 'adaptar', motivos, alternativas: alternativas.slice(0, 5) };
}

// ====================== Avaliações ======================
export const listarAvaliacoes = (clienteId) =>
  todos('SELECT * FROM avaliacoes WHERE cliente_id = ? ORDER BY data, id', [clienteId]);

export function obterAvaliacao(id) {
  const a = um('SELECT * FROM avaliacoes WHERE id = ?', [id]);
  if (!a) return null;
  a.testes = todos('SELECT * FROM avaliacao_testes WHERE avaliacao_id = ? ORDER BY id', [id]).map((t) => ({
    ...t,
    tentativas: t.tentativas ? JSON.parse(t.tentativas) : null,
  }));
  a.composicao = um('SELECT * FROM avaliacao_composicao WHERE avaliacao_id = ?', [id]);
  a.perimetros = todos('SELECT * FROM avaliacao_perimetros WHERE avaliacao_id = ? ORDER BY id', [id]);
  a.resistencia = um('SELECT * FROM avaliacao_resistencia WHERE avaliacao_id = ?', [id]);
  return a;
}

// Grava uma avaliação completa (substitui os sub-registos se for edição).
export function guardarAvaliacao(clienteId, a, id = null) {
  return transacao(() => {
    const cab = { cliente_id: clienteId, data: a.data, tipo: a.tipo, notas: a.notas };
    if (id) {
      atualizar('avaliacoes', id, cab);
      for (const t of ['avaliacao_testes', 'avaliacao_composicao', 'avaliacao_perimetros', 'avaliacao_resistencia'])
        executar(`DELETE FROM ${t} WHERE avaliacao_id = ?`, [id]);
    } else {
      id = inserir('avaliacoes', cab);
    }
    for (const t of a.testes || [])
      inserir('avaliacao_testes', { ...t, avaliacao_id: id, tentativas: t.tentativas ? JSON.stringify(t.tentativas) : null });
    if (a.composicao) inserir('avaliacao_composicao', { ...a.composicao, avaliacao_id: id });
    for (const p of a.perimetros || []) inserir('avaliacao_perimetros', { ...p, avaliacao_id: id });
    if (a.resistencia) inserir('avaliacao_resistencia', { ...a.resistencia, avaliacao_id: id });
    return id;
  });
}
export const apagarAvaliacao = (id) => executar('DELETE FROM avaliacoes WHERE id = ?', [id]);

// Resultados calculados de uma avaliação (1RM, força relativa, assimetria, FC).
export function resultadosAvaliacao(av, cliente) {
  const peso = av.composicao?.peso_kg ?? null;
  const limiares = def('limiares_assimetria');
  const forca = [];

  for (const t of TESTES_FORCA) {
    const regs = av.testes.filter((x) => x.teste === t.id);
    if (!regs.length) continue;
    const r = { teste: t, variante: regs[0].variante, registos: regs };

    if (t.tipo === 'salto') {
      const reg = regs[0];
      r.melhor = calc.melhorTentativa(reg.tentativas);
      r.valido = reg.qualidade !== 0 && r.melhor != null;
    } else if (t.bilateral) {
      const lado = (l) => regs.find((x) => x.lado === l);
      const rmLado = (reg) => (reg && reg.qualidade !== 0 ? calc.epley(reg.carga_kg, reg.reps) : null);
      r.esq = rmLado(lado('esq'));
      r.dir = rmLado(lado('dir'));
      r.valido = !!(r.esq || r.dir);
      r.assimetria = calc.assimetria(r.esq?.valor, r.dir?.valor, limiares);
    } else {
      const reg = regs[0];
      const info = infoVariante(t.id, reg.variante);
      r.pesoCorporal = !!info.pesoCorporal;
      r.valido = reg.qualidade !== 0;
      if (info.pesoCorporal) {
        r.reps = reg.reps;
      } else {
        r.rm = r.valido ? calc.epley(reg.carga_kg, reg.reps) : null;
        if (info.relativa && r.rm) r.relativa = calc.forcaRelativa(r.rm.valor, peso);
      }
    }
    forca.push(r);
  }

  let resistencia = null;
  if (av.resistencia) {
    const rs = av.resistencia;
    const info = TESTES_AEROBIOS[rs.teste] || {};
    const metros = info.tipo === 'distancia' ? rs.distancia_m : info.distancia_m;
    const seg = info.tipo === 'distancia' ? info.duracao_seg : rs.tempo_seg;
    resistencia = {
      ...rs,
      info,
      ritmoKm: info.modalidade === 'corrida' ? calc.ritmoPorKm(seg, metros) : null,
      ritmo500: info.modalidade === 'remo' ? calc.ritmoPor500(seg, metros) : null,
      velocidade: info.modalidade === 'bike' ? calc.velocidadeKmh(seg, metros) : null,
      quedaFC: calc.quedaFC(rs.fc_pico, rs.fc_1min),
    };
  }
  return { peso, forca, resistencia };
}

// Variantes usadas nesta avaliação que diferem da avaliação comparada (impede comparações enganadoras).
export function variantesDiferentes(avA, avB) {
  const mapa = (av) => Object.fromEntries(av.testes.map((t) => [t.teste, t.variante]));
  const a = mapa(avA), b = mapa(avB);
  return Object.keys(a)
    .filter((k) => b[k] !== undefined && a[k] !== b[k])
    .map((k) => ({ teste: testePorId(k)?.nome || k, de: b[k], para: a[k] }));
}

// ====================== FC máxima ======================
// Usa a FC máx. definida (pico observado aceite) ou, por defeito, a estimativa de Tanaka.
export function fcMaxCliente(cliente) {
  const estimada = calc.tanaka(cliente.idade);
  const picoObservado = escalar(
    `SELECT MAX(r.fc_pico) FROM avaliacao_resistencia r JOIN avaliacoes a ON a.id = r.avaliacao_id WHERE a.cliente_id = ?`,
    [cliente.id]
  );
  const usada = cliente.fc_max_definida || estimada;
  return {
    estimada,
    definida: cliente.fc_max_definida,
    usada,
    fonte: cliente.fc_max_definida ? 'pico observado' : 'estimada (Tanaka)',
    picoObservado,
    sugerirAtualizar: picoObservado != null && picoObservado > usada,
  };
}

export function ultimaFCRepouso(clienteId) {
  return escalar(
    `SELECT r.fc_repouso FROM avaliacao_resistencia r JOIN avaliacoes a ON a.id = r.avaliacao_id
     WHERE a.cliente_id = ? AND r.fc_repouso IS NOT NULL ORDER BY a.data DESC, a.id DESC LIMIT 1`,
    [clienteId]
  );
}
