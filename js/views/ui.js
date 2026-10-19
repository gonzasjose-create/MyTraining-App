// Componentes de interface partilhados.
import { html, raw, esc } from '../util.js';

export function cabecalho(titulo, { voltar = null, acoes = '' } = {}) {
  return html`<header class="cab">
    ${voltar ? raw(`<a class="voltar" href="#${esc(voltar)}" aria-label="Voltar">‹</a>`) : ''}
    <h1>${titulo}</h1>
    <div class="cab-acoes">${raw(acoes)}</div>
  </header>`;
}

export const etiqueta = (texto, tipo = '') => html`<span class="tag ${tipo}">${texto}</span>`;

// Caixa de diálogo modal com formulário. onSubmit(form) devolve false para manter aberta.
// Fecha-se sempre por d.fechar() (não depender do evento "close", que nem todos os browsers disparam).
export function dialogo(titulo, corpo, { onSubmit, onFechar, textoOk = 'Guardar', perigo = false } = {}) {
  const d = document.createElement('dialog');
  d.className = 'dialogo';
  d.innerHTML = html`<form method="dialog" novalidate>
    <h2>${titulo}</h2>
    <div class="dialogo-corpo">${raw(corpo)}</div>
    <div class="dialogo-acoes">
      <button type="button" class="btn btn-sec" data-cancelar>Cancelar</button>
      <button type="submit" class="btn ${perigo ? 'btn-perigo' : ''}">${textoOk}</button>
    </div>
  </form>`;
  document.body.appendChild(d);
  const form = d.querySelector('form');
  let fechado = false;
  d.fechar = () => {
    if (fechado) return;
    fechado = true;
    if (d.open) d.close();
    d.remove();
    onFechar?.();
  };
  d.querySelector('[data-cancelar]').onclick = () => d.fechar();
  d.addEventListener('cancel', (ev) => { ev.preventDefault(); d.fechar(); }); // tecla Esc
  d.addEventListener('close', () => d.fechar());
  form.onsubmit = (ev) => {
    ev.preventDefault();
    if (!onSubmit || onSubmit(form) !== false) d.fechar();
  };
  d.showModal();
  return d;
}

export function confirmar(msg, { textoOk = 'Confirmar', perigo = true } = {}) {
  return new Promise((resolve) => {
    let ok = false;
    dialogo('Confirmar', html`<p>${msg}</p>`, { textoOk, perigo, onSubmit: () => { ok = true; }, onFechar: () => resolve(ok) });
  });
}

// Campo de formulário com etiqueta. tipo: text | number | date | textarea | select | checkbox.
export function campo(nome, rotulo, { tipo = 'text', valor = '', opcoes = null, ajuda = '', attrs = '', classe = '' } = {}) {
  const id = 'f_' + nome.replace(/\W/g, '_');
  let input;
  if (tipo === 'textarea') input = html`<textarea id="${id}" name="${nome}" rows="3" ${raw(attrs)}>${valor ?? ''}</textarea>`;
  else if (tipo === 'select')
    input = html`<select id="${id}" name="${nome}" ${raw(attrs)}>${(opcoes || []).map(([v, t]) =>
      raw(html`<option value="${v}" ${String(v) === String(valor ?? '') ? raw('selected') : ''}>${t}</option>`)
    )}</select>`;
  else if (tipo === 'checkbox')
    return html`<label class="campo campo-check ${classe}"><input type="checkbox" id="${id}" name="${nome}" ${valor ? raw('checked') : ''} ${raw(attrs)}> <span>${rotulo}</span>${ajuda ? raw(`<small>${esc(ajuda)}</small>`) : ''}</label>`;
  else {
    // Números usam inputmode decimal (teclado numérico no iPhone) e aceitam vírgula.
    const t = tipo === 'number' ? 'text' : tipo;
    const im = tipo === 'number' ? raw('inputmode="decimal"') : '';
    input = html`<input type="${t}" id="${id}" name="${nome}" value="${valor ?? ''}" ${im} ${raw(attrs)}>`;
  }
  return html`<div class="campo ${classe}"><label for="${id}">${rotulo}</label>${raw(input)}${ajuda ? raw(`<small>${esc(ajuda)}</small>`) : ''}</div>`;
}

export const vazio = (msg, acao = '') => html`<div class="vazio"><p>${msg}</p>${raw(acao)}</div>`;
