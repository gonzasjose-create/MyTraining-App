// Formulário de avaliação (baseline ou reavaliação): força/potência, composição, perímetros, resistência.
import * as repo from '../repo.js';
import { TESTES_FORCA, TESTES_AEROBIOS, QUALIDADE, infoVariante } from '../catalogos.js';
import { epley, assimetria, melhorTentativa } from '../calc.js';
import { html, num, tempo, data, lerTempo, lerNum, hojeISO, Validador, mostrarErros, lerForm, aviso } from '../util.js';
import { ligarAvaliacao } from '../repo-sessoes.js';
import { cabecalho, campo } from './ui.js';
import { ir } from '../app.js';

// Limites de plausibilidade (valores fora disto são recusados).
const LIM = {
  peso: [30, 250], pctMG: [3, 60], agua: [30, 80], visceral: [1, 59], perimetro: [15, 200],
  carga: [0.5, 400], reps: [1, 30], salto_horizontal: [20, 400], salto_vertical: [3, 120],
  fcRep: [30, 120], fc: [60, 230], rpe: [0, 10],
  tempo: { corrida_3km: [480, 2700], remo_2km: [330, 1200], bike_5km: [360, 2400] }, // segundos
  cooper: [800, 5000], // metros em 12 min
};

export function vistaAvaliacaoForm(el, { id, avId, tipo, sessao }) {
  const av = avId ? repo.obterAvaliacao(+avId) : null;
  const c = repo.obterCliente(av ? av.cliente_id : +id);
  if (!c) return ir('/clientes');
  tipo = av?.tipo || (tipo === 'baseline' ? 'baseline' : 'reavaliacao');
  // Aberta a partir de uma sessão de reavaliação (Modo Treino ou registo): volta para a sessão.
  const voltar = sessao ? `/sessao/${sessao}` : av ? `/avaliacao/${av.id}` : `/cliente/${c.id}?tab=avaliacoes`;

  if (!repo.temConsentimento(c.id, 'dados_saude')) {
    el.innerHTML = html`${cabecalho('Avaliação', { voltar })}
      <div class="caixa caixa-alerta">Não é possível registar avaliações sem consentimento para dados de saúde.
        <a href="#/cliente/${c.id}?tab=consentimentos">Registar consentimento</a></div>`;
    return;
  }

  // Valores existentes (edição) indexados por teste/lado.
  const reg = (teste, lado = null) => av?.testes.find((t) => t.teste === teste && (t.lado || null) === lado);
  const v = c.variantes;
  const testesAtivos = TESTES_FORCA.filter((t) => (t.tipo === 'salto' ? v.potencia?.includes(t.id) || reg(t.id) : v[t.id] || reg(t.id)));
  const comp = av?.composicao;
  const perimetros = repo.def('perimetros');
  const perim = (nome, lado = null) => av?.perimetros.find((p) => p.perimetro === nome && (p.lado || null) === lado)?.valor_cm;
  const rs = av?.resistencia;
  // Reavaliação nova: a avaliação anterior serve de referência (mesma bateria; valores como "ant.").
  const avsAnt = !av && tipo === 'reavaliacao' ? repo.listarAvaliacoes(c.id) : [];
  const ant = avsAnt.length ? repo.obterAvaliacao(avsAnt[avsAnt.length - 1].id) : null;
  const antReg = (teste, lado = null) => ant?.testes.find((t) => t.teste === teste && (t.lado || null) === lado);
  const ph = (val) => (val != null ? `placeholder="ant. ${String(val).replace('.', ',')}"` : '');
  const antComp = ant?.composicao;
  const antPer = (nome, lado = null) => ant?.perimetros.find((p) => p.perimetro === nome && (p.lado || null) === lado)?.valor_cm;
  const antRs = ant?.resistencia;
  const testeAer = rs?.teste || antRs?.teste || c.teste_aerobio || '';

  el.innerHTML = html`
    ${cabecalho(`${tipo === 'baseline' ? 'Baseline' : 'Reavaliação'} · ${c.nome}`, { voltar })}
    <form id="form" class="form" novalidate>
      ${ant ? html`<div class="caixa caixa-info">Pré-preenchida com a bateria da avaliação de <strong>${data(ant.data)}</strong>
        (mesmas variantes e ordem). Os valores anteriores aparecem como referência “ant.” — no fim compara automaticamente com a baseline e com a anterior.</div>` : ''}
      <fieldset><legend>Geral</legend>
        <div class="grelha-2">
          ${campo('data', 'Data *', { tipo: 'date', valor: av?.data || hojeISO() })}
        </div>
        ${campo('notas', 'Notas da avaliação', { tipo: 'textarea', valor: av?.notas })}
      </fieldset>

      <fieldset><legend>Composição corporal</legend>
        <div class="caixa caixa-info">
          <strong>Padronização da bioimpedância:</strong> mede sempre à mesma hora, em jejum ou antes de treinar, com hidratação
          semelhante e sem exercício prévio. A bioimpedância varia muito com a hidratação — lê os valores como <em>tendência</em>, não como absolutos.
        </div>
        ${campo('condicoes_padronizadas', 'Medição feita nas condições padronizadas', { tipo: 'checkbox', valor: comp ? comp.condicoes_padronizadas : true })}
        <div class="grelha-2">
          ${campo('modelo_balanca', 'Modelo da balança', { valor: comp?.modelo_balanca ?? antComp?.modelo_balanca ?? repo.def('modelo_balanca') })}
          ${campo('hora', 'Hora da medição', { tipo: 'time', valor: comp?.hora ?? antComp?.hora, ajuda: antComp?.hora ? `Anterior: ${antComp.hora} — mede à mesma hora.` : '' })}
        </div>
        <div class="grelha-3">
          ${campo('peso_kg', 'Peso (kg) *', { tipo: 'number', valor: comp?.peso_kg, attrs: ph(antComp?.peso_kg) })}
          ${campo('massa_gorda_pct', '% massa gorda', { tipo: 'number', valor: comp?.massa_gorda_pct, attrs: ph(antComp?.massa_gorda_pct) })}
          ${campo('massa_gorda_kg', 'Massa gorda (kg)', { tipo: 'number', valor: comp?.massa_gorda_kg, attrs: ph(antComp?.massa_gorda_kg) })}
          ${campo('massa_magra_kg', 'Massa magra (kg)', { tipo: 'number', valor: comp?.massa_magra_kg, attrs: ph(antComp?.massa_magra_kg) })}
          ${campo('agua_pct', 'Água corporal (%)', { tipo: 'number', valor: comp?.agua_pct, attrs: ph(antComp?.agua_pct) })}
          ${campo('gordura_visceral', 'Gordura visceral', { tipo: 'number', valor: comp?.gordura_visceral, attrs: ph(antComp?.gordura_visceral) })}
        </div>
      </fieldset>

      <fieldset><legend>Perímetros (cm)</legend>
        <div class="grelha-3">
          ${perimetros.map((p) =>
            p.bilateral
              ? html`${campo(`per_${p.nome}_esq`, `${p.nome} · esq.`, { tipo: 'number', valor: perim(p.nome, 'esq'), attrs: ph(antPer(p.nome, 'esq')) })}
                     ${campo(`per_${p.nome}_dir`, `${p.nome} · dir.`, { tipo: 'number', valor: perim(p.nome, 'dir'), attrs: ph(antPer(p.nome, 'dir')) })}`
              : campo(`per_${p.nome}`, p.nome, { tipo: 'number', valor: perim(p.nome), attrs: ph(antPer(p.nome)) })
          )}
        </div>
      </fieldset>

      ${c.perfil_forca ? html`<fieldset><legend>Força e potência</legend>
        <div class="caixa caixa-info"><strong>Protocolo:</strong> ordem fixa abaixo · aquecimento progressivo 3–4 séries ·
          1–2 tentativas com 3 min de descanso · 5RM–8RM (avançados 3RM–5RM) · mesmo equipamento, amplitude e técnica.
          Qualidade técnica 0 = falha e não conta.</div>
        ${testesAtivos.map((t) => blocoTeste(t, c, reg, antReg, ant?.data))}
        ${testesAtivos.length ? '' : html`<p class="ajuda">Sem testes de força escolhidos — define as variantes na ficha do cliente.</p>`}
      </fieldset>` : ''}

      ${c.perfil_resistencia ? html`<fieldset><legend>Resistência</legend>
        <div class="grelha-2">
          ${campo('fc_repouso', 'FC de repouso (bpm) · 5 min sentado', { tipo: 'number', valor: rs?.fc_repouso, attrs: ph(antRs?.fc_repouso) })}
          ${campo('teste_aerobio', 'Teste aeróbio', { tipo: 'select', valor: testeAer, opcoes: [['', '— não fez —'], ...Object.entries(TESTES_AEROBIOS).map(([k, x]) => [k, x.nome])] })}
        </div>
        ${c.teste_aerobio && testeAer && testeAer !== c.teste_aerobio
          ? html`<div class="caixa caixa-aviso">Atenção: o teste escolhido é diferente do teste principal do cliente — não será comparável.</div>` : ''}
        <div class="grelha-3">
          <div id="w-tempo">${campo('tempo', 'Tempo final (m:ss)', { valor: rs?.tempo_seg ? tempo(rs.tempo_seg) : '', attrs: `inputmode="numeric" placeholder="${antRs?.tempo_seg ? `ant. ${tempo(antRs.tempo_seg)}` : '14:30'}"` })}</div>
          <div id="w-dist">${campo('distancia_m', 'Distância em 12 min (m)', { tipo: 'number', valor: rs?.distancia_m, attrs: ph(antRs?.distancia_m) })}</div>
          ${campo('fc_media', 'FC média (bpm)', { tipo: 'number', valor: rs?.fc_media, attrs: ph(antRs?.fc_media) })}
          ${campo('fc_pico', 'FC pico (bpm)', { tipo: 'number', valor: rs?.fc_pico, attrs: ph(antRs?.fc_pico) })}
          ${campo('rpe', 'RPE final (0–10)', { tipo: 'number', valor: rs?.rpe, attrs: ph(antRs?.rpe) })}
          ${campo('fc_1min', 'FC 1 min após (bpm)', { tipo: 'number', valor: rs?.fc_1min, attrs: ph(antRs?.fc_1min) })}
        </div>
        <p class="ajuda">FC média/pico apenas se o cliente tiver relógio ou banda. A FC máx. nunca é testada em máximo.</p>
      </fieldset>` : ''}

      <div class="barra-acoes"><button class="btn btn-grande" type="submit">Guardar avaliação</button></div>
    </form>`;

  const form = el.querySelector('#form');

  // Mostra tempo ou distância conforme o teste aeróbio.
  const selAer = form.querySelector('[name="teste_aerobio"]');
  const atualizarAer = () => {
    const info = TESTES_AEROBIOS[selAer.value];
    form.querySelector('#w-tempo').hidden = !info || info.tipo !== 'tempo';
    form.querySelector('#w-dist').hidden = !info || info.tipo !== 'distancia';
  };
  if (selAer) { selAer.onchange = atualizarAer; atualizarAer(); }

  // Cálculo ao vivo do 1RM estimado / melhor salto / assimetria.
  form.addEventListener('input', () => atualizarCalculos(form, testesAtivos));
  atualizarCalculos(form, testesAtivos);

  form.onsubmit = (ev) => {
    ev.preventDefault();
    const r = validar(lerForm(form), c, tipo, testesAtivos, perimetros);
    if (!r.ok) return mostrarErros(form, r.erros);
    const novoId = repo.guardarAvaliacao(c.id, r.dados, av?.id);
    aviso('Avaliação guardada.');
    // Liga a avaliação à sessão de reavaliação (que não desconta do pacote) e volta ao treino.
    if (sessao) {
      ligarAvaliacao(+sessao, novoId);
      return ir(`/sessao/${sessao}`);
    }
    ir(`/avaliacao/${novoId}`);
  };
}

// ---------- Um bloco por teste de força ----------
function blocoTeste(t, c, reg, antReg = () => null, antData = null) {
  const existente = reg(t.id) || reg(t.id, 'esq');
  const variante = existente?.variante || c.variantes[t.id];
  const info = infoVariante(t.id, variante);
  const q = (nome, val) => campo(nome, 'Qualidade técnica', { tipo: 'select', valor: val ?? 2, opcoes: Object.entries(QUALIDADE) });

  // Referência da avaliação anterior (reavaliação nova).
  const fmtReg = (r) => {
    if (!r) return null;
    if (r.tentativas) return `${num(melhorTentativa(r.tentativas))} cm`;
    const rm = r.carga_kg ? epley(r.carga_kg, r.reps) : null;
    return `${r.carga_kg ? `${num(r.carga_kg)} kg × ` : ''}${r.reps} reps${rm ? ` (1RM ${num(rm.valor)} kg)` : ''}${r.qualidade === 0 ? ' · Q0' : ''}`;
  };
  const refs = (t.bilateral ? [['esq', 'esq.'], ['dir', 'dir.']] : [[null, '']])
    .map(([l, rot]) => { const txt = fmtReg(antReg(t.id, l)); return txt ? `${rot ? rot + ' ' : ''}${txt}` : null; })
    .filter(Boolean);
  const antVariante = (antReg(t.id) || antReg(t.id, 'esq'))?.variante;
  const refHtml = refs.length
    ? html`<p class="ref-ant">Anterior (${data(antData)}): ${refs.join(' · ')}${antVariante && variante && antVariante !== variante ? html` <span class="tag tag-aviso">variante anterior: ${antVariante}</span>` : ''}</p>`
    : '';

  if (t.tipo === 'salto') {
    const r = reg(t.id);
    const tent = r?.tentativas || [];
    return html`<div class="bloco-teste">
      <h4>${t.nome} <small>(cm, 3 tentativas — conta a melhor)</small></h4>${refHtml}
      <div class="grelha-4">
        ${[0, 1, 2].map((i) => campo(`${t.id}_t${i + 1}`, `Tentativa ${i + 1}`, { tipo: 'number', valor: tent[i] }))}
        ${q(`${t.id}_q`, r?.qualidade)}
      </div>
      <p class="calc" data-calc="${t.id}"></p>
    </div>`;
  }
  const cabec = html`<h4>${t.nome} · ${variante || '—'} ${info.nota ? html`<small>(${info.nota})</small>` : ''}
    ${variante !== c.variantes[t.id] ? html`<span class="tag tag-aviso">variante diferente da ficha</span>` : ''}</h4>
    <input type="hidden" name="${t.id}_variante" value="${variante || ''}">`;

  if (t.bilateral) {
    const lado = (l) => {
      const r = reg(t.id, l);
      return html`<div class="grelha-3"><strong class="lado">${l === 'esq' ? 'Esquerda' : 'Direita'}</strong>
        ${campo(`${t.id}_${l}_carga`, 'Carga (kg)', { tipo: 'number', valor: r?.carga_kg })}
        ${campo(`${t.id}_${l}_reps`, 'Reps', { tipo: 'number', valor: r?.reps, attrs: 'inputmode="numeric"' })}
        ${q(`${t.id}_${l}_q`, r?.qualidade)}</div>`;
    };
    return html`<div class="bloco-teste">${cabec}${refHtml}<p class="ajuda">Alvo: 8RM por perna.</p>${lado('esq')}${lado('dir')}<p class="calc" data-calc="${t.id}"></p></div>`;
  }

  const r = reg(t.id);
  return html`<div class="bloco-teste">${cabec}${refHtml}
    <div class="grelha-3">
      ${info.pesoCorporal ? html`<p class="ajuda">Peso corporal — regista só as repetições.</p>` : campo(`${t.id}_carga`, 'Carga (kg)', { tipo: 'number', valor: r?.carga_kg })}
      ${campo(`${t.id}_reps`, 'Reps', { tipo: 'number', valor: r?.reps, attrs: 'inputmode="numeric"' })}
      ${q(`${t.id}_q`, r?.qualidade)}
    </div>
    <p class="calc" data-calc="${t.id}"></p>
  </div>`;
}

function atualizarCalculos(form, testes) {
  const f = lerForm(form);
  const limiares = repo.def('limiares_assimetria');
  const rmTxt = (carga, reps, q) => {
    if (q === '0') return 'Qualidade 0 — não conta.';
    const r = epley(lerNum(carga), lerNum(reps));
    return r ? `1RM estimado: <strong>${num(r.valor)} kg</strong>${r.baixaFiabilidade ? ' <span class="tag tag-aviso">baixa fiabilidade (&gt;10 reps)</span>' : ''}` : '';
  };
  for (const t of testes) {
    const alvo = form.querySelector(`[data-calc="${t.id}"]`);
    if (!alvo) continue;
    if (t.tipo === 'salto') {
      const m = melhorTentativa([1, 2, 3].map((i) => lerNum(f[`${t.id}_t${i}`])));
      alvo.innerHTML = m ? `Melhor: <strong>${num(m)} cm</strong>` : '';
    } else if (t.bilateral) {
      const e = f[`${t.id}_esq_q`] !== '0' ? epley(lerNum(f[`${t.id}_esq_carga`]), lerNum(f[`${t.id}_esq_reps`])) : null;
      const d = f[`${t.id}_dir_q`] !== '0' ? epley(lerNum(f[`${t.id}_dir_carga`]), lerNum(f[`${t.id}_dir_reps`])) : null;
      const a = assimetria(e?.valor, d?.valor, limiares);
      alvo.innerHTML = [
        e ? `Esq.: <strong>${num(e.valor)} kg</strong>` : '',
        d ? `Dir.: <strong>${num(d.valor)} kg</strong>` : '',
        a ? `Assimetria: <span class="tag tag-${a.nivel === 'ok' ? 'ok' : a.nivel === 'atencao' ? 'aviso' : 'alerta'}">${num(a.pct)}%${a.ladoFraco ? ` · mais fraco: ${a.ladoFraco === 'esq' ? 'esq.' : 'dir.'}` : ''}</span>` : '',
      ].filter(Boolean).join(' · ');
    } else if (!infoVariante(t.id, f[`${t.id}_variante`]).pesoCorporal) {
      alvo.innerHTML = rmTxt(f[`${t.id}_carga`], f[`${t.id}_reps`], f[`${t.id}_q`]);
    }
  }
}

// ---------- Validação e conversão para o formato da base de dados ----------
function validar(f, c, tipo, testes, perimetros) {
  const v = new Validador();
  const dados = { tipo, data: v.data('data', f.data, { obrigatorio: true }), notas: v.texto('notas', f.notas), testes: [], perimetros: [] };
  if (dados.data && dados.data < c.data_nascimento) v.erro('data', 'A data é anterior ao nascimento do cliente.');

  // Composição
  const n = (campo, [min, max], o = {}) => v.numero(campo, f[campo], { min, max, ...o });
  const comp = {
    modelo_balanca: v.texto('modelo_balanca', f.modelo_balanca, { max: 80 }),
    hora: f.hora || null,
    condicoes_padronizadas: f.condicoes_padronizadas,
    peso_kg: n('peso_kg', LIM.peso, { obrigatorio: true, nome: 'Peso', unidade: 'kg' }),
    massa_gorda_pct: n('massa_gorda_pct', LIM.pctMG, { nome: '% massa gorda', unidade: '%' }),
    massa_gorda_kg: n('massa_gorda_kg', [1, 200], { nome: 'Massa gorda', unidade: 'kg' }),
    massa_magra_kg: n('massa_magra_kg', [10, 200], { nome: 'Massa magra', unidade: 'kg' }),
    agua_pct: n('agua_pct', LIM.agua, { nome: 'Água corporal', unidade: '%' }),
    gordura_visceral: n('gordura_visceral', LIM.visceral, { nome: 'Gordura visceral' }),
  };
  if (comp.peso_kg) {
    if (comp.massa_gorda_kg && comp.massa_gorda_kg >= comp.peso_kg) v.erro('massa_gorda_kg', 'Massa gorda não pode ser ≥ peso.');
    if (comp.massa_magra_kg && comp.massa_magra_kg >= comp.peso_kg) v.erro('massa_magra_kg', 'Massa magra não pode ser ≥ peso.');
    // Preenche massa gorda em kg a partir da % se faltar.
    if (comp.massa_gorda_pct && !comp.massa_gorda_kg) comp.massa_gorda_kg = Math.round(comp.peso_kg * comp.massa_gorda_pct) / 100;
  }
  dados.composicao = comp;

  // Perímetros
  for (const p of perimetros) {
    for (const lado of p.bilateral ? ['esq', 'dir'] : [null]) {
      const nome = lado ? `per_${p.nome}_${lado}` : `per_${p.nome}`;
      const val = v.numero(nome, f[nome], { min: LIM.perimetro[0], max: LIM.perimetro[1], nome: p.nome, unidade: 'cm' });
      if (val != null) dados.perimetros.push({ perimetro: p.nome, lado, valor_cm: val });
    }
  }

  // Força e potência — um teste só é gravado se tiver dados; dados parciais dão erro.
  if (c.perfil_forca) {
    for (const t of testes) {
      if (t.tipo === 'salto') {
        const lim = t.id === 'pot_horizontal' ? LIM.salto_horizontal : LIM.salto_vertical;
        const tent = [1, 2, 3].map((i) => v.numero(`${t.id}_t${i}`, f[`${t.id}_t${i}`], { min: lim[0], max: lim[1], nome: `${t.nome} (tentativa ${i})`, unidade: 'cm' }));
        if (tent.some((x) => x != null)) dados.testes.push({ teste: t.id, tentativas: tent, qualidade: +f[`${t.id}_q`] });
        continue;
      }
      const variante = f[`${t.id}_variante`] || null;
      const pc = infoVariante(t.id, variante).pesoCorporal;
      for (const lado of t.bilateral ? ['esq', 'dir'] : [null]) {
        const p = lado ? `${t.id}_${lado}` : t.id;
        const rotulo = `${t.nome}${lado ? (lado === 'esq' ? ' (esq.)' : ' (dir.)') : ''}`;
        const temCarga = !pc && f[`${p}_carga`]?.trim();
        const temReps = f[`${p}_reps`]?.trim();
        if (!temCarga && !temReps) continue;
        const carga = pc ? null : v.numero(`${p}_carga`, f[`${p}_carga`], { min: LIM.carga[0], max: LIM.carga[1], obrigatorio: true, nome: `${rotulo}: carga`, unidade: 'kg' });
        const reps = v.numero(`${p}_reps`, f[`${p}_reps`], { min: LIM.reps[0], max: pc ? 100 : LIM.reps[1], inteiro: true, obrigatorio: true, nome: `${rotulo}: reps` });
        // Carga relativa absurda face ao peso corporal (ex.: 5× o peso) → provável erro de digitação.
        if (carga && comp.peso_kg && carga > comp.peso_kg * 4) v.erro(`${p}_carga`, `${rotulo}: carga superior a 4× o peso corporal — confirma o valor.`);
        dados.testes.push({ teste: t.id, variante, lado, carga_kg: carga, reps, qualidade: +f[`${p}_q`] });
      }
    }
  }

  // Resistência
  if (c.perfil_resistencia) {
    const info = TESTES_AEROBIOS[f.teste_aerobio];
    const rs = {
      fc_repouso: n('fc_repouso', LIM.fcRep, { inteiro: true, nome: 'FC de repouso', unidade: 'bpm' }),
      teste: f.teste_aerobio || null,
      tempo_seg: null,
      distancia_m: null,
      fc_media: n('fc_media', LIM.fc, { inteiro: true, nome: 'FC média', unidade: 'bpm' }),
      fc_pico: n('fc_pico', LIM.fc, { inteiro: true, nome: 'FC pico', unidade: 'bpm' }),
      rpe: n('rpe', LIM.rpe, { inteiro: true, nome: 'RPE' }),
      fc_1min: n('fc_1min', LIM.fc, { inteiro: true, nome: 'FC 1 min após', unidade: 'bpm' }),
    };
    if (info?.tipo === 'tempo') {
      rs.tempo_seg = lerTempo(f.tempo);
      const [mn, mx] = LIM.tempo[f.teste_aerobio];
      if (!f.tempo) v.erro('tempo', 'Indica o tempo final.');
      else if (rs.tempo_seg == null) v.erro('tempo', 'Tempo inválido. Usa m:ss (ex.: 14:30) ou h:mm:ss.');
      else if (rs.tempo_seg < mn || rs.tempo_seg > mx) v.erro('tempo', `Tempo impossível para este teste (entre ${tempo(mn)} e ${tempo(mx)}).`);
    } else if (info?.tipo === 'distancia') {
      rs.distancia_m = v.numero('distancia_m', f.distancia_m, { min: LIM.cooper[0], max: LIM.cooper[1], inteiro: true, obrigatorio: true, nome: 'Distância', unidade: 'm' });
    }
    if (rs.fc_media && rs.fc_pico && rs.fc_media > rs.fc_pico) v.erro('fc_media', 'FC média não pode ser superior à FC pico.');
    if (rs.fc_1min && rs.fc_pico && rs.fc_1min > rs.fc_pico) v.erro('fc_1min', 'FC a 1 min não pode ser superior à FC pico.');
    if (rs.fc_repouso && rs.fc_pico && rs.fc_repouso >= rs.fc_pico) v.erro('fc_repouso', 'FC de repouso tem de ser inferior à FC pico.');
    if (Object.values(rs).some((x) => x != null)) dados.resistencia = rs;
  }

  return { ok: v.ok, erros: v.erros, dados };
}
