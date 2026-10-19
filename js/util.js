// Utilitários de apresentação (pt-PT), escape de HTML e validação de inputs.

// ---------- HTML ----------
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
// Template literal com escape automático: html`<p>${valor}</p>`.
// O resultado é "seguro" e pode ser aninhado noutro html`` sem novo escape.
// Para inserir HTML já seguro vindo de outra origem, envolver com raw().
class Seguro {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
const parte = (v) => (v instanceof Seguro ? v.s : v === false || v == null ? '' : esc(v));
export function html(partes, ...valores) {
  return new Seguro(
    partes.reduce((acc, p, i) => {
      const v = valores[i - 1];
      return acc + (Array.isArray(v) ? v.map(parte).join('') : parte(v)) + p;
    })
  );
}
export const raw = (s) => (s instanceof Seguro ? s : new Seguro(String(s ?? '')));

// ---------- Datas e números ----------
export const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function data(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
const nf = (casas) => new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: casas });
export const num = (v, casas = 1) => (v == null || v === '' || isNaN(v) ? '—' : nf(casas).format(v));
export const kg = (v) => (v == null ? '—' : `${num(v, 1)} kg`);
export const cm = (v) => (v == null ? '—' : `${num(v, 1)} cm`);
// Segundos → "m:ss" ou "h:mm:ss".
export function tempo(seg) {
  if (seg == null || isNaN(seg)) return '—';
  seg = Math.round(seg);
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
// "m:ss" ou "h:mm:ss" → segundos (null se inválido).
export function lerTempo(txt) {
  if (!txt) return null;
  const p = String(txt).trim().split(':').map((x) => x.trim());
  if (p.some((x) => !/^\d+$/.test(x)) || p.length < 2 || p.length > 3) return null;
  const n = p.map(Number);
  if (n.slice(1).some((x) => x >= 60)) return null;
  return p.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2] : n[0] * 60 + n[1];
}
// Lê número em formato pt-PT ("72,5") ou com ponto.
export function lerNum(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.').trim());
  return isNaN(n) ? NaN : n;
}

// ---------- Validação ----------
// Recolhe erros por campo; cada regra devolve o valor convertido.
export class Validador {
  constructor() { this.erros = {}; }
  get ok() { return Object.keys(this.erros).length === 0; }
  erro(campo, msg) { if (!this.erros[campo]) this.erros[campo] = msg; }

  texto(campo, v, { obrigatorio = false, max = 2000, nome = 'Campo' } = {}) {
    const s = (v ?? '').trim();
    if (obrigatorio && !s) this.erro(campo, `${nome} é obrigatório.`);
    else if (s.length > max) this.erro(campo, `${nome}: máximo ${max} caracteres.`);
    return s || null;
  }
  numero(campo, v, { min, max, obrigatorio = false, inteiro = false, nome = 'Valor', unidade = '' } = {}) {
    const n = lerNum(v);
    if (n == null) { if (obrigatorio) this.erro(campo, `${nome} é obrigatório.`); return null; }
    if (isNaN(n)) { this.erro(campo, `${nome}: número inválido.`); return null; }
    if (inteiro && !Number.isInteger(n)) { this.erro(campo, `${nome}: tem de ser um número inteiro.`); return null; }
    if ((min != null && n < min) || (max != null && n > max)) {
      this.erro(campo, `${nome}: valor impossível (aceite entre ${num(min, 2)} e ${num(max, 2)}${unidade ? ' ' + unidade : ''}).`);
      return null;
    }
    return n;
  }
  data(campo, v, { obrigatorio = false, nome = 'Data', futuro = false, minAno = 1900 } = {}) {
    if (!v) { if (obrigatorio) this.erro(campo, `${nome} é obrigatória.`); return null; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { this.erro(campo, `${nome}: data inválida.`); return null; }
    const [a, m, d] = v.split('-').map(Number);
    const dt = new Date(a, m - 1, d);
    if (dt.getFullYear() !== a || dt.getMonth() !== m - 1 || dt.getDate() !== d || a < minAno) {
      this.erro(campo, `${nome}: data inválida.`); return null;
    }
    if (!futuro && v > hojeISO()) { this.erro(campo, `${nome} não pode ser no futuro.`); return null; }
    return v;
  }
}

// Mostra os erros junto aos campos do formulário (atributo name) e foca o primeiro.
export function mostrarErros(form, erros) {
  form.querySelectorAll('.erro-campo').forEach((e) => e.remove());
  form.querySelectorAll('.invalido').forEach((e) => e.classList.remove('invalido'));
  let primeiro = null;
  for (const [campo, msg] of Object.entries(erros)) {
    const el = form.querySelector(`[name="${CSS.escape(campo)}"]`);
    const p = document.createElement('p');
    p.className = 'erro-campo';
    p.textContent = msg;
    if (el) {
      el.classList.add('invalido');
      (el.closest('.campo') || el.parentElement).appendChild(p);
      primeiro ??= el;
    } else {
      form.prepend(p);
    }
  }
  primeiro?.focus();
  if (!primeiro) form.scrollIntoView({ behavior: 'smooth' });
  aviso('Corrige os campos assinalados.', 'erro');
}

// ---------- Avisos rápidos ----------
// Os avisos empilham-se num contentor (vários avisos seguidos não se sobrepõem).
export function aviso(msg, tipo = 'ok') {
  let pilha = document.querySelector('.toasts');
  if (!pilha) {
    pilha = Object.assign(document.createElement('div'), { className: 'toasts' });
    pilha.setAttribute('role', 'status');
    document.body.appendChild(pilha);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.textContent = msg;
  pilha.appendChild(el);
  const dur = tipo === 'erro' ? 4500 : 2600;
  setTimeout(() => el.classList.add('sair'), dur);
  setTimeout(() => el.remove(), dur + 400);
}

// Lê um formulário para objeto simples (checkboxes → true/false).
export function lerForm(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else o[el.name] = el.value;
  }
  return o;
}

export function baixarFicheiro(nome, bytes, tipo = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
