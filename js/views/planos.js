// Planos por blocos: lista no cliente, criação/duplicação, editor semanal com progressão e avisos.
import * as rp from '../repo-planos.js';
import * as repo from '../repo.js';
import { zonasFC } from '../calc.js';
import { textoPrescricao } from '../progressao.js';
import { DIAS_SEMANA, ESTADOS_PLANO, TIPOS_SESSAO_RESIST, METODOS } from '../catalogos.js';
import { html, raw, data, num, tempo, lerTempo, Validador, mostrarErros, lerForm, aviso } from '../util.js';
import { cabecalho, etiqueta, dialogo, confirmar, campo, vazio } from './ui.js';
import { dialogoEscolherExercicio } from './escolher-exercicio.js';
import { ir } from '../app.js';

const somarDias = (iso, dias) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};
// Próxima segunda-feira (data de início por defeito).
const proximaSegunda = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
};

// ====================================================================== Lista (separador do cliente)
export function seccaoPlanosCliente(sec, c) {
  const ps = rp.listarPlanos(c.id);
  sec.innerHTML = html`
    <div class="barra-acoes-topo"><button class="btn" id="novo">+ Novo plano</button></div>
    ${ps.length
      ? html`<ul class="lista">${ps.map(
          (p) => html`<li><a class="item" href="#/plano/${p.id}">
            <div class="item-principal"><strong>${p.nome}</strong>
              <div class="item-tags">${etiqueta(ESTADOS_PLANO[p.estado], p.estado === 'ativo' ? 'tag-ok' : '')}</div>
              <div class="ajuda">${p.data_inicio ? `${data(p.data_inicio)} → ${data(somarDias(p.data_inicio, p.num_semanas * 7 - 1))} · ` : ''}${p.num_semanas} semanas · ${p.n_sessoes} sessão(ões)</div></div>
            <div class="item-sec">›</div></a></li>`
        )}</ul>`
      : vazio('Ainda não há planos para este cliente.')}`;
  sec.querySelector('#novo').onclick = () => dialogoNovoPlano({ clienteId: c.id });
}

// ====================================================================== Novo plano / template
export function dialogoNovoPlano({ clienteId }) {
  const templates = rp.listarTemplates();
  const outros = clienteId ? rp.listarPlanosTodos() : [];
  const opcoesOrigem = [
    ['', 'Em branco'],
    ...templates.map((t) => [`${t.id}`, `Template: ${t.nome} (${t.num_semanas} sem.)`]),
    ...outros.map((p) => [`${p.id}`, `Copiar de ${p.cliente_nome}: ${p.nome}`]),
  ];
  const d = dialogo(
    clienteId ? 'Novo plano' : 'Novo template',
    html`${campo('nome', 'Nome *', { valor: '', attrs: 'placeholder="Ex.: Bloco 1 — Base de força"' })}
      ${campo('objetivo', 'Objetivo do bloco', { valor: '' })}
      ${opcoesOrigem.length > 1 ? campo('origem', 'Começar a partir de', { tipo: 'select', opcoes: opcoesOrigem }) : ''}
      <div class="grelha-2">
        ${clienteId ? campo('data_inicio', 'Data de início', { tipo: 'date', valor: proximaSegunda() }) : ''}
        <div id="w-semanas">${campo('num_semanas', 'Nº de semanas *', { tipo: 'number', valor: 4, ajuda: 'Recomendado: 4 a 6.' })}</div>
      </div>
      <div id="w-deload">${campo('deload_ultima', 'Última semana é de deload', { tipo: 'checkbox', valor: true })}</div>`,
    {
      textoOk: 'Criar',
      onSubmit(form) {
        const f = lerForm(form);
        const v = new Validador();
        const nome = v.texto('nome', f.nome, { obrigatorio: true, max: 80, nome: 'Nome' });
        const data_inicio = clienteId ? v.data('data_inicio', f.data_inicio, { futuro: true, nome: 'Data de início' }) : null;
        const origem = f.origem ? +f.origem : null;
        const num_semanas = origem ? null : v.numero('num_semanas', f.num_semanas, { min: 1, max: 12, inteiro: true, obrigatorio: true, nome: 'Nº de semanas' });
        if (!v.ok) return mostrarErros(form, v.erros), false;
        const id = origem
          ? rp.duplicarPlano(origem, { cliente_id: clienteId, nome, data_inicio })
          : rp.criarPlano({ cliente_id: clienteId, nome, objetivo: v.texto('objetivo', f.objetivo, { max: 200 }), data_inicio, num_semanas, deload_ultima: f.deload_ultima });
        if (origem && f.objetivo?.trim()) rp.atualizarPlano(id, { objetivo: f.objetivo.trim() });
        avisarContraindicacoes(id);
        ir(`/plano/${id}`);
      },
    }
  );
  const sel = d.querySelector('[name="origem"]');
  if (sel) sel.onchange = () => {
    d.querySelector('#w-semanas').hidden = d.querySelector('#w-deload').hidden = !!sel.value;
  };
}

function avisarContraindicacoes(planoId) {
  const n = Object.keys(rp.avisosPlano(rp.obterPlano(planoId))).length;
  if (n) aviso(`⚠ ${n} exercício(s) contraindicado(s) para este cliente — revê o plano.`, 'erro');
}

// ====================================================================== Editor
export function vistaPlano(el, { planoId, semana }) {
  const plano = rp.obterPlano(+planoId);
  if (!plano) return ir('/clientes');
  const c = plano.cliente_id ? repo.obterCliente(plano.cliente_id) : null;
  const sem = Math.min(Math.max(+semana || 1, 1), plano.num_semanas);
  const semInfo = plano.semanas.find((s) => s.semana === sem) || {};
  const avisos = rp.avisosPlano(plano);
  const nAvisos = Object.keys(avisos).length;
  const vol = rp.volumeSemana(plano, sem);
  const voltar = c ? `/cliente/${c.id}?tab=planos` : '/treino?tab=templates';
  const recarregar = () => vistaPlano(el, { planoId, semana: sem });

  el.innerHTML = html`
    ${cabecalho(plano.nome, { voltar, acoes: '<button class="btn btn-sec" id="menu">Opções</button>' })}
    <div class="ficha-topo">
      ${c ? raw(`<a href="#/cliente/${c.id}">${html`${c.nome}`}</a>`) : etiqueta('Template')}
      ${c ? html`<select id="estado" class="select-compacto" aria-label="Estado do plano">${Object.entries(ESTADOS_PLANO).map(
        ([k, t]) => html`<option value="${k}" ${plano.estado === k ? raw('selected') : ''}>${t}</option>`)}</select>` : ''}
      ${plano.data_inicio ? html`<span>${data(plano.data_inicio)} → ${data(somarDias(plano.data_inicio, plano.num_semanas * 7 - 1))}</span>` : ''}
    </div>
    ${plano.objetivo ? html`<p class="ajuda">Objetivo: ${plano.objetivo}</p>` : ''}
    ${nAvisos ? html`<div class="caixa caixa-alerta" role="alert"><strong>⚠ ${nAvisos} exercício(s) contraindicado(s) para ${c.nome}</strong> — vê os avisos abaixo e as alternativas sugeridas.</div>` : ''}

    <nav class="separadores semanas">
      ${plano.semanas.map((s) => html`<a href="#/plano/${plano.id}?semana=${s.semana}" class="${s.semana === sem ? 'ativo' : ''}">
        S${s.semana}${s.deload ? html` <span class="tag tag-aviso">deload</span>` : ''}
        ${plano.data_inicio ? html`<small>${data(somarDias(plano.data_inicio, (s.semana - 1) * 7)).slice(0, 5)}</small>` : ''}</a>`)}
    </nav>

    <div class="cartao semana-info">
      ${campo('foco', `Foco da semana ${sem}`, { valor: semInfo.foco, attrs: 'placeholder="Ex.: técnica do agachamento"' })}
      ${campo('deload', 'Semana de deload (menos séries e carga)', { tipo: 'checkbox', valor: semInfo.deload })}
      ${sem < plano.num_semanas ? html`<button class="btn btn-sec" id="sugerir">↗ Sugerir progressão das semanas ${sem + 1}–${plano.num_semanas}</button>` : ''}
    </div>

    ${plano.sessoes.length ? plano.sessoes.map((s, i) => blocoSessao(s, i, plano, sem, avisos)) : vazio('Ainda sem sessões. Começa por adicionar a sessão A.')}
    <div class="barra-acoes-topo"><button class="btn" id="nova-sessao">+ Sessão</button></div>

    <div class="cartao">
      <h3>Volume da semana ${sem}</h3>
      ${Object.keys(vol.grupos).length
        ? html`<table class="tabela"><thead><tr><th>Grupo muscular</th><th>Séries</th></tr></thead><tbody>
            ${Object.entries(vol.grupos).sort((a, b) => b[1] - a[1]).map(([g, n]) => html`<tr><td>${g}</td><td>${n}</td></tr>`)}</tbody></table>`
        : html`<p class="ajuda">Sem séries de força prescritas nesta semana.</p>`}
      ${vol.minutos ? html`<p>Resistência: <strong>${vol.minutos} min</strong></p>` : ''}
    </div>`;

  // ---- Eventos gerais
  el.querySelector('#estado')?.addEventListener('change', (e) => {
    const n = rp.definirEstado(plano.id, e.target.value);
    aviso(n ? `Plano ativo. ${n} outro(s) plano(s) passaram a concluídos.` : 'Estado atualizado.');
  });
  const guardarSemana = () => rp.definirSemana(plano.id, sem, { deload: el.querySelector('[name="deload"]').checked, foco: el.querySelector('[name="foco"]').value.trim() });
  el.querySelector('[name="foco"]').onchange = guardarSemana;
  el.querySelector('[name="deload"]').onchange = () => { guardarSemana(); recarregar(); };
  el.querySelector('#sugerir')?.addEventListener('click', () => dialogoSugestoes(plano, sem, recarregar));
  el.querySelector('#nova-sessao').onclick = () => dialogoSessao(plano, null, recarregar);
  el.querySelector('#menu').onclick = () => dialogoOpcoes(plano, c, recarregar);

  // ---- Sessões e exercícios
  const sessao = (id) => plano.sessoes.find((s) => s.id === id);
  const pe = (id) => plano.sessoes.flatMap((s) => s.exercicios).find((e) => e.id === id);
  el.querySelectorAll('[data-sessao-editar]').forEach((b) => (b.onclick = () => dialogoSessao(plano, sessao(+b.dataset.sessaoEditar), recarregar)));
  el.querySelectorAll('[data-sessao-mover]').forEach((b) => (b.onclick = () => { rp.moverSessao(+b.dataset.sessaoMover, +b.dataset.dir); recarregar(); }));
  el.querySelectorAll('[data-add-ex]').forEach((b) => (b.onclick = () => dialogoEscolherExercicioPlano(plano, sessao(+b.dataset.addEx), sem, recarregar)));
  el.querySelectorAll('[data-pe]').forEach((b) => (b.onclick = () => dialogoPrescricao(plano, { pe: pe(+b.dataset.pe) }, sem, recarregar)));
  el.querySelectorAll('[data-pe-mover]').forEach((b) => (b.onclick = () => { rp.moverExercicio(+b.dataset.peMover, +b.dataset.dir); recarregar(); }));
  el.querySelectorAll('[data-trocar]').forEach((b) => (b.onclick = () => {
    rp.trocarExercicio(+b.dataset.trocar, +b.dataset.alt);
    aviso(`Trocado por ${b.dataset.nome}.`);
    recarregar();
  }));
}

function blocoSessao(s, i, plano, sem, avisos) {
  return html`<div class="cartao sessao">
    <div class="cartao-cab">
      <h3>${s.nome}${s.dia_semana ? html` <small>· ${DIAS_SEMANA[s.dia_semana]}</small>` : ''}</h3>
      <div class="botoes">
        <button class="btn btn-sec btn-icone" data-sessao-mover="${s.id}" data-dir="-1" aria-label="Subir sessão" ${i === 0 ? raw('disabled') : ''}>↑</button>
        <button class="btn btn-sec btn-icone" data-sessao-mover="${s.id}" data-dir="1" aria-label="Descer sessão" ${i === plano.sessoes.length - 1 ? raw('disabled') : ''}>↓</button>
        <button class="btn btn-sec btn-icone" data-sessao-editar="${s.id}" aria-label="Editar sessão">✎</button>
      </div>
    </div>
    ${s.notas ? html`<p class="ajuda">${s.notas}</p>` : ''}
    <ol class="lista-ex">
      ${s.exercicios.map((e, j) => {
        const a = avisos[e.id];
        return html`<li class="${a ? (a.nivel === 'evitar' ? 'ex-contra' : 'ex-adaptar') : ''}">
          <div class="ex-linha">
            <button class="ex-principal" data-pe="${e.id}">
              <strong>${e.nome}</strong>${e.ex_ativo ? '' : html` <span class="tag tag-aviso">inativo</span>`}
              <span class="${e.presc[sem] ? '' : 'ajuda'}">${textoPrescricao(e.presc[sem], e, e.metodo)}</span>
              ${e.metodo !== 'manual' ? html`<small>${e.metodo === 'dupla' ? 'dupla progressão' : e.metodo === 'percentagem' ? `+${num(e.params.pct ?? rp.cfgProgressao().pct_carga)}%/semana` : '+volume/semana'}</small>` : ''}
              ${e.notas ? html`<small>${e.notas}</small>` : ''}
            </button>
            <div class="ex-mover">
              <button class="btn btn-sec btn-icone" data-pe-mover="${e.id}" data-dir="-1" aria-label="Subir" ${j === 0 ? raw('disabled') : ''}>↑</button>
              <button class="btn btn-sec btn-icone" data-pe-mover="${e.id}" data-dir="1" aria-label="Descer" ${j === s.exercicios.length - 1 ? raw('disabled') : ''}>↓</button>
            </div>
          </div>
          ${a ? html`<div class="caixa ${a.nivel === 'evitar' ? 'caixa-alerta' : 'caixa-aviso'} aviso-ci">
              <strong>⚠ ${a.nivel === 'evitar' ? 'CONTRAINDICADO' : 'ADAPTAR'}</strong>
              ${a.motivos.map((m) => html`<div class="ajuda">${m.exercicio_id ? 'Exercício marcado' : `Padrão "${m.padrao_nome}"`}${m.lesao_zona ? ` — ${m.lesao_zona}` : ''}${m.notas ? `: ${m.notas}` : ''}</div>`)}
              ${a.alternativas.length
                ? html`<div class="botoes">${a.alternativas.map((alt) => html`<button class="btn btn-peq" data-trocar="${e.id}" data-alt="${alt.id}" data-nome="${alt.nome}">Trocar por ${alt.nome}</button>`)}</div>`
                : html`<div class="ajuda">Sem alternativas seguras na biblioteca.</div>`}
            </div>` : ''}
        </li>`;
      })}
    </ol>
    <button class="btn btn-sec btn-peq" data-add-ex="${s.id}">+ Exercício</button>
  </div>`;
}

// ---------------------------------------------------------------- Sessão
function dialogoSessao(plano, s, recarregar) {
  const sugestao = `Sessão ${String.fromCharCode(65 + plano.sessoes.length)}`;
  const d = dialogo(
    s ? 'Editar sessão' : 'Nova sessão',
    html`${campo('nome', 'Nome *', { valor: s?.nome ?? sugestao, attrs: 'placeholder="Ex.: A — Inferiores"' })}
      ${campo('dia_semana', 'Dia habitual', { tipo: 'select', valor: s?.dia_semana ?? '', opcoes: [['', '— flexível —'], ...Object.entries(DIAS_SEMANA)] })}
      ${campo('notas', 'Notas', { tipo: 'textarea', valor: s?.notas })}
      ${s ? html`<button type="button" class="btn btn-perigo btn-peq" id="apagar">Apagar sessão</button>` : ''}`,
    {
      onSubmit(form) {
        const f = lerForm(form);
        const v = new Validador();
        const dados = { nome: v.texto('nome', f.nome, { obrigatorio: true, max: 60, nome: 'Nome' }), dia_semana: f.dia_semana ? +f.dia_semana : null, notas: v.texto('notas', f.notas, { max: 500 }) };
        if (!v.ok) return mostrarErros(form, v.erros), false;
        s ? rp.atualizarSessao(s.id, dados) : rp.adicionarSessao(plano.id, dados);
        recarregar();
      },
    }
  );
  d.querySelector('#apagar')?.addEventListener('click', async () => {
    d.fechar();
    if (!(await confirmar(`Apagar "${s.nome}" e todos os seus exercícios (em todas as semanas)?`, { textoOk: 'Apagar' }))) return;
    rp.apagarSessao(s.id);
    recarregar();
  });
}

// ---------------------------------------------------------------- Escolher exercício (com aviso imediato)
function dialogoEscolherExercicioPlano(plano, sessao, sem, recarregar) {
  dialogoEscolherExercicio({
    titulo: `Adicionar a ${sessao.nome}`,
    clienteId: plano.cliente_id,
    onEscolher: (exercicio) => dialogoPrescricao(plano, { novo: { sessao, exercicio } }, sem, recarregar),
  });
}

// ---------------------------------------------------------------- Prescrição (semana atual) + método
const DESCANSOS = [['', '—'], [30, '0:30'], [45, '0:45'], [60, '1:00'], [75, '1:15'], [90, '1:30'], [120, '2:00'], [150, '2:30'], [180, '3:00'], [240, '4:00'], [300, '5:00']];

function dialogoPrescricao(plano, { pe = null, novo = null }, sem, recarregar) {
  const ex = pe || { ...novo.exercicio, tipo_registo: novo.exercicio.tipo_registo, params: {}, metodo: novo.exercicio.tipo_registo === 'resistencia' ? 'volume' : 'dupla', presc: {} };
  const resist = ex.tipo_registo === 'resistencia';
  // Valor por defeito: semana atual, senão a semana anterior mais próxima.
  const anterior = Object.keys(ex.presc).map(Number).filter((s) => s < sem).sort((a, b) => b - a)[0];
  const p = ex.presc[sem] || (anterior ? ex.presc[anterior] : null) || {};
  const cfg = rp.cfgProgressao();

  let zonas = null;
  if (resist && plano.cliente_id) {
    const c = repo.obterCliente(plano.cliente_id);
    zonas = zonasFC(repo.fcMaxCliente(c).usada, repo.ultimaFCRepouso(c.id), repo.def('zonas_fc'));
  }
  const zonaOpc = [['', '—'], ...repo.def('zonas_fc').map((z, i) => [i + 1, zonas ? `${z.nome} (${zonas[i].bpmMin}–${zonas[i].bpmMax} bpm)` : z.nome])];

  const corpoForca = html`<div class="grelha-3">
      ${campo('series', 'Séries *', { tipo: 'number', valor: p.series, attrs: 'inputmode="numeric"' })}
      ${campo('reps_min', 'Reps (mín.) *', { tipo: 'number', valor: p.reps_min, attrs: 'inputmode="numeric"' })}
      ${campo('reps_max', 'Reps (máx.)', { tipo: 'number', valor: p.reps_max !== p.reps_min ? p.reps_max : '', attrs: 'inputmode="numeric"', ajuda: 'Deixa vazio se fixo.' })}
      ${campo('carga_kg', 'Carga (kg)', { tipo: 'number', valor: p.carga_kg })}
      ${campo('rpe', 'RPE', { tipo: 'number', valor: p.rpe, ajuda: '1–10' })}
      ${campo('rir', 'RIR', { tipo: 'number', valor: p.rir, attrs: 'inputmode="numeric"' })}
    </div>
    ${campo('descanso_seg', 'Descanso', { tipo: 'select', valor: p.descanso_seg ?? '', opcoes: DESCANSOS })}`;
  const corpoResist = html`
    ${campo('tipo_sessao', 'Tipo *', { tipo: 'select', valor: p.tipo_sessao || 'continuo', opcoes: Object.entries(TIPOS_SESSAO_RESIST) })}
    ${campo('zona_alvo', 'Zona-alvo', { tipo: 'select', valor: p.zona_alvo ?? '', opcoes: zonaOpc })}
    <div class="grelha-3">
      <div class="w-continuo">${campo('duracao_min', 'Duração (min)', { tipo: 'number', valor: p.duracao_min })}</div>
      <div class="w-continuo">${campo('distancia_km', 'Distância (km)', { tipo: 'number', valor: p.distancia_m ? p.distancia_m / 1000 : '' })}</div>
      ${ex.unidade_ritmo ? campo('ritmo', `Ritmo-alvo (m:ss/${ex.unidade_ritmo === '500m' ? '500 m' : 'km'})`, { valor: p.ritmo_alvo_seg ? tempo(p.ritmo_alvo_seg) : '', attrs: 'inputmode="numeric" placeholder="5:30"' }) : ''}
    </div>
    <div class="grelha-3 w-intervalos">
      ${campo('int_repeticoes', 'Repetições', { tipo: 'number', valor: p.int_repeticoes, attrs: 'inputmode="numeric"' })}
      ${campo('int_trabalho', 'Trabalho (m:ss)', { valor: p.int_trabalho_seg ? tempo(p.int_trabalho_seg) : '', attrs: 'inputmode="numeric" placeholder="3:00"' })}
      ${campo('int_recuperacao', 'Recuperação (m:ss)', { valor: p.int_recuperacao_seg ? tempo(p.int_recuperacao_seg) : '', attrs: 'inputmode="numeric" placeholder="2:00"' })}
    </div>
    ${zonas ? '' : html`<p class="ajuda">As zonas mostram bpm quando o cliente tem FC de repouso registada.</p>`}
    <p class="ajuda">Ritmos e zonas são estimativas — ajusta pela perceção de esforço.</p>`;

  const metodos = METODOS[resist ? 'resistencia' : 'forca'];
  const ehNovo = !!novo;
  const d = dialogo(
    `${ex.nome} · semana ${sem}`,
    html`${resist ? corpoResist : corpoForca}
      <fieldset class="sub"><legend>Progressão semanal</legend>
        ${campo('metodo', 'Método', { tipo: 'select', valor: ex.metodo, opcoes: Object.entries(metodos) })}
        <div class="grelha-3">
          <div class="w-dupla">${campo('p_rep_min', 'Gama: mín.', { tipo: 'number', valor: ex.params.rep_min ?? '', attrs: 'inputmode="numeric"', ajuda: 'Por defeito: reps mín.' })}</div>
          <div class="w-dupla">${campo('p_rep_max', 'Gama: máx.', { tipo: 'number', valor: ex.params.rep_max ?? '', attrs: 'inputmode="numeric"', ajuda: 'Por defeito: reps máx.' })}</div>
          <div class="w-dupla">${campo('p_inc_kg', 'Subida de carga (kg)', { tipo: 'number', valor: ex.params.inc_kg ?? cfg.inc_dupla_kg })}</div>
          <div class="w-pct">${campo('p_pct', resist ? '+% duração/semana' : '+% carga/semana', { tipo: 'number', valor: ex.params.pct ?? (resist ? cfg.pct_volume_resist : cfg.pct_carga) })}</div>
        </div>
        ${campo('aplicar', 'Semanas seguintes', {
          tipo: 'select', valor: ehNovo ? 'vazias' : 'nada',
          opcoes: [['nada', 'Não alterar'], ['vazias', 'Preencher só as vazias com a progressão sugerida'], ['todas', 'Substituir todas pela progressão sugerida']],
        })}
      </fieldset>
      ${campo('notas_ex', 'Notas do exercício (todas as semanas)', { valor: ex.notas ?? '', attrs: 'placeholder="Ex.: tempo 3-1-1, pausa em baixo"' })}
      ${campo('notas', `Notas da semana ${sem}`, { valor: ex.presc[sem]?.notas ?? '' })}
      ${pe ? html`<button type="button" class="btn btn-perigo btn-peq" id="remover">Remover do plano</button>` : ''}`,
    {
      onSubmit(form) {
        const r = validarPrescricao(lerForm(form), resist);
        if (!r.ok) return mostrarErros(form, r.erros), false;
        let peId = pe?.id;
        if (ehNovo) peId = rp.adicionarExercicioPlano(novo.sessao.id, { exercicio_id: ex.id, metodo: r.metodo, params: r.params, notas: r.notasEx });
        else rp.atualizarExercicioPlano(peId, { metodo: r.metodo, params: r.params, notas: r.notasEx });
        rp.gravarPrescricao(peId, sem, r.presc);
        // "Substituir todas": apaga as semanas seguintes e volta a preenchê-las a partir desta.
        if (r.aplicar === 'todas') rp.limparSemanasSeguintes(peId, sem);
        if (r.aplicar !== 'nada') {
          const n = rp.preencherSemanasVazias(plano.id, peId, sem);
          if (n) aviso(`Progressão sugerida aplicada a ${n} semana(s). Podes editar cada uma.`);
        }
        recarregar();
      },
    }
  );
  const form = d.querySelector('form');
  const sync = () => {
    const m = form.metodo.value;
    d.querySelectorAll('.w-dupla').forEach((x) => (x.hidden = m !== 'dupla'));
    d.querySelectorAll('.w-pct').forEach((x) => (x.hidden = !['percentagem', 'volume'].includes(m)));
    if (resist) {
      const t = form.tipo_sessao.value;
      d.querySelectorAll('.w-intervalos').forEach((x) => (x.hidden = t !== 'intervalado'));
      d.querySelectorAll('.w-continuo').forEach((x) => (x.hidden = t === 'intervalado'));
    }
  };
  form.metodo.onchange = sync;
  if (resist) form.tipo_sessao.onchange = sync;
  sync();
  d.querySelector('#remover')?.addEventListener('click', async () => {
    d.fechar();
    if (!(await confirmar(`Remover ${ex.nome} desta sessão (todas as semanas)?`, { textoOk: 'Remover' }))) return;
    rp.apagarExercicioPlano(pe.id);
    recarregar();
  });
}

function validarPrescricao(f, resist) {
  const v = new Validador();
  const presc = {};
  if (resist) {
    presc.tipo_sessao = f.tipo_sessao;
    presc.zona_alvo = f.zona_alvo ? +f.zona_alvo : null;
    if (f.ritmo) {
      presc.ritmo_alvo_seg = lerTempo(f.ritmo);
      if (presc.ritmo_alvo_seg == null) v.erro('ritmo', 'Ritmo inválido (m:ss).');
      else if (presc.ritmo_alvo_seg < 60 || presc.ritmo_alvo_seg > 900) v.erro('ritmo', 'Ritmo impossível (entre 1:00 e 15:00).');
    }
    if (f.tipo_sessao === 'intervalado') {
      presc.int_repeticoes = v.numero('int_repeticoes', f.int_repeticoes, { min: 1, max: 50, inteiro: true, obrigatorio: true, nome: 'Repetições' });
      presc.int_trabalho_seg = lerTempo(f.int_trabalho);
      if (presc.int_trabalho_seg == null || presc.int_trabalho_seg < 5 || presc.int_trabalho_seg > 3600) v.erro('int_trabalho', 'Trabalho inválido (m:ss, entre 0:05 e 60:00).');
      if (f.int_recuperacao) {
        presc.int_recuperacao_seg = lerTempo(f.int_recuperacao);
        if (presc.int_recuperacao_seg == null || presc.int_recuperacao_seg > 1800) v.erro('int_recuperacao', 'Recuperação inválida (m:ss, até 30:00).');
      }
    } else {
      presc.duracao_min = v.numero('duracao_min', f.duracao_min, { min: 1, max: 600, nome: 'Duração', unidade: 'min' });
      const km = v.numero('distancia_km', f.distancia_km, { min: 0.1, max: 100, nome: 'Distância', unidade: 'km' });
      presc.distancia_m = km != null ? Math.round(km * 1000) : null;
      if (presc.duracao_min == null && presc.distancia_m == null) v.erro('duracao_min', 'Indica a duração ou a distância.');
    }
  } else {
    presc.series = v.numero('series', f.series, { min: 1, max: 20, inteiro: true, obrigatorio: true, nome: 'Séries' });
    presc.reps_min = v.numero('reps_min', f.reps_min, { min: 1, max: 100, inteiro: true, obrigatorio: true, nome: 'Reps' });
    presc.reps_max = v.numero('reps_max', f.reps_max, { min: 1, max: 100, inteiro: true, nome: 'Reps máx.' }) ?? presc.reps_min;
    if (presc.reps_min && presc.reps_max < presc.reps_min) v.erro('reps_max', 'Reps máx. tem de ser ≥ reps mín.');
    presc.carga_kg = v.numero('carga_kg', f.carga_kg, { min: 0, max: 400, nome: 'Carga', unidade: 'kg' });
    presc.rpe = v.numero('rpe', f.rpe, { min: 1, max: 10, nome: 'RPE' });
    if (presc.rpe != null && (presc.rpe * 2) % 1) v.erro('rpe', 'RPE em passos de 0,5.');
    presc.rir = v.numero('rir', f.rir, { min: 0, max: 10, inteiro: true, nome: 'RIR' });
    presc.descanso_seg = f.descanso_seg ? +f.descanso_seg : null;
  }
  presc.notas = v.texto('notas', f.notas, { max: 300 });

  const metodo = f.metodo;
  const params = {};
  if (metodo === 'dupla') {
    params.rep_min = v.numero('p_rep_min', f.p_rep_min, { min: 1, max: 100, inteiro: true, nome: 'Gama mín.' }) ?? presc.reps_min;
    params.rep_max = v.numero('p_rep_max', f.p_rep_max, { min: 1, max: 100, inteiro: true, nome: 'Gama máx.' }) ?? presc.reps_max;
    params.inc_kg = v.numero('p_inc_kg', f.p_inc_kg, { min: 0.5, max: 20, obrigatorio: true, nome: 'Subida de carga', unidade: 'kg' });
    if (params.rep_min && params.rep_max && params.rep_max <= params.rep_min)
      v.erro(f.p_rep_max ? 'p_rep_max' : 'reps_max', 'Na dupla progressão a gama precisa de um máximo maior que o mínimo (ex.: 6–8).');
  }
  if (metodo === 'percentagem' || metodo === 'volume')
    params.pct = v.numero('p_pct', f.p_pct, { min: 0.5, max: 25, obrigatorio: true, nome: 'Percentagem', unidade: '%' });

  return { ok: v.ok, erros: v.erros, presc, metodo, params, aplicar: f.aplicar, notasEx: v.texto('notas_ex', f.notas_ex, { max: 300 }) };
}

// ---------------------------------------------------------------- Sugestões de progressão (pré-visualização)
function dialogoSugestoes(plano, sem, recarregar) {
  const lista = rp.sugestoesPlano(plano, sem);
  if (!lista.length) return aviso(`Nada a sugerir: as semanas seguintes já seguem a progressão a partir da semana ${sem}.`, 'info');
  const d = dialogo(
    `Progressão a partir da semana ${sem}`,
    html`<p class="ajuda">Sugestão calculada a partir da semana ${sem} e do método de cada exercício. Desmarca o que não quiseres alterar.</p>
      <label class="campo-check"><input type="checkbox" id="todos" checked> <strong>Selecionar tudo</strong></label>
      ${[...new Set(lista.map((x) => x.semana))].map((s) => html`<h4>Semana ${s}${plano.semanas.find((x) => x.semana === s)?.deload ? ' · deload' : ''}</h4>
        <ul class="lista-sug">${lista.map((x, i) => x.semana !== s ? '' : html`<li><label class="campo-check">
          <input type="checkbox" name="s_${i}" checked>
          <span><strong>${x.pe.nome}</strong> <small>${x.sessao.nome}</small><br>
            <small>${x.atual ? textoPrescricao(x.atual, x.pe, x.pe.metodo) : 'vazio'}</small> → <strong>${textoPrescricao(x.sugerida, x.pe, x.pe.metodo)}</strong>
            ${x.motivo ? html`<br><small class="motivo">↳ ${x.motivo}</small>` : ''}</span>
        </label></li>`)}</ul>`)}`,
    {
      textoOk: 'Aplicar selecionadas',
      onSubmit(form) {
        const f = lerForm(form);
        let n = 0;
        lista.forEach((x, i) => { if (f[`s_${i}`]) { rp.gravarPrescricao(x.pe.id, x.semana, { ...x.sugerida, notas: x.atual?.notas ?? null }); n++; } });
        aviso(`${n} prescrição(ões) atualizada(s).`);
        recarregar();
      },
    }
  );
  d.querySelector('#todos').onchange = (e) => d.querySelectorAll('[name^="s_"]').forEach((c) => (c.checked = e.target.checked));
}

// ---------------------------------------------------------------- Opções do plano
function dialogoOpcoes(plano, c, recarregar) {
  const d = dialogo(
    'Opções do plano',
    html`<div class="menu-opcoes">
      <button type="button" class="btn btn-sec" data-op="editar">✎ Editar dados do plano</button>
      <button type="button" class="btn btn-sec" data-op="duplicar">⧉ Duplicar (para um cliente ou como template)</button>
      ${c ? html`<button type="button" class="btn btn-sec" data-op="template">★ Guardar como template</button>` : ''}
      <button type="button" class="btn btn-perigo" data-op="apagar">Apagar plano</button>
    </div>`,
    { textoOk: 'Fechar' }
  );
  d.querySelectorAll('[data-op]').forEach((b) => (b.onclick = async () => {
    d.fechar();
    const op = b.dataset.op;
    if (op === 'editar') dialogoEditarPlano(plano, recarregar);
    if (op === 'duplicar') dialogoDuplicar(plano, null);
    if (op === 'template') dialogoDuplicar(plano, 'template');
    if (op === 'apagar') {
      if (!(await confirmar(`Apagar o plano "${plano.nome}" com todas as sessões e prescrições?`, { textoOk: 'Apagar' }))) return;
      rp.apagarPlano(plano.id);
      aviso('Plano apagado.');
      ir(c ? `/cliente/${c.id}?tab=planos` : '/treino?tab=templates');
    }
  }));
}

function dialogoEditarPlano(plano, recarregar) {
  dialogo(
    'Dados do plano',
    html`${campo('nome', 'Nome *', { valor: plano.nome })}
      ${campo('objetivo', 'Objetivo do bloco', { valor: plano.objetivo })}
      <div class="grelha-2">
        ${plano.cliente_id ? campo('data_inicio', 'Data de início', { tipo: 'date', valor: plano.data_inicio }) : ''}
        ${campo('num_semanas', 'Nº de semanas *', { tipo: 'number', valor: plano.num_semanas, ajuda: 'Reduzir apaga as semanas a mais.' })}
      </div>
      ${campo('notas', 'Notas', { tipo: 'textarea', valor: plano.notas })}`,
    {
      onSubmit(form) {
        const f = lerForm(form);
        const v = new Validador();
        const dados = {
          nome: v.texto('nome', f.nome, { obrigatorio: true, max: 80, nome: 'Nome' }),
          objetivo: v.texto('objetivo', f.objetivo, { max: 200 }),
          num_semanas: v.numero('num_semanas', f.num_semanas, { min: 1, max: 12, inteiro: true, obrigatorio: true, nome: 'Nº de semanas' }),
          notas: v.texto('notas', f.notas, { max: 2000 }),
        };
        if (plano.cliente_id) dados.data_inicio = v.data('data_inicio', f.data_inicio, { futuro: true, nome: 'Data de início' });
        if (!v.ok) return mostrarErros(form, v.erros), false;
        if (dados.num_semanas < plano.num_semanas && !window.confirm(`Reduzir para ${dados.num_semanas} semanas apaga as prescrições das semanas ${dados.num_semanas + 1}–${plano.num_semanas}. Continuar?`)) return false;
        rp.atualizarPlano(plano.id, dados);
        aviso('Plano atualizado.');
        recarregar();
      },
    }
  );
}

function dialogoDuplicar(plano, modo) {
  const clientes = repo.listarClientes();
  const paraTemplate = modo === 'template';
  const d = dialogo(
    paraTemplate ? 'Guardar como template' : 'Duplicar plano',
    html`${paraTemplate ? '' : campo('destino', 'Destino', { tipo: 'select', valor: plano.cliente_id ?? '', opcoes: [['', 'Template (sem cliente)'], ...clientes.map((c) => [c.id, c.nome])] })}
      ${campo('nome', 'Nome *', { valor: paraTemplate ? plano.nome : `${plano.nome} (cópia)` })}
      <div id="w-data">${campo('data_inicio', 'Data de início', { tipo: 'date', valor: proximaSegunda() })}</div>
      <p class="ajuda">As cargas são copiadas tal como estão — revê-as para o novo cliente. As contraindicações dele são verificadas automaticamente.</p>`,
    {
      textoOk: 'Duplicar',
      onSubmit(form) {
        const f = lerForm(form);
        const v = new Validador();
        const nome = v.texto('nome', f.nome, { obrigatorio: true, max: 80, nome: 'Nome' });
        const cliente_id = paraTemplate || !f.destino ? null : +f.destino;
        const data_inicio = cliente_id ? v.data('data_inicio', f.data_inicio, { futuro: true, nome: 'Data de início' }) : null;
        if (!v.ok) return mostrarErros(form, v.erros), false;
        const id = rp.duplicarPlano(plano.id, { cliente_id, nome, data_inicio });
        aviso(cliente_id ? 'Plano duplicado.' : 'Template guardado.');
        avisarContraindicacoes(id);
        ir(`/plano/${id}`);
      },
    }
  );
  const sel = d.querySelector('[name="destino"]');
  const sync = () => (d.querySelector('#w-data').hidden = paraTemplate || !sel?.value);
  if (sel) sel.onchange = sync;
  sync();
}
