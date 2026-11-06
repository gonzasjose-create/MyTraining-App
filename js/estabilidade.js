// Ecrãs de registo estáveis no telemóvel: sem zoom acidental (pinça, duplo toque ou ao focar um campo).
// Só nos ecrãs onde se regista com o cliente à frente (decisão C): Modo Treino, registo/edição de
// sessões, editor de planos (prescrições) e modo cliente. O resto da app (ex.: biblioteca) mantém o zoom.
//
// Camadas (cada browser respeita umas e ignora outras):
// 1. meta viewport com maximum-scale=1 → impede o zoom automático ao focar um campo (iPhone);
//    user-scalable=no → bloqueia a pinça no Android/Chrome (o iPhone ignora-o desde o iOS 10).
// 2. gesturestart/gesturechange (Safari) e toques com 2+ dedos → bloqueiam a pinça no iPhone.
// 3. CSS touch-action: manipulation (classe body.sem-zoom) → sem zoom de duplo toque, toques sem atraso.
// 4. overscroll-behavior → sem "puxar" a página inteira (já no .rolar).
// Os campos têm sempre letra ≥ 16 px (o iPhone faz zoom ao focar campos com letra menor).

const VIEWPORT_NORMAL = 'width=device-width, initial-scale=1, viewport-fit=cover';
const VIEWPORT_FIXO = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

// Rotas abrangidas (ver app.js). Na ficha do cliente só o separador de sessões (registo manual).
const ROTAS_SEM_ZOOM = [/^#\/sessao\//, /^#\/plano\//, /^#\/cliente-modo\//, /^#\/cliente\/\d+\?(.*&)?tab=sessoes/];
export const rotaSemZoom = (hash) => ROTAS_SEM_ZOOM.some((r) => r.test(hash));

let ativo = false;
const impedir = (ev) => { if (ativo) ev.preventDefault(); };
const impedirMultitoque = (ev) => { if (ativo && ev.touches && ev.touches.length > 1) ev.preventDefault(); };

export function aplicarEstabilidade(hash = location.hash) {
  const novo = rotaSemZoom(hash);
  if (novo === ativo) return;
  ativo = novo;
  document.querySelector('meta[name="viewport"]')?.setAttribute('content', ativo ? VIEWPORT_FIXO : VIEWPORT_NORMAL);
  document.body.classList.toggle('sem-zoom', ativo);
}

// Os eventos ficam sempre ligados e só atuam quando "ativo" (passive: false para poder cancelar).
export function iniciarEstabilidade() {
  document.addEventListener('gesturestart', impedir, { passive: false });
  document.addEventListener('gesturechange', impedir, { passive: false });
  document.addEventListener('touchstart', impedirMultitoque, { passive: false });
  document.addEventListener('touchmove', impedirMultitoque, { passive: false });
  aplicarEstabilidade();
}
