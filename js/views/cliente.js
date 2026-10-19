// Ficha do cliente: Resumo, Sessões, Planos, Avaliações, Pacotes, Lesões e Consentimentos.
import * as repo from '../repo.js';
import { executar, inserir, atualizar } from '../db.js';
import { ESTADOS_LESAO, LADOS, TIPOS_CONSENTIMENTO, TESTES_AEROBIOS } from '../catalogos.js';
import { zonasFC } from '../calc.js';
import { html, raw, data, hojeISO, Validador, mostrarErros, lerForm, aviso } from '../util.js';
import { cabecalho, etiqueta, dialogo, confirmar, campo, vazio } from './ui.js';
import { perfilTags } from './clientes.js';
import { blocoResultados } from './avaliacao.js';
import { ir } from '../app.js';
import { seccaoPlanosCliente } from './planos.js';
import { seccaoSessoesCliente, dialogoIniciarTreino } from './sessoes.js';
import { seccaoPacotesCliente } from './pacotes.js';
import { alertaPacote } from '../repo-pacotes.js';
import { seccaoAnaliseCliente } from './analise.js';
import { seccaoZonasCliente } from './zonas.js';
import { seccaoMetasCliente } from './metas.js';
import { seccaoFotosCliente } from './fotos.js';
import { entrarModoCliente } from './modo-cliente.js';
import { limparFotosOrfas } from '../repo-fotos.js';
import { dialogoExportarCliente } from './dados.js';

const SEPARADORES = [
  ['resumo', 'Resumo'],
  ['analise', 'Análise'],
  ['metas', 'Metas'],
  ['zonas', 'Zonas'],
  ['fotos', 'Fotos'],
  ['sessoes', 'Sessões'],
  ['planos', 'Planos'],
  ['avaliacoes', 'Avaliações'],
  ['pacotes', 'Pacotes'],
  ['lesoes', 'Lesões'],
  ['consentimentos', 'Consentimentos'],
];

export function vistaCliente(el, { id, tab = 'resumo' }) {
  const c = repo.obterCliente(+id);
  if (!c) return ir('/clientes');
  const lesoesAtivas = repo.listarLesoes(c.id).filter((l) => l.estado !== 'resolvida').length;
  const alertaPac = alertaPacote(c.id);

  const planos = (sec) => seccaoPlanosCliente(sec, c);
  const sessoes = (sec) => seccaoSessoesCliente(sec, c);
  const pacotes = (sec) => seccaoPacotesCliente(sec, c);
  const analise = (sec) => seccaoAnaliseCliente(sec, c);
  const zonas = (sec) => seccaoZonasCliente(sec, c);
  const metas = (sec) => seccaoMetasCliente(sec, c);
  const fotos = (sec) => seccaoFotosCliente(sec, c);
  const corpo = { resumo, analise, metas, zonas, fotos, sessoes, avaliacoes, planos, pacotes, lesoes, consentimentos }[tab] || resumo;
  // "Zonas" só faz sentido para clientes com resistência.
  const separadores = SEPARADORES.filter(([k]) => k !== 'zonas' || c.perfil_resistencia);
  el.innerHTML = html`
    ${cabecalho(c.nome, { voltar: '/clientes', acoes: `<a class="btn btn-sec" href="#/cliente/${c.id}/editar">Editar</a>` })}
    <div class="ficha-topo">
      <span>${c.idade} anos</span> ${perfilTags(c)} ${c.ativo ? '' : etiqueta('Inativo')}
      ${lesoesAtivas ? raw(`<a href="#/cliente/${c.id}?tab=lesoes">${etiqueta(`⚠ ${lesoesAtivas} lesão(ões) ativa(s)`, 'tag-aviso')}</a>`) : ''}
      ${alertaPac ? raw(`<a href="#/cliente/${c.id}?tab=pacotes">${etiqueta(alertaPac.texto, alertaPac.nivel === 'alerta' ? 'tag-alerta' : 'tag-aviso')}</a>`) : ''}
    </div>
    <div class="acoes-cliente">
      <button class="btn btn-iniciar" id="iniciar-treino">▶ Iniciar treino</button>
      <button class="btn btn-sec" id="modo-cliente" title="Ecrã para mostrar ao cliente (sair pede PIN)">👁 Modo cliente</button>
      <a class="btn btn-sec" href="#/relatorio/${c.id}?tipo=semana">📄 Resumo / relatório</a>
    </div>
    <nav class="separadores">
      ${separadores.map(([k, t]) => html`<a href="#/cliente/${c.id}?tab=${k}" class="${k === tab ? 'ativo' : ''}">${t}</a>`)}
    </nav>
    <section id="corpo"></section>`;

  el.querySelector('#iniciar-treino').onclick = () => dialogoIniciarTreino({ clienteId: c.id });
  el.querySelector('#modo-cliente').onclick = () => entrarModoCliente(c.id, `#/cliente/${c.id}?tab=${tab}`);
  const sec = el.querySelector('#corpo');
  const recarregar = () => vistaCliente(el, { id, tab });
  corpo(sec, c, recarregar);
}

// ---------------------------------------------------------------- Resumo
function resumo(sec, c, recarregar) {
  const avs = repo.listarAvaliacoes(c.id);
  const ultima = avs.length ? repo.obterAvaliacao(avs[avs.length - 1].id) : null;
  const proxima = ultima ? somarSemanas(ultima.data, c.intervalo_reavaliacao_semanas) : null;
  const atrasada = proxima && proxima < hojeISO();

  let fcHtml = '';
  if (c.perfil_resistencia) {
    const fc = repo.fcMaxCliente(c);
    const rep = repo.ultimaFCRepouso(c.id);
    const zonas = zonasFC(fc.usada, rep, repo.def('zonas_fc'));
    fcHtml = html`<div class="cartao">
      <h3>FC e zonas <small class="estimativa">estimativas</small></h3>
      <p>FC máx.: <strong>${fc.usada ?? '—'} bpm</strong> <small>(${fc.fonte})</small> · FC repouso: <strong>${rep ?? '—'} bpm</strong></p>
      ${fc.sugerirAtualizar
        ? html`<div class="caixa caixa-info">FC pico observada num teste (<strong>${fc.picoObservado} bpm</strong>) é superior à FC máx. em uso.
            <button class="btn btn-peq" id="usar-pico">Usar ${fc.picoObservado} bpm</button></div>`
        : ''}
      ${fc.definida ? html`<button class="btn btn-sec btn-peq" id="repor-tanaka">Repor estimativa de Tanaka (${fc.estimada} bpm)</button>` : ''}
      ${zonas
        ? html`<table class="tabela"><thead><tr><th>Zona</th><th>% reserva</th><th>bpm</th></tr></thead><tbody>
            ${zonas.map((z) => html`<tr><td>${z.nome}</td><td>${z.min}–${z.max}%</td><td><strong>${z.bpmMin}–${z.bpmMax}</strong></td></tr>`)}
          </tbody></table>
          <p class="ajuda">Reserva de FC (Karvonen) com FC máx. estimada. Valores indicativos — ajusta pela perceção de esforço.</p>`
        : html`<p class="ajuda">Regista a FC de repouso numa avaliação para calcular as zonas.</p>`}
      <p class="ajuda">Teste aeróbio: ${TESTES_AEROBIOS[c.teste_aerobio]?.nome || 'não definido'}. Ritmos, previsões e Hyrox no separador <a href="#/cliente/${c.id}?tab=zonas">Zonas</a>.</p>
    </div>`;
  }

  sec.innerHTML = html`
    <div class="cartao">
      <h3>Reavaliação</h3>
      ${ultima
        ? html`<p>Última avaliação: <strong>${data(ultima.data)}</strong> (${ultima.tipo === 'baseline' ? 'baseline' : 'reavaliação'}).
            Próxima: <strong class="${atrasada ? 'txt-alerta' : ''}">${data(proxima)}</strong>${atrasada ? ' — em atraso' : ''}</p>`
        : html`<p>Ainda sem baseline.</p>`}
    </div>
    ${ultima ? html`<div class="cartao"><h3>Última avaliação · ${data(ultima.data)}</h3>${blocoResultados(ultima, c, { compacto: true })}</div>` : ''}
    ${fcHtml}
    <div class="cartao">
      <h3>Dados</h3>
      <dl class="dados">
        <dt>Nascimento</dt><dd>${data(c.data_nascimento)}</dd>
        <dt>Telemóvel</dt><dd>${c.telemovel || '—'}</dd>
        <dt>Email</dt><dd>${c.email || '—'}</dd>
        <dt>Disponibilidade</dt><dd>${c.disponibilidade || '—'}</dd>
        <dt>Sessões/semana</dt><dd>${c.frequencia_semanal ?? '—'}</dd>
        <dt>Reavaliar a cada</dt><dd>${c.intervalo_reavaliacao_semanas} semanas</dd>
      </dl>
      <h4>Objetivos</h4><p class="pre">${c.objetivos || '—'}</p>
      <h4>Notas privadas <small>(nunca visíveis ao cliente)</small></h4><p class="pre">${c.notas_privadas || '—'}</p>
    </div>
    <div class="cartao zona-perigo">
      <h3>Dados do cliente (RGPD)</h3>
      <p class="ajuda">Exportar: ficheiro com todos os dados do titular (direito de acesso e portabilidade).
        Apagar: remove o cliente e TODOS os seus dados desta app, incluindo fotografias (direito ao apagamento). Os backups antigos continuam a conter estes dados.</p>
      <div class="botoes">
        <button class="btn btn-sec" id="exportar-rgpd">Exportar dados do cliente (RGPD)</button>
        <button class="btn btn-perigo" id="apagar">Apagar cliente e todos os dados</button>
      </div>
    </div>`;

  sec.querySelector('#usar-pico')?.addEventListener('click', () => {
    atualizar('clientes', c.id, { fc_max_definida: repo.fcMaxCliente(c).picoObservado });
    aviso('FC máx. atualizada.');
    recarregar();
  });
  sec.querySelector('#repor-tanaka')?.addEventListener('click', () => {
    atualizar('clientes', c.id, { fc_max_definida: null });
    recarregar();
  });
  sec.querySelector('#exportar-rgpd').onclick = () => dialogoExportarCliente(c.id, c.nome);
  sec.querySelector('#apagar').onclick = async () => {
    if (!(await confirmar(`Apagar definitivamente ${c.nome} e todos os dados associados? Esta ação não pode ser desfeita.`, { textoOk: 'Apagar' }))) return;
    repo.apagarCliente(c.id);
    limparFotosOrfas(); // apaga também as imagens das fotografias deste cliente
    aviso('Cliente apagado.');
    ir('/clientes');
  };
}

function somarSemanas(iso, semanas) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + semanas * 7);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- Avaliações
function avaliacoes(sec, c) {
  const avs = repo.listarAvaliacoes(c.id);
  const temBaseline = avs.some((a) => a.tipo === 'baseline');
  const consent = repo.temConsentimento(c.id, 'dados_saude');

  sec.innerHTML = html`
    ${consent
      ? html`<div class="barra-acoes-topo">
          ${temBaseline
            ? html`<a class="btn" href="#/cliente/${c.id}/avaliacao/nova?tipo=reavaliacao">+ Nova reavaliação</a>`
            : html`<a class="btn" href="#/cliente/${c.id}/avaliacao/nova?tipo=baseline">+ Registar baseline</a>`}
        </div>`
      : html`<div class="caixa caixa-alerta">Sem consentimento registado para dados de saúde. Regista-o no separador
          <a href="#/cliente/${c.id}?tab=consentimentos">Consentimentos</a> antes de registar avaliações.</div>`}
    ${avs.length
      ? html`<ul class="lista">${[...avs].reverse().map(
          (a) => html`<li><a class="item" href="#/avaliacao/${a.id}">
            <div class="item-principal"><strong>${data(a.data)}</strong>
              ${a.tipo === 'baseline' ? etiqueta('Baseline', 'tag-forca') : etiqueta('Reavaliação')}</div>
            <div class="item-sec">›</div></a></li>`
        )}</ul>`
      : vazio('Ainda não há avaliações.')}`;
}

// ---------------------------------------------------------------- Lesões e contraindicações
function lesoes(sec, c, recarregar) {
  const ls = repo.listarLesoes(c.id);
  const cis = repo.listarContraindicacoes(c.id);
  const exercicios = repo.listarExercicios();

  sec.innerHTML = html`
    <div class="cartao">
      <div class="cartao-cab"><h3>Lesões e limitações</h3><button class="btn btn-peq" id="nova-lesao">+ Lesão</button></div>
      ${ls.length
        ? html`<ul class="lista lista-simples">${ls.map(
            (l) => html`<li class="lesao estado-${l.estado}">
              <div><strong>${l.zona}</strong>${l.lado ? ` (${LADOS[l.lado]})` : ''} ${etiqueta(ESTADOS_LESAO[l.estado], `tag-${l.estado}`)}
                <div class="ajuda">Desde ${data(l.data_inicio)}${l.data_resolucao ? ` · resolvida em ${data(l.data_resolucao)}` : ''}</div>
                ${l.descricao ? html`<div>${l.descricao}</div>` : ''}
                ${l.notas ? html`<div class="ajuda pre">${l.notas}</div>` : ''}
              </div>
              <button class="btn btn-sec btn-peq" data-editar-lesao="${l.id}">Editar</button>
            </li>`
          )}</ul>`
        : html`<p class="ajuda">Sem lesões registadas.</p>`}
    </div>

    <div class="cartao">
      <div class="cartao-cab"><h3>Contraindicações</h3><button class="btn btn-peq" id="nova-ci">+ Contraindicação</button></div>
      <p class="ajuda">Exercícios ou padrões de movimento a evitar/adaptar. Ao montar planos (Fase 2) a app avisa e sugere alternativas.</p>
      ${cis.length
        ? html`<ul class="lista lista-simples">${cis.map(
            (ci) => html`<li class="${ci.ativa ? '' : 'inativa'}">
              <div>
                ${ci.nivel === 'evitar' ? etiqueta('Evitar', 'tag-alerta') : etiqueta('Adaptar', 'tag-aviso')}
                <strong>${ci.exercicio_nome ? `Exercício: ${ci.exercicio_nome}` : `Padrão: ${ci.padrao_nome}`}</strong>
                ${ci.lesao_zona ? html`<div class="ajuda">Ligada a: ${ci.lesao_zona}</div>` : ''}
                ${ci.notas ? html`<div class="ajuda">${ci.notas}</div>` : ''}
                ${ci.ativa ? '' : html`<div class="ajuda">(inativa)</div>`}
              </div>
              <div class="botoes">
                <button class="btn btn-sec btn-peq" data-alternar-ci="${ci.id}" data-ativa="${ci.ativa}">${ci.ativa ? 'Desativar' : 'Ativar'}</button>
                <button class="btn btn-sec btn-peq" data-apagar-ci="${ci.id}" aria-label="Apagar">✕</button>
              </div>
            </li>`
          )}</ul>`
        : html`<p class="ajuda">Sem contraindicações.</p>`}
    </div>

    <div class="cartao">
      <h3>Verificar um exercício</h3>
      <p class="ajuda">Teste rápido do aviso que vai aparecer no planeamento.</p>
      ${campo('verificar', 'Exercício', { tipo: 'select', opcoes: [['', '— escolher —'], ...exercicios.map((e) => [e.id, e.nome])] })}
      <div id="resultado-verificar"></div>
    </div>`;

  sec.querySelector('#nova-lesao').onclick = () => dialogoLesao(c, null, recarregar);
  sec.querySelectorAll('[data-editar-lesao]').forEach(
    (b) => (b.onclick = () => dialogoLesao(c, ls.find((l) => l.id === +b.dataset.editarLesao), recarregar))
  );
  sec.querySelector('#nova-ci').onclick = () => dialogoContra(c, ls, exercicios, recarregar);
  sec.querySelectorAll('[data-alternar-ci]').forEach(
    (b) => (b.onclick = () => {
      executar('UPDATE contraindicacoes SET ativa = ? WHERE id = ?', [b.dataset.ativa === '1' ? 0 : 1, +b.dataset.alternarCi]);
      recarregar();
    })
  );
  sec.querySelectorAll('[data-apagar-ci]').forEach(
    (b) => (b.onclick = async () => {
      if (!(await confirmar('Apagar esta contraindicação?', { textoOk: 'Apagar' }))) return;
      executar('DELETE FROM contraindicacoes WHERE id = ?', [+b.dataset.apagarCi]);
      recarregar();
    })
  );
  sec.querySelector('[name="verificar"]').onchange = (e) => {
    const alvo = sec.querySelector('#resultado-verificar');
    alvo.innerHTML = e.target.value ? avisoContraindicacao(repo.verificarContraindicacao(c.id, +e.target.value)) : '';
  };
}

// Caixa de aviso reutilizável (também usada no planeamento, Fase 2).
export function avisoContraindicacao(r) {
  if (!r.contraindicado) return html`<div class="caixa caixa-ok">✓ Sem contraindicações para este cliente.</div>`;
  return html`<div class="caixa ${r.nivel === 'evitar' ? 'caixa-alerta' : 'caixa-aviso'} aviso-ci" role="alert">
    <strong>⚠ ${r.nivel === 'evitar' ? 'CONTRAINDICADO' : 'ADAPTAR'} para este cliente</strong>
    <ul>${r.motivos.map(
      (m) => html`<li>${m.exercicio_id ? 'Exercício marcado' : `Padrão "${m.padrao_nome}"`}${m.lesao_zona ? ` — ${m.lesao_zona}` : ''}${m.notas ? `: ${m.notas}` : ''}</li>`
    )}</ul>
    ${r.alternativas.length
      ? html`<p><strong>Alternativas sugeridas:</strong> ${r.alternativas.map((a) => a.nome).join(', ')}</p>`
      : html`<p>Sem alternativas seguras na biblioteca — considera adicionar uma.</p>`}
  </div>`;
}

function dialogoLesao(c, l, recarregar) {
  dialogo(
    l ? 'Editar lesão' : 'Nova lesão',
    html`${campo('zona', 'Zona *', { valor: l?.zona, ajuda: 'Ex.: Ombro, Lombar, Joelho, Tendão de Aquiles' })}
      <div class="grelha-2">
        ${campo('lado', 'Lado', { tipo: 'select', valor: l?.lado, opcoes: [['', '—'], ...Object.entries(LADOS)] })}
        ${campo('estado', 'Estado *', { tipo: 'select', valor: l?.estado || 'ativa', opcoes: Object.entries(ESTADOS_LESAO) })}
      </div>
      <div class="grelha-2">
        ${campo('data_inicio', 'Data de início *', { tipo: 'date', valor: l?.data_inicio || hojeISO() })}
        ${campo('data_resolucao', 'Data de resolução', { tipo: 'date', valor: l?.data_resolucao })}
      </div>
      ${campo('descricao', 'Descrição', { valor: l?.descricao })}
      ${campo('notas', 'Notas', { tipo: 'textarea', valor: l?.notas })}
      ${l ? html`<button type="button" class="btn btn-perigo btn-peq" id="apagar-lesao">Apagar lesão</button>` : ''}`,
    {
      onSubmit(form) {
        const f = lerForm(form);
        const v = new Validador();
        const d = {
          cliente_id: c.id,
          zona: v.texto('zona', f.zona, { obrigatorio: true, max: 80, nome: 'Zona' }),
          lado: f.lado || null,
          estado: f.estado,
          data_inicio: v.data('data_inicio', f.data_inicio, { obrigatorio: true, nome: 'Data de início' }),
          data_resolucao: v.data('data_resolucao', f.data_resolucao, { nome: 'Data de resolução' }),
          descricao: v.texto('descricao', f.descricao, { max: 300 }),
          notas: v.texto('notas', f.notas),
        };
        if (d.data_resolucao && d.data_inicio && d.data_resolucao < d.data_inicio) v.erro('data_resolucao', 'A resolução não pode ser antes do início.');
        if (d.estado === 'resolvida' && !d.data_resolucao) d.data_resolucao = hojeISO();
        if (d.estado !== 'resolvida') d.data_resolucao = null;
        if (!v.ok) return mostrarErros(form, v.erros), false;
        l ? atualizar('lesoes', l.id, d) : inserir('lesoes', d);
        if (d.estado === 'resolvida')
          aviso('Lesão resolvida. Revê as contraindicações ligadas a ela.', 'info');
        recarregar();
      },
    }
  ).querySelector('#apagar-lesao')?.addEventListener('click', async (e) => {
    e.target.closest('dialog').fechar();
    if (!(await confirmar('Apagar esta lesão? As contraindicações ligadas mantêm-se, sem ligação.', { textoOk: 'Apagar' }))) return;
    executar('DELETE FROM lesoes WHERE id = ?', [l.id]);
    recarregar();
  });
}

function dialogoContra(c, ls, exercicios, recarregar) {
  const padroes = repo.listarPadroes();
  const d = dialogo(
    'Nova contraindicação',
    html`${campo('alvo', 'Aplicar a', { tipo: 'select', valor: 'padrao', opcoes: [['padrao', 'Padrão de movimento (todos os exercícios desse padrão)'], ['exercicio', 'Exercício concreto']] })}
      <div id="c-padrao">${campo('padrao_id', 'Padrão *', { tipo: 'select', opcoes: [['', '— escolher —'], ...padroes.map((p) => [p.id, p.nome])] })}</div>
      <div id="c-exercicio" hidden>${campo('exercicio_id', 'Exercício *', { tipo: 'select', opcoes: [['', '— escolher —'], ...exercicios.map((e) => [e.id, e.nome])] })}</div>
      ${campo('nivel', 'Nível', { tipo: 'select', valor: 'evitar', opcoes: [['evitar', 'Evitar'], ['adaptar', 'Adaptar (amplitude, carga, variante)']] })}
      ${campo('lesao_id', 'Ligada à lesão', { tipo: 'select', opcoes: [['', '— nenhuma —'], ...ls.filter((l) => l.estado !== 'resolvida').map((l) => [l.id, l.zona])] })}
      ${campo('notas', 'Notas', { valor: '', ajuda: 'Ex.: evitar flexão lombar carregada' })}`,
    {
      onSubmit(form) {
        const f = lerForm(form);
        const v = new Validador();
        const porPadrao = f.alvo === 'padrao';
        if (porPadrao && !f.padrao_id) v.erro('padrao_id', 'Escolhe o padrão.');
        if (!porPadrao && !f.exercicio_id) v.erro('exercicio_id', 'Escolhe o exercício.');
        if (!v.ok) return mostrarErros(form, v.erros), false;
        inserir('contraindicacoes', {
          cliente_id: c.id,
          padrao_id: porPadrao ? +f.padrao_id : null,
          exercicio_id: porPadrao ? null : +f.exercicio_id,
          nivel: f.nivel,
          lesao_id: f.lesao_id ? +f.lesao_id : null,
          notas: v.texto('notas', f.notas, { max: 300 }),
        });
        recarregar();
      },
    }
  );
  d.querySelector('[name="alvo"]').onchange = (e) => {
    d.querySelector('#c-padrao').hidden = e.target.value !== 'padrao';
    d.querySelector('#c-exercicio').hidden = e.target.value === 'padrao';
  };
}

// ---------------------------------------------------------------- Consentimentos
function consentimentos(sec, c, recarregar) {
  const estado = repo.estadoConsentimentos(c.id);
  const hist = repo.listarConsentimentos(c.id);

  sec.innerHTML = html`
    <div class="cartao">
      <h3>Estado atual</h3>
      <ul class="lista lista-simples">${Object.entries(TIPOS_CONSENTIMENTO).map(
        ([k, t]) => html`<li>
          <div>${estado[k] ? etiqueta('✓ Consentido', 'tag-ok') : etiqueta('Sem consentimento', 'tag-alerta')} <strong>${t}</strong>
            ${estado[k] ? html`<div class="ajuda">Desde ${data(estado[k].data)} · ${estado[k].forma || '—'} · texto ${estado[k].versao_texto || '—'}</div>` : ''}</div>
          ${estado[k]
            ? html`<button class="btn btn-sec btn-peq" data-revogar="${estado[k].id}">Revogar</button>`
            : html`<button class="btn btn-peq" data-conceder="${k}">Registar</button>`}
        </li>`
      )}</ul>
    </div>
    <div class="cartao caixa-info">
      <h3>RGPD — o essencial</h3>
      <ul class="ajuda">
        <li>Dados de saúde, lesões e fotografias corporais são <strong>categorias especiais</strong> (art. 9.º RGPD): exigem consentimento <strong>explícito</strong>, idealmente escrito e assinado.</li>
        <li>Guarda o documento assinado (papel ou PDF) — esta app regista a data, forma e versão do texto.</li>
        <li>O cliente pode revogar a qualquer momento; a revogação não apaga dados, mas deixas de os poder tratar para essa finalidade. Para apagar tudo usa “Apagar cliente” no Resumo.</li>
        <li>Fotografias só são possíveis com consentimento específico de fotografias (Fase 6).</li>
      </ul>
    </div>
    <div class="cartao">
      <h3>Histórico</h3>
      ${hist.length
        ? html`<table class="tabela"><thead><tr><th>Data</th><th>Tipo</th><th>Estado</th></tr></thead><tbody>
            ${hist.map((h) => html`<tr><td>${data(h.data)}</td><td>${TIPOS_CONSENTIMENTO[h.tipo]}</td>
              <td>${h.revogado_em ? `Revogado em ${data(h.revogado_em)}` : h.concedido ? 'Concedido' : 'Recusado'}</td></tr>`)}
          </tbody></table>`
        : html`<p class="ajuda">Sem registos.</p>`}
    </div>`;

  sec.querySelectorAll('[data-conceder]').forEach(
    (b) => (b.onclick = () =>
      dialogo(
        'Registar consentimento',
        html`<p><strong>${TIPOS_CONSENTIMENTO[b.dataset.conceder]}</strong></p>
          ${campo('data', 'Data *', { tipo: 'date', valor: hojeISO() })}
          ${campo('forma', 'Forma', { tipo: 'select', valor: 'papel', opcoes: [['papel', 'Papel assinado'], ['digital', 'Digital'], ['verbal', 'Verbal (pouco recomendado)']] })}
          ${campo('versao_texto', 'Versão do texto', { valor: repo.def('versao_consentimento') })}
          ${campo('notas', 'Notas', { valor: '' })}`,
        {
          onSubmit(form) {
            const f = lerForm(form);
            const v = new Validador();
            const dt = v.data('data', f.data, { obrigatorio: true });
            if (!v.ok) return mostrarErros(form, v.erros), false;
            inserir('consentimentos', { cliente_id: c.id, tipo: b.dataset.conceder, concedido: 1, data: dt, forma: f.forma, versao_texto: f.versao_texto || null, notas: f.notas || null });
            recarregar();
          },
        }
      ))
  );
  sec.querySelectorAll('[data-revogar]').forEach(
    (b) => (b.onclick = async () => {
      if (!(await confirmar('Registar a revogação deste consentimento (data de hoje)?', { textoOk: 'Revogar' }))) return;
      executar('UPDATE consentimentos SET revogado_em = ? WHERE id = ?', [hojeISO(), +b.dataset.revogar]);
      recarregar();
    })
  );
}
