// Gráficos (Chart.js, cópia local em lib/). Regras seguidas em todos os gráficos:
// um só eixo Y por gráfico, cores por série em ordem fixa (paleta validada para daltonismo),
// linhas de 2 px, dica ao tocar/passar, tabela alternativa, e cores próprias no modo escuro.
import { html, num, data } from './util.js';

const escuro = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;

// Paleta categórica validada (claro / escuro) e tinta do gráfico.
const PALETA = {
  claro: { series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'], tinta: '#52514e', muda: '#898781', grelha: '#e1e0d9', ref: '#898781', fundo: '#fcfcfb' },
  escuro: { series: ['#3987e5', '#d95926', '#199e70', '#c98500'], tinta: '#c3c2b7', muda: '#898781', grelha: '#2c2c2a', ref: '#898781', fundo: '#1a1a19' },
};
// tema: 'claro' força as cores claras (relatórios para imprimir/PDF), senão segue o sistema.
const cores = (tema) => PALETA[tema === 'claro' ? 'claro' : escuro() ? 'escuro' : 'claro'];

const ativos = new Set();
export function limparGraficos() {
  for (const g of ativos) { try { g.destroy(); } catch { /* ignorar */ } }
  ativos.clear();
}

const fmtData = (ms) => { const d = new Date(ms); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };
const ms = (iso) => new Date(iso + 'T12:00:00').getTime();

function base(c, { unidade = '', casas = 1, invertido = false, fmtValor = null, eixoX = 'tempo', min = undefined, letra = null }) {
  const f = fmtValor || ((v) => `${num(v, casas)}${unidade ? ' ' + unidade : ''}`);
  if (letra && window.Chart) window.Chart.defaults.font.size = letra;
  else if (window.Chart) window.Chart.defaults.font.size = 12;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'nearest', intersect: false, axis: 'x' },
    plugins: {
      legend: { display: false, labels: { color: c.tinta, boxWidth: 12, boxHeight: 2, usePointStyle: false } },
      tooltip: {
        callbacks: {
          title: (it) => (eixoX === 'tempo' ? data(new Date(it[0].parsed.x).toISOString().slice(0, 10)) : it[0].label),
          label: (it) => `${it.dataset.label}: ${f(it.parsed.y)}${it.raw?.extra ? ` · ${it.raw.extra}` : ''}`,
        },
      },
    },
    scales: {
      x: eixoX === 'tempo'
        ? { type: 'linear', ticks: { color: c.muda, callback: (v) => fmtData(v), maxTicksLimit: 6 }, grid: { display: false }, border: { color: c.grelha } }
        : { ticks: { color: c.muda, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false }, border: { color: c.grelha } },
      y: { reverse: invertido, min, ticks: { color: c.muda, callback: (v) => f(v), maxTicksLimit: 5 }, grid: { color: c.grelha }, border: { display: false } },
    },
  };
}

// Linha ao longo do tempo. series: [{ nome, pontos: [{ data, valor, extra }] }]; referencia: { valor, nome }.
export function linha(canvas, { series, referencia = null, ...op }) {
  const c = cores(op.tema);
  const datasets = series.map((s, i) => ({
    label: s.nome,
    data: s.pontos.map((p) => ({ x: ms(p.data), y: p.valor, extra: p.extra })),
    borderColor: c.series[i], backgroundColor: c.series[i],
    borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: c.fundo, pointBorderWidth: 2, tension: 0,
  }));
  if (referencia && series[0]?.pontos.length) {
    const xs = series.flatMap((s) => s.pontos.map((p) => ms(p.data)));
    datasets.push({
      label: referencia.nome, data: [{ x: Math.min(...xs), y: referencia.valor }, { x: Math.max(...xs), y: referencia.valor }],
      borderColor: c.ref, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0,
    });
  }
  const opcoes = base(c, op);
  opcoes.plugins.legend.display = datasets.length > 1;
  const g = new window.Chart(canvas, { type: 'line', data: { datasets }, options: opcoes });
  ativos.add(g);
  return g;
}

// Barras por categoria (ex.: semanas). alvo: linha de referência horizontal (ex.: sessões combinadas).
export function barras(canvas, { rotulos, valores, nome, alvo = null, destaqueUltima = true, ...op }) {
  const c = cores(op.tema);
  const n = valores.length;
  const datasets = [{
    label: nome, data: valores,
    // Semana atual (incompleta) mais clara para não ser lida como uma queda.
    backgroundColor: valores.map((_, i) => (destaqueUltima && i === n - 1 ? c.series[0] + '66' : c.series[0])),
    borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 28, categoryPercentage: 0.8, barPercentage: 0.9,
  }];
  if (alvo != null)
    datasets.push({ type: 'line', label: alvo.nome, data: valores.map(() => alvo.valor), borderColor: c.ref, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0 });
  const opcoes = base(c, { ...op, eixoX: 'categoria', min: 0 });
  opcoes.interaction = { mode: 'index', intersect: false };
  opcoes.plugins.legend.display = alvo != null;
  const g = new window.Chart(canvas, { type: 'bar', data: { labels: rotulos, datasets }, options: opcoes });
  ativos.add(g);
  return g;
}

// Bloco HTML de um gráfico: título, canvas e tabela alternativa (acessível e para ver valores exatos).
export function blocoGrafico(id, titulo, { subtitulo = '', linhasTabela = [], cabecalhos = ['Data', 'Valor'], altura = 220 } = {}) {
  return html`<figure class="grafico">
    <figcaption><strong>${titulo}</strong>${subtitulo ? html`<small>${subtitulo}</small>` : ''}</figcaption>
    <div class="grafico-area" style="height:${altura}px"><canvas id="${id}" role="img" aria-label="${titulo}"></canvas></div>
    ${linhasTabela.length ? html`<details class="grafico-tabela"><summary>Ver tabela</summary>
      <table class="tabela"><thead><tr>${cabecalhos.map((h) => html`<th>${h}</th>`)}</tr></thead>
      <tbody>${linhasTabela.map((l) => html`<tr>${l.map((x) => html`<td>${x}</td>`)}</tr>`)}</tbody></table></details>` : ''}
  </figure>`;
}

export const rotuloSemana = (iso) => iso.split('-').reverse().slice(0, 2).join('/');
