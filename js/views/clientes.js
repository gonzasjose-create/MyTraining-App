// Lista de clientes com pesquisa.
import { listarClientes } from '../repo.js';
import { html, data } from '../util.js';
import { cabecalho, etiqueta, vazio } from './ui.js';
import { carregarDadosExemplo } from '../seed.js';

export function perfilTags(c) {
  return html`${c.perfil_forca ? etiqueta('Força', 'tag-forca') : ''}${c.perfil_resistencia ? etiqueta('Resistência', 'tag-resist') : ''}`;
}

export function vistaClientes(el, { inativos }) {
  const verInativos = inativos === '1';
  const clientes = listarClientes({ incluirInativos: verInativos });

  el.innerHTML = html`
    ${cabecalho('Clientes', { acoes: '<a class="btn" href="#/clientes/novo">+ Novo</a>' })}
    ${clientes.length || verInativos
      ? html`<input type="search" class="pesquisa" placeholder="Pesquisar cliente…" aria-label="Pesquisar">
        <ul class="lista" id="lista">
          ${clientes.map(
            (c) => html`<li data-nome="${c.nome.toLowerCase()}">
              <a href="#/cliente/${c.id}" class="item">
                <div class="item-principal">
                  <strong>${c.nome}</strong>${c.ativo ? '' : etiqueta('Inativo')}
                  <div class="item-tags">${perfilTags(c)}${c.lesoes_ativas ? etiqueta(`${c.lesoes_ativas} lesão(ões)`, 'tag-aviso') : ''}${c.tem_baseline ? '' : etiqueta('Sem baseline', 'tag-aviso')}</div>
                </div>
                <div class="item-sec">${c.idade} anos<br><small>Últ. avaliação: ${data(c.ultima_avaliacao)}</small></div>
              </a>
            </li>`
          )}
        </ul>
        <p class="centro"><a href="#/clientes${verInativos ? '' : '?inativos=1'}">${verInativos ? 'Esconder inativos' : 'Mostrar também inativos'}</a></p>`
      : vazio(
          'Ainda não tens clientes.',
          html`<a class="btn" href="#/clientes/novo">+ Criar o primeiro cliente</a>
            <button class="btn btn-sec" id="exemplo">Carregar 3 clientes de exemplo</button>`
        )}
  `;

  el.querySelector('.pesquisa')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    el.querySelectorAll('#lista li').forEach((li) => (li.hidden = !li.dataset.nome.includes(q)));
  });
  el.querySelector('#exemplo')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'A carregar…';
    await carregarDadosExemplo();
    vistaClientes(el, {});
  });
}
