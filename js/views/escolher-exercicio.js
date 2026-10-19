// Escolher um exercício da biblioteca, com o aviso de contraindicação do cliente imediato
// e botões para usar as alternativas sugeridas. Usado no planeamento e no Modo Treino.
import { listarBiblioteca } from '../repo-planos.js';
import { verificarContraindicacao } from '../repo.js';
import { html, aviso } from '../util.js';
import { dialogo } from './ui.js';
import { avisoContraindicacao } from './cliente.js';

export function dialogoEscolherExercicio({ titulo, clienteId = null, textoOk = 'Continuar', excluir = [], onEscolher }) {
  const exs = listarBiblioteca().filter((e) => !excluir.includes(e.id));
  let escolhido = null;
  const d = dialogo(
    titulo,
    html`<input type="search" id="q" placeholder="Pesquisar exercício…" aria-label="Pesquisar" autocomplete="off">
      <div class="lista-escolha" id="opcoes">
        ${exs.map((e) => html`<button type="button" class="opcao" data-id="${e.id}" data-nome="${e.nome.toLowerCase()} ${(e.grupo_muscular || '').toLowerCase()} ${(e.padrao_nome || '').toLowerCase()}">
          <strong>${e.nome}</strong> <small>${e.grupo_muscular || ''}${e.padrao_nome ? ` · ${e.padrao_nome}` : ''}</small></button>`)}
      </div>
      <div id="aviso"></div>`,
    {
      textoOk,
      onSubmit() {
        if (!escolhido) return aviso('Escolhe um exercício.', 'erro'), false;
        const ex = exs.find((e) => e.id === escolhido);
        setTimeout(() => onEscolher(ex), 50);
      },
    }
  );
  const escolher = (id) => {
    escolhido = id;
    d.querySelectorAll('.opcao').forEach((o) => o.classList.toggle('escolhida', +o.dataset.id === id));
    const alvo = d.querySelector('#aviso');
    if (!clienteId) { alvo.innerHTML = ''; return; }
    const r = verificarContraindicacao(clienteId, id);
    alvo.innerHTML = r.contraindicado
      ? html`${avisoContraindicacao(r)}<div class="botoes">${r.alternativas.map((a) => html`<button type="button" class="btn btn-peq" data-alt="${a.id}">Usar ${a.nome}</button>`)}</div>`
      : avisoContraindicacao(r);
    alvo.querySelectorAll('[data-alt]').forEach((b) => (b.onclick = () => {
      escolher(+b.dataset.alt);
      d.querySelector(`.opcao[data-id="${b.dataset.alt}"]`)?.scrollIntoView({ block: 'nearest' });
    }));
    alvo.scrollIntoView({ block: 'nearest' });
  };
  d.querySelectorAll('.opcao').forEach((o) => (o.onclick = () => escolher(+o.dataset.id)));
  d.querySelector('#q').oninput = (ev) => {
    const q = ev.target.value.trim().toLowerCase();
    d.querySelectorAll('.opcao').forEach((o) => (o.hidden = !o.dataset.nome.includes(q)));
  };
  return d;
}
