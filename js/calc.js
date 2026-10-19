// Fórmulas (puras, sem acesso à base de dados). Usadas em todos os cálculos da app
// para que os resultados sejam sempre comparáveis.

const arred = (x, casas = 1) => (x == null || isNaN(x) ? null : Math.round(x * 10 ** casas) / 10 ** casas);

// 1RM estimado — Epley: carga × (1 + reps/30). Com reps = 1 o 1RM é a própria carga.
// Acima de 10 reps o resultado é marcado como de baixa fiabilidade.
export function epley(carga, reps) {
  if (!(carga > 0) || !(reps >= 1)) return null;
  const valor = reps === 1 ? carga : carga * (1 + reps / 30);
  return { valor: arred(valor, 1), baixaFiabilidade: reps > 10 };
}

// Força relativa = 1RM estimado ÷ peso corporal (2 casas decimais).
export function forcaRelativa(rm, pesoCorporal) {
  if (!(rm > 0) || !(pesoCorporal > 0)) return null;
  return arred(rm / pesoCorporal, 2);
}

// Assimetria % = (mais forte − mais fraco) ÷ mais forte × 100.
// Sinal para investigar, não diagnóstico.
export function assimetria(esq, dir, limiares = { atencao: 10, alerta: 15 }) {
  if (!(esq > 0) || !(dir > 0)) return null;
  const forte = Math.max(esq, dir);
  const pct = arred(((forte - Math.min(esq, dir)) / forte) * 100, 1);
  const ladoFraco = esq === dir ? null : esq < dir ? 'esq' : 'dir';
  const nivel = pct > limiares.alerta ? 'alerta' : pct >= limiares.atencao ? 'atencao' : 'ok';
  return { pct, ladoFraco, nivel };
}

// Idade em anos completos numa data de referência (ISO).
export function idade(dataNascimento, referencia = new Date().toISOString().slice(0, 10)) {
  if (!dataNascimento) return null;
  const [a, m, d] = dataNascimento.split('-').map(Number);
  const [ra, rm, rd] = referencia.split('-').map(Number);
  let anos = ra - a;
  if (rm < m || (rm === m && rd < d)) anos--;
  return anos;
}

// FC máxima ESTIMADA — Tanaka: 208 − 0,7 × idade.
export function tanaka(anos) {
  return anos == null ? null : Math.round(208 - 0.7 * anos);
}

// Zonas de FC pela reserva (Karvonen): FCrep + % × (FCmax − FCrep).
export function zonasFC(fcMax, fcRepouso, zonas) {
  if (!(fcMax > 0) || !(fcRepouso > 0) || fcRepouso >= fcMax) return null;
  const reserva = fcMax - fcRepouso;
  return zonas.map((z) => ({
    ...z,
    bpmMin: Math.round(fcRepouso + (z.min / 100) * reserva),
    bpmMax: Math.round(fcRepouso + (z.max / 100) * reserva),
  }));
}

// Recuperação da FC: queda entre o pico e 1 min após o fim.
export function quedaFC(fcPico, fc1min) {
  return fcPico > 0 && fc1min > 0 ? fcPico - fc1min : null;
}

// Melhor de várias tentativas (saltos).
export function melhorTentativa(tentativas) {
  const v = (tentativas || []).filter((x) => x > 0);
  return v.length ? Math.max(...v) : null;
}

// Ritmo médio (segundos por km) e por 500 m (remo).
export function ritmoPorKm(segundos, metros) {
  return segundos > 0 && metros > 0 ? (segundos / metros) * 1000 : null;
}
export function ritmoPor500(segundos, metros) {
  return segundos > 0 && metros > 0 ? (segundos / metros) * 500 : null;
}
export function velocidadeKmh(segundos, metros) {
  return segundos > 0 && metros > 0 ? arred(metros / 1000 / (segundos / 3600), 1) : null;
}
