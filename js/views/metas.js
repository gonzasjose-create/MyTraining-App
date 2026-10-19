// Separador "Metas": consistência e streak (com pausas justificadas), metas e marcos, check-in semanal.
import * as mv from '../repo-motivacao.js';
import { listarExercicios, def } from '../repo.js';
import { inicioSemana } from '../analise.js';
import { TIPOS_META, ESCALAS_CHECKIN, MOTIVOS_PAUSA, TESTES_AEROBIOS } from '../catalogos.js';
import { html, raw, data, num, tempo, lerTempo, lerNum, hojeISO, Validador, mostrarErros, lerForm, aviso } from '../util.js';
import { dialogo, confirmar, campo, etiqueta } from './ui.js';

const ICONE_SEMANA = { cumprida: ['✓', 'cumprida'], falhada: ['✕', 'abaixo do combinado'], pausa: ['‖', 'pausa justificada'], em_curso: ['…', 'em curso'] };
const ehTempo = (m) => m.tipo === 'teste_aerobio' && TESTES_AEROBIOS[m.perimetro]?.tipo === 'tempo';
const unidadeMeta = (m) => ({ e1rm: 'kg', carga: 'kg', reps: 'reps', peso: 'kg', mg_pct: '%', perimetro: 'cm' }[m.tipo] ?? (ehTempo(m) ? '' : 'm'));
export const fmtMeta = (m, v) => (v == null ? '—' : ehTempo(m) ? tempo(v) : `${num(v, m.tipo === 'reps' ? 0 : 1)} ${unidadeMeta(m)}`.trim());

export function seccaoMetasCliente(sec, c) {
  const recarregar = () => seccaoMetasCliente(sec, c);
  const cons = mv.consistencia(c.id);
  const metas = mv.listarMetas(c.id, { incluirArquivadas: true });
  const checkins = mv.listarCheckins(c.id, 8);
  const ckSemana = mv.checkinSemana(c.id);
  const pausas = mv.listarPausas(c.id);
  const ult12 = cons.semanas.slice(-12);

  sec.innerHTML = html`
    <div class="cartao"><h3>Consistência</h3>
      <div class="kpis">
        <div class="kpi"><span>🔥 ${cons.streak}</span>semana(s) seguida(s)<small>melhor: ${cons.melhor}</small></div>
        <div class="kpi"><span>${cons.score != null ? `${cons.score}%` : '—'}</span>score de consistência<small>${cons.nSemanasScore ? `últimas ${cons.nSemanasScore} semanas` : 'sem semanas completas'}</small></div>
        <div class="kpi"><span>${cons.freq}×</span>por semana<small>combinado na ficha</small></div>
      </div>
      ${ult12.length ? html`<div class="semanas-strip" role="list" aria-label="Últimas semanas">
        ${ult12.map((w) => html`<div class="sw sw-${w.estado}" role="listitem" title="Semana de ${data(w.inicio)}: ${w.sessoes} sessão(ões) · ${ICONE_SEMANA[w.estado][1]}">
          <span>${ICONE_SEMANA[w.estado][0]}</span><small>${data(w.inicio).slice(0, 5)}</small></div>`)}</div>
        <p class="ajuda">Semana cumprida = sessões realizadas ≥ combinado (${cons.freq}). Pausas justificadas (férias, doença, lesão) não contam nem quebram o streak;
          a semana em curso só conta quando for cumprida. Por agora as faltas não penalizam além de não contarem como presença.</p>`
        : html`<p class="ajuda">Aparece depois da primeira sessão realizada.</p>`}
      <div class="cartao-cab"><h4>Pausas justificadas</h4><button class="btn btn-sec btn-peq" id="nova-pausa">+ Pausa</button></div>
      ${pausas.length ? html`<ul class="lista lista-simples">${pausas.map((p) => html`<li><div>${p.motivo} · ${data(p.data_inicio)} → ${data(p.data_fim)}</div>
        <button class="btn btn-sec btn-icone" data-pausa="${p.id}" aria-label="Apagar pausa">✕</button></li>`)}</ul>` : html`<p class="ajuda">Sem pausas registadas.</p>`}
    </div>

    <div class="cartao"><div class="cartao-cab"><h3>Metas</h3><button class="btn btn-peq" id="nova-meta">+ Meta</button></div>
      ${metas.length ? html`<ul class="metas">${metas.map((m) => blocoMeta(m))}</ul>` : html`<p class="ajuda">Ex.: “Agachar 100 kg”, “Cintura 75 cm”, “3 km abaixo de 13:00”. O progresso é calculado automaticamente.</p>`}
    </div>

    <div class="cartao"><div class="cartao-cab"><h3>Check-in semanal</h3>
      <button class="btn btn-peq" id="checkin">${ckSemana ? 'Editar check-in desta semana' : '+ Check-in desta semana'}</button></div>
      ${ckSemana ? '' : html`<div class="caixa caixa-info">Ainda sem check-in esta semana.
        ${c.telemovel ? html`<a class="btn btn-sec btn-peq" target="_blank" rel="noopener" href="${linkWhatsApp(c.telemovel, mv.PERGUNTA_CHECKIN)}">Pedir por WhatsApp</a>` : ''}</div>`}
      ${checkins.length ? html`<table class="tabela checkins"><thead><tr><th>Semana</th>${ESCALAS_CHECKIN.map((e) => html`<th title="${e.nome}: 1 = ${e.baixo}, 5 = ${e.alto}">${e.nome.split(' ')[0]}</th>`)}<th></th></tr></thead><tbody>
        ${checkins.map((k) => html`<tr><td>${data(k.semana).slice(0, 5)}${k.origem === 'whatsapp' ? html` <small title="via WhatsApp">💬</small>` : ''}</td>
          ${ESCALAS_CHECKIN.map((e) => html`<td class="ck ck-${alertaEscala(e.id, k[e.id])}">${k[e.id] ?? '—'}</td>`)}
          <td><button class="btn btn-sec btn-icone" data-ck="${k.id}" aria-label="Editar">✎</button></td></tr>
          ${k.notas ? html`<tr class="ck-nota"><td colspan="6"><small>${k.notas}</small></td></tr>` : ''}`)}</tbody></table>
        <p class="ajuda">Escalas 1–5. Sono, energia e alimentação: 5 = melhor. Dor: 1 = nenhuma. Valores preocupantes ficam assinalados.</p>` : ''}
    </div>`;

  sec.querySelector('#nova-meta').onclick = () => dialogoMeta(c, null, recarregar);
  sec.querySelectorAll('[data-meta]').forEach((b) => (b.onclick = () => dialogoMeta(c, metas.find((m) => m.id === +b.dataset.meta), recarregar)));
  sec.querySelector('#checkin').onclick = () => dialogoCheckin(c, recarregar);
  sec.querySelectorAll('[data-ck]').forEach((b) => (b.onclick = () => dialogoCheckin(c, recarregar, checkins.find((k) => k.id === +b.dataset.ck))));
  sec.querySelector('#nova-pausa').onclick = () => dialogoPausa(c, recarregar);
  sec.querySelectorAll('[data-pausa]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmar('Apagar esta pausa?', { textoOk: 'Apagar' }))) return;
    mv.apagarPausa(+b.dataset.pausa);
    recarregar();
  }));
}

// Sono/energia/alimentação ≤ 2 ou dor ≥ 4 → atenção.
export const alertaEscala = (id, v) => (v == null ? '' : id === 'dor' ? (v >= 4 ? 'mau' : '') : v <= 2 ? 'mau' : '');

export function linkWhatsApp(telemovel, texto) {
  let n = String(telemovel).replace(/\D/g, '');
  if (n.length === 9) n = '351' + n; // número português sem indicativo
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
}

function blocoMeta(m) {
  const p = mv.progressoMeta(m);
  const pct = Math.round(p.progresso * 100);
  return html`<li class="meta ${m.estado === 'arquivada' ? 'inativa' : ''}">
    <div class="meta-cab"><strong>${m.titulo}</strong>
      ${p.atingida ? etiqueta(`✓ atingida ${data(p.atingida).slice(0, 5)}`, 'tag-ok') : m.data_alvo ? html`<small>até ${data(m.data_alvo)}</small>` : ''}
      ${m.estado === 'arquivada' ? etiqueta('arquivada') : ''}${m.mostrar_cliente ? '' : html` <small title="Não aparece ao cliente">🔒</small>`}
      <button class="btn btn-sec btn-icone" data-meta="${m.id}" aria-label="Editar meta">✎</button></div>
    <div class="barra-meta" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
      <span style="width:${pct}%"></span>
      ${p.marcos.map((mc) => html`<i class="marco ${mc.atingido ? 'ok' : ''}" style="left:${Math.round(Math.min(1, Math.max(0, (mc.valor - m.valor_inicial) / (m.valor_alvo - m.valor_inicial))) * 100)}%" title="Marco ${fmtMeta(m, mc.valor)}${mc.atingido ? ` · atingido ${data(mc.atingido)}` : ''}"></i>`)}
    </div>
    <div class="meta-valores"><span>${fmtMeta(m, m.valor_inicial)}</span><strong>${fmtMeta(m, p.atual)} · ${pct}%</strong><span>${fmtMeta(m, m.valor_alvo)}</span></div>
    ${p.marcos.length ? html`<div class="meta-marcos">${p.marcos.map((mc) => html`<span class="${mc.atingido ? 'ok' : ''}">${mc.atingido ? '✓' : '○'} ${fmtMeta(m, mc.valor)}</span>`)}</div>` : ''}
    ${p.atual == null ? html`<small class="ajuda">Ainda sem registos para calcular.</small>` : ''}
  </li>`;
}

// ---------------------------------------------------------------- Meta
function dialogoMeta(c, m, recarregar) {
  const exs = listarExercicios().filter((e) => e.tipo_registo !== 'resistencia');
  const perims = def('perimetros');
  const d = dialogo(
    m ? 'Editar meta' : 'Nova meta',
    html`${campo('tipo', 'Tipo *', { tipo: 'select', valor: m?.tipo ?? 'e1rm', opcoes: Object.entries(TIPOS_META), attrs: m ? 'disabled' : '' })}
      <div id="w-ex">${campo('exercicio_id', 'Exercício *', { tipo: 'select', valor: m?.exercicio_id ?? '', opcoes: [['', '— escolher —'], ...exs.map((e) => [e.id, e.nome])], attrs: m ? 'disabled' : '' })}</div>
      <div id="w-per">${campo('perimetro', 'Perímetro *', { tipo: 'select', valor: m ? `${m.perimetro}|${m.lado ?? ''}` : '', opcoes: [['', '— escolher —'], ...perims.flatMap((p) => (p.bilateral ? [[`${p.nome}|esq`, `${p.nome} · esq.`], [`${p.nome}|dir`, `${p.nome} · dir.`]] : [[`${p.nome}|`, p.nome]]))], attrs: m ? 'disabled' : '' })}</div>
      <div id="w-teste">${campo('teste', 'Teste *', { tipo: 'select', valor: m?.perimetro ?? c.teste_aerobio ?? '', opcoes: [['', '— escolher —'], ...Object.entries(TESTES_AEROBIOS).map(([k, t]) => [k, t.nome])], attrs: m ? 'disabled' : '' })}</div>
      ${campo('titulo', 'Título *', { valor: m?.titulo ?? '', attrs: 'placeholder="Ex.: Agachar 100 kg"' })}
      <p class="ajuda" id="info-atual"></p>
      <div class="grelha-2">
        ${campo('valor_inicial', 'Ponto de partida *', { valor: m ? (ehTempo(m) ? tempo(m.valor_inicial) : m.valor_inicial) : '' })}
        ${campo('valor_alvo', 'Alvo *', { valor: m ? (ehTempo(m) ? tempo(m.valor_alvo) : m.valor_alvo) : '' })}
        ${campo('data_inicio', 'Início', { tipo: 'date', valor: m?.data_inicio ?? hojeISO() })}
        ${campo('data_alvo', 'Prazo (opcional)', { tipo: 'date', valor: m?.data_alvo ?? '' })}
      </div>
      ${campo('marcos', 'Marcos intermédios (opcional, separados por espaço)', { valor: m ? JSON.parse(m.marcos).map((v) => (ehTempo(m) ? tempo(v) : String(v).replace('.', ','))).join(' ') : '', attrs: 'placeholder="Ex.: 80 90"' })}
      ${campo('mostrar_cliente', 'Mostrar ao cliente (modo cliente e relatórios)', { tipo: 'checkbox', valor: m ? m.mostrar_cliente : true })}
      ${m ? campo('arquivada', 'Arquivar meta', { tipo: 'checkbox', valor: m.estado === 'arquivada' }) : ''}
      ${m ? html`<button type="button" class="btn btn-perigo btn-peq" id="apagar">Apagar meta</button>` : ''}`,
    {
      onSubmit(form) {
        const f = lerForm(form);
        const tipo = m?.tipo ?? f.tipo;
        const v = new Validador();
        const base = { cliente_id: c.id, tipo };
        if (!m) {
          if (['e1rm', 'carga', 'reps'].includes(tipo)) { if (!f.exercicio_id) v.erro('exercicio_id', 'Escolhe o exercício.'); base.exercicio_id = +f.exercicio_id || null; }
          if (tipo === 'perimetro') { if (!f.perimetro) v.erro('perimetro', 'Escolhe o perímetro.'); [base.perimetro, base.lado] = (f.perimetro || '|').split('|'); base.lado ||= null; }
          if (tipo === 'teste_aerobio') { if (!f.teste) v.erro('teste', 'Escolhe o teste.'); base.perimetro = f.teste || null; }
        }
        const comoTempo = m ? ehTempo(m) : tipo === 'teste_aerobio' && TESTES_AEROBIOS[f.teste]?.tipo === 'tempo';
        const lerValor = (nome, rot) => {
          const t = f[nome];
          if (!t?.trim()) { v.erro(nome, `${rot} é obrigatório.`); return null; }
          const x = comoTempo ? lerTempo(t) : lerNum(t);
          if (x == null || isNaN(x) || x <= 0 || x > 100000) { v.erro(nome, `${rot}: valor inválido${comoTempo ? ' (m:ss)' : ''}.`); return null; }
          return x;
        };
        const ini = lerValor('valor_inicial', 'Ponto de partida');
        const alvo = lerValor('valor_alvo', 'Alvo');
        if (ini != null && alvo != null && ini === alvo) v.erro('valor_alvo', 'O alvo tem de ser diferente do ponto de partida.');
        const marcos = (f.marcos || '').split(/\s+/).filter(Boolean).map((t) => (comoTempo ? lerTempo(t) : lerNum(t)));
        if (marcos.some((x) => x == null || isNaN(x))) v.erro('marcos', 'Marcos inválidos.');
        else if (ini != null && alvo != null && marcos.some((x) => (x - ini) * (alvo - x) <= 0)) v.erro('marcos', 'Os marcos têm de ficar entre o ponto de partida e o alvo.');
        const dados = {
          titulo: v.texto('titulo', f.titulo, { obrigatorio: true, max: 80, nome: 'Título' }),
          valor_inicial: ini, valor_alvo: alvo, marcos: JSON.stringify(marcos.filter((x) => x != null && !isNaN(x)).sort((a, b) => (alvo > ini ? a - b : b - a))),
          data_inicio: v.data('data_inicio', f.data_inicio, { obrigatorio: true, futuro: true, nome: 'Início' }),
          data_alvo: v.data('data_alvo', f.data_alvo, { futuro: true, nome: 'Prazo' }),
          mostrar_cliente: f.mostrar_cliente ? 1 : 0,
        };
        if (dados.data_alvo && dados.data_inicio && dados.data_alvo <= dados.data_inicio) v.erro('data_alvo', 'O prazo tem de ser depois do início.');
        if (m) dados.estado = f.arquivada ? 'arquivada' : 'ativa';
        if (!v.ok) return mostrarErros(form, v.erros), false;
        mv.guardarMeta(m ? dados : { ...base, ...dados }, m?.id);
        aviso('Meta guardada.');
        recarregar();
      },
    }
  );
  const form = d.querySelector('form');
  // Mostra os campos do tipo e sugere o ponto de partida a partir dos registos atuais.
  const sync = () => {
    const tipo = form.tipo.value;
    d.querySelector('#w-ex').hidden = !['e1rm', 'carga', 'reps'].includes(tipo);
    d.querySelector('#w-per').hidden = tipo !== 'perimetro';
    d.querySelector('#w-teste').hidden = tipo !== 'teste_aerobio';
    if (m) return;
    const [perimetro, lado] = (form.perimetro.value || '|').split('|');
    const prov = { cliente_id: c.id, tipo, exercicio_id: +form.exercicio_id.value || null, perimetro: tipo === 'teste_aerobio' ? form.teste.value : perimetro, lado: lado || null, valor_inicial: 0, valor_alvo: 1 };
    const pronto = (['e1rm', 'carga', 'reps'].includes(tipo) && prov.exercicio_id) || (tipo === 'perimetro' && perimetro) || (tipo === 'teste_aerobio' && prov.perimetro) || ['peso', 'mg_pct'].includes(tipo);
    const atual = pronto ? mv.valorAtual(prov) : null;
    d.querySelector('#info-atual').textContent = pronto ? (atual != null ? `Valor atual nos registos: ${fmtMeta(prov, atual)}` : 'Ainda sem registos — indica o ponto de partida.') : '';
    if (atual != null && !form.valor_inicial.value) form.valor_inicial.value = ehTempo(prov) ? tempo(atual) : String(Math.round(atual * 10) / 10).replace('.', ',');
  };
  form.tipo.onchange = () => { form.valor_inicial.value = ''; sync(); };
  form.exercicio_id.onchange = form.perimetro.onchange = form.teste.onchange = () => { form.valor_inicial.value = ''; sync(); };
  sync();
  d.querySelector('#apagar')?.addEventListener('click', async () => {
    d.fechar();
    if (!(await confirmar(`Apagar a meta "${m.titulo}"?`, { textoOk: 'Apagar' }))) return;
    mv.apagarMeta(m.id);
    recarregar();
  });
}

// ---------------------------------------------------------------- Check-in (30 segundos)
export function dialogoCheckin(c, depois, existente = null) {
  const k = existente ?? mv.checkinSemana(c.id);
  const escala = (e) => html`<div class="ck-linha"><div><strong>${e.nome}</strong><small>1 = ${e.baixo} · 5 = ${e.alto}</small></div>
    <div class="segmentado ck-seg" data-escala="${e.id}" role="radiogroup" aria-label="${e.nome}">
      ${[1, 2, 3, 4, 5].map((n) => html`<button type="button" role="radio" aria-checked="${k?.[e.id] === n}" class="${k?.[e.id] === n ? 'ativo' : ''}" data-v="${n}">${n}</button>`)}
    </div></div>`;
  const d = dialogo(
    `Check-in · ${c.nome}`,
    html`${ESCALAS_CHECKIN.map(escala)}
      ${campo('notas', 'Notas (opcional)', { valor: k?.notas ?? '' })}
      ${campo('data', 'Data', { tipo: 'date', valor: k?.data ?? hojeISO(), ajuda: 'Conta para a semana desta data.' })}
      <details class="mais-serie" ${k?.origem === 'whatsapp' ? raw('open') : ''}><summary>Colar resposta do WhatsApp</summary>
        <textarea id="wa-texto" rows="2" placeholder="Ex.: 4 3 1 5 dormi mal na terça"></textarea>
        <button type="button" class="btn btn-sec btn-peq" id="wa-ler">Interpretar</button>
        <p class="ajuda" id="wa-info">Ordem: sono, energia, dor, alimentação (ou com nomes: “sono 4, energia 3…”).</p>
      </details>
      ${existente ? html`<button type="button" class="btn btn-perigo btn-peq" id="apagar">Apagar check-in</button>` : ''}`,
    {
      onSubmit(form) {
        const f = lerForm(form);
        const v = new Validador();
        const dt = v.data('data', f.data, { obrigatorio: true });
        const val = Object.fromEntries(ESCALAS_CHECKIN.map((e) => [e.id, +d.querySelector(`[data-escala="${e.id}"] .ativo`)?.dataset.v || null]));
        if (ESCALAS_CHECKIN.some((e) => val[e.id] == null)) return aviso('Escolhe um valor de 1 a 5 em cada escala.', 'erro'), false;
        if (!v.ok) return mostrarErros(form, v.erros), false;
        if (!existente && mv.checkinSemana(c.id, inicioSemana(dt)) && inicioSemana(dt) !== inicioSemana(hojeISO()))
          aviso('Já havia um check-in nessa semana: foi substituído.', 'info');
        mv.guardarCheckin(c.id, { ...val, data: dt, notas: v.texto('notas', f.notas, { max: 300 }), origem: origem });
        aviso('Check-in guardado.');
        depois?.();
      },
    }
  );
  let origem = k?.origem ?? 'presencial';
  d.querySelectorAll('.ck-seg').forEach((g) => (g.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    g.querySelectorAll('button').forEach((x) => { x.classList.toggle('ativo', x === b); x.setAttribute('aria-checked', x === b); });
  }));
  d.querySelector('#wa-ler').onclick = () => {
    const r = mv.interpretarCheckin(d.querySelector('#wa-texto').value);
    const info = d.querySelector('#wa-info');
    if (!r) return void (info.textContent = 'Cola primeiro a mensagem.');
    for (const e of ESCALAS_CHECKIN)
      if (r[e.id] != null) d.querySelectorAll(`[data-escala="${e.id}"] button`).forEach((x) => x.classList.toggle('ativo', +x.dataset.v === r[e.id]));
    if (r.notas) d.querySelector('[name="notas"]').value = r.notas;
    origem = 'whatsapp';
    info.textContent = r.completo ? '✓ Interpretado — confirma os valores e guarda.' : '⚠ Faltam valores — completa à mão.';
  };
  d.querySelector('#apagar')?.addEventListener('click', async () => {
    d.fechar();
    if (!(await confirmar('Apagar este check-in?', { textoOk: 'Apagar' }))) return;
    mv.apagarCheckin(existente.id);
    depois?.();
  });
}

// ---------------------------------------------------------------- Pausa
function dialogoPausa(c, recarregar) {
  dialogo(
    'Pausa justificada',
    html`${campo('motivo', 'Motivo', { tipo: 'select', valor: 'Férias', opcoes: MOTIVOS_PAUSA.map((m) => [m, m]) })}
      <div class="grelha-2">${campo('data_inicio', 'De *', { tipo: 'date', valor: hojeISO() })}${campo('data_fim', 'Até *', { tipo: 'date', valor: '' })}</div>
      <p class="ajuda">Semanas com 4 ou mais dias de pausa não contam para o streak nem para o score.</p>`,
    {
      onSubmit(form) {
        const f = lerForm(form);
        const v = new Validador();
        const ini = v.data('data_inicio', f.data_inicio, { obrigatorio: true, futuro: true, nome: 'Início' });
        const fim = v.data('data_fim', f.data_fim, { obrigatorio: true, futuro: true, nome: 'Fim' });
        if (ini && fim && fim < ini) v.erro('data_fim', 'O fim não pode ser antes do início.');
        if (!v.ok) return mostrarErros(form, v.erros), false;
        mv.guardarPausa({ cliente_id: c.id, motivo: f.motivo, data_inicio: ini, data_fim: fim });
        recarregar();
      },
    }
  );
}
