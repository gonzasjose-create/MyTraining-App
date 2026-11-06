// Testes automáticos (funções puras). Abrir testes.html no browser.
import { epley, forcaRelativa, assimetria, tanaka, zonasFC, idade, quedaFC, melhorTentativa } from './calc.js';
import { progredir, deload, sugerirSeguintes, ajustarComRealizado } from './progressao.js';
import { riegel, tempo5kDoTeste, zonasRitmoCorrida, metasHyrox, totalHyrox } from './ritmos.js';
import { lerTempo, tempo, lerNum } from './util.js';
import { interpretarCheckin } from './repo-motivacao.js';
import { gerarICS, nomeCalendario } from './ics.js';
import { DEFINICOES_PADRAO } from './catalogos.js';
import { escolherEquivalente, arredondarUnidades } from './equivalentes.js';
import { comparacaoSemanas } from './visao-cliente.js';
import { normalizarGrupos, ligarSeguinte, desligarSeguinte, rotulosGrupos, rotulo, moverComGrupos, seguinteNoGrupo, descansoGrupo } from './superseries.js';

const resultados = [];
const perto = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;
function testar(nome, fn) {
  try {
    const r = fn();
    resultados.push({ nome, ok: r === true, detalhe: r === true ? '' : String(r) });
  } catch (e) {
    resultados.push({ nome, ok: false, detalhe: e.message });
  }
}
const igual = (obtido, esperado) => (JSON.stringify(obtido) === JSON.stringify(esperado) ? true : `obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
const cfg = DEFINICOES_PADRAO.progressao;

// ---- Força
testar('Epley: 1 rep = própria carga', () => igual(epley(100, 1).valor, 100));
testar('Epley: 80 kg × 5 = 93,3 kg', () => igual(epley(80, 5).valor, 93.3));
testar('Epley: >10 reps marca baixa fiabilidade', () => igual(epley(60, 12).baixaFiabilidade, true));
testar('Epley: entradas inválidas → null', () => igual(epley(0, 5), null));
testar('Força relativa 81 ÷ 61,2 = 1,32', () => igual(forcaRelativa(81, 61.2), 1.32));
testar('Assimetria 25,3 vs 30,4 → 16,8% alerta, esq. mais fraco', () => igual((({ pct, ladoFraco, nivel }) => ({ pct, ladoFraco, nivel }))(assimetria(25.3, 30.4)), { pct: 16.8, ladoFraco: 'esq', nivel: 'alerta' }));
testar('Assimetria < 10% → ok', () => igual(assimetria(20, 21).nivel, 'ok'));
testar('Melhor tentativa de salto', () => igual(melhorTentativa([175, 180, null, 178]), 180));

// ---- Superséries
const L = (gs) => gs.map((g, i) => ({ id: i + 1, grupo_id: g }));
testar('Grupos: só seguidos ficam ligados; grupos de 1 desaparecem', () => igual([...normalizarGrupos(L([1, 1, null, 1, 2, 2, 2, 5])).values()], [1, 1, null, null, 2, 2, 2, null]));
testar('Ligar 1+2 e 2+3 → tri-série', () => igual(ligarSeguinte(ligarSeguinte(L([null, null, null, null]), 1), 2).map((e) => e.grupo_id), [1, 1, 1, null]));
testar('Desligar A1 de A2 numa tri-série → A2+A3 continuam ligados', () => igual([...normalizarGrupos(desligarSeguinte(L([1, 1, 1]), 1)).values()], [null, 1, 1]));
testar('Rótulos A1, A2, B1, B2', () => { const r = rotulosGrupos(L([1, 1, null, 2, 2])); return igual([1, 2, 4, 5].map((i) => rotulo(r.get(i))), ['A1', 'A2', 'B1', 'B2']); });
testar('Mover para fora de uma supersérie move o grupo inteiro', () => igual(moverComGrupos(L([null, 1, 1]), 1, 1), [2, 3, 1]));
testar('Mover dentro da supersérie troca A1/A2', () => igual(moverComGrupos(L([1, 1, null]), 2, -1), [2, 1, 3]));
testar('Alternância: A1 → A2 (a meio da ronda)', () => { const m = L([1, 1]); return igual((({ ex, volta }) => [ex.id, volta])(seguinteNoGrupo(m, 1, () => true)), [2, false]); });
testar('Alternância: A2 → A1 (fim da ronda)', () => { const m = L([1, 1]); return igual((({ ex, volta }) => [ex.id, volta])(seguinteNoGrupo(m, 2, () => true)), [1, true]); });
testar('Séries desiguais: A2 acabou → A1 continua sozinho', () => { const m = L([1, 1]); return igual(seguinteNoGrupo(m, 1, (x) => x.id === 1).ex.id, 1); });
testar('Descanso: a meio da ronda = entre exercícios (vazio = 0)', () => igual(descansoGrupo([{ id: 1 }, { id: 2, descanso_apos_seg: 120 }], { id: 1 }, false, 90, 60), 0));
testar('Descanso: fim da ronda = descanso da ronda', () => igual(descansoGrupo([{ id: 1, descanso_apos_seg: 15 }, { id: 2, descanso_apos_seg: 120 }], { id: 2 }, true, 90, 60), 120));
testar('Descanso: ronda sem valor → descanso da série', () => igual(descansoGrupo([{ id: 1 }, { id: 2, descanso_apos_seg: null }], { id: 2 }, true, 90, 60), 90));

// ---- Resumo semanal: equivalentes e comparação
const EQ = DEFINICOES_PADRAO.equivalentes;
testar('Equivalente: 2184 kg → entre 1 e 20 unidades, com "cerca de"', () => { const e = escolherEquivalente(EQ, 'peso', 2184, { semente: 0 }); return e && e.quantidade >= 1 && e.quantidade <= 20 && e.texto.includes('cerca de') ? true : JSON.stringify(e); });
testar('Equivalente: volume baixo (40 kg) usa um item leve', () => igual(escolherEquivalente(EQ, 'peso', 40, { semente: 3 })?.nome, 'Melancia'));
testar('Equivalente: abaixo do mínimo → não aparece', () => igual(escolherEquivalente(EQ, 'peso', 5), null));
testar('Equivalente: a mesma semana dá o mesmo item; semanas diferentes podem variar', () => {
  const a = (s) => escolherEquivalente(EQ, 'peso', 6000, { semente: s })?.nome;
  return a(5) === a(5) && new Set([0, 1, 2, 3].map(a)).size > 1 ? true : 'sem variação';
});
testar('Equivalente: 1 unidade usa o singular ("um cavalo")', () => igual(escolherEquivalente([{ nome: 'Cavalo', tipo: 'peso', valor: 500, singular: 'cavalo', plural: 'cavalos' }], 'peso', 520).texto, 'Levantaste no total o equivalente a cerca de um cavalo.'));
testar('Equivalente: arredonda a meias unidades abaixo de 3', () => igual([arredondarUnidades(1.3), arredondarUnidades(2.8), arredondarUnidades(7.4)], [1.5, 3, 7]));
testar('Comparação: mais treinos e mais volume → frases positivas', () => igual(comparacaoSemanas({ sessoes: 3, volume: 1100 }, { sessoes: 2, volume: 1000 }), ['Mais 1 treino do que na semana anterior 👏', 'Mais 10% de volume do que na semana anterior 📈']));
testar('Comparação: menos volume → linguagem neutra (sem "pior")', () => { const l = comparacaoSemanas({ sessoes: 2, volume: 800 }, { sessoes: 2, volume: 1000 }); return l.some((x) => /pior/i.test(x)) ? 'usa "pior"' : igual(l[1], 'Menos 20% de volume do que na semana anterior — recuperar também faz parte do plano.'); });
testar('Comparação: semana sem treinos → sem comparação', () => igual(comparacaoSemanas({ sessoes: 0, volume: 0 }, { sessoes: 3, volume: 900 }), []));

// ---- FC
testar('Tanaka 42 anos = 179 bpm', () => igual(tanaka(42), 179));
testar('Idade em anos completos', () => igual(idade('1990-10-20', '2026-10-19'), 35));
testar('Zonas Karvonen (179/58) Z2 = 131–143', () => { const z = zonasFC(179, 58, DEFINICOES_PADRAO.zonas_fc)[1]; return igual([z.bpmMin, z.bpmMax], [131, 143]); });
testar('Recuperação FC 184 → 152 = 32', () => igual(quedaFC(184, 152), 32));

// ---- Tempos e números
testar('lerTempo 14:30 = 870 s', () => igual(lerTempo('14:30'), 870));
testar('lerTempo 1:02:03 = 3723 s', () => igual(lerTempo('1:02:03'), 3723));
testar('lerTempo inválido (5:99) → null', () => igual(lerTempo('5:99'), null));
testar('tempo(825) = 13:45', () => igual(tempo(825), '13:45'));
testar('lerNum aceita vírgula', () => igual(lerNum('72,5'), 72.5));

// ---- Progressão
const base = { series: 3, reps_min: 6, reps_max: 8, carga_kg: 62.5, rpe: 7, rir: null, descanso_seg: 180 };
testar('Dupla progressão: 6 → 7 reps, mesma carga', () => { const p = progredir(base, 'forca', 'dupla', { rep_min: 6, rep_max: 8, inc_kg: 2.5 }, cfg); return igual([p.reps_min, p.carga_kg], [7, 62.5]); });
testar('Dupla progressão: no topo (8) → 6 reps e +2,5 kg', () => { const p = progredir({ ...base, reps_min: 8 }, 'forca', 'dupla', { rep_min: 6, rep_max: 8, inc_kg: 2.5 }, cfg); return igual([p.reps_min, p.carga_kg], [6, 65]); });
testar('+2,5% de carga: 65 → 67,5 kg', () => igual(progredir({ ...base, carga_kg: 65 }, 'forca', 'percentagem', { pct: 2.5 }, cfg).carga_kg, 67.5));
testar('+% com carga baixa sobe pelo menos um passo', () => igual(progredir({ ...base, carga_kg: 10 }, 'forca', 'percentagem', { pct: 2.5 }, cfg).carga_kg, 12.5));
testar('Deload: 3 séries → 2, 65 kg → 57,5 kg, RPE 7 → 5,5', () => { const p = deload({ ...base, carga_kg: 65 }, 'forca', cfg); return igual([p.series, p.carga_kg, p.rpe], [2, 57.5, 5.5]); });
testar('Depois do deload retoma a partir da última semana normal', () => {
  const s = sugerirSeguintes({ ...base, carga_kg: 60 }, 1, [{ semana: 2 }, { semana: 3, deload: 1 }, { semana: 4 }], 'forca', 'percentagem', { pct: 2.5 }, cfg);
  return igual([s[2].carga_kg, s[4].carga_kg], [62.5, 65]);
});
testar('Realizado: topo atingido → sobe carga', () => { const a = ajustarComRealizado(base, [8, 8, 8].map((r) => ({ reps: r, carga_kg: 62.5, rpe: 8, qualidade: 2 })), 'forca', 'dupla', { rep_min: 6, rep_max: 8 }); return igual([a.base.reps_min, a.travar], [8, false]); });
testar('Realizado: reps abaixo do alvo → repete', () => igual(ajustarComRealizado({ ...base, reps_min: 7 }, [{ reps: 5, carga_kg: 62.5, qualidade: 2 }], 'forca', 'dupla', { rep_min: 6, rep_max: 8 }).travar, true));
testar('Realizado: qualidade 0 é ignorada', () => igual(ajustarComRealizado(base, [{ reps: 8, carga_kg: 62.5, qualidade: 0 }], 'forca', 'dupla', {}).motivo, null));
testar('Resistência: +10% de duração (30 → 33 min)', () => igual(progredir({ duracao_min: 30, tipo_sessao: 'continuo' }, 'resistencia', 'volume', { pct: 10 }, cfg).duracao_min, 33));

// ---- Ritmos e Hyrox
testar('Riegel 3 km 13:45 → 5 km ≈ 23:38', () => (perto(riegel(825, 3000, 5000), 1418, 1) ? true : riegel(825, 3000, 5000)));
testar('Cooper 2600 m → 5 km estimados', () => (tempo5kDoTeste('cooper_12min', null, 2600) > 1300 ? true : 'valor inesperado'));
testar('Zonas de ritmo: Z2 = 5k + 60–90 s/km', () => { const z = zonasRitmoCorrida(284, DEFINICOES_PADRAO.zonas_ritmo_corrida)[1]; return igual([z.rapido, z.lento], [344, 374]); });
testar('Hyrox: metas escalam para o tempo-meta', () => { const ref = DEFINICOES_PADRAO.hyrox_referencias.open_ind.tempos; const m = metasHyrox(ref, 5400); return perto(totalHyrox(m.metas), 5400, 1) ? true : totalHyrox(m.metas); });

// ---- Check-in (WhatsApp)
testar('Check-in "4 3 1 5 dormi mal"', () => { const r = interpretarCheckin('4 3 1 5 dormi mal'); return igual([r.sono, r.energia, r.dor, r.alimentacao, r.notas, r.completo], [4, 3, 1, 5, 'dormi mal', true]); });
testar('Check-in com nomes e ordem trocada', () => { const r = interpretarCheckin('dor 2, sono 5, alimentação 3, energia 4 — tudo bem'); return igual([r.sono, r.energia, r.dor, r.alimentacao], [5, 4, 2, 3]); });
testar('Check-in incompleto é assinalado', () => igual(interpretarCheckin('5 4').completo, false));

// ---- Calendário
testar('.ics: estrutura e fim de linha CRLF', () => { const t = gerarICS([{ uid: 'a@b', inicio: '2026-10-20T07:00:00', titulo: 'Treino' }]); return t.startsWith('BEGIN:VCALENDAR\r\n') && t.includes('DTSTART:20261020T070000') && t.trim().endsWith('END:VCALENDAR') ? true : t; });
testar('.ics: escapa vírgulas e ponto e vírgula', () => (gerarICS([{ uid: 'x', dia: '2026-10-20', titulo: 'A, B; C' }]).includes('SUMMARY:A\\, B\\; C') ? true : 'sem escape'));
testar('Iniciais no calendário', () => igual(nomeCalendario('Ana Ribeiro (exemplo)', true), 'A. R.'));

// ---- Mostrar
const ok = resultados.filter((r) => r.ok).length;
document.getElementById('resumo').innerHTML = `<strong class="${ok === resultados.length ? 'ok' : 'erro'}">${ok}/${resultados.length} testes passaram</strong>`;
document.getElementById('tabela').innerHTML = resultados
  .map((r) => `<tr><td class="${r.ok ? 'ok' : 'erro'}">${r.ok ? '✓' : '✕'}</td><td>${r.nome}${r.detalhe ? `<br><code>${r.detalhe.replace(/</g, '&lt;')}</code>` : ''}</td></tr>`)
  .join('');
window.__testes = { ok, total: resultados.length, falhas: resultados.filter((r) => !r.ok) };
