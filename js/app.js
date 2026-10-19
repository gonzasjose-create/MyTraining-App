// Arranque da app: base de dados, tema, router por hash (#/rota?param=valor).
import { iniciarDB } from './db.js';
import { def } from './repo.js';
import { esc, tempo } from './util.js';
import { sessaoEmCurso, decorridoSeg } from './repo-sessoes.js';
import { vistaSessao } from './views/sessao.js';
import { vistaPagamentos } from './views/pacotes.js';
import { limparGraficos } from './graficos.js';
import { vistaAgenda } from './views/agenda.js';
import { vistaModoCliente, modoClienteAtivo } from './views/modo-cliente.js';
import { vistaRelatorio } from './views/relatorio.js';
import { vistaResumos } from './views/resumos.js';
import { limparFotosOrfas } from './repo-fotos.js';
import { bloqueioAtivo, mostrarBloqueio, vigiarBloqueio } from './bloqueio.js';
import { garantirBiblioteca } from './seed.js';
import { vistaPainel } from './views/painel.js';
import { vistaClientes } from './views/clientes.js';
import { vistaClienteForm } from './views/cliente-form.js';
import { vistaCliente } from './views/cliente.js';
import { vistaAvaliacaoForm } from './views/avaliacao-form.js';
import { vistaAvaliacao } from './views/avaliacao.js';
import { vistaDefinicoes } from './views/definicoes.js';
import { vistaTreino } from './views/treino.js';
import { vistaPlano } from './views/planos.js';

// Rotas: padrão → vista. ":x" captura um parâmetro.
const ROTAS = [
  ['/', vistaPainel],
  ['/clientes', vistaClientes],
  ['/clientes/novo', vistaClienteForm],
  ['/cliente/:id', vistaCliente],
  ['/cliente/:id/editar', vistaClienteForm],
  ['/cliente/:id/avaliacao/nova', vistaAvaliacaoForm],
  ['/avaliacao/:avId', vistaAvaliacao],
  ['/avaliacao/:avId/editar', vistaAvaliacaoForm],
  ['/definicoes', vistaDefinicoes],
  ['/treino', vistaTreino],
  ['/plano/:planoId', vistaPlano],
  ['/sessao/:sessaoId', vistaSessao],
  ['/pagamentos', vistaPagamentos],
  ['/agenda', vistaAgenda],
  ['/cliente-modo/:id', vistaModoCliente],
  ['/relatorio/:id', vistaRelatorio],
  ['/resumos', vistaResumos],
];

// Navega; se já estiver nessa rota, volta a desenhar (ex.: depois de terminar o treino).
export function ir(rota) {
  if (location.hash === '#' + rota) render();
  else location.hash = '#' + rota;
}

// Aplica a marca (cores) às variáveis CSS; tudo o resto da UI usa estas variáveis.
export function aplicarTema() {
  const n = def('negocio');
  const raiz = document.documentElement.style;
  raiz.setProperty('--cor-principal', n.cor_principal);
  raiz.setProperty('--cor-secundaria', n.cor_secundaria);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', n.cor_principal);
  const marca = document.getElementById('marca');
  marca.innerHTML = n.logo ? `<img src="${esc(n.logo)}" alt="${esc(n.nome)}">` : esc(n.nome);
  document.title = n.nome;
}

function resolver() {
  const [caminho, qs] = (location.hash.slice(1) || '/').split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  for (const [padrao, vista] of ROTAS) {
    const p = padrao.split('/'), c = caminho.split('/');
    if (p.length !== c.length) continue;
    const params = {};
    if (p.every((seg, i) => (seg.startsWith(':') ? ((params[seg.slice(1)] = decodeURIComponent(c[i])), true) : seg === c[i]))) {
      return { vista, params: { ...params, ...query }, caminho };
    }
  }
  return null;
}

// Uma vista pode devolver uma função de limpeza (ex.: Modo Treino pára relógios e liberta o ecrã).
let limpeza = null;

function render() {
  const main = document.getElementById('app');
  if (typeof limpeza === 'function') { try { limpeza(); } catch (e) { console.warn(e); } }
  limpeza = null;
  main.onclick = main.oninput = main.onchange = null; // handlers delegados da vista anterior
  limparGraficos();
  // Modo cliente ativo: só se pode estar no ecrã do cliente (sair exige o PIN).
  const mc = modoClienteAtivo();
  if (mc && !location.hash.startsWith(`#/cliente-modo/${mc.clienteId}`)) {
    location.replace(`#/cliente-modo/${mc.clienteId}`);
    return;
  }
  if (!mc) document.body.classList.remove('modo-cliente');
  const r = resolver();
  // Destaca o separador ativo na barra inferior.
  const c = r?.caminho || '';
  const secao = c === '/' ? '/' : c.startsWith('/definicoes') ? '/definicoes' : c.startsWith('/treino') ? '/treino' : c.startsWith('/agenda') ? '/agenda' : '/clientes';
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('ativo', a.getAttribute('href') === '#' + secao));
  window.scrollTo(0, 0);
  if (!r) {
    main.innerHTML = '<div class="vazio"><p>Página não encontrada.</p><a class="btn" href="#/">Voltar ao painel</a></div>';
    return;
  }
  try {
    limpeza = r.vista(main, r.params);
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="caixa caixa-erro"><strong>Ocorreu um erro.</strong><p>${esc(e.message)}</p></div>`;
  }
  atualizarBanner();
}

// Aviso "Treino em curso · Retomar" em todos os ecrãs, exceto no próprio treino.
function atualizarBanner() {
  const b = document.getElementById('banner-treino');
  const s = sessaoEmCurso();
  const noTreino = s && location.hash.startsWith(`#/sessao/${s.id}`);
  b.hidden = !s || noTreino || !!modoClienteAtivo();
  if (b.hidden) return;
  b.innerHTML = `<span>● Treino em curso: <strong>${esc(s.cliente_nome)}</strong> · <span id="banner-t">${tempo(decorridoSeg(s))}</span></span>
    <a class="btn btn-peq" href="#/sessao/${s.id}">Retomar treino</a>`;
}
setInterval(() => {
  const t = document.getElementById('banner-t');
  const s = t && sessaoEmCurso();
  if (s) t.textContent = tempo(decorridoSeg(s));
}, 1000);

async function arrancar() {
  try {
    await iniciarDB();
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="caixa caixa-erro"><strong>Não foi possível abrir a base de dados.</strong><p>${esc(e.message)}</p></div>`;
    return;
  }
  garantirBiblioteca();
  limparFotosOrfas();
  aplicarTema();
  window.addEventListener('hashchange', render);
  render();
  // PIN de arranque (opcional) por cima de tudo; volta a pedir após X minutos em segundo plano.
  if (bloqueioAtivo()) mostrarBloqueio();
  vigiarBloqueio();

  // Service worker (funcionamento offline). Em localhost fica desligado para facilitar o desenvolvimento.
  if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // Nova versão publicada: avisa para recarregar (os dados não são afetados).
      reg.addEventListener('updatefound', () => {
        const novo = reg.installing;
        novo?.addEventListener('statechange', () => {
          if (novo.state === 'activated' && navigator.serviceWorker.controller) avisoAtualizacao();
        });
      });
    }).catch((e) => console.warn('SW:', e));
  }
}

function avisoAtualizacao() {
  const b = document.createElement('div');
  b.className = 'aviso-atualizacao';
  b.innerHTML = '<span>Nova versão da app disponível.</span><button class="btn btn-peq" type="button">Recarregar</button>';
  b.querySelector('button').onclick = () => location.reload();
  document.body.appendChild(b);
}

arrancar();
