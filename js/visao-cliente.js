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
import { TESTES_AEROBIOS, TESTES_FORCA } from './catalogos.js';
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

// ---------------------------------------------------------------- Resumo semanal
export function resumoSemana(c, segunda = inicioSemana(hojeISO())) {
  const domingo = somarDias(segunda, 6);
  const sess = todos("SELECT * FROM sessoes WHERE cliente_id = ? AND estado = 'realizada' AND data BETWEEN ? AND ? ORDER BY data", [c.id, segunda, domingo]);
  const cons = consistencia(c.id);
  return {
    de: segunda, ate: domingo,
    sessoes: sess.length, combinado: c.frequencia_semanal || null,
    minutos: Math.round(sess.reduce((a, s) => a + (s.duracao_seg || 0), 0) / 60),
    prs: prsPeriodo(c, segunda, domingo),
    streak: cons.streak, score: cons.score,
    metas: metasVisiveis(c),
    checkin: checkinSemana(c.id, segunda),
    foco: focoProximaSemana(c, segunda),
  };
}

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
    l.push(`✅ ${r.sessoes}${r.combinado ? `/${r.combinado}` : ''} treino(s)`);
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
