// Separador "Análise" da ficha: alertas, highlights, indicadores de carga, comparações e gráficos.
// Vista do TREINADOR (inclui alertas internos). O modo cliente (Fase 6) terá uma versão filtrada.
import * as an from '../analise.js';
import { resultadosAvaliacao, def } from '../repo.js';
import { TESTES_AEROBIOS } from '../catalogos.js';
import { html, raw, data, num, tempo } from '../util.js';
import { linha, barras, blocoGrafico, limparGraficos, rotuloSemana } from '../graficos.js';

const ICONES = { pr: ['🏆', 'PR'], subida: ['▲', 'Subida'], queda: ['▼', 'Queda'], estagnacao: ['＝', 'Estagnação'], info: ['ℹ', 'Info'] };
const sinal = (v, casas = 0) => (v == null ? '—' : `${v > 0 ? '+' : ''}${num(v, casas)}`);

// Classificação indicativa do rácio agudo:crónico (não é diagnóstico).
function leituraACWR(r) {
  if (r == null) return ['—', 'precisa de 3+ semanas de registos com RPE e duração'];
  if (r < 0.8) return ['baixo', 'carga recente abaixo do habitual'];
  if (r <= 1.3) return ['estável', 'carga recente em linha com o habitual'];
  if (r <= 1.5) return ['a subir', 'vigiar a progressão'];
  return ['alto', 'aumento brusco — considera ajustar'];
}

export function seccaoAnaliseCliente(sec, c, estado = {}) {
  limparGraficos();
  const series = an.seriesRealizadas(c.id);
  const e1rm = an.e1rmPorExercicio(c.id, series);
  const sem = an.semanas(c.id, 12, series);
  const ind = an.indicadores(c, sem);
  const alertas = an.alertasCliente(c, { e1rm, ind });
  const hl = an.highlights(c, { e1rm });
  const blocos = an.comparacaoBlocos(c, e1rm);
  const comp = an.serieComposicao(c.id);
  const resist = c.perfil_resistencia ? an.serieResistencia(c) : null;
  const n = sem.length;
  const [atual, anterior] = [sem[n - 1], sem[n - 2]];
  const soma = (ws, k) => ws.reduce((a, w) => a + w[k], 0);
  const ult4 = sem.slice(n - 5, n - 1), ant4 = sem.slice(n - 9, n - 5);
  const [acwrTxt, acwrDesc] = leituraACWR(ind.acwr);
  const antes = sem[n - 3];
  const varVolume = antes.tonelagem ? ((anterior.tonelagem - antes.tonelagem) / antes.tonelagem) * 100 : null;

  const exSel = e1rm.find((x) => x.exercicio_id === +estado.ex) || e1rm[0];
  const perims = [...new Set(comp.flatMap((x) => x.perimetros.map((p) => p.perimetro)))];
  const perSel = perims.includes(estado.per) ? estado.per : perims[0];
  // Assimetria ao longo das avaliações (teste unilateral).
  const asim = comp.map(({ av }) => ({ data: av.data, r: resultadosAvaliacao(av, c).forca.find((f) => f.teste.bilateral)?.assimetria })).filter((x) => x.r);
  const limAsim = def('limiares_assimetria');

  sec.innerHTML = html`
    ${alertas.length ? html`<div class="cartao alertas"><h3>⚠ Alertas <small>(só para ti)</small></h3>
      <ul class="lista-alertas">${alertas.map((a) => html`<li class="${a.nivel}"><a href="#/cliente/${c.id}?tab=${a.tab}">
        <span class="icone">${a.nivel === 'alerta' ? '⛔' : '⚠'}</span> ${a.texto}</a></li>`)}</ul></div>` : ''}

    <div class="cartao"><h3>Destaques</h3>
      ${hl.length ? html`<ul class="highlights">${hl.map((h) => html`<li class="hl-${h.tipo}">
          <span class="hl-icone" aria-hidden="true">${ICONES[h.tipo][0]}</span>
          <div><span class="hl-tipo">${ICONES[h.tipo][1]}</span><strong>${h.texto}</strong><small>${h.detalhe}</small></div></li>`)}</ul>`
        : html`<p class="ajuda">Ainda sem dados suficientes para destaques — regista sessões e avaliações.</p>`}
    </div>

    <div class="cartao"><h3>Indicadores de carga</h3>
      <div class="kpis kpis-4">
        <div class="kpi"><span>${num(anterior.tonelagem, 0)}</span>volume da semana passada (kg)<small>${varVolume != null ? `${sinal(varVolume)}% vs semana antes` : ''}</small></div>
        <div class="kpi"><span>${num(anterior.cargaInterna, 0)}</span>carga interna (UA)<small>RPE × min${anterior.parcial ? ' · parcial' : ''}</small></div>
        <div class="kpi"><span>${ind.acwr != null ? num(ind.acwr, 2) : '—'}</span>rácio agudo:crónico<small>${acwrTxt} · ${acwrDesc}</small></div>
        <div class="kpi"><span>${ind.assiduidade4 != null ? `${ind.assiduidade4}%` : '—'}</span>assiduidade (4 sem.)<small>${c.frequencia_semanal ? `alvo ${c.frequencia_semanal}×/semana` : 'define a frequência na ficha'}</small></div>
      </div>
      <p class="ajuda">Tendência do volume (últimas 4 semanas vs 4 anteriores): <strong>${ind.tendenciaVolume != null ? `${sinal(ind.tendenciaVolume)}%` : '—'}</strong>.
        Carga interna = RPE da sessão × duração; o rácio é indicativo, não um diagnóstico.</p>
    </div>

    <div class="cartao"><h3>Comparação</h3>
      <table class="tabela comparacao"><thead><tr><th></th><th>Semana atual<br><small>até hoje</small></th><th>Semana passada</th><th>Últ. 4 sem.</th><th>4 anteriores</th></tr></thead><tbody>
        <tr><td>Sessões</td><td>${atual.sessoes}</td><td>${anterior.sessoes}</td><td>${soma(ult4, 'sessoes')}</td><td>${soma(ant4, 'sessoes')}</td></tr>
        <tr><td>Faltas</td><td>${atual.faltas}</td><td>${anterior.faltas}</td><td>${soma(ult4, 'faltas')}</td><td>${soma(ant4, 'faltas')}</td></tr>
        <tr><td>Séries de força</td><td>${atual.series}</td><td>${anterior.series}</td><td>${soma(ult4, 'series')}</td><td>${soma(ant4, 'series')}</td></tr>
        <tr><td>Volume (kg)</td><td>${num(atual.tonelagem, 0)}</td><td>${num(anterior.tonelagem, 0)}</td><td>${num(soma(ult4, 'tonelagem'), 0)}</td><td>${num(soma(ant4, 'tonelagem'), 0)}</td></tr>
        <tr><td>Carga interna</td><td>${num(atual.cargaInterna, 0)}</td><td>${num(anterior.cargaInterna, 0)}</td><td>${num(soma(ult4, 'cargaInterna'), 0)}</td><td>${num(soma(ant4, 'cargaInterna'), 0)}</td></tr>
        <tr><td>Minutos</td><td>${atual.minutos}</td><td>${anterior.minutos}</td><td>${soma(ult4, 'minutos')}</td><td>${soma(ant4, 'minutos')}</td></tr>
      </tbody></table>
      ${blocos ? html`<h4>Bloco anterior vs atual</h4>
        <table class="tabela comparacao"><thead><tr><th></th><th>${blocos.nomes[0]}<br><small>${data(blocos.periodos[0].de)}–${data(blocos.periodos[0].ate)}</small></th><th>${blocos.nomes[1]}<br><small>desde ${data(blocos.periodos[1].de)}</small></th></tr></thead><tbody>
          <tr><td>Sessões/semana</td>${blocos.metricas.map((m) => html`<td>${num(m.porSemana, 1)}</td>`)}</tr>
          <tr><td>Volume total (kg)</td>${blocos.metricas.map((m) => html`<td>${num(m.tonelagem, 0)}</td>`)}</tr>
          <tr><td>RPE médio</td>${blocos.metricas.map((m) => html`<td>${m.rpe != null ? num(m.rpe, 1) : '—'}</td>`)}</tr>
          ${blocos.exs.map((x) => html`<tr><td>${x.nome} <small>(melhor 1RM est.)</small></td>${x.valores.map((v) => html`<td>${v != null ? `${num(v)} kg` : '—'}</td>`)}</tr>`)}
        </tbody></table>` : html`<p class="ajuda">A comparação entre blocos aparece quando o cliente tiver dois planos com data de início.</p>`}
      <p class="ajuda">Comparação com a baseline: abre a última avaliação no separador <a href="#/cliente/${c.id}?tab=avaliacoes">Avaliações</a>.</p>
    </div>

    <div class="cartao"><h3>Gráficos</h3>
      ${e1rm.length ? html`
        <label class="campo"><span>Exercício</span><select id="sel-ex">${e1rm.map((x) => html`<option value="${x.exercicio_id}" ${x === exSel ? raw('selected') : ''}>${x.nome} (${x.pontos.length})</option>`)}</select></label>
        ${blocoGrafico('g-e1rm', `1RM estimado · ${exSel.nome}`, {
          subtitulo: 'Epley, qualidade técnica 1–2 · treino e testes em séries separadas (não são comparáveis diretamente)',
          cabecalhos: ['Data', '1RM est.', 'Série', 'Origem'],
          linhasTabela: exSel.pontos.map((p) => [data(p.data), `${num(p.valor)} kg`, `${num(p.carga)} × ${p.reps}`, p.fonte]),
        })}` : html`<p class="ajuda">O 1RM estimado aparece quando houver séries ou testes de força registados.</p>`}
      ${blocoGrafico('g-volume', 'Volume semanal (kg levantados)', {
        subtitulo: 'Σ carga × reps das séries feitas · barra clara = semana atual (incompleta)',
        cabecalhos: ['Semana', 'Volume', 'Séries'], linhasTabela: sem.map((w) => [rotuloSemana(w.inicio), num(w.tonelagem, 0), w.series]),
      })}
      ${blocoGrafico('g-carga', 'Carga interna semanal (UA)', {
        subtitulo: 'RPE da sessão × duração (min)',
        cabecalhos: ['Semana', 'Carga interna', 'Minutos'], linhasTabela: sem.map((w) => [rotuloSemana(w.inicio), num(w.cargaInterna, 0), w.minutos]),
      })}
      ${blocoGrafico('g-assid', 'Sessões por semana', {
        subtitulo: c.frequencia_semanal ? `tracejado = combinado (${c.frequencia_semanal}×)` : '',
        cabecalhos: ['Semana', 'Sessões', 'Faltas'], linhasTabela: sem.map((w) => [rotuloSemana(w.inicio), w.sessoes, w.faltas]),
      })}
      ${comp.filter((x) => x.peso).length ? blocoGrafico('g-peso', 'Peso corporal', {
        subtitulo: 'bioimpedância: ler como tendência', cabecalhos: ['Data', 'Peso', '% MG'],
        linhasTabela: comp.map((x) => [data(x.data), x.peso ? `${num(x.peso)} kg` : '—', x.mg ? `${num(x.mg)}%` : '—']), altura: 180,
      }) : ''}
      ${comp.filter((x) => x.mg).length ? blocoGrafico('g-mg', '% massa gorda', { subtitulo: 'tendência, não valor absoluto', altura: 180 }) : ''}
      ${perims.length ? html`
        <label class="campo"><span>Perímetro</span><select id="sel-per">${perims.map((p) => html`<option ${p === perSel ? raw('selected') : ''}>${p}</option>`)}</select></label>
        ${blocoGrafico('g-per', `Perímetro · ${perSel}`, { altura: 180 })}` : ''}
      ${asim.length ? blocoGrafico('g-asim', 'Assimetria (teste unilateral)', {
        subtitulo: `tracejado = limiar de atenção (${limAsim.atencao}%) · sinal para investigar, não diagnóstico`,
        cabecalhos: ['Data', 'Assimetria', 'Lado mais fraco'], linhasTabela: asim.map((x) => [data(x.data), `${num(x.r.pct)}%`, x.r.ladoFraco === 'esq' ? 'esquerdo' : x.r.ladoFraco === 'dir' ? 'direito' : '—']), altura: 180,
      }) : ''}
      ${resist ? blocosResistencia(resist) : ''}
    </div>`;

  desenhar();

  function desenhar() {
    if (!window.Chart) { sec.insertAdjacentHTML('afterbegin', '<p class="caixa caixa-erro">Não foi possível carregar os gráficos.</p>'); return; }
    if (exSel && document.getElementById('g-e1rm')) {
      // Duas séries: treino (séries submáximas) e testes de avaliação (esforço máximo) — não se misturam.
      const pts = (f) => exSel.pontos.filter((p) => p.fonte === f).map((p) => ({ data: p.data, valor: p.valor, extra: `${num(p.carga)} × ${p.reps}` }));
      const series = [{ nome: 'Séries de treino', pontos: pts('sessão') }, { nome: 'Testes de avaliação', pontos: pts('avaliação') }].filter((s) => s.pontos.length);
      linha(document.getElementById('g-e1rm'), { series, unidade: 'kg' });
    }
    const rot = sem.map((w) => rotuloSemana(w.inicio));
    barras(document.getElementById('g-volume'), { rotulos: rot, valores: sem.map((w) => w.tonelagem), nome: 'Volume', unidade: 'kg', casas: 0 });
    barras(document.getElementById('g-carga'), { rotulos: rot, valores: sem.map((w) => w.cargaInterna), nome: 'Carga interna', unidade: 'UA', casas: 0 });
    barras(document.getElementById('g-assid'), {
      rotulos: rot, valores: sem.map((w) => w.sessoes), nome: 'Sessões', casas: 0,
      alvo: c.frequencia_semanal ? { valor: c.frequencia_semanal, nome: 'Combinado' } : null,
    });
    const pesoPts = comp.filter((x) => x.peso).map((x) => ({ data: x.data, valor: x.peso, extra: x.padronizada ? '' : 'fora das condições padronizadas' }));
    if (document.getElementById('g-peso')) linha(document.getElementById('g-peso'), { series: [{ nome: 'Peso', pontos: pesoPts }], unidade: 'kg' });
    if (document.getElementById('g-mg')) linha(document.getElementById('g-mg'), { series: [{ nome: '% MG', pontos: comp.filter((x) => x.mg).map((x) => ({ data: x.data, valor: x.mg })) }], unidade: '%' });
    if (document.getElementById('g-per')) {
      const lados = [...new Set(comp.flatMap((x) => x.perimetros.filter((p) => p.perimetro === perSel).map((p) => p.lado || '')))];
      linha(document.getElementById('g-per'), {
        series: lados.map((l) => ({
          nome: l === 'esq' ? 'Esquerdo' : l === 'dir' ? 'Direito' : perSel,
          pontos: comp.map((x) => ({ data: x.data, valor: x.perimetros.find((p) => p.perimetro === perSel && (p.lado || '') === l)?.valor_cm })).filter((p) => p.valor != null),
        })),
        unidade: 'cm',
      });
    }
    if (document.getElementById('g-asim'))
      linha(document.getElementById('g-asim'), { series: [{ nome: 'Assimetria', pontos: asim.map((x) => ({ data: x.data, valor: x.r.pct })) }], referencia: { valor: limAsim.atencao, nome: 'Limiar de atenção' }, unidade: '%', min: 0 });
    if (resist) desenharResistencia(resist);
  }

  sec.querySelector('#sel-ex')?.addEventListener('change', (e) => seccaoAnaliseCliente(sec, c, { ...estado, ex: e.target.value }));
  sec.querySelector('#sel-per')?.addEventListener('change', (e) => seccaoAnaliseCliente(sec, c, { ...estado, per: e.target.value }));
}

// ---------------------------------------------------------------- Resistência
function blocosResistencia({ testes, sessoes }) {
  const t = testes.filter((x) => x.r.teste);
  const corr = sessoes.filter((s) => s.ritmo && s.unidade === 'km');
  const fcs = sessoes.filter((s) => s.fc);
  const fcRep = testes.filter((x) => x.r.fc_repouso);
  return html`
    ${t.length ? blocoGrafico('g-teste', `Teste aeróbio · ${TESTES_AEROBIOS[t[t.length - 1].r.teste]?.nome}`, {
      subtitulo: TESTES_AEROBIOS[t[t.length - 1].r.teste]?.tipo === 'tempo' ? 'tempo final — para cima é mais rápido' : 'distância em 12 min',
      cabecalhos: ['Data', 'Resultado', 'FC média', 'FC pico'],
      linhasTabela: t.map((x) => [data(x.data), x.r.tempo_seg ? tempo(x.r.tempo_seg) : `${x.r.distancia_m} m`, x.r.fc_media ?? '—', x.r.fc_pico ?? '—']), altura: 180,
    }) : ''}
    ${fcRep.length ? blocoGrafico('g-fcrep', 'FC de repouso', { subtitulo: 'bpm · tendência a descer costuma acompanhar a melhoria aeróbia', altura: 160 }) : ''}
    ${corr.length ? blocoGrafico('g-ritmo', 'Ritmo médio nas sessões de corrida', {
      subtitulo: 'min/km — para cima é mais rápido', cabecalhos: ['Data', 'Exercício', 'Ritmo', 'Distância', 'FC média'],
      linhasTabela: corr.map((s) => [data(s.data), s.nome, `${tempo(s.ritmo)}/km`, `${num(s.distancia / 1000, 2)} km`, s.fc ?? '—']), altura: 180,
    }) : ''}
    ${fcs.length ? blocoGrafico('g-fcsess', 'FC média nas sessões de resistência', { subtitulo: 'bpm', altura: 160 }) : ''}`;
}

function desenharResistencia({ testes, sessoes }) {
  const t = testes.filter((x) => x.r.teste && x.r.teste === testes.filter((y) => y.r.teste).pop()?.r.teste);
  const g = (id) => document.getElementById(id);
  if (g('g-teste')) {
    const porTempo = TESTES_AEROBIOS[t[0].r.teste]?.tipo === 'tempo';
    linha(g('g-teste'), {
      series: [{ nome: porTempo ? 'Tempo' : 'Distância', pontos: t.map((x) => ({ data: x.data, valor: porTempo ? x.r.tempo_seg : x.r.distancia_m })) }],
      invertido: porTempo, fmtValor: porTempo ? (v) => tempo(v) : (v) => `${num(v, 0)} m`,
    });
  }
  if (g('g-fcrep')) linha(g('g-fcrep'), { series: [{ nome: 'FC repouso', pontos: testes.filter((x) => x.r.fc_repouso).map((x) => ({ data: x.data, valor: x.r.fc_repouso })) }], unidade: 'bpm', casas: 0 });
  if (g('g-ritmo')) linha(g('g-ritmo'), {
    series: [{ nome: 'Ritmo', pontos: sessoes.filter((s) => s.ritmo && s.unidade === 'km').map((s) => ({ data: s.data, valor: s.ritmo, extra: s.nome })) }],
    invertido: true, fmtValor: (v) => `${tempo(v)}/km`,
  });
  if (g('g-fcsess')) linha(g('g-fcsess'), { series: [{ nome: 'FC média', pontos: sessoes.filter((s) => s.fc).map((s) => ({ data: s.data, valor: s.fc, extra: s.nome })) }], unidade: 'bpm', casas: 0 });
}
