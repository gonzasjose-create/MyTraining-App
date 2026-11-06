// O que o CLIENTE pode ver (modo cliente, resumo semanal, relatório, imagem e WhatsApp).
// Regras: NUNCA notas privadas, pagamentos/pacotes, alertas internos, lesões/triagem, nem dados de
// outros clientes. Linguagem positiva: uma variação desfavorável é "ponto a trabalhar" (sem vermelho).
// A assimetria só aparece se o treinador a marcou como "mostrar ao cliente", com texto neutro.
import { todos } from './db.js';
import * as repo from './repo.js';
import { e1rmPorExercicio, variacoes, somarDias, inicioSemana, diasEntre } from './analise.js';
import { listarMetas, progressoMeta, consistencia, checkinSemana } from './repo-motivacao.js';
import { obterPlano } from './repo-planos.js';
import { planoAtivo, semanaDoPlano } from './repo-sessoes.js';
import { TESTES_AEROBIOS, TESTES_FORCA, DEFINICOES_PADRAO, familiaDe } from './catalogos.js';
import { escolherEquivalente, sementeSemana } from './equivalentes.js';
import { hojeISO, num, tempo } from './util.js';

const pct = (a, b) => (b ? ((a - b) / b) * 100 : null);

// ---------------------------------------------------------------- Comparação baseline vs última avaliação
export function comparacaoBaseline(c) {
  const avs = repo.listarAvaliacoes(c.id);
  if (!avs.length) return null;
  const base = repo.obterAvaliacao((avs.find((a) => a.tipo === 'baseline') || avs[0]).id);
  const ult = repo.obterAvaliacao(avs[avs.length - 1].id);
  const rb = repo.resultadosAvaliacao(base, c), ru = repo.resultadosAvaliacao(ult, c);
  const itens = [];
  const add = (grupo, nome, b, a, { maiorMelhor = true, neutro = false, fmt = (v) => num(v), unidade = '' } = {}) => {
    if (a == null && b == null) return;
    const d = a != null && b != null ? a - b : null;
    const sentido = d == null || Math.abs(d) < 1e-9 ? 'igual' : neutro ? 'neutro' : (d > 0) === maiorMelhor ? 'melhor' : 'ponto';
    itens.push({ grupo, nome, base: b, atual: a, delta: d, pct: d != null && b ? pct(a, b) : null, sentido, fmt, unidade });
  };
  const mesmo = ult.id === base.id;

  for (const t of TESTES_FORCA) {
    const fb = rb.forca.find((x) => x.teste.id === t.id), fu = ru.forca.find((x) => x.teste.id === t.id);
    const r = fu || fb;
    if (!r) continue;
    // Só se compara a mesma variante (evita comparações enganadoras).
    const comparavel = fb && fu && fb.variante === fu.variante;
    const B = (k) => (comparavel || mesmo ? fb?.[k] : null);
    if (t.tipo === 'salto') add('Potência', t.nome, comparavel ? fb.melhor : null, fu?.melhor, { unidade: 'cm', fmt: (v) => num(v, 0) });
    else if (t.bilateral) {
      add('Força', `${r.variante} · esq. (1RM est.)`, B('esq')?.valor, fu?.esq?.valor, { unidade: 'kg' });
      add('Força', `${r.variante} · dir. (1RM est.)`, B('dir')?.valor, fu?.dir?.valor, { unidade: 'kg' });
      if (c.mostrar_assimetria_cliente && fu?.assimetria)
        add('Força', 'Diferença entre lados', B('assimetria')?.pct, fu.assimetria.pct, { maiorMelhor: false, unidade: '%' });
    } else if (r.pesoCorporal) add('Força', `${r.variante} (repetições)`, B('reps'), fu?.reps, { fmt: (v) => num(v, 0), unidade: 'reps' });
    else {
      add('Força', `${r.variante} (1RM est.)`, B('rm')?.valor, fu?.rm?.valor, { unidade: 'kg' });
      if (fu?.relativa != null) add('Força', `${r.variante} · força relativa`, B('relativa'), fu.relativa, { fmt: (v) => num(v, 2), unidade: '× peso' });
    }
  }
  const cb = base.composicao, cu = ult.composicao;
  if (cb || cu) {
    add('Corpo', 'Peso', cb?.peso_kg, cu?.peso_kg, { neutro: true, unidade: 'kg' });
    add('Corpo', '% massa gorda', cb?.massa_gorda_pct, cu?.massa_gorda_pct, { neutro: true, unidade: '%' });
    add('Corpo', 'Massa magra', cb?.massa_magra_kg, cu?.massa_magra_kg, { neutro: true, unidade: 'kg' });
  }
  for (const p of ult.perimetros) {
    const pb = base.perimetros.find((x) => x.perimetro === p.perimetro && x.lado === p.lado);
    add('Perímetros', `${p.perimetro}${p.lado ? (p.lado === 'esq' ? ' · esq.' : ' · dir.') : ''}`, pb?.valor_cm, p.valor_cm, { neutro: true, unidade: 'cm' });
  }
  const sb = base.resistencia, su = ult.resistencia;
  if (su?.teste) {
    const info = TESTES_AEROBIOS[su.teste];
    const comp = sb?.teste === su.teste;
    if (info.tipo === 'tempo') add('Resistência', info.nome, comp ? sb.tempo_seg : null, su.tempo_seg, { maiorMelhor: false, fmt: tempo });
    else add('Resistência', info.nome, comp ? sb.distancia_m : null, su.distancia_m, { unidade: 'm', fmt: (v) => num(v, 0) });
  }
  if (su?.fc_repouso || sb?.fc_repouso) add('Resistência', 'FC de repouso', sb?.fc_repouso, su?.fc_repouso, { maiorMelhor: false, unidade: 'bpm', fmt: (v) => num(v, 0) });
  return { base, ult, mesmo, itens };
}

// ---------------------------------------------------------------- PRs num período (1RM est., qualidade 1–2)
export function prsPeriodo(c, de, ate, e1rm = e1rmPorExercicio(c.id)) {
  const prs = [];
  for (const ex of e1rm) {
    let melhor = null;
    for (const p of ex.pontos) {
      if (melhor != null && p.valor > melhor && p.data >= de && p.data <= ate) prs.push({ nome: ex.nome, ...p, anterior: melhor, ganho: pct(p.valor, melhor) });
      melhor = Math.max(melhor ?? 0, p.valor);
    }
  }
  // Um PR por exercício (o melhor do período).
  const porEx = new Map();
  for (const p of prs) if (!porEx.has(p.nome) || p.valor > porEx.get(p.nome).valor) porEx.set(p.nome, p);
  return [...porEx.values()].sort((a, b) => b.ganho - a.ganho);
}

// ---------------------------------------------------------------- Maiores melhorias (texto positivo)
export function melhorias(c, n = 4) {
  const lista = [];
  const comp = comparacaoBaseline(c);
  for (const i of comp?.itens || [])
    if (i.sentido === 'melhor' && i.pct != null && Math.abs(i.pct) >= 2 && i.grupo !== 'Corpo')
      lista.push({ texto: `${i.nome}: ${i.fmt(i.base)} → ${i.fmt(i.atual)}${i.unidade ? ' ' + i.unidade : ''}`, valor: Math.abs(i.pct), extra: `${i.pct > 0 ? '+' : ''}${num(i.pct, 0)}% desde a avaliação inicial` });
  for (const v of variacoes(e1rmPorExercicio(c.id)))
    if (v.vsBase != null && v.vsBase >= 3 && !lista.some((x) => x.texto.startsWith(v.nome)))
      lista.push({ texto: `${v.nome}: ${num(v.base.valor)} → ${num(v.melhorRec)} kg`, valor: v.vsBase, extra: `+${num(v.vsBase, 0)}% nos treinos` });
  return lista.sort((a, b) => b.valor - a.valor).slice(0, n);
}

// Pontos a trabalhar (sem dramatizar): variações desfavoráveis de desempenho na última avaliação.
export function pontosATrabalhar(c) {
  return (comparacaoBaseline(c)?.itens || []).filter((i) => i.sentido === 'ponto').map((i) => i.nome);
}

export const metasVisiveis = (c) =>
  listarMetas(c.id).filter((m) => m.mostrar_cliente).map((m) => ({ ...m, p: progressoMeta(m) }));

// Foco da semana seguinte: o "foco" da próxima semana do plano ativo (se existir).
export function focoProximaSemana(c, data = hojeISO()) {
  const pa = planoAtivo(c.id);
  if (!pa) return '';
  const p = obterPlano(pa.id);
  const s = semanaDoPlano(p, somarDias(data, 7));
  return p.semanas.find((x) => x.semana === s)?.foco || '';
}

// ---------------------------------------------------------------- Números de uma semana
// Volume = carga × reps das séries FEITAS com qualidade técnica 1–2. Ficam de fora: séries eliminadas
// (já não existem), saltadas, de aquecimento e com técnica 0. Exercícios de peso corporal sem carga
// contam séries e repetições à parte; só entram em kg se a opção estiver ligada (peso × % do exercício).
export const cfgRelatorio = () => ({ ...DEFINICOES_PADRAO.relatorio_semanal, ...repo.def('relatorio_semanal') });

function ultimoPeso(clienteId, ate) {
  return todos(
    `SELECT cp.peso_kg FROM avaliacao_composicao cp JOIN avaliacoes a ON a.id = cp.avaliacao_id
     WHERE a.cliente_id = ? AND a.data <= ? AND cp.peso_kg IS NOT NULL ORDER BY a.data DESC LIMIT 1`,
    [clienteId, ate]
  )[0]?.peso_kg ?? null;
}

export function numerosPeriodo(c, de, ate, cfg = cfgRelatorio()) {
  const sess = todos("SELECT duracao_seg, rpe_sessao FROM sessoes WHERE cliente_id = ? AND estado = 'realizada' AND data BETWEEN ? AND ?", [c.id, de, ate]);
  const series = todos(
    `SELECT e.nome, e.grupo_muscular, e.tipo_registo, e.unidade_ritmo, e.peso_corporal_pct,
       y.carga_kg, y.reps, y.rpe, y.qualidade, y.duracao_seg, y.distancia_m
     FROM sessao_series y JOIN sessao_exercicios x ON x.id = y.sessao_exercicio_id
     JOIN sessoes s ON s.id = x.sessao_id JOIN exercicios e ON e.id = x.exercicio_id
     WHERE s.cliente_id = ? AND s.estado = 'realizada' AND s.data BETWEEN ? AND ? AND y.estado = 'feita' AND y.aquecimento = 0`,
    [c.id, de, ate]
  );
  const peso = cfg.volume_peso_corporal ? ultimoPeso(c.id, ate) : null;
  const n = { sessoes: sess.length, minutos: Math.round(sess.reduce((a, s) => a + (s.duracao_seg || 0), 0) / 60),
    series: 0, reps: 0, volume: 0, pcSeries: 0, pcReps: 0, pcIncluido: !!peso, porGrupo: {}, porExercicio: {},
    distancia_m: 0, duracao_seg: 0, kmDist: 0, kmTempo: 0 };
  const rpes = [];
  for (const y of series) {
    if (y.tipo_registo === 'resistencia') {
      n.distancia_m += y.distancia_m || 0;
      n.duracao_seg += y.duracao_seg || 0;
      if (y.unidade_ritmo === 'km' && y.distancia_m && y.duracao_seg) { n.kmDist += y.distancia_m; n.kmTempo += y.duracao_seg; }
      continue;
    }
    n.series++;
    n.reps += y.reps || 0;
    if (y.rpe != null) rpes.push(y.rpe);
    if (!(y.reps > 0) || y.qualidade < 1) continue;
    const carga = y.carga_kg || 0;
    let kg = 0;
    if (y.peso_corporal_pct != null && peso) kg = (peso * y.peso_corporal_pct / 100 + carga) * y.reps;
    else if (carga > 0) kg = carga * y.reps;
    else { n.pcSeries++; n.pcReps += y.reps; } // sem carga = peso corporal (conta à parte)
    if (!kg) continue;
    n.volume += kg;
    const g = familiaDe(y.grupo_muscular);
    n.porGrupo[g] = (n.porGrupo[g] || 0) + kg;
    n.porExercicio[y.nome] = (n.porExercicio[y.nome] || 0) + kg;
  }
  n.volume = Math.round(n.volume);
  // RPE médio: o da sessão (se registado), senão o das séries.
  const rpeSess = sess.map((s) => s.rpe_sessao).filter((v) => v != null);
  const lista = rpeSess.length ? rpeSess : rpes;
  n.rpeMedio = lista.length ? Math.round((lista.reduce((a, b) => a + b, 0) / lista.length) * 10) / 10 : null;
  // Carga média por sessão = volume ÷ sessões feitas (só faz sentido com 2 ou mais).
  n.cargaMedia = n.sessoes > 1 && n.volume ? Math.round(n.volume / n.sessoes) : null;
  n.ritmoKm = n.kmDist >= 500 ? Math.round(n.kmTempo / (n.kmDist / 1000)) : null;
  return n;
}

// Comparação com a semana anterior, sempre em linguagem neutra/positiva (nunca "pior").
// parcial: semana ainda a decorrer → compara com a anterior só até ao mesmo dia.
export function comparacaoSemanas(a, b, parcial = false) {
  if (!b.sessoes || !a.sessoes) return [];
  const l = [];
  const ref = parcial ? 'na mesma altura da semana anterior' : 'na semana anterior';
  const refDa = parcial ? 'da mesma altura da semana anterior' : 'da semana anterior';
  const dif = a.sessoes - b.sessoes;
  if (dif > 0) l.push(`Mais ${dif} treino${dif > 1 ? 's' : ''} do que ${ref} 👏`);
  else if (dif === 0) l.push(`O mesmo número de treinos que ${ref} — consistência!`);
  else l.push(`${-dif} treino${dif < -1 ? 's' : ''} a menos do que ${ref} — na próxima retomamos o ritmo.`);
  if (a.volume && b.volume) {
    const p = Math.round(pct(a.volume, b.volume));
    if (p >= 5) l.push(`Mais ${p}% de volume do que ${ref} 📈`);
    else if (p <= -5) l.push(`Menos ${-p}% de volume do que ${ref} — recuperar também faz parte do plano.`);
    else l.push(`Volume semelhante ao ${refDa}.`);
  }
  if (a.distancia_m && b.distancia_m) {
    const p = Math.round(pct(a.distancia_m, b.distancia_m));
    if (p >= 5) l.push(`Mais ${p}% de distância do que ${ref} 🏃`);
  }
  return l;
}

// Exercício da semana: o maior recorde; sem recordes, o de maior volume.
function melhorExercicio(prs, n) {
  if (prs.length) {
    const p = prs[0];
    return { nome: p.nome, texto: `novo recorde: ${num(p.valor)} kg (1RM est.), +${num(p.valor - p.anterior)} kg` };
  }
  const top = Object.entries(n.porExercicio).sort((a, b) => b[1] - a[1])[0];
  return top ? { nome: top[0], texto: `${num(top[1], 0)} kg de volume` } : null;
}

export function equivalentesSemana(c, segunda, n, cfg = cfgRelatorio()) {
  const lista = repo.def('equivalentes');
  const o = { min: cfg.equiv_min, max: cfg.equiv_max, semente: sementeSemana(c.id, segunda) };
  const out = [];
  const add = (tipo, total) => { const e = escolherEquivalente(lista, tipo, total, o); if (e) out.push(e); };
  if (n.volume) add('peso', n.volume);
  if (n.distancia_m) add('distancia', n.distancia_m);
  if (!out.length && n.reps + n.pcReps) add('reps', n.reps);
  if (!out.length && n.minutos) add('tempo', n.minutos);
  return out.slice(0, 2);
}

// ---------------------------------------------------------------- Resumo semanal
export function resumoSemana(c, segunda = inicioSemana(hojeISO())) {
  const domingo = somarDias(segunda, 6);
  const cfg = cfgRelatorio();
  const n = numerosPeriodo(c, segunda, domingo, cfg);
  // Semana a decorrer: a anterior conta só até ao mesmo dia da semana (comparação justa).
  const hoje = hojeISO();
  const parcial = domingo > hoje && segunda <= hoje;
  const ant = numerosPeriodo(c, somarDias(segunda, -7), parcial ? somarDias(hoje, -7) : somarDias(segunda, -1), cfg);
  const cons = consistencia(c.id);
  const prs = prsPeriodo(c, segunda, domingo);
  return {
    de: segunda, ate: domingo,
    ...n, combinado: c.frequencia_semanal || null,
    porGrupo: Object.entries(n.porGrupo).sort((a, b) => b[1] - a[1]).map(([g, kg]) => [g, Math.round(kg)]),
    prs,
    melhor: melhorExercicio(prs, n),
    comparacao: comparacaoSemanas(n, ant, parcial),
    equivalentes: equivalentesSemana(c, segunda, n, cfg),
    streak: cons.streak, score: cons.score,
    metas: metasVisiveis(c),
    checkin: checkinSemana(c.id, segunda),
    foco: focoProximaSemana(c, segunda),
  };
}

// Tempo total: "45 min" ou "3 h 20 min".
export const tempoTotal = (min) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`);
// Volume legível: até 1 t em kg; acima, em toneladas.
export const textoVolume = (kg) => (kg >= 1000 ? `${num(kg / 1000, 1)} t` : `${num(kg, 0)} kg`);

// ---------------------------------------------------------------- Relatório de período
export function relatorioPeriodo(c, de, ate) {
  const sess = todos("SELECT * FROM sessoes WHERE cliente_id = ? AND estado = 'realizada' AND data BETWEEN ? AND ?", [c.id, de, ate]);
  const semanas = Math.max(1, Math.round((diasEntre(de, ate) + 1) / 7));
  const previstas = (c.frequencia_semanal || 0) * semanas;
  const avs = repo.listarAvaliacoes(c.id);
  const proxReav = avs.length ? somarDias(avs[avs.length - 1].data, c.intervalo_reavaliacao_semanas * 7) : null;
  const cons = consistencia(c.id);
  return {
    de, ate, sessoes: sess.length, previstas,
    assiduidade: previstas ? Math.min(100, Math.round((sess.length / previstas) * 100)) : null,
    minutos: Math.round(sess.reduce((a, s) => a + (s.duracao_seg || 0), 0) / 60),
    prs: prsPeriodo(c, de, ate),
    melhorias: melhorias(c),
    pontos: pontosATrabalhar(c),
    comparacao: comparacaoBaseline(c),
    metas: metasVisiveis(c),
    streak: cons.streak, melhorStreak: cons.melhor, score: cons.score,
    proxReav,
  };
}

// Mensagem pré-escrita para o WhatsApp (o treinador anexa o PDF/imagem e envia).
export function mensagemWhatsApp(c, r, tipo = 'semana') {
  const primeiro = c.nome.replace(/\(.*?\)/g, '').trim().split(/\s+/)[0];
  const dm = (iso) => iso.split('-').reverse().slice(0, 2).join('/');
  const l = [`Olá ${primeiro}! 💪`];
  if (tipo === 'semana') {
    l.push(`Resumo da semana ${dm(r.de)}–${dm(r.ate)}:`);
    l.push(`✅ ${r.sessoes}${r.combinado ? `/${r.combinado}` : ''} treino(s)${r.minutos ? ` · ${tempoTotal(r.minutos)}` : ''}`);
    if (r.volume) l.push(`🏋️ ${textoVolume(r.volume)} de volume · ${r.series} séries · ${r.reps} repetições`);
    if (r.equivalentes?.[0]) l.push(`${r.equivalentes[0].icone} ${r.equivalentes[0].texto}`);
    if (r.distancia_m) l.push(`🏃 ${num(r.distancia_m / 1000, 1)} km${r.ritmoKm ? ` · ritmo médio ${tempo(r.ritmoKm)}/km` : ''}`);
    if (r.prs.length) l.push(`🏆 ${r.prs.length} recorde(s): ${r.prs.slice(0, 2).map((p) => `${p.nome} ${num(p.valor)} kg`).join(', ')}`);
    if (r.streak) l.push(`🔥 ${r.streak} semana(s) seguida(s) a cumprir o plano`);
    if (r.foco) l.push(`🎯 Foco da próxima semana: ${r.foco}`);
  } else {
    l.push(`O teu relatório de ${dm(r.de)} a ${dm(r.ate)}:`);
    l.push(`✅ ${r.sessoes} treino(s)${r.assiduidade != null ? ` (${r.assiduidade}% do combinado)` : ''}`);
    if (r.melhorias[0]) l.push(`📈 ${r.melhorias[0].texto}`);
    if (r.prs.length) l.push(`🏆 ${r.prs.length} recorde(s) no período`);
  }
  l.push('Envio-te o resumo em anexo. Continua assim! 👏');
  return l.join('\n');
}
