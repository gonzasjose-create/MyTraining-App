// Testes automáticos (funções puras). Abrir testes.html no browser.
import { epley, forcaRelativa, assimetria, tanaka, zonasFC, idade, quedaFC, melhorTentativa } from './calc.js';
import { progredir, deload, sugerirSeguintes, ajustarComRealizado } from './progressao.js';
import { riegel, tempo5kDoTeste, zonasRitmoCorrida, metasHyrox, totalHyrox } from './ritmos.js';
import { lerTempo, tempo, lerNum } from './util.js';
import { interpretarCheckin } from './repo-motivacao.js';
import { gerarICS, nomeCalendario } from './ics.js';
import { DEFINICOES_PADRAO } from './catalogos.js';

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
