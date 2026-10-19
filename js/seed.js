// Biblioteca inicial (padrões e exercícios) e dados de exemplo (3 clientes fictícios).
import { todos, escalar, inserir, transacao, executar, lerDefinicao, gravarDefinicao, gravarAgora } from './db.js';
import { guardarAvaliacao, guardarCliente } from './repo.js';
import {
  criarPlano, adicionarSessao, adicionarExercicioPlano, gravarPrescricao, preencherSemanasVazias, definirEstado,
  duplicarPlano, atualizarPlano, definirSemana,
} from './repo-planos.js';
import { registarSessao } from './repo-sessoes.js';
import { guardarTipoPacote, guardarPacote, guardarPagamento } from './repo-pacotes.js';
import { agendar, remarcar } from './repo-agenda.js';
import { adicionarFoto } from './repo-fotos.js';

const PADROES = [
  'Joelho dominante', 'Anca dominante', 'Empurrar horizontal', 'Empurrar vertical', 'Puxar horizontal',
  'Puxar vertical', 'Unilateral membros inferiores', 'Pliometria / saltos', 'Transporte (carry)', 'Core',
  'Corrida / impacto', 'Ergómetros sem impacto',
];

// [nome, categoria, grupo muscular, padrão (ou null), notas técnicas]
const EXERCICIOS = [
  ['Agachamento livre', 'força', 'Quadríceps', 'Joelho dominante', 'Barra alta/baixa; profundidade consistente entre testes.'],
  ['Agachamento frontal', 'força', 'Quadríceps', 'Joelho dominante', ''],
  ['Agachamento goblet', 'força', 'Quadríceps', 'Joelho dominante', ''],
  ['Leg press', 'força', 'Quadríceps', 'Joelho dominante', ''],
  ['Wall balls', 'resistência', 'Corpo inteiro', 'Joelho dominante', 'Estação Hyrox.'],
  ['RDL', 'força', 'Posterior / glúteos', 'Anca dominante', 'Coluna neutra; amplitude até perder a neutralidade.'],
  ['Peso morto convencional', 'força', 'Posterior / glúteos', 'Anca dominante', ''],
  ['Good morning', 'força', 'Posterior / glúteos', 'Anca dominante', ''],
  ['Kettlebell swing', 'potência', 'Posterior / glúteos', 'Anca dominante', ''],
  ['Hip thrust', 'força', 'Posterior / glúteos', null, ''],
  ['Ponte de glúteos', 'força', 'Posterior / glúteos', null, ''],
  ['Curl femoral', 'força', 'Posterior / glúteos', null, ''],
  ['Supino com barra', 'força', 'Peito', 'Empurrar horizontal', ''],
  ['Supino com halteres', 'força', 'Peito', 'Empurrar horizontal', ''],
  ['Supino inclinado com halteres', 'força', 'Peito', 'Empurrar horizontal', ''],
  ['Flexões', 'força', 'Peito', 'Empurrar horizontal', ''],
  ['Press militar', 'força', 'Ombros', 'Empurrar vertical', ''],
  ['Press de ombros com halteres', 'força', 'Ombros', 'Empurrar vertical', ''],
  ['Landmine press', 'força', 'Ombros', null, 'Alternativa ao overhead com menor exigência de mobilidade do ombro.'],
  ['Remada com barra', 'força', 'Costas', 'Puxar horizontal', ''],
  ['Remada com halteres', 'força', 'Costas', 'Puxar horizontal', ''],
  ['Remada invertida', 'força', 'Costas', 'Puxar horizontal', ''],
  ['Remada sentada no cabo', 'força', 'Costas', 'Puxar horizontal', ''],
  ['Pull-up', 'força', 'Costas', 'Puxar vertical', ''],
  ['Puxada na polia', 'força', 'Costas', 'Puxar vertical', ''],
  ['Agachamento búlgaro', 'força', 'Quadríceps', 'Unilateral membros inferiores', 'Mesma altura de banco e distância em todos os testes.'],
  ['Step-up com carga', 'força', 'Quadríceps', 'Unilateral membros inferiores', 'Mesma altura de caixa em todos os testes.'],
  ['Afundo reverso', 'força', 'Quadríceps', 'Unilateral membros inferiores', ''],
  ['Sandbag lunges', 'resistência', 'Quadríceps', 'Unilateral membros inferiores', 'Estação Hyrox.'],
  ['Salto horizontal', 'potência', 'Corpo inteiro', 'Pliometria / saltos', ''],
  ['Salto vertical (CMJ)', 'potência', 'Corpo inteiro', 'Pliometria / saltos', ''],
  ['Saltos para caixa', 'potência', 'Corpo inteiro', 'Pliometria / saltos', ''],
  ['Burpee broad jump', 'resistência', 'Corpo inteiro', 'Pliometria / saltos', 'Estação Hyrox.'],
  ['Farmers carry', 'resistência', 'Corpo inteiro', 'Transporte (carry)', 'Estação Hyrox.'],
  ['Sled push', 'resistência', 'Corpo inteiro', 'Transporte (carry)', 'Estação Hyrox.'],
  ['Sled pull', 'resistência', 'Corpo inteiro', 'Transporte (carry)', 'Estação Hyrox.'],
  ['Prancha', 'core', 'Core', 'Core', ''],
  ['Pallof press', 'core', 'Core', 'Core', ''],
  ['Dead bug', 'core', 'Core', 'Core', ''],
  ['Corrida contínua', 'resistência', 'Cardio', 'Corrida / impacto', ''],
  ['Intervalos de corrida', 'resistência', 'Cardio', 'Corrida / impacto', ''],
  ['Remo ergómetro', 'resistência', 'Cardio', 'Ergómetros sem impacto', 'Estação Hyrox.'],
  ['SkiErg', 'resistência', 'Cardio', 'Ergómetros sem impacto', 'Estação Hyrox.'],
  ['Bike', 'resistência', 'Cardio', 'Ergómetros sem impacto', ''],
];

// Exercícios registados por duração/zona/ritmo (e unidade do ritmo).
const REGISTO_RESISTENCIA = {
  'Corrida contínua': 'km', 'Intervalos de corrida': 'km', 'Remo ergómetro': '500m', SkiErg: '500m', Bike: null,
};

const ALTERNATIVAS = {
  'Agachamento livre': ['Agachamento goblet', 'Leg press', 'Agachamento frontal'],
  'Agachamento frontal': ['Agachamento goblet', 'Leg press'],
  RDL: ['Hip thrust', 'Ponte de glúteos', 'Curl femoral', 'Kettlebell swing'],
  'Peso morto convencional': ['RDL', 'Hip thrust'],
  'Good morning': ['Hip thrust', 'Ponte de glúteos'],
  'Supino com barra': ['Supino com halteres', 'Flexões'],
  'Supino com halteres': ['Flexões', 'Supino inclinado com halteres'],
  'Press militar': ['Landmine press', 'Press de ombros com halteres'],
  'Press de ombros com halteres': ['Landmine press'],
  'Remada com barra': ['Remada com halteres', 'Remada sentada no cabo', 'Remada invertida'],
  'Pull-up': ['Puxada na polia', 'Remada invertida'],
  'Agachamento búlgaro': ['Step-up com carga', 'Afundo reverso', 'Leg press'],
  'Step-up com carga': ['Afundo reverso', 'Leg press'],
  'Saltos para caixa': ['Kettlebell swing'],
  'Corrida contínua': ['Bike', 'Remo ergómetro'],
  'Intervalos de corrida': ['Bike', 'SkiErg', 'Remo ergómetro'],
};

// Corre uma única vez por base de dados (mesmo que depois apagues exercícios).
export function garantirBiblioteca() {
  if (lerDefinicao('biblioteca_inicial')) return;
  transacao(() => {
    for (const p of PADROES) executar('INSERT OR IGNORE INTO padroes_movimento (nome) VALUES (?)', [p]);
    const pid = Object.fromEntries(todos('SELECT id, nome FROM padroes_movimento').map((p) => [p.nome, p.id]));
    for (const [nome, categoria, grupo, padrao, notas] of EXERCICIOS) {
      const resist = nome in REGISTO_RESISTENCIA;
      executar(
        'INSERT OR IGNORE INTO exercicios (nome, categoria, grupo_muscular, padrao_id, notas_tecnicas, tipo_registo, unidade_ritmo) VALUES (?,?,?,?,?,?,?)',
        [nome, categoria, grupo, padrao ? pid[padrao] : null, notas || null, resist ? 'resistencia' : 'forca', resist ? REGISTO_RESISTENCIA[nome] : null]
      );
    }
    const eid = Object.fromEntries(todos('SELECT id, nome FROM exercicios').map((e) => [e.nome, e.id]));
    for (const [ex, alts] of Object.entries(ALTERNATIVAS))
      for (const a of alts) executar('INSERT OR IGNORE INTO exercicio_alternativas VALUES (?, ?)', [eid[ex], eid[a]]);
    gravarDefinicao('biblioteca_inicial', true);
  });
}

// ---------------------------------------------------------------- Dados de exemplo
const diasAtras = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const padrao = (nome) => escalar('SELECT id FROM padroes_movimento WHERE nome = ?', [nome]);
const exercicio = (nome) => escalar('SELECT id FROM exercicios WHERE nome = ?', [nome]);
const consentir = (cid, tipos, dias) =>
  tipos.forEach((tipo) => inserir('consentimentos', { cliente_id: cid, tipo, concedido: 1, data: diasAtras(dias), forma: 'papel', versao_texto: 'v1 (16/10/2026)' }));
const per = (cintura, anca, peito, braco, coxa, gemeo) => [
  { perimetro: 'Cintura', lado: null, valor_cm: cintura },
  { perimetro: 'Anca', lado: null, valor_cm: anca },
  { perimetro: 'Peito', lado: null, valor_cm: peito },
  { perimetro: 'Braço (relaxado)', lado: 'esq', valor_cm: braco[0] },
  { perimetro: 'Braço (relaxado)', lado: 'dir', valor_cm: braco[1] },
  { perimetro: 'Coxa', lado: 'esq', valor_cm: coxa[0] },
  { perimetro: 'Coxa', lado: 'dir', valor_cm: coxa[1] },
  { perimetro: 'Gémeo', lado: 'esq', valor_cm: gemeo[0] },
  { perimetro: 'Gémeo', lado: 'dir', valor_cm: gemeo[1] },
];
const t = (teste, variante, carga_kg, reps, lado = null, qualidade = 2) => ({ teste, variante, carga_kg, reps, lado, qualidade });
const salto = (teste, tentativas) => ({ teste, tentativas, qualidade: 2 });

// Assíncrona por causa das fotografias de exemplo (gravadas no IndexedDB depois da transação).
export async function carregarDadosExemplo() {
  garantirBiblioteca();
  const ids = transacao(() => {
    // 1) Ana — força
    const ana = guardarCliente({
      nome: 'Ana Ribeiro (exemplo)', data_nascimento: '1991-03-12', sexo: 'F', telemovel: '912345678',
      objetivos: 'Ganhar força e agachar 80 kg até ao verão. Melhorar a composição corporal.',
      disponibilidade: 'Seg, Qua e Sex 7h–8h', frequencia_semanal: 3, perfil_forca: 1, perfil_resistencia: 0,
      intervalo_reavaliacao_semanas: 5, mostrar_assimetria_cliente: 0,
      variantes: { potencia: ['pot_horizontal', 'pot_vertical'], joelho: 'Agachamento livre', anca: 'RDL', empurrar: 'Supino com barra', puxar: 'Pull-up', unilateral: 'Agachamento búlgaro' },
      notas_privadas: 'Trabalha por turnos — sono irregular em semanas de noite.',
    });
    consentir(ana, ['dados_saude', 'fotografias', 'partilha_whatsapp'], 72);
    const lAna = inserir('lesoes', { cliente_id: ana, zona: 'Ombro', lado: 'esq', descricao: 'Dor anterior em overhead', data_inicio: diasAtras(50), estado: 'em_recuperacao', notas: 'Seguida por fisioterapeuta.' });
    inserir('contraindicacoes', { cliente_id: ana, lesao_id: lAna, padrao_id: padrao('Empurrar vertical'), nivel: 'adaptar', notas: 'Sem carga acima da cabeça até alta da fisio.' });
    guardarAvaliacao(ana, {
      tipo: 'baseline', data: diasAtras(70), notas: 'Primeira avaliação.',
      composicao: { modelo_balanca: 'Tanita (exemplo)', hora: '07:15', condicoes_padronizadas: 1, peso_kg: 62.0, massa_gorda_pct: 27.5, massa_gorda_kg: 17.1, massa_magra_kg: 42.8, agua_pct: 51.0, gordura_visceral: 4 },
      perimetros: per(74, 99, 88, [27.5, 28], [56, 56.5], [35, 35.5]),
      testes: [
        salto('pot_horizontal', [175, 180, 178]), salto('pot_vertical', [28, 30, 29]),
        t('joelho', 'Agachamento livre', 60, 6), t('anca', 'RDL', 65, 8), t('empurrar', 'Supino com barra', 37.5, 6),
        t('puxar', 'Pull-up', null, 2), t('unilateral', 'Agachamento búlgaro', 14, 8, 'esq'), t('unilateral', 'Agachamento búlgaro', 16, 8, 'dir'),
      ],
    });
    guardarAvaliacao(ana, {
      tipo: 'reavaliacao', data: diasAtras(33),
      composicao: { modelo_balanca: 'Tanita (exemplo)', hora: '07:20', condicoes_padronizadas: 1, peso_kg: 61.2, massa_gorda_pct: 26.1, massa_gorda_kg: 16.0, massa_magra_kg: 43.0, agua_pct: 51.8, gordura_visceral: 4 },
      perimetros: per(72.5, 98, 88, [28, 28.5], [56.5, 57], [35, 35.5]),
      testes: [
        salto('pot_horizontal', [183, 186, 185]), salto('pot_vertical', [31, 32, 30]),
        t('joelho', 'Agachamento livre', 67.5, 6), t('anca', 'RDL', 72.5, 7), t('empurrar', 'Supino com barra', 40, 6),
        t('puxar', 'Pull-up', null, 4), t('unilateral', 'Agachamento búlgaro', 16, 8, 'esq'), t('unilateral', 'Agachamento búlgaro', 17, 8, 'dir'),
      ],
    });

    // 2) Bruno — resistência
    const bruno = guardarCliente({
      nome: 'Bruno Matos (exemplo)', data_nascimento: '1984-07-02', sexo: 'M', telemovel: '936123456',
      objetivos: 'Baixar os 10 km para menos de 47 min. Correr sem dor no tendão.',
      disponibilidade: 'Ter e Qui 19h; Dom manhã', frequencia_semanal: 3, perfil_forca: 0, perfil_resistencia: 1,
      teste_aerobio: 'corrida_3km', intervalo_reavaliacao_semanas: 5, variantes: {},
    });
    consentir(bruno, ['dados_saude', 'partilha_whatsapp'], 45);
    const lBruno = inserir('lesoes', { cliente_id: bruno, zona: 'Tendão de Aquiles', lado: 'dir', descricao: 'Tendinopatia — dor matinal', data_inicio: diasAtras(30), estado: 'ativa' });
    inserir('contraindicacoes', { cliente_id: bruno, lesao_id: lBruno, padrao_id: padrao('Pliometria / saltos'), nivel: 'evitar', notas: 'Sem saltos até dor ≤ 2/10.' });
    inserir('contraindicacoes', { cliente_id: bruno, lesao_id: lBruno, exercicio_id: exercicio('Intervalos de corrida'), nivel: 'adaptar', notas: 'Intervalos só em bike ou remo.' });
    guardarAvaliacao(bruno, {
      tipo: 'baseline', data: diasAtras(40),
      composicao: { modelo_balanca: 'Tanita (exemplo)', hora: '18:30', condicoes_padronizadas: 0, peso_kg: 78.4, massa_gorda_pct: 18.2, massa_gorda_kg: 14.3, massa_magra_kg: 60.6 },
      perimetros: per(86, 98, 101, [31, 31.5], [57, 57], [38, 38.5]),
      resistencia: { fc_repouso: 58, teste: 'corrida_3km', tempo_seg: 825, fc_media: 168, fc_pico: 184, rpe: 9, fc_1min: 152 },
    });

    // 3) Carla — misto (força + resistência, Hyrox)
    const carla = guardarCliente({
      nome: 'Carla Sousa (exemplo)', data_nascimento: '1995-11-20', sexo: 'F', telemovel: '965432198',
      objetivos: 'Preparar o primeiro Hyrox (Open) e melhorar força de membros inferiores.',
      disponibilidade: 'Seg a Qui 12h30', frequencia_semanal: 4, perfil_forca: 1, perfil_resistencia: 1,
      teste_aerobio: 'remo_2km', intervalo_reavaliacao_semanas: 6, mostrar_assimetria_cliente: 1,
      variantes: { potencia: ['pot_horizontal'], joelho: 'Agachamento livre', anca: 'RDL', empurrar: 'Supino com halteres', puxar: 'Remada com halteres', unilateral: 'Step-up com carga' },
    });
    consentir(carla, ['dados_saude'], 25);
    inserir('lesoes', { cliente_id: carla, zona: 'Joelho', lado: 'dir', descricao: 'Entorse ligeira', data_inicio: '2025-02-10', estado: 'resolvida', data_resolucao: '2025-04-01' });
    const lCarla = inserir('lesoes', { cliente_id: carla, zona: 'Lombar', descricao: 'Desconforto após volume alto de wall balls', data_inicio: diasAtras(12), estado: 'ativa' });
    inserir('contraindicacoes', { cliente_id: carla, lesao_id: lCarla, exercicio_id: exercicio('Peso morto convencional'), nivel: 'evitar' });
    inserir('contraindicacoes', { cliente_id: carla, lesao_id: lCarla, padrao_id: padrao('Anca dominante'), nivel: 'adaptar', notas: 'Reduzir amplitude e carga; RPE ≤ 7.' });
    guardarAvaliacao(carla, {
      tipo: 'baseline', data: diasAtras(20),
      composicao: { modelo_balanca: 'Tanita (exemplo)', hora: '12:00', condicoes_padronizadas: 1, peso_kg: 66.5, massa_gorda_pct: 23.0, massa_gorda_kg: 15.3, massa_magra_kg: 48.5, agua_pct: 54.0, gordura_visceral: 3 },
      perimetros: per(70, 100, 90, [28, 28.5], [57, 58.5], [36, 36.5]),
      testes: [
        salto('pot_horizontal', [195, 201, 198]),
        t('joelho', 'Agachamento livre', 70, 5), t('anca', 'RDL', 80, 6), t('empurrar', 'Supino com halteres', 36, 8),
        t('puxar', 'Remada com halteres', 32, 12), t('unilateral', 'Step-up com carga', 20, 8, 'esq'), t('unilateral', 'Step-up com carga', 24, 8, 'dir'),
      ],
      resistencia: { fc_repouso: 54, teste: 'remo_2km', tempo_seg: 485, fc_media: 172, fc_pico: 186, rpe: 9, fc_1min: 160 },
    });

    const planos = carregarPlanosExemplo({ ana, bruno, carla });
    carregarSessoesExemplo({ ana, bruno, carla }, planos);
    return { ana, bruno, carla };
  });
  await carregarFotosExemplo(ids.ana);
  await gravarAgora();
}

// Fotografias FICTÍCIAS (silhueta desenhada) para a Ana, que tem consentimento de fotografias.
async function carregarFotosExemplo(clienteId) {
  const desenhar = (angulo, data, k) => new Promise((res) => {
    const cv = Object.assign(document.createElement('canvas'), { width: 480, height: 720 });
    const g = cv.getContext('2d');
    g.fillStyle = '#E9ECEF'; g.fillRect(0, 0, 480, 720);
    g.fillStyle = '#7A8899';
    const larg = 1 - k * 0.06; // a "cintura" estreita um pouco ao longo do tempo
    g.beginPath(); g.arc(240, 120, 55, 0, Math.PI * 2); g.fill();                       // cabeça
    g.beginPath(); g.ellipse(240, 330, (angulo === 'lado' ? 70 : 115) * larg, 150, 0, 0, Math.PI * 2); g.fill(); // tronco
    g.fillRect(angulo === 'lado' ? 215 : 175, 450, angulo === 'lado' ? 50 : 50, 230);   // pernas
    if (angulo !== 'lado') g.fillRect(255, 450, 50, 230);
    g.fillStyle = '#1F2933'; g.font = 'bold 30px sans-serif';
    g.fillText(`EXEMPLO · ${angulo}`, 24, 690); g.fillText(data.split('-').reverse().join('/'), 300, 50);
    cv.toBlob((b) => res(new File([b], `${angulo}.jpg`, { type: 'image/jpeg' })), 'image/jpeg', 0.85);
  });
  const datas = [diasAtras(70), diasAtras(33), diasAtras(5)];
  for (const [k, d] of datas.entries())
    for (const a of ['frente', 'lado', 'costas']) await adicionarFoto(clienteId, d, a, await desenhar(a, d, k));
}

// ---------------------------------------------------------------- Pacotes, pagamentos e sessões (Fase 3)
// As sessões são criadas pelas MESMAS funções da app (registarSessao), como se fossem registadas à mão.
function carregarSessoesExemplo({ ana, bruno, carla }, { pa, pb, pc }) {
  const t10 = guardarTipoPacote({ nome: 'Pack 10 sessões', sessoes: 10, validade_dias: 60, preco: 400 });
  const t20 = guardarTipoPacote({ nome: 'Pack 20 sessões', sessoes: 20, validade_dias: 120, preco: 720 });
  const t8 = guardarTipoPacote({ nome: 'Mensal 8 sessões', sessoes: 8, validade_dias: 31, preco: 280 });

  const pacote = (cliente_id, tipo, nome, sessoes, inicio, dias, preco) =>
    guardarPacote({ cliente_id, tipo_pacote_id: tipo, nome, sessoes_contratadas: sessoes, data_inicio: diasAtras(inicio), data_validade: diasAtras(inicio - dias), preco });
  const pkA = pacote(ana, t10, 'Pack 10 sessões', 10, 28, 60, 400);
  const pkB = pacote(bruno, t8, 'Mensal 8 sessões', 8, 24, 31, 280);
  const pkC = pacote(carla, t20, 'Pack 20 sessões', 20, 10, 120, 720);
  guardarPagamento({ cliente_id: ana, pacote_id: pkA, data: diasAtras(28), valor: 400, metodo: 'MB WAY', estado: 'pago' });
  guardarPagamento({ cliente_id: bruno, pacote_id: pkB, data: diasAtras(24), valor: 280, metodo: 'Transferência', estado: 'pendente', notas: 'Paga no fim do mês' });
  guardarPagamento({ cliente_id: carla, pacote_id: pkC, data: diasAtras(10), valor: 720, metodo: 'Transferência', estado: 'pago' });

  const sessaoPlano = (planoId, nome) => todos('SELECT id FROM plano_sessoes WHERE plano_id = ? AND nome = ?', [planoId, nome])[0]?.id;
  const reg = (cliente_id, dias, hora, extra = {}) =>
    registarSessao({ cliente_id, data: diasAtras(dias), hora, duracao_min: 60, estado: 'realizada', tipo: 'livre', desconta_pacote: true, ...extra });
  const doPlano = (cliente_id, planoId, nome, semana, dias, hora, extra = {}) =>
    reg(cliente_id, dias, hora, { tipo: 'treino', plano_id: planoId, plano_sessao_id: sessaoPlano(planoId, nome), semana, ...extra });
  // Ajusta o realizado de uma série (exercício pelo nome, série n).
  const realizado = (sessaoId, exNome, n, campos) => {
    const cols = Object.keys(campos);
    executar(
      `UPDATE sessao_series SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE n = ? AND sessao_exercicio_id IN
       (SELECT x.id FROM sessao_exercicios x JOIN exercicios e ON e.id = x.exercicio_id WHERE x.sessao_id = ? AND e.nome = ?)`,
      [...cols.map((c) => campos[c]), n, sessaoId, exNome]
    );
  };
  const etiq = (sessao_id, etiqueta, exNome = null) =>
    inserir('sessao_etiquetas', {
      sessao_id, etiqueta,
      sessao_exercicio_id: exNome ? todos('SELECT x.id FROM sessao_exercicios x JOIN exercicios e ON e.id = x.exercicio_id WHERE x.sessao_id = ? AND e.nome = ?', [sessao_id, exNome])[0]?.id : null,
    });

  // Ana — 3 sessões livres antes do bloco + 5 do plano + 1 falta (não desconta) → restam 2 no pacote.
  for (const d of [25, 21, 18]) reg(ana, d, '07:00', { notas: 'Sessão técnica antes do bloco 2.' });
  doPlano(ana, pa, 'A — Inferiores', 1, 14, '07:00');
  doPlano(ana, pa, 'B — Superiores', 1, 12, '07:00');
  doPlano(ana, pa, 'C — Full body', 1, 10, '07:00');
  const anaA2 = doPlano(ana, pa, 'A — Inferiores', 2, 7, '07:00', { notas: 'Muito bem no agachamento — pronta para subir carga.' });
  [1, 2, 3].forEach((n) => realizado(anaA2, 'Agachamento livre', n, { reps: 8, rpe: 8 }));
  etiq(anaA2, 'subir carga na próxima', 'Agachamento livre');
  const anaB2 = doPlano(ana, pa, 'B — Superiores', 2, 5, '07:00');
  realizado(anaB2, 'Press militar', 3, { dor: 1, dor_local: 'ombro esquerdo', notas: 'Parou à 6.ª rep' , reps: 6 });
  etiq(anaB2, 'dor', 'Press militar');
  doPlano(ana, pa, 'C — Full body', 2, 3, '07:00', { estado: 'faltou', motivo_falta: 'Doente', desconta_pacote: false, duracao_min: null });

  // Bruno — pacote mensal quase no fim (alerta de renovação).
  for (const d of [20, 17, 13]) reg(bruno, d, '19:00', { notas: 'Corrida contínua leve.' });
  const brA = doPlano(bruno, pb, 'A — Contínuo', 1, 6, '19:00');
  realizado(brA, 'Corrida contínua', 1, { fc_media: 141, rpe: 4, distancia_m: 5100 });
  doPlano(bruno, pb, 'B — Intervalos', 1, 4, '19:00', { notas: 'Intervalos feitos em bike (tendão).' });
  doPlano(bruno, pb, 'C — Longo sem impacto', 1, 2, '09:00');

  // Carla — 1.ª sessão do bloco, com PR no agachamento (72,5 × 5 > baseline 70 × 5).
  const caA = doPlano(carla, pc, 'A — Força', 1, 3, '12:30', { notas: 'Boa sessão.' });
  realizado(caA, 'Agachamento livre', 4, { carga_kg: 72.5, reps: 5, rpe: 8.5 });
  etiq(caA, 'boa técnica', 'Agachamento livre');

  // ---- Fase 4: histórico para análise e gráficos ----
  // Ana — "Bloco 1" concluído (8 a 5 semanas atrás), com cargas mais baixas: dá tendência ao 1RM est.,
  // comparação entre blocos e um caso de ESTAGNAÇÃO no supino (40 kg × 6 em todos os registos).
  const pk0 = pacote(ana, t10, 'Pack 12 sessões (anterior)', 12, 60, 31, 460);
  guardarPagamento({ cliente_id: ana, pacote_id: pk0, data: diasAtras(60), valor: 460, metodo: 'MB WAY', estado: 'pago' });
  const p1 = duplicarPlano(pa, { cliente_id: ana, nome: 'Bloco 1 — Base', data_inicio: diasAtras(56) });
  atualizarPlano(p1, { num_semanas: 4, objetivo: 'Técnica e base de força' });
  definirSemana(p1, 4, { deload: true, foco: 'Deload' });
  definirEstado(p1, 'concluido');
  const escalarCargas = (sessaoId, f) =>
    executar(
      `UPDATE sessao_series SET carga_kg = round(carga_kg * ? / 2.5) * 2.5 WHERE carga_kg IS NOT NULL AND sessao_exercicio_id IN
       (SELECT x.id FROM sessao_exercicios x JOIN exercicios e ON e.id = x.exercicio_id WHERE x.sessao_id = ? AND e.nome <> 'Supino com barra')`,
      [f, sessaoId]
    );
  const agenda1 = [[1, 56, 54, 52], [2, 49, 47, 45], [3, 42, 40, 38], [4, 35, 33, null]];
  for (const [sem, dA, dB, dC] of agenda1) {
    const f = sem === 4 ? 0.8 : 0.86 + 0.03 * (sem - 1); // semana 4 = deload
    for (const [nome, d] of [['A — Inferiores', dA], ['B — Superiores', dB], ['C — Full body', dC]]) {
      if (d == null) continue;
      const id = doPlano(ana, p1, nome, sem, d, '07:00', { rpe_sessao: sem === 4 ? 5 : 7 });
      escalarCargas(id, f);
      executar(`UPDATE sessao_series SET carga_kg = 40, reps = 6 WHERE sessao_exercicio_id IN
        (SELECT x.id FROM sessao_exercicios x JOIN exercicios e ON e.id = x.exercicio_id WHERE x.sessao_id = ? AND e.nome = 'Supino com barra')`, [id]);
    }
  }
  // No bloco atual o supino também não passou de 40 × 6 (estagnação).
  executar(`UPDATE sessao_series SET carga_kg = 40, reps = 6 WHERE sessao_exercicio_id IN
    (SELECT x.id FROM sessao_exercicios x JOIN exercicios e ON e.id = x.exercicio_id WHERE x.sessao_id = ? AND e.nome = 'Supino com barra')`, [anaB2]);
  // RPE da sessão nas sessões do bloco atual (carga interna).
  executar("UPDATE sessoes SET rpe_sessao = 7 WHERE cliente_id = ? AND estado = 'realizada' AND rpe_sessao IS NULL", [ana]);

  // Bruno — corridas livres com distância e FC (ritmo a melhorar).
  const corrida = escalar("SELECT id FROM exercicios WHERE nome = 'Corrida contínua'");
  const brLivres = todos("SELECT id FROM sessoes WHERE cliente_id = ? AND tipo = 'livre' ORDER BY data", [bruno]);
  brLivres.forEach(({ id }, i) => {
    const sx = inserir('sessao_exercicios', { sessao_id: id, exercicio_id: corrida, ordem: 0, estado: 'feito' });
    inserir('sessao_series', { sessao_exercicio_id: sx, n: 1, estado: 'feita', duracao_seg: 1800, distancia_m: 4850 + i * 120, fc_media: 149 - i * 3, rpe: 5 });
  });
  executar("UPDATE sessoes SET rpe_sessao = 5 WHERE cliente_id = ? AND estado = 'realizada'", [bruno]);
  executar("UPDATE sessoes SET rpe_sessao = 7 WHERE cliente_id = ? AND estado = 'realizada'", [carla]);

  // Carla — preparação Hyrox (Open individual, meta 1:30:00) e uma simulação parcial.
  executar('UPDATE clientes SET hyrox_escalao = ?, hyrox_meta_seg = ? WHERE id = ?', ['open_ind', 5400, carla]);
  inserir('hyrox_simulacoes', {
    cliente_id: carla, data: diasAtras(5), escalao: 'open_ind', completa: 0, notas: 'Meia simulação (4 estações)',
    tempos: JSON.stringify({ corrida: 342, skierg: 296, sled_push: 245, remo: 301, wall_balls: 395 }),
    total_seg: 342 * 8 + 296 + 245 + 301 + 395,
  });

  carregarMotivacaoAgendaExemplo({ ana, bruno, carla });
}

// ---------------------------------------------------------------- Fase 5: metas, check-ins, pausas, agenda
function carregarMotivacaoAgendaExemplo({ ana, bruno, carla }) {
  const ex = (nome) => escalar('SELECT id FROM exercicios WHERE nome = ?', [nome]);
  const meta = (d) => inserir('metas', { data_inicio: diasAtras(60), marcos: '[]', mostrar_cliente: 1, ...d, marcos: JSON.stringify(d.marcos || []) });
  meta({ cliente_id: ana, tipo: 'e1rm', exercicio_id: ex('Agachamento livre'), titulo: 'Agachar 90 kg (1RM est.)', valor_inicial: 66, valor_alvo: 90, marcos: [80, 85], data_alvo: diasAtras(-60) });
  meta({ cliente_id: ana, tipo: 'reps', exercicio_id: ex('Pull-up'), titulo: '8 pull-ups seguidos', valor_inicial: 2, valor_alvo: 8, marcos: [5] });
  meta({ cliente_id: ana, tipo: 'perimetro', perimetro: 'Cintura', lado: null, titulo: 'Cintura 70 cm', valor_inicial: 74, valor_alvo: 70, marcos: [72] });
  meta({ cliente_id: bruno, tipo: 'teste_aerobio', perimetro: 'corrida_3km', titulo: '3 km abaixo de 13:00', valor_inicial: 825, valor_alvo: 780, marcos: [810], data_alvo: diasAtras(-45) });
  meta({ cliente_id: carla, tipo: 'e1rm', exercicio_id: ex('Agachamento livre'), titulo: 'Agachamento 90 kg (1RM est.)', valor_inicial: 81.7, valor_alvo: 90, marcos: [85], data_inicio: diasAtras(20) });

  // Check-ins: Ana e Bruno nas últimas semanas (o do Bruno com dor alta → alerta); esta semana em falta.
  const ck = (cliente_id, dias, [sono, energia, dor, alimentacao], notas = null, origem = 'presencial') => {
    const data = diasAtras(dias);
    const d = new Date(data + 'T12:00:00');
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const semana = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    inserir('checkins', { cliente_id, semana, data, sono, energia, dor, alimentacao, notas, origem });
  };
  ck(ana, 14, [3, 3, 1, 5], null);
  ck(ana, 7, [4, 4, 2, 4], 'Semana de turnos de noite', 'whatsapp');
  ck(bruno, 13, [4, 4, 3, 3]);
  ck(bruno, 6, [3, 3, 4, 4], 'Tendão pior de manhã', 'whatsapp');

  // Pausa justificada (férias) — essa semana não quebra o streak da Ana.
  inserir('pausas', { cliente_id: ana, data_inicio: diasAtras(31), data_fim: diasAtras(26), motivo: 'Férias' });

  // Agenda das próximas 2 semanas (as MESMAS funções da app). Hoje incluído se calhar no dia.
  const proximo = (diaSemana) => { // 1 = segunda … 7 = domingo
    const d = new Date();
    const atual = ((d.getDay() + 6) % 7) + 1;
    d.setDate(d.getDate() + ((diaSemana - atual + 7) % 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const marcar = (cliente_id, dia, hora, tipo = 'treino', repetir = 1) => agendar({ cliente_id, data: proximo(dia), hora, duracao_min: 60, tipo, repetir });
  [1, 3, 5].forEach((d) => marcar(ana, d, '07:00'));
  [2, 4].forEach((d) => marcar(bruno, d, '19:00'));
  marcar(bruno, 7, '09:00', 'treino', 1);
  [1, 2, 3, 4].forEach((d) => marcar(carla, d, '12:30'));
  marcar(bruno, 6, '10:00', 'reavaliacao', 0); // reavaliação em atraso → marcada para sábado
  // Uma remarcação: a sessão de quarta da Ana passa para quinta às 08:00.
  const qua = escalar("SELECT id FROM sessoes WHERE cliente_id = ? AND estado = 'agendada' AND data = ? ORDER BY hora_inicio LIMIT 1", [ana, proximo(3)]);
  if (qua) remarcar(qua, proximo(4), '08:00', 60);
}

// ---------------------------------------------------------------- Planos de exemplo (Fase 2)
// Cada exercício: [nome, método, params, prescrição da semana 1]. As semanas seguintes são
// preenchidas com a progressão sugerida, como acontece na app.
const F = (series, reps_min, reps_max, carga_kg, rpe, descanso_seg) => ({ series, reps_min, reps_max: reps_max ?? reps_min, carga_kg, rpe, descanso_seg });

function criarPlanoExemplo(dados, sessoes) {
  const planoId = criarPlano(dados);
  sessoes.forEach(([nome, dia, exs]) => {
    const sid = adicionarSessao(planoId, { nome, dia_semana: dia });
    for (const [ex, metodo, params, presc] of exs) {
      const peId = adicionarExercicioPlano(sid, { exercicio_id: exercicio(ex), metodo, params, notas: null });
      gravarPrescricao(peId, 1, presc);
      preencherSemanasVazias(planoId, peId, 1);
    }
  });
  return planoId;
}

function carregarPlanosExemplo({ ana, bruno, carla }) {
  // Template reutilizável (sem cargas: definem-se por cliente).
  criarPlanoExemplo({ nome: 'Força base · full body 2×/semana', objetivo: 'Introdução ao treino de força', num_semanas: 4 }, [
    ['A — Full body', 1, [
      ['Agachamento goblet', 'dupla', { rep_min: 8, rep_max: 12 }, F(3, 8, 12, null, 7, 90)],
      ['RDL', 'dupla', { rep_min: 8, rep_max: 10 }, F(3, 8, 10, null, 7, 120)],
      ['Supino com halteres', 'dupla', { rep_min: 8, rep_max: 12 }, F(3, 8, 12, null, 7, 90)],
      ['Remada com halteres', 'dupla', { rep_min: 8, rep_max: 12 }, F(3, 8, 12, null, 7, 90)],
    ]],
    ['B — Full body', 4, [
      ['Afundo reverso', 'dupla', { rep_min: 8, rep_max: 10 }, F(3, 8, 10, null, 7, 90)],
      ['Hip thrust', 'dupla', { rep_min: 10, rep_max: 12 }, F(3, 10, 12, null, 7, 90)],
      ['Puxada na polia', 'dupla', { rep_min: 8, rep_max: 12 }, F(3, 8, 12, null, 7, 90)],
      ['Pallof press', 'manual', {}, F(3, 10, null, null, null, 60)],
    ]],
  ]);

  // Ana — força (inclui Press militar para mostrar o aviso de "adaptar").
  const pa = criarPlanoExemplo(
    { cliente_id: ana, nome: 'Bloco 2 — Força', objetivo: 'Subir o agachamento para 75 kg (1RM est.)', data_inicio: diasAtras(14), num_semanas: 5 },
    [
      ['A — Inferiores', 1, [
        ['Agachamento livre', 'dupla', { rep_min: 6, rep_max: 8, inc_kg: 2.5 }, F(3, 6, 8, 62.5, 7, 180)],
        ['RDL', 'percentagem', { pct: 2.5 }, F(3, 8, null, 65, 7, 150)],
        ['Agachamento búlgaro', 'dupla', { rep_min: 8, rep_max: 10, inc_kg: 2 }, F(3, 8, 10, 14, 7, 90)],
        ['Pallof press', 'manual', {}, F(3, 10, null, null, null, 60)],
      ]],
      ['B — Superiores', 3, [
        ['Supino com barra', 'percentagem', { pct: 2.5 }, F(4, 6, null, 40, 8, 150)],
        ['Pull-up', 'manual', {}, F(4, 4, null, null, 8, 150)],
        ['Press militar', 'manual', {}, F(3, 8, null, 25, 7, 90)],
        ['Remada com halteres', 'dupla', { rep_min: 10, rep_max: 12, inc_kg: 2 }, F(3, 10, 12, 24, 7, 90)],
      ]],
      ['C — Full body', 5, [
        ['Hip thrust', 'dupla', { rep_min: 8, rep_max: 12, inc_kg: 5 }, F(3, 8, 12, 60, 7, 120)],
        ['Flexões', 'manual', {}, F(3, 10, null, null, 7, 60)],
        ['Dead bug', 'manual', {}, F(3, 8, null, null, null, 60)],
      ]],
    ]
  );
  definirEstado(pa, 'ativo');

  // Bruno — resistência (os intervalos de corrida estão marcados como "adaptar").
  const pb = criarPlanoExemplo(
    { cliente_id: bruno, nome: 'Base aeróbia — regresso à corrida', objetivo: 'Correr 3×/semana sem dor no tendão', data_inicio: diasAtras(7), num_semanas: 4 },
    [
      ['A — Contínuo', 2, [['Corrida contínua', 'volume', { pct: 10 }, { tipo_sessao: 'continuo', duracao_min: 30, zona_alvo: 2, ritmo_alvo_seg: 360 }]]],
      ['B — Intervalos', 4, [['Intervalos de corrida', 'volume', {}, { tipo_sessao: 'intervalado', int_repeticoes: 5, int_trabalho_seg: 180, int_recuperacao_seg: 120, zona_alvo: 4, ritmo_alvo_seg: 290 }]]],
      ['C — Longo sem impacto', 7, [['Bike', 'volume', { pct: 10 }, { tipo_sessao: 'continuo', duracao_min: 50, zona_alvo: 2 }]]],
    ]
  );
  definirEstado(pb, 'ativo');

  // Carla — misto/Hyrox (inclui Peso morto convencional, contraindicado).
  const pc = criarPlanoExemplo(
    { cliente_id: carla, nome: 'Hyrox — bloco 1', objetivo: 'Força de base + capacidade nas estações', data_inicio: diasAtras(3), num_semanas: 6 },
    [
      ['A — Força', 1, [
        ['Agachamento livre', 'dupla', { rep_min: 5, rep_max: 7, inc_kg: 2.5 }, F(4, 5, 7, 70, 7, 180)],
        ['Peso morto convencional', 'percentagem', { pct: 2.5 }, F(3, 5, null, 80, 7, 180)],
        ['Step-up com carga', 'dupla', { rep_min: 8, rep_max: 10, inc_kg: 2 }, F(3, 8, 10, 20, 7, 90)],
      ]],
      ['B — Estações Hyrox', 3, [
        ['Remo ergómetro', 'volume', {}, { tipo_sessao: 'intervalado', int_repeticoes: 5, int_trabalho_seg: 120, int_recuperacao_seg: 90, zona_alvo: 4, ritmo_alvo_seg: 120 }],
        ['Wall balls', 'manual', {}, F(4, 15, null, 6, 8, 60)],
        ['Sandbag lunges', 'percentagem', { pct: 5 }, F(3, 20, null, 10, 7, 90)],
      ]],
      ['C — Corrida', 5, [['Corrida contínua', 'volume', { pct: 10 }, { tipo_sessao: 'tempo', duracao_min: 20, zona_alvo: 3, ritmo_alvo_seg: 315 }]]],
    ]
  );
  definirEstado(pc, 'ativo');
  return { pa, pb, pc };
}
