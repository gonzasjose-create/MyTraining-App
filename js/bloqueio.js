// Bloqueio da app com PIN (opcional): pedido ao abrir e depois de X minutos em segundo plano.
// Impede acessos casuais (ex.: alguém pega no telemóvel). NÃO encripta os dados guardados —
// a proteção forte é o código de bloqueio do iPhone (que ativa a encriptação do dispositivo).
import { def } from './repo.js';
import { pinCorreto } from './pin.js';
import { apagarTudo } from './db.js';

const cfg = () => def('bloqueio_app') || {};
export const bloqueioAtivo = () => !!(cfg().ativo && cfg().hash);
let escondidaDesde = null;
let aberto = false;

export function mostrarBloqueio(aoDesbloquear) {
  if (aberto) return;
  aberto = true;
  const el = document.createElement('div');
  el.className = 'bloqueio';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'App bloqueada');
  el.innerHTML = `
    <div class="bloqueio-caixa">
      <div class="bloqueio-icone">🔒</div>
      <h1>App bloqueada</h1>
      <div class="bloqueio-pontos" aria-live="polite"></div>
      <div class="bloqueio-teclado">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-n="${n}">${n}</button>`).join('')}
        <button type="button" data-acao="apagar" aria-label="Apagar">⌫</button>
        <button type="button" data-n="0">0</button>
        <button type="button" data-acao="ok" aria-label="Desbloquear">OK</button>
      </div>
      <p class="bloqueio-erro" hidden>PIN incorreto.</p>
      <button type="button" class="bloqueio-esqueci" data-acao="esqueci">Esqueci o PIN</button>
    </div>`;
  document.body.appendChild(el);
  document.body.classList.add('bloqueada');
  let pin = '';
  const pontos = el.querySelector('.bloqueio-pontos');
  const desenhar = () => (pontos.textContent = '●'.repeat(pin.length) || ' ');
  const tentar = async () => {
    if (await pinCorreto('bloqueio_app', pin)) {
      el.remove();
      document.body.classList.remove('bloqueada');
      aberto = false;
      aoDesbloquear?.();
    } else {
      pin = '';
      desenhar();
      el.querySelector('.bloqueio-erro').hidden = false;
      navigator.vibrate?.(150);
    }
  };
  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    el.querySelector('.bloqueio-erro').hidden = true;
    if (b.dataset.n && pin.length < 6) { pin += b.dataset.n; desenhar(); if (pin.length === 6) tentar(); }
    if (b.dataset.acao === 'apagar') { pin = pin.slice(0, -1); desenhar(); }
    if (b.dataset.acao === 'ok' && pin.length >= 4) tentar();
    if (b.dataset.acao === 'esqueci') {
      const r = window.prompt('Sem o PIN não é possível entrar. Para recomeçar, todos os dados deste dispositivo são APAGADOS (podes depois importar um backup).\n\nEscreve APAGAR para confirmar:');
      if (r === 'APAGAR') { await apagarTudo(); location.reload(); }
    }
  });
  // Teclado físico (portátil).
  el.tabIndex = -1;
  el.addEventListener('keydown', (ev) => {
    if (/^\d$/.test(ev.key) && pin.length < 6) { pin += ev.key; desenhar(); }
    if (ev.key === 'Backspace') { pin = pin.slice(0, -1); desenhar(); }
    if (ev.key === 'Enter' && pin.length >= 4) tentar();
  });
  el.focus();
  desenhar();
}

// Volta a bloquear depois de X minutos com a app em segundo plano.
export function vigiarBloqueio() {
  document.addEventListener('visibilitychange', () => {
    if (!bloqueioAtivo()) return;
    if (document.visibilityState === 'hidden') escondidaDesde = Date.now();
    else if (escondidaDesde && Date.now() - escondidaDesde > (cfg().minutos ?? 5) * 60000) mostrarBloqueio();
  });
}
