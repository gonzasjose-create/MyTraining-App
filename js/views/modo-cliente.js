// MODO CLIENTE: ecrã para mostrar ao cliente (iPhone/tablet), com linguagem positiva e sem
// dados internos. Enquanto está ativo, a app não deixa sair deste ecrã sem o PIN do treinador.
import * as vc from '../visao-cliente.js';
import { obterCliente, def, temConsentimento } from '../repo.js';
import { gravarPin, pinCorreto as pinCorretoBase, pinValido } from '../pin.js';
import { e1rmPorExercicio, serieComposicao } from '../analise.js';
import { consistencia } from '../repo-motivacao.js';
import { linhaTemporalFotos, libertarUrls } from '../repo-fotos.js';
import { linha, limparGraficos } from '../graficos.js';
import { blocoComparacao } from './fotos.js';
import { html, raw, data, num, aviso } from '../util.js';
import { dialogo, campo } from './ui.js';

// ---------------------------------------------------------------- Estado (sobrevive a recarregar)
const CHAVE = 'treino:modoCliente';
let memoria = null;
export function modoClienteAtivo() {
  try { return JSON.parse(localStorage.getItem(CHAVE)) ?? memoria; } catch { return memoria; }
}
function guardarEstado(e) {
  memoria = e;
  try { e ? localStorage.setItem(CHAVE, JSON.stringify(e)) : localStorage.removeItem(CHAVE); } catch { /* só memória */ }
}

// ---------------------------------------------------------------- PIN (hash com sal; nunca guardado em claro)
export const temPin = () => !!def('pin_cliente')?.hash;
export const definirPin = (pin) => gravarPin('pin_cliente', pin);
const pinCorreto = (pin) => pinCorretoBase('pin_cliente', pin);

export function dialogoDefinirPin(depois) {
  dialogo('Definir PIN do modo cliente', html`<p class="ajuda">O PIN (4 a 6 dígitos) é pedido para sair do modo cliente.</p>
    ${campo('pin', 'PIN', { tipo: 'password', attrs: 'inputmode="numeric" autocomplete="new-password" maxlength="6"' })}
    ${campo('pin2', 'Repetir PIN', { tipo: 'password', attrs: 'inputmode="numeric" autocomplete="new-password" maxlength="6"' })}`, {
    onSubmit(form) {
      const p = form.pin.value, p2 = form.pin2.value;
      if (!pinValido(p)) return aviso('O PIN tem de ter 4 a 6 dígitos.', 'erro'), false;
      if (p !== p2) return aviso('Os PIN não coincidem.', 'erro'), false;
      definirPin(p).then(() => { aviso('PIN definido.'); depois?.(); });
    },
  });
}

// Entra no modo cliente (voltar = rota a que se regressa depois do PIN).
export function entrarModoCliente(clienteId, voltar, extra = '') {
  const abrir = () => {
    guardarEstado({ clienteId, voltar });
    location.hash = `#/cliente-modo/${clienteId}${extra}`;
  };
  temPin() ? abrir() : dialogoDefinirPin(abrir);
}

function pedirPinParaSair() {
  const e = modoClienteAtivo();
  dialogo('Sair do modo cliente', html`${campo('pin', 'PIN do treinador', { tipo: 'password', attrs: 'inputmode="numeric" autocomplete="off" maxlength="6" autofocus' })}`, {
    textoOk: 'Sair',
    onSubmit(form) {
      pinCorreto(form.pin.value).then((ok) => {
        if (!ok) return aviso('PIN incorreto.', 'erro');
        guardarEstado(null);
        document.body.classList.remove('modo-cliente');
        location.hash = e?.voltar || `#/cliente/${e?.clienteId ?? ''}`;
      });
    },
  });
}

// ---------------------------------------------------------------- Ecrã
const VISTAS = [['forca', '💪 Força'], ['corpo', '📏 Corpo'], ['metas', '🎯 Metas'], ['resistencia', '🏃 Resistência'], ['fotos', '📷 Fotos']];

export function vistaModoCliente(el, { id, vista = 'forca', ex }) {
  const c = obterCliente(+id);
  if (!c) return;
  document.body.classList.add('modo-cliente');
  limparGraficos();
  libertarUrls();
  const marca = def('negocio');
  const nome = c.nome.replace(/\(.*?\)/g, '').trim().split(/\s+/)[0];
  const comp = vc.comparacaoBaseline(c);
  const temFotos = temConsentimento(c.id, 'fotografias') && linhaTemporalFotos(c.id).length >= 2;
  const vistas = VISTAS.filter(([k]) => (k !== 'fotos' || temFotos) && (k !== 'resistencia' || c.perfil_resistencia));
  if (!vistas.some(([k]) => k === vista)) vista = 'forca';

  el.innerHTML = html`
    <header class="mc-cab">
      <div class="mc-marca">${marca.logo ? html`<img src="${marca.logo}" alt="${marca.nome}">` : html`<strong>${marca.nome}</strong>`}</div>
      <h1>Olá, ${nome}! 👋</h1>
      <button class="btn btn-sec btn-peq" id="sair" aria-label="Sair do modo cliente (pede PIN)">🔒 Sair</button>
    </header>
    <nav class="mc-tabs">${vistas.map(([k, t]) => html`<a href="#/cliente-modo/${c.id}?vista=${k}" class="${k === vista ? 'ativo' : ''}">${t}</a>`)}</nav>
    <section id="mc-corpo"></section>`;
  el.querySelector('#sair').onclick = pedirPinParaSair;
  const sec = el.querySelector('#mc-corpo');
  ({ forca, corpo, metas, resistencia, fotos })[vista](sec, c, comp, { ex });
  return () => { limparGraficos(); libertarUrls(); document.body.classList.remove('modo-cliente'); };
}

// Cartão "antes → agora" com linguagem positiva (sem vermelho; desfavorável = "ponto a trabalhar").
function cartoes(itens) {
  return html`<div class="mc-cartoes">${itens.map((i) => html`<div class="mc-cartao mc-${i.sentido}">
    <span class="mc-nome">${i.nome}</span>
    <div class="mc-valores">
      ${i.base != null ? html`<span class="mc-antes">${i.fmt(i.base)}<small>${i.unidade}</small></span><span class="mc-seta">→</span>` : ''}
      <span class="mc-agora">${i.atual != null ? i.fmt(i.atual) : '—'}<small>${i.unidade}</small></span>
    </div>
    <span class="mc-rodape">${i.sentido === 'melhor' ? raw(`▲ ${i.pct != null ? `${i.pct > 0 ? '+' : ''}${num(i.pct, 0)}%` : 'melhorou'}`)
      : i.sentido === 'ponto' ? 'ponto a trabalhar' : i.sentido === 'neutro' && i.delta != null ? `${i.delta > 0 ? '+' : ''}${i.fmt(i.delta)} ${i.unidade}` : i.base == null ? 'primeiro registo' : 'igual'}</span>
  </div>`)}</div>`;
}

function forca(sec, c, comp, { ex }) {
  const melh = vc.melhorias(c, 3);
  const hoje = new Date().toISOString().slice(0, 10);
  const prs = vc.prsPeriodo(c, new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), hoje);
  const e1rm = e1rmPorExercicio(c.id).filter((x) => x.pontos.length >= 2);
  const sel = e1rm.find((x) => x.exercicio_id === +ex) || e1rm[0];
  const itens = (comp?.itens || []).filter((i) => ['Força', 'Potência'].includes(i.grupo));
  sec.innerHTML = html`
    ${melh.length ? html`<div class="mc-destaques">${melh.map((m) => html`<div class="mc-destaque"><span>📈</span><div><strong>${m.texto}</strong><small>${m.extra}</small></div></div>`)}</div>` : ''}
    ${prs.length ? html`<h2>🏆 Recordes (últimos 30 dias)</h2><div class="mc-destaques">${prs.slice(0, 4).map((p) => html`<div class="mc-destaque"><span>🏆</span><div><strong>${p.nome}: ${num(p.valor)} kg</strong><small>1RM estimado · +${num(p.ganho, 0)}%</small></div></div>`)}</div>` : ''}
    ${sel ? html`<h2>Evolução</h2>
      <select id="mc-ex" class="mc-select" aria-label="Exercício">${e1rm.map((x) => html`<option value="${x.exercicio_id}" ${x === sel ? raw('selected') : ''}>${x.nome}</option>`)}</select>
      <div class="mc-grafico"><canvas id="mc-g"></canvas></div>
      <p class="mc-nota">1RM estimado (Epley). Os treinos e as avaliações aparecem separados.</p>` : ''}
    ${itens.length ? html`<h2>Desde a avaliação inicial${comp.mesmo ? '' : ` (${data(comp.base.data)} → ${data(comp.ult.data)})`}</h2>${cartoes(itens)}` : ''}
    ${!melh.length && !prs.length && !sel && !itens.length ? html`<p class="mc-nota">Os teus resultados vão aparecer aqui à medida que treinamos. 💪</p>` : ''}`;
  if (sel) {
    const pts = (f) => sel.pontos.filter((p) => p.fonte === f).map((p) => ({ data: p.data, valor: p.valor }));
    linha(sec.querySelector('#mc-g'), { series: [{ nome: 'Treinos', pontos: pts('sessão') }, { nome: 'Avaliações', pontos: pts('avaliação') }].filter((s) => s.pontos.length), unidade: 'kg', letra: 15 });
    sec.querySelector('#mc-ex').onchange = (e) => (location.hash = `#/cliente-modo/${c.id}?vista=forca&ex=${e.target.value}`);
  }
}

function corpo(sec, c, comp) {
  const itens = (comp?.itens || []).filter((i) => ['Corpo', 'Perímetros'].includes(i.grupo));
  const s = serieComposicao(c.id);
  const peso = s.filter((x) => x.peso), mg = s.filter((x) => x.mg);
  sec.innerHTML = html`
    ${itens.length ? html`<h2>Corpo${comp.mesmo ? '' : ` (${data(comp.base.data)} → ${data(comp.ult.data)})`}</h2>${cartoes(itens)}
      <p class="mc-nota">A bioimpedância varia com a hidratação: olhamos para a tendência, não para um valor isolado.</p>` : html`<p class="mc-nota">Ainda sem medições.</p>`}
    ${peso.length >= 2 ? html`<h2>Peso</h2><div class="mc-grafico"><canvas id="mc-peso"></canvas></div>` : ''}
    ${mg.length >= 2 ? html`<h2>% massa gorda</h2><div class="mc-grafico"><canvas id="mc-mg"></canvas></div>` : ''}`;
  if (peso.length >= 2) linha(sec.querySelector('#mc-peso'), { series: [{ nome: 'Peso', pontos: peso.map((x) => ({ data: x.data, valor: x.peso })) }], unidade: 'kg', letra: 15 });
  if (mg.length >= 2) linha(sec.querySelector('#mc-mg'), { series: [{ nome: '% MG', pontos: mg.map((x) => ({ data: x.data, valor: x.mg })) }], unidade: '%', letra: 15 });
}

function metas(sec, c) {
  const cons = consistencia(c.id);
  const ms = vc.metasVisiveis(c);
  sec.innerHTML = html`
    <div class="mc-streak"><span>🔥 ${cons.streak}</span><div><strong>${cons.streak === 1 ? 'semana seguida' : 'semanas seguidas'} a cumprir o plano</strong>
      <small>Melhor sequência: ${cons.melhor}${cons.score != null ? ` · consistência ${cons.score}%` : ''}</small></div></div>
    ${ms.length ? html`<h2>As tuas metas</h2><ul class="mc-metas">${ms.map((m) => html`<li>
      <div class="mc-meta-cab"><strong>${m.titulo}</strong><span>${Math.round(m.p.progresso * 100)}%</span></div>
      <div class="mc-barra"><span style="width:${Math.round(m.p.progresso * 100)}%"></span></div>
      ${m.p.atingida ? html`<p class="mc-ok">🎉 Meta atingida a ${data(m.p.atingida)}!</p>` : ''}
      ${m.p.marcos.length ? html`<p class="mc-marcos">${m.p.marcos.map((mc) => html`<span class="${mc.atingido ? 'ok' : ''}">${mc.atingido ? '✓' : '○'} ${num(mc.valor)}</span>`)}</p>` : ''}
    </li>`)}</ul>` : html`<p class="mc-nota">Vamos definir metas juntos! 🎯</p>`}`;
}

function resistencia(sec, c, comp) {
  const itens = (comp?.itens || []).filter((i) => i.grupo === 'Resistência');
  sec.innerHTML = itens.length ? html`<h2>Resistência${comp.mesmo ? '' : ` (${data(comp.base.data)} → ${data(comp.ult.data)})`}</h2>${cartoes(itens)}
    <p class="mc-nota">Tempos e frequência cardíaca de teste — valores de referência, que variam com o dia.</p>` : html`<p class="mc-nota">Ainda sem testes de resistência.</p>`;
}

function fotos(sec, c) {
  sec.innerHTML = '<div class="mc-fotos"></div>';
  blocoComparacao(sec.querySelector('.mc-fotos'), c.id, { titulo: 'Antes e agora' });
}
