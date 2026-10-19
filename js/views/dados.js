// Definições → backup encriptado, restauro, PIN da app, conservação de dados (RGPD) e armazenamento.
import { criarBackup, lerBackup, restaurarBackup, ehBackupEncriptado, registarBackupFeito } from '../backup.js';
import { importarBytes, gravarDefinicao, todos } from '../db.js';
import { def } from '../repo.js';
import { gravarPin, pinValido } from '../pin.js';
import { bloqueioAtivo } from '../bloqueio.js';
import { exportarDadosCliente } from '../exportar-cliente.js';
import { somarDias, diasEntre } from '../analise.js';
import { VERSAO_APP } from '../versao.js';
import { html, data, num, hojeISO, aviso, baixarFicheiro } from '../util.js';
import { dialogo, confirmar, campo } from './ui.js';

// ---------------------------------------------------------------- Backup
export const diasDesdeBackup = () => {
  const u = def('ultimo_backup');
  return u ? diasEntre(u.slice(0, 10), hojeISO()) : null;
};
export const cfgLembreteBackup = () => def('backup_lembrete_dias') ?? 7;

// Guarda/partilha um ficheiro (no iPhone, "Partilhar" permite AirDrop para o portátil).
async function guardarFicheiro(bytes, nome, tipo = 'application/octet-stream') {
  const f = new File([bytes], nome, { type: tipo });
  if (navigator.canShare?.({ files: [f] })) {
    try { await navigator.share({ files: [f], title: nome }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  baixarFicheiro(nome, bytes, tipo);
  return true;
}

export function blocoBackup(alvo, recarregar) {
  const dias = diasDesdeBackup();
  alvo.innerHTML = html`<h3>Backup</h3>
    <p class="ajuda">Os dados existem <strong>apenas neste dispositivo</strong>. O backup é <strong>um único ficheiro</strong> com a base de dados
      e as fotografias, <strong>encriptado com uma palavra-passe tua</strong> (AES-256). Guarda-o no portátil (AirDrop, cabo ou Ficheiros).</p>
    <p class="${dias == null || dias > cfgLembreteBackup() ? 'txt-alerta' : ''}">${dias == null ? '⚠ Ainda não fizeste nenhum backup.' : `Último backup: há ${dias} dia(s) (${data(def('ultimo_backup').slice(0, 10))}).`}</p>
    <div class="botoes">
      <button class="btn" id="bk-criar">🔐 Criar backup encriptado</button>
      <label class="btn btn-sec">Restaurar backup<input type="file" id="bk-restaurar" hidden></label>
    </div>
    ${campo('bk_lembrete', 'Lembrar no painel se não houver backup há mais de (dias)', { tipo: 'number', valor: cfgLembreteBackup() })}
    <p class="ajuda" id="armazenamento"></p>
    <p class="ajuda">Para passar os dados do iPhone para o portátil (ou ao contrário): cria o backup num e restaura-o no outro. Restaurar SUBSTITUI tudo no destino.</p>`;

  alvo.querySelector('[name="bk_lembrete"]').onchange = (e) => {
    const n = Math.round(+String(e.target.value).replace(',', '.'));
    if (!(n >= 1 && n <= 90)) return aviso('Entre 1 e 90 dias.', 'erro');
    gravarDefinicao('backup_lembrete_dias', n);
    aviso('Guardado.');
  };

  alvo.querySelector('#bk-criar').onclick = () =>
    dialogo('Criar backup encriptado', html`
      <p class="ajuda">Escolhe uma palavra-passe forte (mín. 8 caracteres). <strong>Se a perderes, o backup não pode ser recuperado</strong> — nem por mim.</p>
      ${campo('pw', 'Palavra-passe', { tipo: 'password', attrs: 'autocomplete="new-password"' })}
      ${campo('pw2', 'Repetir palavra-passe', { tipo: 'password', attrs: 'autocomplete="new-password"' })}`, {
      textoOk: 'Criar backup',
      onSubmit(form) {
        const pw = form.pw.value;
        if (pw.length < 8) return aviso('A palavra-passe tem de ter pelo menos 8 caracteres.', 'erro'), false;
        if (pw !== form.pw2.value) return aviso('As palavras-passe não coincidem.', 'erro'), false;
        aviso('A criar backup…', 'info');
        criarBackup(pw).then(async ({ bytes, nFotos }) => {
          const ok = await guardarFicheiro(bytes, `treino-backup-${hojeISO()}.treino`);
          if (!ok) return;
          registarBackupFeito();
          aviso(`Backup criado (${num(bytes.length / 1048576, 1)} MB, ${nFotos} fotografia(s)).`);
          recarregar?.();
        }).catch((e) => aviso(e.message, 'erro'));
      },
    });

  alvo.querySelector('#bk-restaurar').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (!ehBackupEncriptado(bytes)) {
      // Compatibilidade: backups antigos .sqlite (sem fotografias, sem encriptação).
      if (!(await confirmar('Este ficheiro parece um backup antigo (.sqlite, sem fotografias). Restaurar SUBSTITUI todos os dados deste dispositivo. Continuar?', { textoOk: 'Substituir' }))) return;
      try { await importarBytes(bytes); aviso('Backup restaurado.'); setTimeout(() => location.reload(), 600); } catch (err) { aviso(err.message, 'erro'); }
      return;
    }
    dialogo('Restaurar backup', html`${campo('pw', 'Palavra-passe do backup', { tipo: 'password', attrs: 'autocomplete="off"' })}
      <p class="ajuda">Restaurar <strong>substitui todos os dados</strong> deste dispositivo (clientes, sessões, fotografias…).</p>`, {
      textoOk: 'Desencriptar',
      onSubmit(form) {
        lerBackup(bytes, form.pw.value).then(async (bk) => {
          const ok = await confirmar(`Backup de ${new Date(bk.cab.criado).toLocaleString('pt-PT')} com ${bk.fotos.length} fotografia(s). Substituir TODOS os dados atuais?`, { textoOk: 'Substituir tudo' });
          if (!ok) return;
          await restaurarBackup(bk);
          aviso('Backup restaurado. A recarregar…');
          setTimeout(() => location.reload(), 800);
        }).catch((err) => aviso(err.message, 'erro'));
      },
    });
  };

  // Espaço ocupado e persistência.
  (async () => {
    const p = await navigator.storage?.persisted?.();
    const est = await navigator.storage?.estimate?.();
    alvo.querySelector('#armazenamento').textContent = [
      est?.usage != null ? `Espaço usado: ${num(est.usage / 1048576, 1)} MB.` : '',
      p ? '✓ Armazenamento persistente ativo.' : 'Armazenamento persistente não confirmado — no iPhone, usa sempre a app a partir do ícone no ecrã principal.',
      `Versão da app: ${VERSAO_APP}.`,
    ].filter(Boolean).join(' ');
  })();
}

// ---------------------------------------------------------------- PIN da app
export function blocoPinApp(alvo, recarregar) {
  const c = def('bloqueio_app') || {};
  alvo.innerHTML = html`<h3>Bloqueio da app (PIN)</h3>
    <p class="ajuda">Pede um PIN ao abrir a app e depois de algum tempo em segundo plano. Evita acessos casuais se alguém pegar no telemóvel.
      Não substitui o código de bloqueio do iPhone, que é o que encripta os dados no dispositivo.</p>
    <p>${bloqueioAtivo() ? `✓ Ativo · volta a pedir após ${c.minutos ?? 5} min em segundo plano.` : 'Desativado.'}</p>
    <div class="botoes">
      <button class="btn btn-sec" id="pa-definir">${c.hash ? 'Alterar PIN' : 'Definir PIN'}</button>
      ${c.hash ? html`<button class="btn btn-sec" id="pa-alternar">${c.ativo ? 'Desativar' : 'Ativar'}</button>` : ''}
    </div>`;
  alvo.querySelector('#pa-definir').onclick = () =>
    dialogo('PIN da app', html`${campo('pin', 'Novo PIN (4–6 dígitos)', { tipo: 'password', attrs: 'inputmode="numeric" maxlength="6" autocomplete="new-password"' })}
      ${campo('pin2', 'Repetir PIN', { tipo: 'password', attrs: 'inputmode="numeric" maxlength="6" autocomplete="new-password"' })}
      ${campo('minutos', 'Voltar a pedir após (minutos em segundo plano)', { tipo: 'select', valor: c.minutos ?? 5, opcoes: [[1, '1'], [5, '5'], [15, '15'], [30, '30'], [60, '60']] })}
      <p class="ajuda">Usa um PIN diferente do PIN do modo cliente.</p>`, {
      onSubmit(form) {
        if (!pinValido(form.pin.value)) return aviso('O PIN tem de ter 4 a 6 dígitos.', 'erro'), false;
        if (form.pin.value !== form.pin2.value) return aviso('Os PIN não coincidem.', 'erro'), false;
        gravarPin('bloqueio_app', form.pin.value, { ativo: true, minutos: +form.minutos.value }).then(() => { aviso('PIN da app ativo.'); recarregar?.(); });
      },
    });
  alvo.querySelector('#pa-alternar')?.addEventListener('click', () => {
    gravarDefinicao('bloqueio_app', { ...c, ativo: !c.ativo });
    recarregar?.();
  });
}

// ---------------------------------------------------------------- Conservação de dados (RGPD)
export const cfgConservacao = () => def('conservacao_meses') ?? 24;

// Clientes inativos cuja última atividade (sessão, avaliação ou criação) é mais antiga que o prazo.
export function clientesAForaDePrazo() {
  const limite = somarDias(hojeISO(), -Math.round(cfgConservacao() * 30.44));
  return todos(
    `SELECT c.id, c.nome, MAX(COALESCE((SELECT MAX(data) FROM sessoes s WHERE s.cliente_id = c.id), ''),
         COALESCE((SELECT MAX(data) FROM avaliacoes a WHERE a.cliente_id = c.id), ''), substr(c.atualizado_em, 1, 10)) AS ultima
     FROM clientes c WHERE c.ativo = 0 GROUP BY c.id`
  ).filter((c) => c.ultima < limite);
}

export function blocoConservacao(alvo, recarregar) {
  const lista = clientesAForaDePrazo();
  alvo.innerHTML = html`<h3>Conservação de dados (RGPD)</h3>
    <p class="ajuda">Os dados de ex-clientes não devem ser guardados para sempre. Define um prazo; os clientes <strong>inativos</strong> sem atividade
      há mais tempo aparecem aqui para exportares (se o titular pedir) e apagares.</p>
    ${campo('meses', 'Prazo de conservação após a última atividade (meses)', { tipo: 'number', valor: cfgConservacao() })}
    ${lista.length ? html`<ul class="lista lista-simples">${lista.map((c) => html`<li><div><strong>${c.nome}</strong><div class="ajuda">Última atividade: ${data(c.ultima)}</div></div>
        <div class="botoes"><button class="btn btn-sec btn-peq" data-exp="${c.id}">Exportar</button><a class="btn btn-perigo btn-peq" href="#/cliente/${c.id}">Apagar…</a></div></li>`)}</ul>`
      : html`<p class="ajuda">✓ Nenhum cliente fora do prazo.</p>`}`;
  alvo.querySelector('[name="meses"]').onchange = (e) => {
    const n = Math.round(+e.target.value);
    if (!(n >= 6 && n <= 120)) return aviso('Entre 6 e 120 meses.', 'erro');
    gravarDefinicao('conservacao_meses', n);
    recarregar?.();
  };
  alvo.querySelectorAll('[data-exp]').forEach((b) => (b.onclick = () => dialogoExportarCliente(+b.dataset.exp, lista.find((c) => c.id === +b.dataset.exp).nome)));
}

// ---------------------------------------------------------------- Exportar dados de um cliente
export function dialogoExportarCliente(clienteId, nome) {
  dialogo('Exportar dados do cliente (RGPD)', html`
    <p>Ficheiro JSON com <strong>todos</strong> os dados pessoais de ${nome}: ficha, consentimentos, lesões, avaliações, planos, sessões,
      pacotes, pagamentos, check-ins, metas e notas. Serve o direito de acesso e de portabilidade.</p>
    ${campo('fotos', 'Incluir fotografias (ficheiro maior)', { tipo: 'checkbox', valor: false })}
    <p class="ajuda">Entrega-o ao titular por um meio seguro (em mão, ou por email com ficheiro protegido). O ficheiro não vai encriptado.</p>`, {
    textoOk: 'Exportar',
    onSubmit(form) {
      const fotos = form.fotos.checked;
      exportarDadosCliente(clienteId, { incluirFotos: fotos }).then((bytes) => {
        const base = nome.replace(/\(.*?\)/g, '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
        return guardarFicheiro(bytes, `dados-${base}-${hojeISO()}.json`, 'application/json');
      }).then((ok) => ok && aviso('Dados exportados.')).catch((e) => aviso(e.message, 'erro'));
    },
  });
}
