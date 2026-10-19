// Definições: marca, valores de referência editáveis, backup e dados de exemplo.
import { def } from '../repo.js';
import { cfgProgressao } from '../repo-planos.js';
import { gravarDefinicao, apagarTudo, escalar } from '../db.js';
import { PALETAS, DEFINICOES_PADRAO } from '../catalogos.js';
import { html, Validador, mostrarErros, lerForm, aviso, tempo, lerTempo } from '../util.js';
import { cabecalho, campo, confirmar } from './ui.js';
import { carregarDadosExemplo, garantirBiblioteca } from '../seed.js';
import { aplicarTema } from '../app.js';
import { cfgAlertas } from '../repo-pacotes.js';
import { blocoTiposPacote } from './pacotes.js';
import { cfgAnalise } from '../analise.js';
import { cfgAgenda } from '../repo-agenda.js';
import { temPin, dialogoDefinirPin } from './modo-cliente.js';
import { blocoBackup, blocoPinApp, blocoConservacao } from './dados.js';
import { SEGMENTOS_HYROX, totalHyrox } from '../ritmos.js';

export function vistaDefinicoes(el) {
  const neg = def('negocio');
  const perims = def('perimetros');
  const lim = def('limiares_assimetria');
  const zonas = def('zonas_fc');
  const prog = cfgProgressao();
  const mt = { ...DEFINICOES_PADRAO.modo_treino, ...def('modo_treino') };
  const ap = cfgAlertas();
  const zr = def('zonas_ritmo_corrida');
  const zm = def('zonas_ritmo_remo');
  const hx = def('hyrox_referencias');
  const aa = cfgAnalise();
  const agc = cfgAgenda();
  const nClientes = escalar('SELECT COUNT(*) FROM clientes');

  el.innerHTML = html`
    ${cabecalho('Definições')}
    <form id="f-marca" class="form cartao" novalidate>
      <h3>Marca</h3>
      ${campo('nome', 'Nome do negócio *', { valor: neg.nome })}
      <div class="campo"><label>Paletas prontas</label>
        <div class="paletas">${PALETAS.map(
          (p) => html`<button type="button" class="paleta" data-p="${p.principal}" data-s="${p.secundaria}" title="${p.nome}">
            <span style="background:${p.principal}"></span><span style="background:${p.secundaria}"></span><small>${p.nome}</small></button>`
        )}</div></div>
      <div class="grelha-2">
        ${campo('cor_principal', 'Cor principal', { tipo: 'color', valor: neg.cor_principal })}
        ${campo('cor_secundaria', 'Cor secundária', { tipo: 'color', valor: neg.cor_secundaria })}
      </div>
      <div class="campo"><label for="logo">Logótipo (opcional)</label>
        ${neg.logo ? html`<img class="logo-prev" src="${neg.logo}" alt="Logótipo"><button type="button" class="btn btn-sec btn-peq" id="sem-logo">Remover logótipo</button>` : ''}
        <input type="file" id="logo" accept="image/png,image/jpeg,image/svg+xml">
        <small>Sem logótipo, é usado o nome em texto. A imagem é reduzida e guardada só neste dispositivo.</small></div>
      <button class="btn">Guardar marca</button>
    </form>

    <form id="f-ref" class="form cartao" novalidate>
      <h3>Valores de referência</h3>
      ${campo('modelo_balanca', 'Modelo da balança de bioimpedância (por defeito)', { valor: def('modelo_balanca') })}
      ${campo('versao_consentimento', 'Versão atual do texto de consentimento', { valor: def('versao_consentimento') })}
      <h4>Limiares de assimetria (%)</h4>
      <div class="grelha-2">
        ${campo('lim_atencao', 'Atenção a partir de', { tipo: 'number', valor: lim.atencao })}
        ${campo('lim_alerta', 'Alerta acima de', { tipo: 'number', valor: lim.alerta })}
      </div>
      <h4>Zonas de FC (% da reserva de FC)</h4>
      ${zonas.map((z, i) => html`<div class="grelha-3">
        ${campo(`z${i}_nome`, 'Zona', { valor: z.nome })}${campo(`z${i}_min`, 'Mín. %', { tipo: 'number', valor: z.min })}${campo(`z${i}_max`, 'Máx. %', { tipo: 'number', valor: z.max })}</div>`)}
      <h4>Progressão semanal sugerida (valores por defeito)</h4>
      <div class="grelha-3">
        ${campo('pg_pct_carga', '+% carga/semana', { tipo: 'number', valor: prog.pct_carga })}
        ${campo('pg_passo_kg', 'Arredondar carga a (kg)', { tipo: 'number', valor: prog.passo_kg })}
        ${campo('pg_inc_dupla_kg', 'Dupla progressão: subida (kg)', { tipo: 'number', valor: prog.inc_dupla_kg })}
        ${campo('pg_deload_volume_pct', 'Deload: séries (% da base)', { tipo: 'number', valor: prog.deload_volume_pct })}
        ${campo('pg_deload_carga_pct', 'Deload: carga (% da base)', { tipo: 'number', valor: prog.deload_carga_pct })}
        ${campo('pg_pct_volume_resist', 'Resistência: +% duração/semana', { tipo: 'number', valor: prog.pct_volume_resist })}
      </div>
      <h4>Perímetros</h4>
      <p class="ajuda">Um por linha. Acrescenta “ (bilateral)” no fim para medir esq./dir. Mudar um nome não altera registos antigos (passa a ser outro perímetro).</p>
      ${campo('perimetros', 'Lista de perímetros', { tipo: 'textarea', valor: perims.map((p) => p.nome + (p.bilateral ? ' (bilateral)' : '')).join('\n'), attrs: 'rows="7"' })}
      <button class="btn">Guardar valores</button>
    </form>

    <form id="f-treino" class="form cartao" novalidate>
      <h3>Modo Treino e agenda</h3>
      <div class="grelha-2">
        ${campo('mt_passo_kg', 'Passo de carga por defeito (kg)', { tipo: 'select', valor: mt.passo_kg, opcoes: [[1, '1'], [1.25, '1,25'], [2, '2'], [2.5, '2,5'], [5, '5']] })}
        ${campo('mt_descanso', 'Descanso por defeito (s)', { tipo: 'number', valor: mt.descanso_padrao_seg, ajuda: 'Usado quando o plano não define descanso.' })}
      </div>
      ${campo('mt_vibrar', 'Vibrar no fim do descanso', { tipo: 'checkbox', valor: mt.vibrar, ajuda: 'O Safari do iPhone não permite vibração a apps web; aí só funciona o som.' })}
      ${campo('mt_som', 'Som no fim do descanso', { tipo: 'checkbox', valor: mt.som })}
      <h4>Etiquetas rápidas</h4>
      ${campo('etiquetas', 'Uma por linha (aparecem como botões nas séries, exercícios e sessões)', { tipo: 'textarea', valor: def('etiquetas').join('\n'), attrs: 'rows="6"' })}
      <h4>Agenda</h4>
      <div class="grelha-3">
        ${campo('ag_max_sessoes', 'Dia sobrecarregado acima de (sessões)', { tipo: 'number', valor: agc.max_sessoes_dia })}
        ${campo('ag_max_horas', 'ou acima de (horas)', { tipo: 'number', valor: agc.max_horas_dia })}
        ${campo('ag_duracao', 'Duração por defeito (min)', { tipo: 'number', valor: agc.duracao_padrao_min })}
      </div>
      <h4>Alertas de renovação de pacotes</h4>
      <div class="grelha-2">
        ${campo('ap_sessoes', 'Avisar quando restarem (sessões)', { tipo: 'number', valor: ap.sessoes_restantes })}
        ${campo('ap_dias', 'Avisar quando faltarem (dias)', { tipo: 'number', valor: ap.dias_validade })}
      </div>
      <button class="btn">Guardar</button>
    </form>

    <div class="cartao" id="tipos-pacote"></div>

    <form id="f-ritmos" class="form cartao" novalidate>
      <h3>Zonas de ritmo, Hyrox e alertas <small class="estimativa">estimativas</small></h3>
      <h4>Corrida — segundos/km a somar ao ritmo de 5 km estimado</h4>
      <p class="ajuda">Negativo = mais rápido que o ritmo de 5 km. “Mín.” é o lado rápido da zona.</p>
      ${zr.map((z, i) => html`<div class="grelha-3">${campo(`zc${i}_nome`, 'Zona', { valor: z.nome })}${campo(`zc${i}_min`, 'Mín. (s)', { tipo: 'number', valor: z.min })}${campo(`zc${i}_max`, 'Máx. (s)', { tipo: 'number', valor: z.max })}</div>`)}
      <h4>Remo — segundos/500 m a somar ao parcial do teste de 2 km</h4>
      ${zm.map((z, i) => html`<div class="grelha-3">${campo(`zr${i}_nome`, 'Zona', { valor: z.nome })}${campo(`zr${i}_min`, 'Mín. (s)', { tipo: 'number', valor: z.min })}${campo(`zr${i}_max`, 'Máx. (s)', { tipo: 'number', valor: z.max })}</div>`)}
      ${campo('riegel_k', 'Expoente de Riegel (previsões)', { tipo: 'number', valor: def('riegel_k'), ajuda: 'Por defeito 1,06. Mais alto = previsões mais conservadoras nas distâncias longas.' })}
      <h4>Hyrox — tempos de referência por segmento (m:ss)</h4>
      <p class="ajuda">Valores aproximados de um finalista a meio da tabela. Ajusta-os aos resultados oficiais da tua prova/época. Na corrida: tempo por cada 1 km.</p>
      ${Object.entries(hx).map(([k, esc]) => html`<details class="sub-hx"><summary>${esc.nome} · total ${tempo(totalHyrox(esc.tempos))}</summary>
        <div class="grelha-2">${SEGMENTOS_HYROX.map((g) => campo(`hx_${k}_${g.id}`, g.nome, { valor: esc.tempos[g.id] ? tempo(esc.tempos[g.id]) : '', attrs: 'inputmode="numeric"' }))}</div></details>`)}
      <h4>Alertas da análise</h4>
      <div class="grelha-3">
        ${campo('aa_acwr_max', 'Rácio agudo:crónico máx.', { tipo: 'number', valor: aa.acwr_max })}
        ${campo('aa_rpe_alto', 'RPE alto a partir de', { tipo: 'number', valor: aa.rpe_alto })}
        ${campo('aa_dias_sem_treinar', 'Dias sem treinar', { tipo: 'number', valor: aa.dias_sem_treinar })}
        ${campo('aa_assiduidade_min_pct', 'Assiduidade mínima (%)', { tipo: 'number', valor: aa.assiduidade_min_pct })}
        ${campo('aa_queda_pct', 'Queda de força (%)', { tipo: 'number', valor: aa.queda_pct })}
        ${campo('aa_semanas_estagnacao', 'Estagnação (semanas)', { tipo: 'number', valor: aa.semanas_estagnacao })}
      </div>
      <button class="btn">Guardar</button>
    </form>

    <div class="cartao">
      <h3>Modo cliente</h3>
      <p class="ajuda">Ecrã para mostrar ao cliente (sem notas, pagamentos, alertas nem lesões). Para sair é pedido este PIN.</p>
      <p>${temPin() ? '✓ PIN definido.' : 'Ainda sem PIN — será pedido na primeira vez que entrares no modo cliente.'}</p>
      <button class="btn btn-sec" id="pin">${temPin() ? 'Alterar PIN' : 'Definir PIN'}</button>
    </div>

    <div class="cartao" id="bl-backup"></div>
    <div class="cartao" id="bl-pin-app"></div>
    <div class="cartao" id="bl-conservacao"></div>

    <div class="cartao zona-perigo">
      <h3>Dados de teste</h3>
      <div class="botoes">
        ${nClientes ? '' : html`<button class="btn btn-sec" id="exemplo">Carregar 3 clientes de exemplo</button>`}
        <button class="btn btn-perigo" id="apagar-tudo">Apagar TODOS os dados</button>
      </div>
    </div>`;

  // ---- Marca
  const fm = el.querySelector('#f-marca');
  let logo = neg.logo;
  fm.querySelectorAll('.paleta').forEach((b) => (b.onclick = () => {
    fm.cor_principal.value = b.dataset.p;
    fm.cor_secundaria.value = b.dataset.s;
  }));
  fm.querySelector('#sem-logo')?.addEventListener('click', () => { logo = null; fm.querySelector('.logo-prev').remove(); });
  fm.querySelector('#logo').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 5e6) return aviso('Imagem demasiado grande (máx. 5 MB).', 'erro');
    logo = await reduzirImagem(f, 400);
  };
  fm.onsubmit = (ev) => {
    ev.preventDefault();
    const f = lerForm(fm);
    const v = new Validador();
    const nome = v.texto('nome', f.nome, { obrigatorio: true, max: 60, nome: 'Nome' });
    if (!v.ok) return mostrarErros(fm, v.erros);
    gravarDefinicao('negocio', { nome, logo, cor_principal: f.cor_principal, cor_secundaria: f.cor_secundaria });
    aplicarTema();
    aviso('Marca atualizada.');
  };

  // ---- Valores de referência
  const fr = el.querySelector('#f-ref');
  fr.onsubmit = (ev) => {
    ev.preventDefault();
    const f = lerForm(fr);
    const v = new Validador();
    const atencao = v.numero('lim_atencao', f.lim_atencao, { min: 1, max: 50, obrigatorio: true, nome: 'Limiar de atenção', unidade: '%' });
    const alerta = v.numero('lim_alerta', f.lim_alerta, { min: 1, max: 60, obrigatorio: true, nome: 'Limiar de alerta', unidade: '%' });
    if (atencao && alerta && alerta <= atencao) v.erro('lim_alerta', 'O alerta tem de ser maior do que a atenção.');
    const novasZonas = zonas.map((_, i) => ({
      nome: v.texto(`z${i}_nome`, f[`z${i}_nome`], { obrigatorio: true, max: 40, nome: 'Nome da zona' }),
      min: v.numero(`z${i}_min`, f[`z${i}_min`], { min: 0, max: 100, obrigatorio: true, nome: 'Mín.' }),
      max: v.numero(`z${i}_max`, f[`z${i}_max`], { min: 0, max: 100, obrigatorio: true, nome: 'Máx.' }),
    }));
    novasZonas.forEach((z, i) => { if (z.min != null && z.max != null && z.min >= z.max) v.erro(`z${i}_max`, 'Máx. tem de ser maior do que mín.'); });
    const listaPer = f.perimetros.split('\n').map((s) => s.trim()).filter(Boolean).map((s) => {
      const bilateral = /\(bilateral\)$/i.test(s);
      return { nome: s.replace(/\s*\(bilateral\)$/i, '').trim(), bilateral };
    });
    if (!listaPer.length) v.erro('perimetros', 'Indica pelo menos um perímetro.');
    if (new Set(listaPer.map((p) => p.nome.toLowerCase())).size !== listaPer.length) v.erro('perimetros', 'Há perímetros repetidos.');
    const LIM_PROG = {
      pct_carga: [0.5, 20, '+% carga'], passo_kg: [0.25, 10, 'Arredondamento'], inc_dupla_kg: [0.5, 20, 'Subida da dupla progressão'],
      deload_volume_pct: [20, 100, 'Deload: séries'], deload_carga_pct: [50, 100, 'Deload: carga'], pct_volume_resist: [1, 50, '+% duração'],
    };
    const novaProg = Object.fromEntries(
      Object.entries(LIM_PROG).map(([k, [min, max, nome]]) => [k, v.numero(`pg_${k}`, f[`pg_${k}`], { min, max, obrigatorio: true, nome })])
    );
    if (!v.ok) return mostrarErros(fr, v.erros);
    gravarDefinicao('progressao', novaProg);
    gravarDefinicao('limiares_assimetria', { atencao, alerta });
    gravarDefinicao('zonas_fc', novasZonas);
    gravarDefinicao('perimetros', listaPer);
    gravarDefinicao('modelo_balanca', f.modelo_balanca.trim());
    gravarDefinicao('versao_consentimento', f.versao_consentimento.trim() || DEFINICOES_PADRAO.versao_consentimento);
    aviso('Valores guardados.');
  };

  // ---- Modo Treino, etiquetas e alertas de pacotes
  const ft = el.querySelector('#f-treino');
  ft.onsubmit = (ev) => {
    ev.preventDefault();
    const f = lerForm(ft);
    const v = new Validador();
    const descanso = v.numero('mt_descanso', f.mt_descanso, { min: 10, max: 900, inteiro: true, obrigatorio: true, nome: 'Descanso', unidade: 's' });
    const sessoes = v.numero('ap_sessoes', f.ap_sessoes, { min: 0, max: 50, inteiro: true, obrigatorio: true, nome: 'Sessões restantes' });
    const dias = v.numero('ap_dias', f.ap_dias, { min: 0, max: 120, inteiro: true, obrigatorio: true, nome: 'Dias' });
    const etiquetas = [...new Set(f.etiquetas.split('\n').map((s) => s.trim()).filter(Boolean))];
    if (etiquetas.some((e) => e.length > 30)) v.erro('etiquetas', 'Cada etiqueta pode ter no máximo 30 caracteres.');
    if (etiquetas.length > 20) v.erro('etiquetas', 'Máximo de 20 etiquetas.');
    const agenda = {
      max_sessoes_dia: v.numero('ag_max_sessoes', f.ag_max_sessoes, { min: 1, max: 20, inteiro: true, obrigatorio: true, nome: 'Sessões por dia' }),
      max_horas_dia: v.numero('ag_max_horas', f.ag_max_horas, { min: 1, max: 16, obrigatorio: true, nome: 'Horas por dia' }),
      duracao_padrao_min: v.numero('ag_duracao', f.ag_duracao, { min: 15, max: 240, inteiro: true, obrigatorio: true, nome: 'Duração' }),
    };
    if (!v.ok) return mostrarErros(ft, v.erros);
    gravarDefinicao('agenda', agenda);
    gravarDefinicao('modo_treino', { passo_kg: +f.mt_passo_kg, descanso_padrao_seg: descanso, vibrar: f.mt_vibrar, som: f.mt_som });
    gravarDefinicao('alertas_pacote', { sessoes_restantes: sessoes, dias_validade: dias });
    gravarDefinicao('etiquetas', etiquetas);
    aviso('Definições guardadas.');
  };
  blocoTiposPacote(el.querySelector('#tipos-pacote'));
  el.querySelector('#pin').onclick = () => dialogoDefinirPin(() => vistaDefinicoes(el));

  // ---- Zonas de ritmo, Hyrox e alertas da análise
  const fz = el.querySelector('#f-ritmos');
  fz.onsubmit = (ev) => {
    ev.preventDefault();
    const f = lerForm(fz);
    const v = new Validador();
    const zonasDe = (pref, lista) => lista.map((_, i) => {
      const z = {
        nome: v.texto(`${pref}${i}_nome`, f[`${pref}${i}_nome`], { obrigatorio: true, max: 40, nome: 'Zona' }),
        min: v.numero(`${pref}${i}_min`, f[`${pref}${i}_min`], { min: -120, max: 300, inteiro: true, obrigatorio: true, nome: 'Mín.' }),
        max: v.numero(`${pref}${i}_max`, f[`${pref}${i}_max`], { min: -120, max: 300, inteiro: true, obrigatorio: true, nome: 'Máx.' }),
      };
      if (z.min != null && z.max != null && z.min > z.max) v.erro(`${pref}${i}_max`, 'Máx. tem de ser ≥ mín.');
      return z;
    });
    const corrida = zonasDe('zc', zr), remo = zonasDe('zr', zm);
    const k = v.numero('riegel_k', f.riegel_k, { min: 1, max: 1.2, obrigatorio: true, nome: 'Expoente' });
    const novoHx = {};
    for (const [chave, esc] of Object.entries(hx)) {
      const tempos = {};
      for (const g of SEGMENTOS_HYROX) {
        const nomeCampo = `hx_${chave}_${g.id}`;
        const t = lerTempo(f[nomeCampo]);
        if (t == null || t < 10 || t > 3600) v.erro(nomeCampo, `${esc.nome} · ${g.nome}: tempo inválido (m:ss).`);
        else tempos[g.id] = t;
      }
      novoHx[chave] = { ...esc, tempos };
    }
    const LIM = { acwr_max: [1, 3], rpe_alto: [5, 10], dias_sem_treinar: [3, 60], assiduidade_min_pct: [10, 100], queda_pct: [1, 50], semanas_estagnacao: [2, 16] };
    const novoAa = Object.fromEntries(Object.entries(LIM).map(([c, [mn, mx]]) => [c, v.numero(`aa_${c}`, f[`aa_${c}`], { min: mn, max: mx, obrigatorio: true, nome: 'Valor' })]));
    if (!v.ok) {
      // Abre os blocos recolhidos que têm campos com erro.
      for (const n of Object.keys(v.erros)) fz.querySelector(`[name="${CSS.escape(n)}"]`)?.closest('details')?.setAttribute('open', '');
      return mostrarErros(fz, v.erros);
    }
    gravarDefinicao('zonas_ritmo_corrida', corrida);
    gravarDefinicao('zonas_ritmo_remo', remo);
    gravarDefinicao('riegel_k', k);
    gravarDefinicao('hyrox_referencias', novoHx);
    gravarDefinicao('alertas_analise', novoAa);
    aviso('Valores guardados.');
  };

  // ---- Backup, PIN da app e conservação de dados
  const recarregar = () => vistaDefinicoes(el);
  blocoBackup(el.querySelector('#bl-backup'), recarregar);
  blocoPinApp(el.querySelector('#bl-pin-app'), recarregar);
  blocoConservacao(el.querySelector('#bl-conservacao'), recarregar);

  // ---- Dados de teste
  el.querySelector('#exemplo')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    await carregarDadosExemplo();
    aviso('Clientes de exemplo carregados.');
    vistaDefinicoes(el);
  });
  el.querySelector('#apagar-tudo').onclick = async () => {
    if (!(await confirmar('Apagar TODOS os dados desta app neste dispositivo? Faz backup antes. Não pode ser desfeito.', { textoOk: 'Apagar tudo' }))) return;
    await apagarTudo();
    garantirBiblioteca();
    aplicarTema();
    aviso('Dados apagados.');
    vistaDefinicoes(el);
  };
}

// Reduz uma imagem para no máximo "lado" px e devolve data URL (PNG mantém transparência).
function reduzirImagem(ficheiro, lado) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, lado / Math.max(img.width, img.height));
      const cv = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k) || lado, height: Math.round(img.height * k) || lado });
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src);
      resolve(cv.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Imagem inválida.'));
    img.src = URL.createObjectURL(ficheiro);
  });
}
