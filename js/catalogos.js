// Catálogos fixos da app: testes da baseline, variantes e valores por defeito.
// Os valores editáveis (perímetros, limiares, zonas) são copiados para as definições
// na primeira utilização e passam a ser editados aí.

// Ordem fixa do protocolo (a mesma em todas as reavaliações).
export const TESTES_FORCA = [
  { id: 'pot_horizontal', nome: 'Salto horizontal', grupo: 'Potência', tipo: 'salto' },
  { id: 'pot_vertical', nome: 'Salto vertical', grupo: 'Potência', tipo: 'salto' },
  {
    id: 'joelho', nome: 'Joelho dominante', grupo: 'Força', tipo: 'carga',
    variantes: [{ nome: 'Agachamento livre', relativa: true }],
  },
  {
    id: 'anca', nome: 'Anca dominante', grupo: 'Força', tipo: 'carga',
    variantes: [{ nome: 'RDL', relativa: true }],
  },
  {
    id: 'empurrar', nome: 'Empurrar', grupo: 'Força', tipo: 'carga',
    variantes: [
      { nome: 'Supino com barra', relativa: true },
      { nome: 'Supino com halteres', relativa: true, nota: 'carga total (soma dos 2 halteres)' },
    ],
  },
  {
    id: 'puxar', nome: 'Puxar', grupo: 'Força', tipo: 'carga',
    variantes: [
      { nome: 'Remada com barra', relativa: true },
      { nome: 'Remada com halteres', relativa: true, nota: 'carga total (soma dos 2 halteres)' },
      { nome: 'Remada invertida', pesoCorporal: true },
      { nome: 'Pull-up', pesoCorporal: true },
    ],
  },
  {
    id: 'unilateral', nome: 'Unilateral', grupo: 'Força', tipo: 'carga', bilateral: true,
    variantes: [{ nome: 'Agachamento búlgaro' }, { nome: 'Step-up com carga' }],
  },
];

export const testePorId = (id) => TESTES_FORCA.find((t) => t.id === id);
export function infoVariante(testeId, nomeVariante) {
  const t = testePorId(testeId);
  return t?.variantes?.find((v) => v.nome === nomeVariante) || {};
}

// Variantes por defeito para um cliente novo (todas as potências ativas).
export function variantesPorDefeito() {
  const v = { potencia: ['pot_horizontal', 'pot_vertical'] };
  for (const t of TESTES_FORCA) if (t.variantes) v[t.id] = t.variantes[0].nome;
  return v;
}

export const QUALIDADE = { 0: '0 · falha (não conta)', 1: '1 · aceitável', 2: '2 · boa' };

export const TESTES_AEROBIOS = {
  corrida_3km: { nome: 'Corrida 3 km (tempo)', tipo: 'tempo', distancia_m: 3000, modalidade: 'corrida' },
  cooper_12min: { nome: 'Corrida 12 min (distância)', tipo: 'distancia', duracao_seg: 720, modalidade: 'corrida' },
  remo_2km: { nome: 'Remo 2 km em ergómetro (tempo)', tipo: 'tempo', distancia_m: 2000, modalidade: 'remo' },
  bike_5km: { nome: 'Bike 5 km (tempo) · baixo impacto', tipo: 'tempo', distancia_m: 5000, modalidade: 'bike' },
};

export const ESTADOS_LESAO = { ativa: 'Ativa', em_recuperacao: 'Em recuperação', resolvida: 'Resolvida' };
export const LADOS = { esq: 'Esquerdo', dir: 'Direito', ambos: 'Ambos' };

export const TIPOS_CONSENTIMENTO = {
  dados_saude: 'Tratamento de dados pessoais e de saúde',
  fotografias: 'Fotografias de progresso',
  partilha_whatsapp: 'Envio de resumos/relatórios por WhatsApp',
};

// Valores por defeito das definições editáveis.
export const DEFINICOES_PADRAO = {
  negocio: { nome: 'O Meu Treino', logo: null, cor_principal: '#1F2933', cor_secundaria: '#2BB673' },
  perimetros: [
    { nome: 'Cintura', bilateral: false },
    { nome: 'Anca', bilateral: false },
    { nome: 'Peito', bilateral: false },
    { nome: 'Braço (relaxado)', bilateral: true },
    { nome: 'Coxa', bilateral: true },
    { nome: 'Gémeo', bilateral: true },
  ],
  limiares_assimetria: { atencao: 10, alerta: 15 },
  // % da reserva de FC (Karvonen) por zona.
  zonas_fc: [
    { nome: 'Z1 · Recuperação', min: 50, max: 60 },
    { nome: 'Z2 · Aeróbio base', min: 60, max: 70 },
    { nome: 'Z3 · Tempo', min: 70, max: 80 },
    { nome: 'Z4 · Limiar', min: 80, max: 90 },
    { nome: 'Z5 · VO2máx', min: 90, max: 100 },
  ],
  modelo_balanca: '',
  versao_consentimento: 'v1 (16/10/2026)',
  modulo_mobilidade: false,
  // Parâmetros por defeito da progressão semanal sugerida (editáveis nas definições).
  progressao: {
    pct_carga: 2.5,          // +% de carga por semana (método percentagem)
    passo_kg: 2.5,           // arredondamento da carga (discos disponíveis)
    inc_dupla_kg: 2.5,       // incremento quando a dupla progressão chega ao topo da gama
    deload_volume_pct: 50,   // séries na semana de deload (% da semana base)
    deload_carga_pct: 90,    // carga na semana de deload (% da semana base)
    pct_volume_resist: 10,   // +% de duração por semana na resistência
  },
  // Modo Treino (registo em tempo real).
  modo_treino: { passo_kg: 2.5, descanso_padrao_seg: 90, vibrar: true, som: true },
  // Alertas de renovação de pacotes (só para o treinador).
  alertas_pacote: { sessoes_restantes: 2, dias_validade: 14 },
  etiquetas: ['boa técnica', 'dor', 'cansaço', 'subir carga na próxima', 'descer carga', 'técnica a corrigir'],

  // ---- Fase 4: zonas de ritmo e Hyrox (ESTIMATIVAS, editáveis) ----
  // Corrida: segundos por km A SOMAR ao ritmo de 5 km estimado (min = mais rápido).
  zonas_ritmo_corrida: [
    { nome: 'Z1 · Recuperação', min: 90, max: 120 },
    { nome: 'Z2 · Aeróbio base', min: 60, max: 90 },
    { nome: 'Z3 · Tempo', min: 25, max: 45 },
    { nome: 'Z4 · Limiar', min: 10, max: 20 },
    { nome: 'Z5 · Intervalos (VO2máx)', min: -5, max: 5 },
  ],
  // Remo: segundos por 500 m A SOMAR ao parcial médio do teste de 2 km.
  zonas_ritmo_remo: [
    { nome: 'Z1 · Recuperação', min: 25, max: 35 },
    { nome: 'Z2 · Aeróbio base', min: 18, max: 25 },
    { nome: 'Z3 · Tempo', min: 10, max: 15 },
    { nome: 'Z4 · Limiar', min: 4, max: 8 },
    { nome: 'Z5 · Intervalos', min: 0, max: 3 },
  ],
  riegel_k: 1.06,
  // Tempos de referência por segmento (segundos) — valores APROXIMADOS de um finalista a meio
  // da tabela, para servir de ponto de partida. Ajusta-os aos resultados oficiais da época.
  hyrox_referencias: {
    open_ind: { nome: 'Open · individual', tempos: { corrida: 330, skierg: 285, sled_push: 210, sled_pull: 270, bbj: 300, remo: 290, farmers: 120, lunges: 270, wall_balls: 360, roxzone: 420 } },
    pro_ind: { nome: 'Pro · individual', tempos: { corrida: 315, skierg: 275, sled_push: 240, sled_pull: 300, bbj: 290, remo: 280, farmers: 135, lunges: 300, wall_balls: 390, roxzone: 390 } },
    open_pares: { nome: 'Open · pares', tempos: { corrida: 315, skierg: 180, sled_push: 140, sled_pull: 180, bbj: 190, remo: 185, farmers: 80, lunges: 170, wall_balls: 220, roxzone: 400 } },
    pro_pares: { nome: 'Pro · pares', tempos: { corrida: 300, skierg: 175, sled_push: 160, sled_pull: 200, bbj: 185, remo: 180, farmers: 90, lunges: 190, wall_balls: 240, roxzone: 380 } },
  },
  // ---- Fase 5: agenda ----
  agenda: { max_sessoes_dia: 6, max_horas_dia: 6, duracao_padrao_min: 60 },
  // Limiares dos alertas de análise.
  alertas_analise: { acwr_max: 1.5, rpe_alto: 9, dias_sem_treinar: 10, assiduidade_min_pct: 50, queda_pct: 5, semanas_estagnacao: 4 },
};

// ---------- Metas, check-ins e pausas (Fase 5) ----------
export const TIPOS_META = {
  e1rm: 'Força: 1RM estimado de um exercício (kg)',
  carga: 'Força: carga levantada num exercício (kg)',
  reps: 'Repetições numa série (ex.: pull-ups)',
  peso: 'Peso corporal (kg)',
  mg_pct: '% massa gorda',
  perimetro: 'Perímetro (cm)',
  teste_aerobio: 'Teste aeróbio (tempo ou distância)',
};
export const ESCALAS_CHECKIN = [
  { id: 'sono', nome: 'Sono', baixo: 'mau', alto: 'ótimo' },
  { id: 'energia', nome: 'Energia', baixo: 'baixa', alto: 'alta' },
  { id: 'dor', nome: 'Dor', baixo: 'nenhuma', alto: 'muita' },
  { id: 'alimentacao', nome: 'Alimentação (adesão)', baixo: 'nada', alto: 'total' },
];
export const MOTIVOS_PAUSA = ['Férias', 'Doença', 'Lesão', 'Viagem', 'Outro'];

// ---------- Sessões e pacotes (Fase 3) ----------
export const TIPOS_SESSAO = { treino: 'Treino do plano', livre: 'Sessão livre', reavaliacao: 'Reavaliação' };
export const ESTADOS_SESSAO = { agendada: 'Agendada', em_curso: 'Em curso', realizada: 'Realizada', faltou: 'Faltou', cancelada: 'Cancelada' };
export const METODOS_PAGAMENTO = ['MB WAY', 'Transferência', 'Numerário', 'Multibanco', 'Outro'];

// ---------- Planeamento (Fase 2) ----------
export const CATEGORIAS_EXERCICIO = ['força', 'potência', 'resistência', 'core', 'mobilidade'];
export const DIAS_SEMANA = { 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado', 7: 'Domingo' };
export const ESTADOS_PLANO = { rascunho: 'Rascunho', ativo: 'Ativo', concluido: 'Concluído', arquivado: 'Arquivado' };
export const TIPOS_SESSAO_RESIST = { continuo: 'Contínuo', intervalado: 'Intervalado', tempo: 'Tempo' };
// Métodos de progressão por tipo de registo do exercício.
export const METODOS = {
  forca: {
    manual: 'Manual (repete a semana anterior)',
    dupla: 'Dupla progressão (reps até ao topo da gama, depois +carga)',
    percentagem: '+% de carga por semana',
  },
  resistencia: {
    manual: 'Manual (repete a semana anterior)',
    volume: '+% de duração / +1 repetição nos intervalos',
  },
};

export const PALETAS = [
  { nome: 'Grafite e verde', principal: '#1F2933', secundaria: '#2BB673' },
  { nome: 'Azul-petróleo e coral', principal: '#0F4C5C', secundaria: '#E36414' },
  { nome: 'Preto e lima', principal: '#111111', secundaria: '#9BC53D' },
];
