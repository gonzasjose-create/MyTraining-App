// Escolher um exercício da biblioteca: pesquisa (sem acentos), filtros rápidos por grupo muscular,
// "usados recentemente" com o cliente, lista agrupada e aviso de contraindicação imediato
// com botões para usar as alternativas sugeridas. Usado no planeamento e no Modo Treino.
import { listarBiblioteca } from '../repo-planos.js';
import { verificarContraindicacao } from '../repo.js';
import { todos } from '../db.js';
import { FAMILIAS_GRUPO, familiaDe } from '../catalogos.js';
import { html, aviso, normalizar } from '../util.js';
import { dialogo } from './ui.js';
import { avisoContraindicacao } from './cliente.js';

// Exercícios mais usados recentemente com o cliente (sessões e planos).
function recentesDoCliente(clienteId, n = 8) {
  if (!clienteId) return [];
  return todos(
    `SELECT exercicio_id, MAX(d) AS ultima FROM (
       SELECT x.exercicio_id, s.data AS d FROM sessao_exercicios x JOIN sessoes s ON s.id = x.sessao_id WHERE s.cliente_id = ?
       UNION ALL
       SELECT pe.exercicio_id, p.data_inicio AS d FROM plano_exercicios pe JOIN plano_sessoes ps ON ps.id = pe.sessao_id
       JOIN planos p ON p.id = ps.plano_id WHERE p.cliente_id = ?
     ) GROUP BY exercicio_id ORDER BY ultima DESC LIMIT ?`,
    [clienteId, clienteId, n]
  ).map((r) => r.exercicio_id);
}

export function dialogoEscolherExercicio({ titulo, clienteId = null, textoOk = 'Continuar', excluir = [], onEscolher }) {
  const exs = listarBiblioteca().filter((e) => !excluir.includes(e.id)).map((e) => ({ ...e, familia: familiaDe(e.grupo_muscular) }));
  const porId = new Map(exs.map((e) => [e.id, e]));
  const recentes = recentesDoCliente(clienteId).map((id) => porId.get(id)).filter(Boolean);
  const familias = [...FAMILIAS_GRUPO.map(([f]) => f), 'Outros'].filter((f) => exs.some((e) => e.familia === f));
  let escolhido = null;
  let filtro = '';

  const opcao = (e) => html`<button type="button" class="opcao" data-id="${e.id}" data-texto="${normalizar(`${e.nome} ${e.grupo_muscular || ''} ${e.padrao_nome || ''}`)}" data-familia="${e.familia}">
    <strong>${e.nome}</strong> <small>${e.grupo_muscular || ''}${e.padrao_nome ? ` · ${e.padrao_nome}` : ''}</small></button>`;

  const d = dialogo(
    titulo,
    html`<input type="search" id="q" placeholder="Pesquisar (ex.: remada, gemeos, kettlebell)…" aria-label="Pesquisar" autocomplete="off">
      <div class="chips chips-rolar" role="group" aria-label="Filtrar por grupo muscular">
        <button type="button" class="chip ativo" data-familia="">Todos</button>
        ${familias.map((f) => html`<button type="button" class="chip" data-familia="${f}">${f}</button>`)}
      </div>
      <div class="lista-escolha" id="opcoes">
        ${recentes.length ? html`<div class="grupo-escolha" data-grupo="recentes"><h4>Usados recentemente</h4>${recentes.map(opcao)}</div>` : ''}
        ${familias.map((f) => html`<div class="grupo-escolha" data-grupo="${f}"><h4>${f}</h4>${exs.filter((e) => e.familia === f).map(opcao)}</div>`)}
        <p class="ajuda centro" id="sem-resultados" hidden>Nenhum exercício encontrado. Podes criá-lo em Treino → Exercícios.</p>
      </div>
      <div id="aviso"></div>`,
    {
      textoOk,
      onSubmit() {
        if (!escolhido) return aviso('Escolhe um exercício.', 'erro'), false;
        setTimeout(() => onEscolher(porId.get(escolhido)), 50);
      },
    }
  );

  const aplicarFiltros = () => {
    const q = normalizar(d.querySelector('#q').value.trim());
    let visiveis = 0;
    d.querySelectorAll('.grupo-escolha').forEach((g) => {
      let n = 0;
      // "Usados recentemente" só aparece sem pesquisa nem filtro (evita repetidos).
      const recentes = g.dataset.grupo === 'recentes';
      g.querySelectorAll('.opcao').forEach((o) => {
        const ok = (!q || o.dataset.texto.includes(q)) && (!filtro || o.dataset.familia === filtro) && !(recentes && (q || filtro));
        o.hidden = !ok;
        if (ok) n++;
      });
      g.hidden = n === 0;
      visiveis += recentes ? 0 : n;
    });
    d.querySelector('#sem-resultados').hidden = visiveis > 0;
  };

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
      d.querySelector(`.opcao[data-id="${b.dataset.alt}"]:not([hidden])`)?.scrollIntoView({ block: 'nearest' });
    }));
    alvo.scrollIntoView({ block: 'nearest' });
  };

  d.querySelectorAll('.opcao').forEach((o) => (o.onclick = () => escolher(+o.dataset.id)));
  d.querySelector('#q').oninput = aplicarFiltros;
  d.querySelectorAll('.chips [data-familia]').forEach((b) => (b.onclick = () => {
    filtro = b.dataset.familia;
    d.querySelectorAll('.chips [data-familia]').forEach((x) => x.classList.toggle('ativo', x === b));
    aplicarFiltros();
  }));
  return d;
}
