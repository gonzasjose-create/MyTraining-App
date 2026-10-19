// Progressão semanal sugerida (funções puras). A app SUGERE; o treinador aceita ou edita.
// Sem dados de sessões realizadas (Fase 3), a progressão é planeada a partir da semana-âncora.
import { num, tempo } from './util.js';
import { TIPOS_SESSAO_RESIST } from './catalogos.js';

export const CAMPOS_PRESCRICAO = [
  'series', 'reps_min', 'reps_max', 'carga_kg', 'rpe', 'rir', 'descanso_seg',
  'tipo_sessao', 'duracao_min', 'distancia_m', 'zona_alvo', 'ritmo_alvo_seg',
  'int_repeticoes', 'int_trabalho_seg', 'int_recuperacao_seg', 'notas',
];

const arred = (x, passo) => (x == null ? null : Math.round(x / passo) * passo);
const copia = (p) => Object.fromEntries(CAMPOS_PRESCRICAO.map((c) => [c, p?.[c] ?? null]));

// Um passo de progressão a partir da semana base.
export function progredir(base, tipoRegisto, metodo, params, cfg) {
  const p = copia(base);
  if (tipoRegisto === 'resistencia') {
    if (metodo !== 'volume') return p;
    const pct = (params.pct ?? cfg.pct_volume_resist) / 100;
    if (p.tipo_sessao === 'intervalado' && p.int_repeticoes) p.int_repeticoes += 1;
    else if (p.duracao_min) p.duracao_min = Math.round(p.duracao_min * (1 + pct));
    return p;
  }
  if (metodo === 'percentagem' && p.carga_kg) {
    const pct = (params.pct ?? cfg.pct_carga) / 100;
    const nova = arred(p.carga_kg * (1 + pct), params.passo ?? cfg.passo_kg);
    // Garante subida mínima de um passo (com cargas baixas o arredondamento pode anular a subida).
    p.carga_kg = nova > p.carga_kg ? nova : p.carga_kg + (params.passo ?? cfg.passo_kg);
  }
  if (metodo === 'dupla' && p.reps_min != null) {
    const min = params.rep_min ?? p.reps_min;
    const max = params.rep_max ?? p.reps_max ?? p.reps_min;
    if (p.reps_min < max) p.reps_min += 1;
    else {
      p.reps_min = min;
      if (p.carga_kg != null) p.carga_kg += params.inc_kg ?? cfg.inc_dupla_kg;
    }
    p.reps_max = max;
  }
  return p;
}

// Semana de deload: menos séries/duração e menos carga; RPE baixa ~1,5 pontos.
export function deload(base, tipoRegisto, cfg) {
  const p = copia(base);
  const vol = cfg.deload_volume_pct / 100;
  if (tipoRegisto === 'resistencia') {
    if (p.duracao_min) p.duracao_min = Math.max(5, Math.round(p.duracao_min * vol));
    if (p.int_repeticoes) p.int_repeticoes = Math.max(1, Math.ceil(p.int_repeticoes * vol));
    if (p.zona_alvo && p.zona_alvo > 2) p.zona_alvo -= 1;
    return p;
  }
  if (p.series) p.series = Math.max(1, Math.round(p.series * vol));
  if (p.carga_kg) p.carga_kg = arred(p.carga_kg * (cfg.deload_carga_pct / 100), cfg.passo_kg);
  if (p.rpe) p.rpe = Math.max(5, Math.round((p.rpe - 1.5) * 2) / 2);
  if (p.rir != null) p.rir = Math.min(10, p.rir + 2);
  return p;
}

// Ajusta a semana-âncora com o que foi REALMENTE feito (séries registadas, qualidade ≥ 1).
// Devolve { base, motivo, travar }: travar = repetir a prescrição em vez de progredir.
export function ajustarComRealizado(ancora, realizado, tipoRegisto, metodo, params) {
  const series = (realizado || []).filter((x) => x.qualidade >= 1 && x.reps != null);
  if (tipoRegisto === 'resistencia' || !series.length) return { base: copia(ancora), motivo: null, travar: false };
  const base = copia(ancora);
  const cargaFeita = Math.max(...series.map((x) => x.carga_kg || 0));
  const minReps = Math.min(...series.map((x) => x.reps));
  const rpes = series.filter((x) => x.rpe != null).map((x) => x.rpe);
  const rpeMedio = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
  const resumo = `realizado: ${series.length} série(s), mín. ${minReps} reps${cargaFeita ? ` @ ${num(cargaFeita)} kg` : ''}${rpeMedio ? `, RPE médio ${num(rpeMedio)}` : ''}`;
  if (base.carga_kg != null && cargaFeita) base.carga_kg = cargaFeita;

  if (metodo === 'dupla') {
    const max = params.rep_max ?? ancora.reps_max ?? ancora.reps_min;
    if (minReps >= max) return { base: { ...base, reps_min: max }, motivo: `topo da gama atingido em todas as séries (${resumo}) → sobe carga`, travar: false };
    if (ancora.reps_min != null && minReps < ancora.reps_min)
      return { base, motivo: `reps abaixo do alvo (${resumo}) → repete`, travar: true };
    return { base: { ...base, reps_min: Math.max(minReps, ancora.reps_min ?? minReps) }, motivo: resumo, travar: false };
  }
  if (metodo === 'percentagem' && rpeMedio != null && ancora.rpe != null && rpeMedio >= ancora.rpe + 1)
    return { base, motivo: `RPE acima do previsto (${resumo}) → mantém carga`, travar: true };
  return { base, motivo: resumo, travar: false };
}

// Sugere as semanas seguintes à semana-âncora. semanas: [{ semana, deload }].
// Depois de um deload, a progressão continua a partir da última semana normal.
// Se houver "realizado" da semana-âncora, o 1.º passo usa-o (e o motivo fica em _motivo).
export function sugerirSeguintes(ancora, semanaAncora, semanas, tipoRegisto, metodo, params, cfg, realizado = null) {
  const res = {};
  const aj = ajustarComRealizado(ancora, realizado, tipoRegisto, metodo, params);
  let base = aj.base;
  let primeiro = true;
  for (const s of semanas.filter((x) => x.semana > semanaAncora).sort((a, b) => a.semana - b.semana)) {
    if (s.deload) res[s.semana] = deload(base, tipoRegisto, cfg);
    else {
      base = primeiro && aj.travar ? copia(base) : progredir(base, tipoRegisto, metodo, params, cfg);
      res[s.semana] = base;
      if (primeiro && aj.motivo) res[s.semana] = { ...base, _motivo: aj.motivo };
      primeiro = false;
    }
  }
  return res;
}

// Duas prescrições são iguais (para saber se a sugestão muda alguma coisa)?
export const iguais = (a, b) => CAMPOS_PRESCRICAO.every((c) => (a?.[c] ?? null) === (b?.[c] ?? null));

// Texto curto legível: "3 × 8 @ 60 kg · RPE 7 · desc. 2:00" ou "Contínuo 40 min · Z2 · 5:45/km".
export function textoPrescricao(p, ex = {}, metodo = 'manual') {
  if (!p) return '— sem prescrição —';
  const partes = [];
  if (ex.tipo_registo === 'resistencia') {
    if (p.tipo_sessao === 'intervalado' && p.int_repeticoes)
      partes.push(`${p.int_repeticoes} × ${tempo(p.int_trabalho_seg)}${p.int_recuperacao_seg ? ` / ${tempo(p.int_recuperacao_seg)} rec.` : ''}`);
    else if (p.tipo_sessao) partes.push(`${TIPOS_SESSAO_RESIST[p.tipo_sessao]}${p.duracao_min ? ` ${num(p.duracao_min, 0)} min` : ''}`);
    else if (p.duracao_min) partes.push(`${num(p.duracao_min, 0)} min`);
    if (p.distancia_m) partes.push(`${num(p.distancia_m / 1000, 2)} km`);
    if (p.zona_alvo) partes.push(`Z${p.zona_alvo}`);
    if (p.ritmo_alvo_seg) partes.push(`${tempo(p.ritmo_alvo_seg)}${ex.unidade_ritmo === '500m' ? '/500 m' : '/km'}`);
  } else {
    let reps = p.reps_min == null ? '?' : p.reps_max && p.reps_max !== p.reps_min ? `${p.reps_min}–${p.reps_max}` : `${p.reps_min}`;
    if (metodo === 'dupla' && p.reps_max && p.reps_max !== p.reps_min) reps = `${p.reps_min} (gama até ${p.reps_max})`;
    partes.push(`${p.series ?? '?'} × ${reps}${p.carga_kg != null ? ` @ ${num(p.carga_kg)} kg` : ''}`);
    if (p.rpe != null) partes.push(`RPE ${num(p.rpe)}`);
    if (p.rir != null) partes.push(`RIR ${p.rir}`);
    if (p.descanso_seg) partes.push(`desc. ${tempo(p.descanso_seg)}`);
  }
  return partes.join(' · ') || '—';
}
