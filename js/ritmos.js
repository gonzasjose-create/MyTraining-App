// Zonas de ritmo, previsões e Hyrox (funções puras). TODOS os valores são ESTIMATIVAS:
// dependem do teste, do dia, do terreno e da experiência do cliente.

// Riegel: T2 = T1 × (D2 / D1)^k (k ≈ 1,06). Bom para distâncias próximas da do teste;
// perde precisão quanto mais longe (ex.: de 3 km para a meia maratona).
export function riegel(tempoSeg, distM, novaDistM, k = 1.06) {
  if (!(tempoSeg > 0) || !(distM > 0) || !(novaDistM > 0)) return null;
  return tempoSeg * Math.pow(novaDistM / distM, k);
}

// Tempo de 5 km estimado a partir do teste aeróbio principal (só corrida).
export function tempo5kDoTeste(teste, tempoSeg, distanciaM, k) {
  if (teste === 'corrida_3km') return riegel(tempoSeg, 3000, 5000, k);
  if (teste === 'cooper_12min') return riegel(720, distanciaM, 5000, k);
  return null;
}

// Zonas de ritmo de corrida = ritmo de 5 km + desvio (segundos por km) de cada zona.
export function zonasRitmoCorrida(ritmo5kSegKm, zonas) {
  if (!(ritmo5kSegKm > 0)) return null;
  // min = mais rápido (menos segundos), max = mais lento.
  return zonas.map((z) => ({ ...z, rapido: ritmo5kSegKm + z.min, lento: ritmo5kSegKm + z.max }));
}

// Zonas de remo = parcial médio de 2 km (por 500 m) + desvio (segundos por 500 m).
export function zonasRitmoRemo(tempo2kSeg, zonas) {
  if (!(tempo2kSeg > 0)) return null;
  const split = tempo2kSeg / 4;
  return { split, zonas: zonas.map((z) => ({ ...z, rapido: split + z.min, lento: split + z.max })) };
}

// ---------------------------------------------------------------- Hyrox
// Segmentos de uma prova (as 8 corridas de 1 km estão agrupadas numa linha "× 8").
export const SEGMENTOS_HYROX = [
  { id: 'corrida', nome: 'Corrida (cada 1 km)', vezes: 8, ritmo: 'km', metros: 1000 },
  { id: 'skierg', nome: 'SkiErg 1000 m', ritmo: '500m', metros: 1000 },
  { id: 'sled_push', nome: 'Sled push 50 m', ritmo: '25m', metros: 50 },
  { id: 'sled_pull', nome: 'Sled pull 50 m', ritmo: '25m', metros: 50 },
  { id: 'bbj', nome: 'Burpee broad jumps 80 m', ritmo: '10m', metros: 80 },
  { id: 'remo', nome: 'Remo 1000 m', ritmo: '500m', metros: 1000 },
  { id: 'farmers', nome: 'Farmers carry 200 m', ritmo: '50m', metros: 200 },
  { id: 'lunges', nome: 'Sandbag lunges 100 m', ritmo: '25m', metros: 100 },
  { id: 'wall_balls', nome: 'Wall balls 100 reps', ritmo: '10reps', reps: 100 },
  { id: 'roxzone', nome: 'Roxzone (transições, total)' },
];

export function totalHyrox(tempos) {
  return SEGMENTOS_HYROX.reduce((s, g) => s + (tempos[g.id] || 0) * (g.vezes || 1), 0);
}

// Ritmo de um segmento a partir do tempo: por km, por 500 m, por 25 m, por 10 reps…
export function ritmoSegmento(seg, tempoSeg) {
  if (!(tempoSeg > 0) || !seg.ritmo) return null;
  if (seg.ritmo === '10reps') return { seg: (tempoSeg / seg.reps) * 10, unidade: '/10 reps' };
  const [por, unidade] = { km: [1000, '/km'], '500m': [500, '/500 m'], '25m': [25, '/25 m'], '10m': [10, '/10 m'], '50m': [50, '/50 m'] }[seg.ritmo];
  return { seg: (tempoSeg / seg.metros) * por, unidade };
}

// Metas por segmento: escala o perfil de referência do escalão para o tempo-meta do cliente.
export function metasHyrox(referencia, metaSeg) {
  const total = totalHyrox(referencia);
  if (!(total > 0)) return null;
  const k = metaSeg > 0 ? metaSeg / total : 1;
  const metas = {};
  for (const g of SEGMENTOS_HYROX) metas[g.id] = referencia[g.id] ? referencia[g.id] * k : null;
  return { metas, totalRef: total, fator: k };
}
