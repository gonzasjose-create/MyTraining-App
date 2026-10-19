// Ver uma avaliação: resultados calculados e comparação com a baseline e com a avaliação anterior.
import * as repo from '../repo.js';
import { html, data, num, tempo, aviso } from '../util.js';
import { cabecalho, etiqueta, confirmar } from './ui.js';
import { ir } from '../app.js';

// Converte uma avaliação numa lista de linhas comparáveis (chave estável entre avaliações).
// melhor: 'mais' | 'menos' | null (neutro — ex.: peso e perímetros dependem do objetivo).
function linhas(av, c) {
  const res = repo.resultadosAvaliacao(av, c);
  const L = [];
  const add = (grupo, chave, nome, valor, unidade, o = {}) => valor != null && L.push({ grupo, chave, nome, valor, unidade, ...o });

  for (const r of res.forca) {
    const t = r.teste;
    if (t.tipo === 'salto') {
      add('Potência', `salto:${t.id}`, t.nome, r.valido ? r.melhor : null, 'cm', { melhor: 'mais', casas: 0 });
    } else if (t.bilateral) {
      add('Força', `rm:${t.id}:esq`, `${r.variante} · esq. (1RM est.)`, r.esq?.valor, 'kg', { melhor: 'mais', variante: r.variante, baixa: r.esq?.baixaFiabilidade });
      add('Força', `rm:${t.id}:dir`, `${r.variante} · dir. (1RM est.)`, r.dir?.valor, 'kg', { melhor: 'mais', variante: r.variante, baixa: r.dir?.baixaFiabilidade });
      if (r.assimetria)
        add('Força', `asim:${t.id}`, `Assimetria ${r.variante}`, r.assimetria.pct, '%', {
          melhor: 'menos', variante: r.variante, nivel: r.assimetria.nivel,
          extra: r.assimetria.ladoFraco ? `mais fraco: ${r.assimetria.ladoFraco === 'esq' ? 'esq.' : 'dir.'}` : '',
        });
    } else if (r.pesoCorporal) {
      add('Força', `reps:${t.id}`, `${r.variante} (reps)`, r.valido ? r.reps : null, 'reps', { melhor: 'mais', variante: r.variante, casas: 0 });
    } else {
      add('Força', `rm:${t.id}`, `${r.variante} (1RM est.)`, r.rm?.valor, 'kg', { melhor: 'mais', variante: r.variante, baixa: r.rm?.baixaFiabilidade });
      add('Força', `rel:${t.id}`, `${r.variante} · força relativa`, r.relativa, '× PC', { melhor: 'mais', variante: r.variante, casas: 2 });
    }
    if (r.valido === false) L.push({ grupo: 'Força', chave: `inv:${t.id}`, nome: `${r.variante || t.nome}`, valor: null, falha: true });
  }

  const cp = av.composicao;
  if (cp) {
    add('Composição', 'peso', 'Peso', cp.peso_kg, 'kg');
    add('Composição', 'mg_pct', '% massa gorda', cp.massa_gorda_pct, '%', { tendencia: true });
    add('Composição', 'mg_kg', 'Massa gorda', cp.massa_gorda_kg, 'kg', { tendencia: true });
    add('Composição', 'mm_kg', 'Massa magra', cp.massa_magra_kg, 'kg', { tendencia: true });
    add('Composição', 'agua', 'Água corporal', cp.agua_pct, '%', { tendencia: true });
    add('Composição', 'visceral', 'Gordura visceral', cp.gordura_visceral, '', { tendencia: true, casas: 0 });
  }
  for (const p of av.perimetros)
    add('Perímetros', `per:${p.perimetro}:${p.lado || ''}`, `${p.perimetro}${p.lado ? (p.lado === 'esq' ? ' · esq.' : ' · dir.') : ''}`, p.valor_cm, 'cm');

  const rs = res.resistencia;
  if (rs) {
    add('Resistência', 'fc_repouso', 'FC de repouso', rs.fc_repouso, 'bpm', { melhor: 'menos', casas: 0 });
    if (rs.teste) {
      const v = rs.teste;
      if (rs.info.tipo === 'tempo') add('Resistência', `t:${v}`, rs.info.nome, rs.tempo_seg, 's', { melhor: 'menos', fmt: tempo, variante: v });
      else add('Resistência', `d:${v}`, rs.info.nome, rs.distancia_m, 'm', { melhor: 'mais', casas: 0, variante: v });
      if (rs.ritmoKm) add('Resistência', `rk:${v}`, 'Ritmo médio', rs.ritmoKm, '/km', { melhor: 'menos', fmt: tempo, variante: v });
      if (rs.ritmo500) add('Resistência', `r5:${v}`, 'Ritmo médio', rs.ritmo500, '/500 m', { melhor: 'menos', fmt: tempo, variante: v });
      if (rs.velocidade) add('Resistência', `vel:${v}`, 'Velocidade média', rs.velocidade, 'km/h', { melhor: 'mais', variante: v });
      add('Resistência', `fcm:${v}`, 'FC média no teste', rs.fc_media, 'bpm', { casas: 0, variante: v });
      add('Resistência', `fcp:${v}`, 'FC pico observada', rs.fc_pico, 'bpm', { casas: 0, variante: v });
      add('Resistência', `rpe:${v}`, 'RPE final', rs.rpe, '/10', { casas: 0, variante: v });
      add('Resistência', `rec:${v}`, 'Recuperação 1 min (queda FC)', rs.quedaFC, 'bpm', { melhor: 'mais', casas: 0, variante: v });
    }
  }
  return L;
}

// Valor formatado com unidade (tempos em m:ss; a unidade "s" não se mostra).
const fmtValor = (l, v = l.valor) =>
  (l.fmt ? l.fmt(v) : num(v, l.casas ?? 1)) + (l.unidade && l.unidade !== 's' ? ` ${l.unidade}` : '');

function celulaDelta(l, ref) {
  if (!ref) return html`<td class="delta">—</td>`;
  if (ref.variante !== l.variante) return html`<td class="delta"><span class="tag tag-aviso" title="Variante/teste diferente">não comparável</span></td>`;
  const d = l.valor - ref.valor;
  if (Math.abs(d) < 1e-9) return html`<td class="delta">=</td>`;
  const classe = !l.melhor ? 'neutro' : (d > 0) === (l.melhor === 'mais') ? 'sobe' : 'desce';
  // Valores já em % mostram-se em pontos percentuais (pp), sem % relativa.
  if (l.unidade === '%') return html`<td class="delta ${classe}">${d > 0 ? '+' : ''}${num(d, 1)} pp</td>`;
  const pct = ref.valor ? `${d > 0 ? '+' : ''}${num((d / ref.valor) * 100, 1)}%` : '';
  const val = l.fmt ? `${d > 0 ? '+' : '−'}${l.fmt(Math.abs(d))}` : `${d > 0 ? '+' : ''}${num(d, l.casas ?? 1)}`;
  return html`<td class="delta ${classe}">${val}${pct ? html`<br><small>${pct}</small>` : ''}</td>`;
}

// Tabela de resultados. Se "comparar" for dado, mostra o valor de referência e a diferença.
export function blocoResultados(av, c, { compacto = false, comparar = null, rotuloComparar = 'Baseline' } = {}) {
  const L = linhas(av, c);
  if (!L.length) return html`<p class="ajuda">Sem resultados registados.</p>`;
  const ref = comparar ? Object.fromEntries(linhas(comparar, c).map((l) => [l.chave, l])) : null;
  const grupos = [...new Set(L.map((l) => l.grupo))];
  // Versão compacta (resumo da ficha): sem perímetros nem detalhe de FC do teste.
  const filtro = compacto
    ? (l) => l.grupo !== 'Perímetros' && !['mg_kg', 'agua', 'visceral'].includes(l.chave) && !/^(fcm|fcp|rpe|rec):/.test(l.chave)
    : () => true;

  return html`${grupos.map((g) => {
    const ls = L.filter((l) => l.grupo === g && filtro(l));
    if (!ls.length) return '';
    return html`<h4>${g}${ls.some((l) => l.tendencia) ? html` <small class="estimativa">bioimpedância: ler como tendência</small>` : ''}</h4>
      <table class="tabela resultados"><thead><tr><th></th>${ref ? html`<th>${rotuloComparar}</th>` : ''}<th>Valor</th>${ref ? html`<th>Diferença</th>` : ''}</tr></thead><tbody>
      ${ls.map((l) =>
        l.falha
          ? html`<tr><td>${l.nome}</td>${ref ? html`<td></td>` : ''}<td colspan="2"><span class="tag tag-aviso">qualidade 0 — não conta</span></td></tr>`
          : html`<tr>
            <td>${l.nome}${l.baixa ? html` <span class="tag tag-aviso">baixa fiabilidade</span>` : ''}${l.extra ? html`<br><small>${l.extra}</small>` : ''}</td>
            ${ref ? html`<td class="ref">${ref[l.chave] ? fmtValor(ref[l.chave]) : '—'}</td>` : ''}
            <td><strong>${fmtValor(l)}</strong>${l.nivel && l.nivel !== 'ok' ? html` <span class="tag ${l.nivel === 'alerta' ? 'tag-alerta' : 'tag-aviso'}">${l.nivel === 'alerta' ? 'investigar' : 'atenção'}</span>` : ''}</td>
            ${ref ? celulaDelta(l, ref[l.chave]) : ''}
          </tr>`
      )}</tbody></table>`;
  })}`;
}

export function vistaAvaliacao(el, { avId, comp = 'baseline' }) {
  const av = repo.obterAvaliacao(+avId);
  if (!av) return ir('/clientes');
  const c = repo.obterCliente(av.cliente_id);
  const todas = repo.listarAvaliacoes(c.id);
  const idx = todas.findIndex((a) => a.id === av.id);
  const baseline = todas.find((a) => a.tipo === 'baseline' && a.id !== av.id);
  const anterior = idx > 0 ? todas[idx - 1] : null;

  const alvo = comp === 'anterior' ? anterior : baseline;
  const avComp = alvo ? repo.obterAvaliacao(alvo.id) : null;
  const difs = avComp ? repo.variantesDiferentes(av, avComp) : [];

  el.innerHTML = html`
    ${cabecalho(`${av.tipo === 'baseline' ? 'Baseline' : 'Reavaliação'} · ${data(av.data)}`, {
      voltar: `/cliente/${c.id}?tab=avaliacoes`,
      acoes: `<a class="btn btn-sec" href="#/avaliacao/${av.id}/editar">Editar</a>`,
    })}
    <p class="ficha-topo"><a href="#/cliente/${c.id}">${c.nome}</a>
      ${av.composicao && !av.composicao.condicoes_padronizadas ? etiqueta('Bioimpedância fora das condições padronizadas', 'tag-aviso') : ''}</p>
    ${baseline || anterior
      ? html`<nav class="separadores">
          ${baseline ? html`<a href="#/avaliacao/${av.id}?comp=baseline" class="${comp !== 'anterior' ? 'ativo' : ''}">vs baseline</a>` : ''}
          ${anterior ? html`<a href="#/avaliacao/${av.id}?comp=anterior" class="${comp === 'anterior' ? 'ativo' : ''}">vs anterior (${data(anterior.data)})</a>` : ''}
        </nav>`
      : ''}
    ${difs.length
      ? html`<div class="caixa caixa-aviso"><strong>Variantes diferentes — comparação direta bloqueada:</strong>
          <ul>${difs.map((d) => html`<li>${d.teste}: ${d.de} → ${d.para}</li>`)}</ul></div>`
      : ''}
    <div class="cartao">${blocoResultados(av, c, { comparar: avComp, rotuloComparar: comp === 'anterior' ? 'Anterior' : 'Baseline' })}</div>
    ${av.notas ? html`<div class="cartao"><h4>Notas</h4><p class="pre">${av.notas}</p></div>` : ''}
    <p class="ajuda">1RM estimado pela fórmula de Epley · força relativa = 1RM ÷ peso corporal · valores de resistência e FC são estimativas.</p>
    <div class="cartao zona-perigo"><button class="btn btn-perigo btn-peq" id="apagar">Apagar avaliação</button></div>`;

  el.querySelector('#apagar').onclick = async () => {
    if (!(await confirmar('Apagar esta avaliação e todos os seus resultados?', { textoOk: 'Apagar' }))) return;
    repo.apagarAvaliacao(av.id);
    aviso('Avaliação apagada.');
    ir(`/cliente/${c.id}?tab=avaliacoes`);
  };
}
