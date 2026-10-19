// Separador "Treino": biblioteca de exercícios editável e templates de planos.
import * as rp from '../repo-planos.js';
import { listarPadroes } from '../repo.js';
import { escalar } from '../db.js';
import { CATEGORIAS_EXERCICIO } from '../catalogos.js';
import { html, raw, Validador, mostrarErros, lerForm, aviso } from '../util.js';
import { cabecalho, etiqueta, dialogo, confirmar, campo, vazio } from './ui.js';
import { dialogoNovoPlano } from './planos.js';

export function vistaTreino(el, { tab = 'exercicios' }) {
  el.innerHTML = html`
    ${cabecalho('Treino')}
    <nav class="separadores">
      <a href="#/treino?tab=exercicios" class="${tab === 'exercicios' ? 'ativo' : ''}">Exercícios</a>
      <a href="#/treino?tab=templates" class="${tab === 'templates' ? 'ativo' : ''}">Templates</a>
    </nav>
    <section id="corpo"></section>`;
  const sec = el.querySelector('#corpo');
  const recarregar = () => vistaTreino(el, { tab });
  (tab === 'templates' ? templates : exercicios)(sec, recarregar);
}

// ---------------------------------------------------------------- Biblioteca
function exercicios(sec, recarregar) {
  const lista = rp.listarBiblioteca({ incluirInativos: true });
  const padroes = listarPadroes();

  sec.innerHTML = html`
    <div class="barra-filtros">
      <input type="search" id="q" placeholder="Pesquisar exercício…" aria-label="Pesquisar">
      <select id="f-padrao" aria-label="Filtrar por padrão">
        <option value="">Todos os padrões</option>
        ${padroes.map((p) => html`<option value="${p.id}">${p.nome}</option>`)}
      </select>
      <button class="btn" id="novo">+ Exercício</button>
    </div>
    <label class="campo-check"><input type="checkbox" id="f-inativos"> Mostrar inativos</label>
    <ul class="lista" id="lista">
      ${lista.map(
        (e) => html`<li data-nome="${e.nome.toLowerCase()}" data-padrao="${e.padrao_id ?? ''}" data-ativo="${e.ativo}" ${e.ativo ? '' : raw('hidden')}>
          <button class="item item-botao" data-id="${e.id}">
            <div class="item-principal"><strong>${e.nome}</strong>
              <div class="item-tags">
                ${e.categoria ? etiqueta(e.categoria) : ''}
                ${e.tipo_registo === 'resistencia' ? etiqueta('duração/zona', 'tag-resist') : ''}
                ${e.padrao_nome ? etiqueta(e.padrao_nome, 'tag-forca') : ''}
                ${e.ativo ? '' : etiqueta('Inativo', 'tag-aviso')}
              </div></div>
            <div class="item-sec"><small>${e.grupo_muscular || ''}${e.n_alternativas ? raw(`<br>${e.n_alternativas} alternativa(s)`) : ''}</small></div>
          </button>
        </li>`
      )}
    </ul>
    <p class="ajuda centro">${lista.length} exercícios na biblioteca.</p>`;

  const filtrar = () => {
    const q = sec.querySelector('#q').value.trim().toLowerCase();
    const p = sec.querySelector('#f-padrao').value;
    const inat = sec.querySelector('#f-inativos').checked;
    sec.querySelectorAll('#lista li').forEach((li) => {
      li.hidden = !li.dataset.nome.includes(q) || (p && li.dataset.padrao !== p) || (!inat && li.dataset.ativo === '0');
    });
  };
  sec.querySelector('#q').oninput = filtrar;
  sec.querySelector('#f-padrao').onchange = filtrar;
  sec.querySelector('#f-inativos').onchange = filtrar;
  sec.querySelector('#novo').onclick = () => dialogoExercicio(null, recarregar);
  sec.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => dialogoExercicio(+b.dataset.id, recarregar)));
}

export function dialogoExercicio(id, depois) {
  const e = id ? rp.obterExercicio(id) : null;
  const todos = rp.listarBiblioteca().filter((x) => x.id !== id);
  const padroes = listarPadroes();
  const grupos = rp.gruposMusculares();
  const alts = new Set(e?.alternativas || []);

  const d = dialogo(
    e ? 'Editar exercício' : 'Novo exercício',
    html`${campo('nome', 'Nome *', { valor: e?.nome })}
      <div class="grelha-2">
        ${campo('categoria', 'Categoria', { tipo: 'select', valor: e?.categoria || 'força', opcoes: CATEGORIAS_EXERCICIO.map((c) => [c, c]) })}
        ${campo('grupo_muscular', 'Grupo muscular', { valor: e?.grupo_muscular, attrs: 'list="dl-grupos" autocomplete="off"' })}
      </div>
      <datalist id="dl-grupos">${grupos.map((g) => html`<option value="${g}">`)}</datalist>
      <div class="grelha-2">
        ${campo('padrao_id', 'Padrão de movimento', { tipo: 'select', valor: e?.padrao_id ?? '', opcoes: [['', '— nenhum —'], ...padroes.map((p) => [p.id, p.nome]), ['novo', '+ Novo padrão…']] })}
        <div id="w-novo-padrao" hidden>${campo('novo_padrao', 'Nome do novo padrão', {})}</div>
      </div>
      <div class="grelha-2">
        ${campo('tipo_registo', 'Como se prescreve', { tipo: 'select', valor: e?.tipo_registo || 'forca', opcoes: [['forca', 'Séries · reps · carga'], ['resistencia', 'Duração · zona · ritmo']] })}
        <div id="w-ritmo">${campo('unidade_ritmo', 'Ritmo em', { tipo: 'select', valor: e?.unidade_ritmo ?? '', opcoes: [['', 'Sem ritmo'], ['km', 'min/km'], ['500m', 'min/500 m']] })}</div>
      </div>
      ${campo('notas_tecnicas', 'Notas técnicas', { tipo: 'textarea', valor: e?.notas_tecnicas })}
      <div class="campo"><label>Alternativas <small>(sugeridas quando este exercício está contraindicado)</small></label>
        <input type="search" id="q-alt" placeholder="Filtrar…" aria-label="Filtrar alternativas">
        <div class="lista-check" id="alts">
          ${[...todos].sort((a, b) => alts.has(b.id) - alts.has(a.id)).map(
            (x) => html`<label class="campo-check" data-nome="${x.nome.toLowerCase()}"><input type="checkbox" name="alt_${x.id}" ${alts.has(x.id) ? raw('checked') : ''}> ${x.nome}</label>`
          )}
        </div>
      </div>
      ${e ? campo('ativo', 'Ativo (aparece ao montar planos)', { tipo: 'checkbox', valor: e.ativo }) : ''}
      ${e ? html`<button type="button" class="btn btn-perigo btn-peq" id="remover">Remover exercício</button>` : ''}`,
    {
      onSubmit(form) {
        const f = lerForm(form);
        const v = new Validador();
        const nome = v.texto('nome', f.nome, { obrigatorio: true, max: 80, nome: 'Nome' });
        if (nome && escalar('SELECT COUNT(*) FROM exercicios WHERE nome = ? COLLATE NOCASE AND id <> ?', [nome, id ?? 0]))
          v.erro('nome', 'Já existe um exercício com este nome.');
        let padrao_id = f.padrao_id ? +f.padrao_id || null : null;
        if (f.padrao_id === 'novo') {
          const np = v.texto('novo_padrao', f.novo_padrao, { obrigatorio: true, max: 60, nome: 'Nome do padrão' });
          if (np && escalar('SELECT COUNT(*) FROM padroes_movimento WHERE nome = ? COLLATE NOCASE', [np])) v.erro('novo_padrao', 'Esse padrão já existe.');
          if (v.ok) padrao_id = rp.criarPadrao(np);
        }
        if (!v.ok) return mostrarErros(form, v.erros), false;
        const dados = {
          nome, categoria: f.categoria, grupo_muscular: v.texto('grupo_muscular', f.grupo_muscular, { max: 60 }), padrao_id,
          tipo_registo: f.tipo_registo, unidade_ritmo: f.tipo_registo === 'resistencia' ? f.unidade_ritmo || null : null,
          notas_tecnicas: v.texto('notas_tecnicas', f.notas_tecnicas),
        };
        if (e) dados.ativo = f.ativo;
        const alternativas = Object.keys(f).filter((k) => k.startsWith('alt_') && f[k]).map((k) => +k.slice(4));
        const novoId = rp.guardarExercicio(dados, alternativas, id);
        aviso('Exercício guardado.');
        depois?.(novoId);
      },
    }
  );
  const form = d.querySelector('form');
  const sync = () => {
    d.querySelector('#w-novo-padrao').hidden = form.padrao_id.value !== 'novo';
    d.querySelector('#w-ritmo').hidden = form.tipo_registo.value !== 'resistencia';
  };
  form.padrao_id.onchange = form.tipo_registo.onchange = sync;
  sync();
  d.querySelector('#q-alt').oninput = (ev) => {
    const q = ev.target.value.trim().toLowerCase();
    d.querySelectorAll('#alts label').forEach((l) => (l.hidden = !l.dataset.nome.includes(q)));
  };
  d.querySelector('#remover')?.addEventListener('click', async () => {
    d.fechar();
    if (!(await confirmar(`Remover "${e.nome}"? Se estiver usado em planos fica apenas inativo.`, { textoOk: 'Remover' }))) return;
    aviso(rp.removerExercicio(e.id) === 'apagado' ? 'Exercício apagado.' : 'Exercício usado em planos: ficou inativo.');
    depois?.();
  });
}

// ---------------------------------------------------------------- Templates
function templates(sec) {
  const ts = rp.listarTemplates();
  sec.innerHTML = html`
    <p class="ajuda">Templates são planos sem cliente, para reutilizar. Ao aplicar a um cliente, a app verifica as contraindicações dele.</p>
    <div class="barra-acoes-topo"><button class="btn" id="novo">+ Novo template</button></div>
    ${ts.length
      ? html`<ul class="lista">${ts.map(
          (t) => html`<li><a class="item" href="#/plano/${t.id}">
            <div class="item-principal"><strong>${t.nome}</strong>
              <div class="ajuda">${t.num_semanas} semanas · ${t.n_sessoes} sessão(ões)${t.objetivo ? ` · ${t.objetivo}` : ''}</div></div>
            <div class="item-sec">›</div></a></li>`
        )}</ul>`
      : vazio('Ainda não há templates. Cria um aqui ou guarda um plano de cliente como template.')}`;
  sec.querySelector('#novo').onclick = () => dialogoNovoPlano({ clienteId: null });
}
