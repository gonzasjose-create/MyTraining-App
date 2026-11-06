// Superséries, tri-séries e circuitos: exercícios SEGUIDOS da mesma sessão com o mesmo grupo_id.
// O grupo é só um número (por sessão); a ordem dentro do grupo é a ordem dos exercícios.
// Os dados (séries, cargas, descanso) continuam por exercício — a análise não muda.
// Funções puras: o plano (plano_exercicios) e a sessão (sessao_exercicios) usam a mesma lógica.
// "lista" = exercícios ordenados [{ id, grupo_id, … }].

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Só exercícios seguidos ficam no mesmo grupo; grupos de 1 desaparecem; grupos renumerados 1, 2, 3…
export function normalizarGrupos(lista) {
  const blocos = [];
  lista.forEach((e, i) => {
    if (i && e.grupo_id != null && e.grupo_id === lista[i - 1].grupo_id) blocos[blocos.length - 1].push(e);
    else blocos.push([e]);
  });
  const novo = new Map();
  let g = 0;
  for (const b of blocos) {
    const v = b.length > 1 ? ++g : null;
    for (const e of b) novo.set(e.id, v);
  }
  return novo;
}

// Rótulos A1, A2, B1… (só para exercícios em grupo): Map id → { letra, n, total, grupo }.
export function rotulosGrupos(lista) {
  const out = new Map();
  let letra = -1;
  lista.forEach((e, i) => {
    if (e.grupo_id == null) return;
    if (!i || lista[i - 1].grupo_id !== e.grupo_id) letra++;
    const membros = lista.filter((x) => x.grupo_id === e.grupo_id);
    out.set(e.id, { letra: LETRAS[letra % 26], n: membros.indexOf(e) + 1, total: membros.length, grupo: e.grupo_id });
  });
  return out;
}
export const rotulo = (r) => (r ? `${r.letra}${r.n}` : '');
export const nomeGrupo = (n) => (n <= 2 ? 'Supersérie' : n === 3 ? 'Tri-série' : 'Circuito');

export const membrosGrupo = (lista, grupo) => (grupo == null ? [] : lista.filter((e) => e.grupo_id === grupo));

// Liga o exercício "id" ao seguinte (junta os grupos de ambos, se já existirem).
export function ligarSeguinte(lista, id) {
  const i = lista.findIndex((e) => e.id === id);
  const a = lista[i], b = lista[i + 1];
  if (!a || !b) return lista;
  const g = a.grupo_id ?? b.grupo_id ?? Math.max(0, ...lista.map((e) => e.grupo_id || 0)) + 1;
  const gb = b.grupo_id;
  for (const e of lista) if (gb != null && e.grupo_id === gb) e.grupo_id = g;
  a.grupo_id = b.grupo_id = g;
  return lista;
}
// Separa o grupo entre "id" e o seguinte (os de baixo formam outro grupo, se tiverem 2 ou mais).
export function desligarSeguinte(lista, id) {
  const i = lista.findIndex((e) => e.id === id);
  const g = lista[i]?.grupo_id;
  if (g == null || lista[i + 1]?.grupo_id !== g) return lista;
  const novo = Math.max(0, ...lista.map((e) => e.grupo_id || 0)) + 1;
  for (let k = i + 1; k < lista.length && lista[k].grupo_id === g; k++) lista[k].grupo_id = novo;
  return lista;
}

// Mover respeitando grupos: dentro do grupo troca com o vizinho; na fronteira move o grupo inteiro
// (nunca parte uma supersérie sem querer). Devolve os ids pela nova ordem.
export function moverComGrupos(lista, id, dir) {
  const blocos = [];
  lista.forEach((e, i) => {
    if (i && e.grupo_id != null && e.grupo_id === lista[i - 1].grupo_id) blocos[blocos.length - 1].push(e.id);
    else blocos.push([e.id]);
  });
  const bi = blocos.findIndex((b) => b.includes(id));
  const b = blocos[bi];
  const k = b.indexOf(id);
  if (b.length > 1 && b[k + dir] !== undefined) [b[k], b[k + dir]] = [b[k + dir], b[k]];
  else if (blocos[bi + dir]) [blocos[bi], blocos[bi + dir]] = [blocos[bi + dir], blocos[bi]];
  return blocos.flat();
}

// Próximo exercício da ronda, por ordem circular, entre os que ainda têm séries por fazer.
// volta = true quando a ronda recomeça (ou só resta o próprio exercício) → descanso de fim de ronda.
export function seguinteNoGrupo(membros, atualId, temPendente) {
  const i = membros.findIndex((m) => m.id === atualId);
  for (let k = 1; k <= membros.length; k++) {
    const m = membros[(i + k) % membros.length];
    if (temPendente(m)) return { ex: m, volta: i + k >= membros.length };
  }
  return null;
}

// Descanso depois de uma série dentro de um grupo:
// a meio da ronda → descanso_apos_seg do exercício (vazio = sem descanso);
// no fim da ronda → descanso_apos_seg do último membro, senão o descanso da série, senão o padrão.
export function descansoGrupo(membros, atual, volta, descansoSerie, padrao) {
  if (!volta) return atual.descanso_apos_seg || 0;
  return membros[membros.length - 1].descanso_apos_seg ?? (descansoSerie || padrao);
}
