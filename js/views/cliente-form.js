// Criar / editar cliente (dados base, perfil de treino, variantes dos testes, consentimentos iniciais).
import { obterCliente, guardarCliente, def } from '../repo.js';
import { inserir, transacao } from '../db.js';
import { TESTES_FORCA, TESTES_AEROBIOS, TIPOS_CONSENTIMENTO, variantesPorDefeito } from '../catalogos.js';
import { html, raw, Validador, mostrarErros, lerForm, aviso, hojeISO } from '../util.js';
import { cabecalho, campo } from './ui.js';
import { ir } from '../app.js';

export function vistaClienteForm(el, { id }) {
  const c = id ? obterCliente(+id) : null;
  if (id && !c) return ir('/clientes');
  const v = c?.variantes || variantesPorDefeito();

  el.innerHTML = html`
    ${cabecalho(c ? 'Editar cliente' : 'Novo cliente', { voltar: c ? `/cliente/${c.id}` : '/clientes' })}
    <form id="form" novalidate class="form">
      <fieldset><legend>Dados base</legend>
        ${campo('nome', 'Nome *', { valor: c?.nome, attrs: 'autocomplete="off" required' })}
        <div class="grelha-2">
          ${campo('data_nascimento', 'Data de nascimento *', { tipo: 'date', valor: c?.data_nascimento, ajuda: 'Usada para a idade e a FC máx. estimada.' })}
          ${campo('sexo', 'Sexo', { tipo: 'select', valor: c?.sexo, opcoes: [['', '—'], ['F', 'Feminino'], ['M', 'Masculino'], ['O', 'Outro']] })}
        </div>
        <div class="grelha-2">
          ${campo('telemovel', 'Telemóvel', { tipo: 'tel', valor: c?.telemovel, ajuda: 'Para o link do WhatsApp. Ex.: 912 345 678' })}
          ${campo('email', 'Email', { tipo: 'email', valor: c?.email })}
        </div>
        ${campo('objetivos', 'Objetivos', { tipo: 'textarea', valor: c?.objetivos })}
        <div class="grelha-2">
          ${campo('disponibilidade', 'Disponibilidade semanal', { valor: c?.disponibilidade, ajuda: 'Ex.: Seg e Qua 7h–9h; Sáb manhã' })}
          ${campo('frequencia_semanal', 'Sessões/semana combinadas', { tipo: 'number', valor: c?.frequencia_semanal ?? 2 })}
        </div>
      </fieldset>

      <fieldset><legend>Perfil de treino</legend>
        <p class="ajuda">Ativa os módulos respetivos na ficha, na baseline e nos planos.</p>
        ${campo('perfil_forca', 'Força', { tipo: 'checkbox', valor: c ? c.perfil_forca : true })}
        ${campo('perfil_resistencia', 'Resistência (corrida, remo, bike, Hyrox)', { tipo: 'checkbox', valor: c?.perfil_resistencia })}
        <div class="grelha-2">
          ${campo('intervalo_reavaliacao_semanas', 'Reavaliar a cada (semanas)', { tipo: 'number', valor: c?.intervalo_reavaliacao_semanas ?? 5, ajuda: 'Por defeito 4 a 6.' })}
        </div>
      </fieldset>

      <fieldset id="fs-forca"><legend>Variantes dos testes de força</legend>
        <p class="ajuda">A variante fica guardada e é usada em todas as reavaliações. Mudar de variante impede comparações diretas.</p>
        <div class="campo"><label>Potência</label>
          ${['pot_horizontal', 'pot_vertical'].map(
            (p) => html`<label class="campo-check"><input type="checkbox" name="pot_${p}" ${v.potencia?.includes(p) ? raw('checked') : ''}> ${TESTES_FORCA.find((t) => t.id === p).nome}</label>`
          )}
        </div>
        <div class="grelha-2">
          ${TESTES_FORCA.filter((t) => t.variantes).map((t) =>
            campo(`var_${t.id}`, t.nome, { tipo: 'select', valor: v[t.id], opcoes: [['', '— não testar —'], ...t.variantes.map((x) => [x.nome, x.nome])] })
          )}
        </div>
        ${campo('mostrar_assimetria_cliente', 'Mostrar a assimetria ao cliente (modo cliente e PDF, com texto neutro)', { tipo: 'checkbox', valor: c?.mostrar_assimetria_cliente })}
      </fieldset>

      <fieldset id="fs-resist"><legend>Resistência</legend>
        ${campo('teste_aerobio', 'Teste aeróbio principal (mantém-se nas reavaliações)', {
          tipo: 'select', valor: c?.teste_aerobio,
          opcoes: [['', '— escolher —'], ...Object.entries(TESTES_AEROBIOS).map(([k, x]) => [k, x.nome])],
        })}
      </fieldset>

      ${c ? '' : html`<fieldset><legend>Consentimentos (RGPD)</legend>
        <p class="ajuda">Regista apenas o que o cliente consentiu de forma explícita (idealmente por escrito). Sem consentimento de dados de saúde não é possível registar a baseline.</p>
        ${Object.entries(TIPOS_CONSENTIMENTO).map(([k, t]) => campo(`cons_${k}`, t, { tipo: 'checkbox' }))}
        ${campo('cons_forma', 'Forma', { tipo: 'select', valor: 'papel', opcoes: [['papel', 'Papel assinado'], ['digital', 'Digital'], ['verbal', 'Verbal (pouco recomendado)']] })}
      </fieldset>`}

      <fieldset><legend>Notas privadas</legend>
        ${campo('notas_privadas', 'Só para ti — nunca aparecem no modo cliente nem nos PDF', { tipo: 'textarea', valor: c?.notas_privadas })}
        ${c ? campo('ativo', 'Cliente ativo', { tipo: 'checkbox', valor: c.ativo }) : ''}
      </fieldset>

      <div class="barra-acoes"><button class="btn btn-grande" type="submit">Guardar</button></div>
    </form>`;

  const form = el.querySelector('#form');
  const atualizarSeccoes = () => {
    form.querySelector('#fs-forca').hidden = !form.perfil_forca.checked;
    form.querySelector('#fs-resist').hidden = !form.perfil_resistencia.checked;
  };
  form.perfil_forca.onchange = form.perfil_resistencia.onchange = atualizarSeccoes;
  atualizarSeccoes();

  form.onsubmit = (ev) => {
    ev.preventDefault();
    const f = lerForm(form);
    const val = new Validador();
    const dados = {
      nome: val.texto('nome', f.nome, { obrigatorio: true, max: 120, nome: 'Nome' }),
      data_nascimento: val.data('data_nascimento', f.data_nascimento, { obrigatorio: true, nome: 'Data de nascimento' }),
      sexo: f.sexo || null,
      telemovel: val.texto('telemovel', f.telemovel, { max: 20 }),
      email: val.texto('email', f.email, { max: 120 }),
      objetivos: val.texto('objetivos', f.objetivos),
      disponibilidade: val.texto('disponibilidade', f.disponibilidade, { max: 300 }),
      frequencia_semanal: val.numero('frequencia_semanal', f.frequencia_semanal, { min: 1, max: 7, inteiro: true, nome: 'Sessões/semana' }),
      perfil_forca: f.perfil_forca,
      perfil_resistencia: f.perfil_resistencia,
      intervalo_reavaliacao_semanas: val.numero('intervalo_reavaliacao_semanas', f.intervalo_reavaliacao_semanas, { min: 2, max: 16, inteiro: true, obrigatorio: true, nome: 'Intervalo' }),
      teste_aerobio: f.perfil_resistencia ? f.teste_aerobio || null : c?.teste_aerobio ?? null,
      mostrar_assimetria_cliente: f.mostrar_assimetria_cliente,
      notas_privadas: val.texto('notas_privadas', f.notas_privadas, { max: 5000 }),
      variantes: {
        potencia: ['pot_horizontal', 'pot_vertical'].filter((p) => f[`pot_${p}`]),
        ...Object.fromEntries(TESTES_FORCA.filter((t) => t.variantes).map((t) => [t.id, f[`var_${t.id}`] || null])),
      },
    };
    if (c) dados.ativo = f.ativo;
    if (dados.data_nascimento) {
      const anos = new Date().getFullYear() - +dados.data_nascimento.slice(0, 4);
      if (anos < 12 || anos > 100) val.erro('data_nascimento', 'Idade fora do intervalo plausível (12 a 100 anos).');
    }
    if (dados.telemovel && !/^\+?[\d\s]{9,16}$/.test(dados.telemovel)) val.erro('telemovel', 'Telemóvel inválido (só dígitos, espaços e + opcional).');
    if (dados.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dados.email)) val.erro('email', 'Email inválido.');
    if (!dados.perfil_forca && !dados.perfil_resistencia) val.erro('perfil_forca', 'Escolhe pelo menos um perfil (força e/ou resistência).');
    if (!val.ok) return mostrarErros(form, val.erros);

    const novoId = transacao(() => {
      const cid = guardarCliente(dados, c?.id);
      if (!c) {
        for (const tipo of Object.keys(TIPOS_CONSENTIMENTO))
          if (f[`cons_${tipo}`])
            inserir('consentimentos', { cliente_id: cid, tipo, concedido: 1, data: hojeISO(), forma: f.cons_forma, versao_texto: def('versao_consentimento') });
      }
      return cid;
    });
    aviso('Cliente guardado.');
    ir(`/cliente/${novoId}`);
  };
}
