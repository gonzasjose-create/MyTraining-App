// Equivalentes divertidos no resumo semanal ("levantaste o equivalente a cerca de 3 elefantes").
// A lista é editável nas Definições. Regras: dá sempre entre "min" e "max" unidades (por defeito 1–20),
// diz sempre "cerca de", varia de semana para semana e, com volume baixo, usa naturalmente um item
// mais leve (os pesados dariam menos de 1 unidade e ficam de fora). Sem item adequado → não aparece.

export const TIPOS_EQUIVALENTE = {
  peso: { nome: 'Peso (volume)', unidade: 'kg' },
  reps: { nome: 'Repetições', unidade: 'repetições' },
  distancia: { nome: 'Distância', unidade: 'm' },
  tempo: { nome: 'Tempo de treino', unidade: 'min' },
};

const FRASES = {
  peso: (q) => `Levantaste no total o equivalente a cerca de ${q}.`,
  reps: (q) => `As tuas repetições equivalem a cerca de ${q}.`,
  distancia: (q) => `Percorreste o equivalente a cerca de ${q}.`,
  tempo: (q) => `O teu tempo de treino equivale a cerca de ${q}.`,
};

// Abaixo de 3 arredonda a meias unidades ("cerca de 1,5"); acima, a unidades.
export function arredondarUnidades(q) {
  return q < 3 ? Math.max(0.5, Math.round(q * 2) / 2) : Math.round(q);
}
const fmt = (q) => new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 }).format(q);

// Semente estável por cliente e semana (a mesma semana dá sempre o mesmo item; a seguinte muda).
export function sementeSemana(clienteId, segundaISO) {
  const semanas = Math.floor(new Date(segundaISO + 'T12:00:00').getTime() / (7 * 864e5));
  return Math.abs(semanas * 31 + (clienteId || 0) * 7);
}

// total: na unidade do tipo (kg, repetições, metros, minutos).
export function escolherEquivalente(lista, tipo, total, { min = 1, max = 20, semente = 0 } = {}) {
  if (!(total > 0)) return null;
  const itens = (lista || []).filter((e) => e.ativo !== false && e.tipo === tipo && e.valor > 0);
  const cands = itens.map((e) => ({ e, q: total / e.valor })).filter((x) => x.q >= min && x.q <= max);
  if (!cands.length) return null;
  // Preferência por quantidades "fáceis de imaginar" (2 a 12); varia entre elas de semana para semana.
  const bons = cands.filter((x) => x.q >= 2 && x.q <= 12);
  const pool = (bons.length ? bons : cands).sort((a, b) => a.e.valor - b.e.valor);
  const { e, q } = pool[semente % pool.length];
  const n = arredondarUnidades(q);
  const forma = n === 1 ? e.singular || e.nome : e.plural || e.nome;
  return { icone: e.icone || '✨', nome: e.nome, quantidade: n, texto: FRASES[tipo](n === 1 ? artigo(forma) + forma : `${fmt(n)} ${forma}`) };
}

// "1 elefante" → "um elefante"; "1 melancia" → "uma melancia" (palavras femininas mais comuns terminam em -a).
function artigo(forma) {
  const primeira = forma.split(/[\s-]+/)[0].toLowerCase();
  return /(a|ção|gem|ade)$/.test(primeira) ? 'uma ' : 'um ';
}
