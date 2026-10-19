// Análise de progresso (núcleo). Tudo é calculado a partir dos dados brutos já registados:
// sessões/séries (repo-sessoes) e avaliações (repo). Nada é guardado em duplicado.
import { todos } from './db.js';
import { epley } from './calc.js';
import * as repo from './repo.js';
import { alertaPacote } from './repo-pacotes.js';
import { DEFINICOES_PADRAO, TESTES_AEROBIOS } from './catalogos.js';
import { hojeISO, num } from './util.js';

export const cfgAnalise = () => ({ ...DEFINICOES_PADRAO.alertas_analise, ...repo.def('alertas_analise') });

// ---------------------------------------------------------------- Datas
const p2 = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const somarDias = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
export const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
export const inicioSemana = (s) => somarDias(s, -((new Date(s + 'T12:00:00').getDay() + 6) % 7)); // segunda-feira
const max = (arr) => (arr.length ? Math.max(...arr) : null);
const media = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const pct = (novo, antigo) => (antigo ? ((novo - antigo) / antigo) * 100 : null);

// ---------------------------------------------------------------- Dados brutos
function seriesRealizadas(clienteId) {
  return todos(
    `SELECT s.id AS sessao_id, s.data, x.exercicio_id, e.nome, e.grupo_muscular, e.tipo_registo, e.unidade_ritmo,
       y.carga_kg, y.reps, y.rpe, y.qualidade, y.duracao_seg, y.distancia_m, y.fc_media
     FROM sessao_series y JOIN sessao_exercicios x ON x.id = y.sessao_exercicio_id
     JOIN sessoes s ON s.id = x.sessao_id JOIN exercicios e ON e.id = x.exercicio_id
     WHERE s.cliente_id = ? AND s.estado = 'realizada' AND y.estado = 'feita' ORDER BY s.data, s.hora_inicio`,
    [clienteId]
  );
}
const sessoesCliente = (clienteId) =>
  todos("SELECT * FROM sessoes WHERE cliente_id = ? AND estado IN ('realizada','faltou') ORDER BY data, hora_inicio", [clienteId]);

// ---------------------------------------------------------------- 1RM estimado ao longo do tempo
// Por exercício (= variante): melhor 1RM estimado por dia, de sessões e de testes de avaliação
// com qualidade técnica 1 ou 2. Testes unilaterais (por lado) ficam de fora desta série.
export function e1rmPorExercicio(clienteId, series = seriesRealizadas(clienteId)) {
  const mapa = new Map();
  const juntar = (exId, nome, grupo, data, carga, reps, fonte) => {
    const r = epley(carga, reps);
    if (!r) return;
    if (!mapa.has(exId)) mapa.set(exId, { exercicio_id: exId, nome, grupo, dias: new Map() });
    const ex = mapa.get(exId);
    const atual = ex.dias.get(data);
    if (!atual || r.valor > atual.valor) ex.dias.set(data, { data, valor: r.valor, carga, reps, fonte, baixa: r.baixaFiabilidade });
  };
  for (const y of series)
    if (y.tipo_registo === 'forca' && y.qualidade >= 1 && y.carga_kg > 0 && y.reps >= 1)
      juntar(y.exercicio_id, y.nome, y.grupo_muscular, y.data, y.carga_kg, y.reps, 'sessão');
  const testes = todos(
    `SELECT e.id AS exercicio_id, e.nome, e.grupo_muscular, t.carga_kg, t.reps, a.data
     FROM avaliacao_testes t JOIN avaliacoes a ON a.id = t.avaliacao_id JOIN exercicios e ON e.nome = t.variante
     WHERE a.cliente_id = ? AND t.carga_kg IS NOT NULL AND t.qualidade >= 1 AND t.lado IS NULL`,
    [clienteId]
  );
  for (const t of testes) juntar(t.exercicio_id, t.nome, t.grupo_muscular, t.data, t.carga_kg, t.reps, 'avaliação');
  return [...mapa.values()]
    .map((ex) => ({ ...ex, pontos: [...ex.dias.values()].sort((a, b) => a.data.localeCompare(b.data)) }))
    .sort((a, b) => b.pontos.length - a.pontos.length || a.nome.localeCompare(b.nome));
}

// ---------------------------------------------------------------- Semanas (volume, carga interna, assiduidade)
// Carga interna (sRPE) = RPE da sessão × duração (min). Sem RPE da sessão usa-se a média do RPE das séries.
export function semanas(clienteId, n = 12, series = seriesRealizadas(clienteId)) {
  const hoje = hojeISO();
  const ini0 = inicioSemana(somarDias(hoje, -(n - 1) * 7));
  const lista = Array.from({ length: n }, (_, i) => ({
    inicio: somarDias(ini0, i * 7), sessoes: 0, faltas: 0, tonelagem: 0, series: 0, cargaInterna: 0, minutos: 0, rpes: [], parcial: false,
  }));
  const porSessao = new Map();
  for (const y of series) {
    const s = porSessao.get(y.sessao_id) || { ton: 0, n: 0, rpes: [] };
    if (y.tipo_registo === 'forca') { s.n++; if (y.carga_kg && y.reps) s.ton += y.carga_kg * y.reps; }
    if (y.rpe != null) s.rpes.push(y.rpe);
    porSessao.set(y.sessao_id, s);
  }
  for (const s of sessoesCliente(clienteId)) {
    const i = Math.floor(diasEntre(ini0, s.data) / 7);
    if (i < 0 || i >= n) continue;
    const w = lista[i];
    if (s.estado === 'faltou') { w.faltas++; continue; }
    const ps = porSessao.get(s.id) || { ton: 0, n: 0, rpes: [] };
    w.sessoes++;
    w.tonelagem += ps.ton;
    w.series += ps.n;
    const min = s.duracao_seg ? s.duracao_seg / 60 : null;
    if (min) w.minutos += min;
    const rpe = s.rpe_sessao ?? media(ps.rpes);
    if (rpe != null) w.rpes.push(rpe);
    if (rpe != null && min) w.cargaInterna += rpe * min;
    else w.parcial = true; // sessão sem RPE ou sem duração: carga interna incompleta
  }
  lista[n - 1].emCurso = true; // semana atual (até hoje)
  return lista.map((w) => ({ ...w, tonelagem: Math.round(w.tonelagem), cargaInterna: Math.round(w.cargaInterna), minutos: Math.round(w.minutos), rpeMedio: media(w.rpes) }));
}

// ---------------------------------------------------------------- Indicadores de carga
export function indicadores(c, sem = semanas(c.id, 12)) {
  const hoje = hojeISO();
  const n = sem.length;
  const completas = sem.slice(0, n - 1);
  const ult4 = completas.slice(-4), ant4 = completas.slice(-8, -4);
  const freq = c.frequencia_semanal || null;
  const sess = sessoesCliente(c.id).filter((s) => s.estado === 'realizada');
  // Assiduidade só conta semanas a partir da 1.ª sessão (um cliente novo não tem "faltas" antes de começar).
  const inicioCliente = sess.length ? inicioSemana(sess[0].data) : null;
  const assid = (ws) => {
    const validas = ws.filter((w) => inicioCliente && w.inicio >= inicioCliente);
    return freq && validas.length ? Math.round(media(validas.map((w) => Math.min(1, w.sessoes / freq))) * 100) : null;
  };

  // Rácio agudo:crónico da carga interna (7 dias ÷ média semanal de 28 dias).
  const series = seriesRealizadas(c.id);
  const rpePorSessao = new Map();
  for (const y of series) if (y.rpe != null) (rpePorSessao.get(y.sessao_id) || rpePorSessao.set(y.sessao_id, []).get(y.sessao_id)).push(y.rpe);
  const carga = (s) => {
    const rpe = s.rpe_sessao ?? media(rpePorSessao.get(s.id) || []);
    return rpe != null && s.duracao_seg ? (rpe * s.duracao_seg) / 60 : 0;
  };
  const aguda = sess.filter((s) => diasEntre(s.data, hoje) < 7).reduce((a, s) => a + carga(s), 0);
  const cronica = sess.filter((s) => diasEntre(s.data, hoje) < 28).reduce((a, s) => a + carga(s), 0) / 4;
  const historicoSuficiente = sess.length && diasEntre(sess[0].data, hoje) >= 21;
  const acwr = historicoSuficiente && cronica > 0 ? Math.round((aguda / cronica) * 100) / 100 : null;

  const ultima = sess[sess.length - 1]?.data ?? null;
  const ultimas4 = sess.slice(-4).map((s) => s.rpe_sessao ?? media(rpePorSessao.get(s.id) || [])).filter((x) => x != null);
  const ton = (ws) => ws.reduce((a, w) => a + w.tonelagem, 0);
  return {
    semanaAnterior: completas[completas.length - 1],
    semanaAtual: sem[n - 1],
    assiduidade4: assid(ult4),
    assiduidade2: assid(completas.slice(-2)),
    acwr, aguda: Math.round(aguda), cronica: Math.round(cronica),
    tendenciaVolume: ton(ant4) ? Math.round(pct(ton(ult4), ton(ant4))) : null,
    diasSemTreinar: ultima ? diasEntre(ultima, hoje) : null,
    rpeAltoSessoes: ultimas4.filter((r) => r >= cfgAnalise().rpe_alto).length,
    rpeUltimas: ultimas4,
  };
}

// ---------------------------------------------------------------- Estagnações e variações por exercício
function variacoes(e1rm) {
  const cfg = cfgAnalise();
  const hoje = hojeISO();
  const corte = somarDias(hoje, -cfg.semanas_estagnacao * 7);
  return e1rm.map((ex) => {
    // Só séries de treino: um teste de avaliação é um esforço máximo e não é comparável
    // com séries a RPE 7–8 (daria falsas estagnações). Testes comparam-se nas Avaliações.
    const pts = ex.pontos.filter((p) => p.fonte === 'sessão');
    const recentes = pts.filter((p) => p.data >= corte);
    const antes = pts.filter((p) => p.data < corte);
    const melhorRec = max(recentes.map((p) => p.valor));
    const melhorAntes = max(antes.map((p) => p.valor));
    const base = pts[0];
    return {
      ...ex, base, melhorRec, melhorAntes,
      vsBase: melhorRec != null && base ? pct(melhorRec, base.valor) : null,
      // Estagnado: tem registos recentes e antigos e o melhor recente não supera o melhor anterior.
      estagnado: recentes.length >= 2 && antes.length >= 1 && melhorRec <= melhorAntes,
      queda: melhorRec != null && melhorAntes != null && melhorRec < melhorAntes * (1 - cfg.queda_pct / 100),
    };
  });
}

// PRs nos últimos N dias: um ponto que supera tudo o que havia antes dele.
function prsRecentes(e1rm, dias = 14) {
  const corte = somarDias(hojeISO(), -dias);
  const prs = [];
  for (const ex of e1rm) {
    let melhor = null;
    for (const p of ex.pontos) {
      if (melhor != null && p.valor > melhor && p.data >= corte && p.fonte === 'sessão')
        prs.push({ nome: ex.nome, ...p, anterior: melhor });
      melhor = Math.max(melhor ?? 0, p.valor);
    }
  }
  return prs.sort((a, b) => b.data.localeCompare(a.data));
}

// ---------------------------------------------------------------- Alertas (só para o treinador)
export function alertasCliente(c, { e1rm, ind } = {}) {
  const cfg = cfgAnalise();
  e1rm ??= e1rmPorExercicio(c.id);
  ind ??= indicadores(c);
  const al = [];
  const add = (nivel, texto, tab) => al.push({ nivel, texto, tab });

  // Reavaliação em atraso
  const avs = repo.listarAvaliacoes(c.id);
  if (avs.length) {
    const prox = somarDias(avs[avs.length - 1].data, c.intervalo_reavaliacao_semanas * 7);
    if (prox < hojeISO()) add('alerta', `Reavaliação em atraso (desde ${prox.split('-').reverse().join('/')})`, 'avaliacoes');
  }
  // Pacote a acabar
  const ap = alertaPacote(c.id);
  if (ap) add(ap.nivel, ap.texto, 'pacotes');
  // Assiduidade
  if (ind.diasSemTreinar != null && ind.diasSemTreinar > cfg.dias_sem_treinar) add('alerta', `Sem treinar há ${ind.diasSemTreinar} dias`, 'sessoes');
  else if (ind.assiduidade2 != null && ind.assiduidade2 < cfg.assiduidade_min_pct) add('aviso', `Quebra de assiduidade: ${ind.assiduidade2}% nas últimas 2 semanas`, 'analise');
  // Carga
  if (ind.acwr != null && ind.acwr > cfg.acwr_max) add('alerta', `Aumento brusco de carga (rácio agudo:crónico ${num(ind.acwr, 2)})`, 'analise');
  if (ind.rpeAltoSessoes >= 3) add('aviso', `RPE consistentemente alto (${ind.rpeAltoSessoes} das últimas ${ind.rpeUltimas.length} sessões ≥ ${cfg.rpe_alto})`, 'analise');
  // Último check-in (até 10 dias): dor alta, sono ou energia baixos.
  const ck = todos('SELECT * FROM checkins WHERE cliente_id = ? ORDER BY data DESC LIMIT 1', [c.id])[0];
  if (ck && diasEntre(ck.data, hojeISO()) <= 10) {
    const p = [];
    if (ck.dor >= 4) p.push(`dor ${ck.dor}/5`);
    if (ck.sono <= 2) p.push(`sono ${ck.sono}/5`);
    if (ck.energia <= 2) p.push(`energia ${ck.energia}/5`);
    if (p.length) add('aviso', `Check-in: ${p.join(', ')}${ck.notas ? ` — “${ck.notas}”` : ''}`, 'metas');
  }
  // Progressão
  const v = variacoes(e1rm);
  const estag = v.filter((x) => x.estagnado);
  if (estag.length) add('aviso', `Estagnado: ${estag.map((x) => x.nome).join(', ')} (sem melhorar o 1RM est. há ${cfg.semanas_estagnacao}+ semanas)`, 'analise');
  const quedas = v.filter((x) => x.queda);
  if (quedas.length) add('aviso', `Queda de força: ${quedas.map((x) => `${x.nome} (${num(pct(x.melhorRec, x.melhorAntes), 0)}%)`).join(', ')}`, 'analise');
  return al;
}

// ---------------------------------------------------------------- Highlights automáticos
export function highlights(c, { e1rm } = {}) {
  e1rm ??= e1rmPorExercicio(c.id);
  const v = variacoes(e1rm);
  const hl = [];
  for (const p of prsRecentes(e1rm).slice(0, 4))
    hl.push({ tipo: 'pr', texto: `${p.nome}: ${num(p.valor)} kg (${num(p.carga)} × ${p.reps})`, detalhe: `+${num(pct(p.valor, p.anterior), 1)}% vs melhor anterior · ${p.data.split('-').reverse().join('/')}` });
  v.filter((x) => x.vsBase != null && x.vsBase >= 2 && x.base.data < somarDias(hojeISO(), -14))
    .sort((a, b) => b.vsBase - a.vsBase).slice(0, 3)
    .forEach((x) => hl.push({ tipo: 'subida', texto: `${x.nome}: +${num(x.vsBase, 1)}% desde ${x.base.data.split('-').reverse().slice(0, 2).join('/')}`, detalhe: `${num(x.base.valor)} → ${num(x.melhorRec)} kg (1RM est. nas séries de treino)` }));
  v.filter((x) => x.queda).forEach((x) => hl.push({ tipo: 'queda', texto: `${x.nome}: ${num(pct(x.melhorRec, x.melhorAntes), 1)}%`, detalhe: `melhor recente ${num(x.melhorRec)} kg vs ${num(x.melhorAntes)} kg antes` }));
  v.filter((x) => x.estagnado).forEach((x) => hl.push({ tipo: 'estagnacao', texto: `${x.nome}: sem subir há ${cfgAnalise().semanas_estagnacao}+ semanas`, detalhe: `melhor ${num(x.melhorAntes)} kg` }));

  // Composição e resistência (primeira vs última avaliação).
  const avs = repo.listarAvaliacoes(c.id).map((a) => repo.obterAvaliacao(a.id));
  if (avs.length >= 2) {
    const [a0, a1] = [avs[0], avs[avs.length - 1]];
    const p0 = a0.composicao?.peso_kg, p1 = a1.composicao?.peso_kg;
    if (p0 && p1 && p0 !== p1) hl.push({ tipo: 'info', texto: `Peso: ${p1 > p0 ? '+' : ''}${num(p1 - p0)} kg desde a baseline`, detalhe: `${num(p0)} → ${num(p1)} kg (bioimpedância: tendência)` });
    const c0 = a0.perimetros.find((p) => p.perimetro === 'Cintura')?.valor_cm, c1 = a1.perimetros.find((p) => p.perimetro === 'Cintura')?.valor_cm;
    if (c0 && c1 && c0 !== c1) hl.push({ tipo: 'info', texto: `Cintura: ${c1 > c0 ? '+' : ''}${num(c1 - c0)} cm desde a baseline`, detalhe: `${num(c0)} → ${num(c1)} cm` });
    const r0 = a0.resistencia, r1 = a1.resistencia;
    if (r0?.teste && r0.teste === r1?.teste) {
      const info = TESTES_AEROBIOS[r0.teste];
      const [x0, x1] = info.tipo === 'tempo' ? [r0.tempo_seg, r1.tempo_seg] : [r0.distancia_m, r1.distancia_m];
      if (x0 && x1 && x0 !== x1) {
        const melhor = info.tipo === 'tempo' ? x1 < x0 : x1 > x0;
        hl.push({ tipo: melhor ? 'subida' : 'queda', texto: `${info.nome}: ${melhor ? 'melhorou' : 'piorou'} ${num(Math.abs(pct(x1, x0)), 1)}%`, detalhe: 'teste aeróbio, baseline vs última avaliação' });
      }
    }
  }
  return hl;
}

// ---------------------------------------------------------------- Comparações (semana, 4 semanas, blocos)
export function comparacaoBlocos(c, e1rm) {
  const hoje = hojeISO();
  const planos = todos('SELECT * FROM planos WHERE cliente_id = ? AND data_inicio IS NOT NULL AND data_inicio <= ? ORDER BY data_inicio', [c.id, hoje]);
  if (planos.length < 2) return null;
  const [ant, atual] = planos.slice(-2);
  const periodo = (p, ate) => ({ de: p.data_inicio, ate: ate ?? somarDias(p.data_inicio, p.num_semanas * 7 - 1) });
  const per = [periodo(ant, somarDias(atual.data_inicio, -1)), periodo(atual, hoje)];
  const sess = sessoesCliente(c.id).filter((s) => s.estado === 'realizada');
  const series = seriesRealizadas(c.id);
  const metricas = per.map(({ de, ate }) => {
    const ss = sess.filter((s) => s.data >= de && s.data <= ate);
    const ys = series.filter((y) => y.data >= de && y.data <= ate && y.tipo_registo === 'forca');
    const semanasN = Math.max(1, Math.ceil((diasEntre(de, ate) + 1) / 7));
    return {
      sessoes: ss.length, porSemana: ss.length / semanasN,
      tonelagem: Math.round(ys.reduce((a, y) => a + (y.carga_kg || 0) * (y.reps || 0), 0)),
      rpe: media(ys.filter((y) => y.rpe != null).map((y) => y.rpe)),
    };
  });
  // Melhor 1RM est. de cada exercício principal em cada bloco.
  const exs = e1rm.slice(0, 5).map((ex) => ({
    nome: ex.nome,
    valores: per.map(({ de, ate }) => max(ex.pontos.filter((p) => p.fonte === 'sessão' && p.data >= de && p.data <= ate).map((p) => p.valor))),
  })).filter((x) => x.valores.some((v) => v != null));
  return { nomes: [ant.nome, atual.nome], periodos: per, metricas, exs };
}

// ---------------------------------------------------------------- Séries para gráficos
export function serieComposicao(clienteId) {
  return repo.listarAvaliacoes(clienteId).map((a) => repo.obterAvaliacao(a.id)).map((a) => ({
    data: a.data, peso: a.composicao?.peso_kg ?? null, mg: a.composicao?.massa_gorda_pct ?? null, mm: a.composicao?.massa_magra_kg ?? null,
    padronizada: !!a.composicao?.condicoes_padronizadas, perimetros: a.perimetros, av: a,
  }));
}

// Resistência: testes (avaliações) e sessões de corrida/remo com distância (ritmo e FC média).
export function serieResistencia(c) {
  const testes = serieComposicao(c.id).map(({ av }) => ({ data: av.data, r: av.resistencia })).filter((x) => x.r);
  const sessoes = seriesRealizadas(c.id)
    .filter((y) => y.tipo_registo === 'resistencia' && y.duracao_seg && (y.distancia_m || y.fc_media))
    .map((y) => ({
      data: y.data, nome: y.nome, unidade: y.unidade_ritmo,
      ritmo: y.distancia_m && y.unidade_ritmo ? (y.duracao_seg / y.distancia_m) * (y.unidade_ritmo === '500m' ? 500 : 1000) : null,
      fc: y.fc_media, duracao: y.duracao_seg, distancia: y.distancia_m,
    }));
  return { testes, sessoes };
}

export { seriesRealizadas, variacoes };
