// Esquema da base de dados, em migrações sequenciais.
// Regra: NUNCA alterar uma migração já publicada; acrescentar sempre uma nova no fim.
// Datas guardadas em ISO (aaaa-mm-dd); apresentadas em dd/mm/aaaa.
// Valores calculados (1RM estimado, força relativa, assimetria, zonas) NÃO são guardados:
// calculam-se sempre a partir dos dados brutos, para usar sempre a mesma fórmula.

export const MIGRACOES = [
  // ---- v1: Fase 1 — clientes, consentimentos, lesões, exercícios, avaliações ----
  `
  CREATE TABLE definicoes (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );

  CREATE TABLE clientes (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    data_nascimento TEXT NOT NULL,
    sexo TEXT CHECK (sexo IN ('F','M','O') OR sexo IS NULL),
    telemovel TEXT,
    email TEXT,
    objetivos TEXT,
    disponibilidade TEXT,              -- texto livre (ex.: "Seg/Qua 7h-9h")
    frequencia_semanal INTEGER,        -- sessões/semana combinadas (para streaks)
    perfil_forca INTEGER NOT NULL DEFAULT 1,
    perfil_resistencia INTEGER NOT NULL DEFAULT 0,
    variantes TEXT NOT NULL DEFAULT '{}',   -- JSON: variante escolhida por teste
    teste_aerobio TEXT,                -- corrida_3km | cooper_12min | remo_2km | bike_5km
    fc_max_definida INTEGER,           -- se aceitar FC pico observada; senão usa Tanaka
    intervalo_reavaliacao_semanas INTEGER NOT NULL DEFAULT 5,
    mostrar_assimetria_cliente INTEGER NOT NULL DEFAULT 0,
    notas_privadas TEXT,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE consentimentos (
    id INTEGER PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('dados_saude','fotografias','partilha_whatsapp')),
    concedido INTEGER NOT NULL,
    data TEXT NOT NULL,
    forma TEXT,                        -- papel | digital | verbal
    versao_texto TEXT,                 -- versão do texto de consentimento usado
    revogado_em TEXT,
    notas TEXT
  );

  CREATE TABLE lesoes (
    id INTEGER PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    zona TEXT NOT NULL,
    lado TEXT CHECK (lado IN ('esq','dir','ambos') OR lado IS NULL),
    descricao TEXT,
    data_inicio TEXT NOT NULL,
    estado TEXT NOT NULL CHECK (estado IN ('ativa','em_recuperacao','resolvida')),
    data_resolucao TEXT,
    notas TEXT
  );

  CREATE TABLE padroes_movimento (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE
  );

  CREATE TABLE exercicios (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    categoria TEXT,                    -- força | potência | resistência | mobilidade | core
    grupo_muscular TEXT,
    padrao_id INTEGER REFERENCES padroes_movimento(id),
    notas_tecnicas TEXT,
    ativo INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE exercicio_alternativas (
    exercicio_id INTEGER NOT NULL REFERENCES exercicios(id) ON DELETE CASCADE,
    alternativa_id INTEGER NOT NULL REFERENCES exercicios(id) ON DELETE CASCADE,
    PRIMARY KEY (exercicio_id, alternativa_id)
  );

  -- Contraindicação: OU um exercício concreto OU um padrão de movimento inteiro.
  CREATE TABLE contraindicacoes (
    id INTEGER PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    lesao_id INTEGER REFERENCES lesoes(id) ON DELETE SET NULL,
    exercicio_id INTEGER REFERENCES exercicios(id) ON DELETE CASCADE,
    padrao_id INTEGER REFERENCES padroes_movimento(id) ON DELETE CASCADE,
    nivel TEXT NOT NULL DEFAULT 'evitar' CHECK (nivel IN ('evitar','adaptar')),
    notas TEXT,
    ativa INTEGER NOT NULL DEFAULT 1,
    CHECK ((exercicio_id IS NULL) <> (padrao_id IS NULL))
  );

  -- Avaliação = baseline ou reavaliação.
  CREATE TABLE avaliacoes (
    id INTEGER PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('baseline','reavaliacao')),
    notas TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Testes de força e potência (um registo por teste e por lado).
  CREATE TABLE avaliacao_testes (
    id INTEGER PRIMARY KEY,
    avaliacao_id INTEGER NOT NULL REFERENCES avaliacoes(id) ON DELETE CASCADE,
    teste TEXT NOT NULL,               -- pot_horizontal | pot_vertical | joelho | anca | empurrar | puxar | unilateral
    variante TEXT,
    lado TEXT CHECK (lado IN ('esq','dir') OR lado IS NULL),
    carga_kg REAL,
    reps INTEGER,
    tentativas TEXT,                   -- JSON [cm, cm, cm] nos saltos
    qualidade INTEGER CHECK (qualidade IN (0,1,2) OR qualidade IS NULL),
    notas TEXT
  );

  CREATE TABLE avaliacao_composicao (
    avaliacao_id INTEGER PRIMARY KEY REFERENCES avaliacoes(id) ON DELETE CASCADE,
    modelo_balanca TEXT,
    hora TEXT,
    condicoes_padronizadas INTEGER,    -- 1 = confirmou condições semelhantes
    peso_kg REAL,
    massa_gorda_pct REAL,
    massa_gorda_kg REAL,
    massa_magra_kg REAL,
    agua_pct REAL,
    gordura_visceral REAL
  );

  CREATE TABLE avaliacao_perimetros (
    id INTEGER PRIMARY KEY,
    avaliacao_id INTEGER NOT NULL REFERENCES avaliacoes(id) ON DELETE CASCADE,
    perimetro TEXT NOT NULL,
    lado TEXT CHECK (lado IN ('esq','dir') OR lado IS NULL),
    valor_cm REAL NOT NULL
  );

  CREATE TABLE avaliacao_resistencia (
    avaliacao_id INTEGER PRIMARY KEY REFERENCES avaliacoes(id) ON DELETE CASCADE,
    fc_repouso INTEGER,
    teste TEXT,                        -- corrida_3km | cooper_12min | remo_2km | bike_5km
    tempo_seg INTEGER,                 -- testes por distância
    distancia_m INTEGER,               -- teste de 12 min
    fc_media INTEGER,
    fc_pico INTEGER,
    rpe INTEGER,
    fc_1min INTEGER,
    notas TEXT
  );

  CREATE INDEX idx_aval_cliente ON avaliacoes(cliente_id, data);
  CREATE INDEX idx_lesoes_cliente ON lesoes(cliente_id);
  CREATE INDEX idx_contra_cliente ON contraindicacoes(cliente_id);
  `,

  // ---- v2: Fase 2 — biblioteca (tipo de registo) e planos por blocos ----
  `
  -- forca = séries/reps/carga · resistencia = duração/zona/ritmo
  ALTER TABLE exercicios ADD COLUMN tipo_registo TEXT NOT NULL DEFAULT 'forca';
  ALTER TABLE exercicios ADD COLUMN unidade_ritmo TEXT;   -- km | 500m | NULL
  UPDATE exercicios SET tipo_registo = 'resistencia', unidade_ritmo = 'km' WHERE nome IN ('Corrida contínua', 'Intervalos de corrida');
  UPDATE exercicios SET tipo_registo = 'resistencia', unidade_ritmo = '500m' WHERE nome IN ('Remo ergómetro', 'SkiErg');
  UPDATE exercicios SET tipo_registo = 'resistencia' WHERE nome = 'Bike';

  -- Plano/bloco. cliente_id NULL = template reutilizável.
  CREATE TABLE planos (
    id INTEGER PRIMARY KEY,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    objetivo TEXT,
    data_inicio TEXT,
    num_semanas INTEGER NOT NULL CHECK (num_semanas BETWEEN 1 AND 12),
    estado TEXT NOT NULL DEFAULT 'rascunho' CHECK (estado IN ('rascunho','ativo','concluido','arquivado')),
    origem_id INTEGER,                 -- plano/template de onde foi duplicado (informativo)
    notas TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE plano_semanas (
    plano_id INTEGER NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
    semana INTEGER NOT NULL,
    deload INTEGER NOT NULL DEFAULT 0,
    foco TEXT,
    PRIMARY KEY (plano_id, semana)
  );

  -- Sessões do bloco (A, B, C…). A estrutura repete-se todas as semanas;
  -- o que muda por semana está em plano_prescricoes.
  CREATE TABLE plano_sessoes (
    id INTEGER PRIMARY KEY,
    plano_id INTEGER NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
    ordem INTEGER NOT NULL DEFAULT 0,
    nome TEXT NOT NULL,
    dia_semana INTEGER CHECK (dia_semana BETWEEN 1 AND 7 OR dia_semana IS NULL),
    notas TEXT
  );

  -- Exercício dentro de uma sessão. Um exercício usado em planos não pode ser apagado (só desativado).
  CREATE TABLE plano_exercicios (
    id INTEGER PRIMARY KEY,
    sessao_id INTEGER NOT NULL REFERENCES plano_sessoes(id) ON DELETE CASCADE,
    exercicio_id INTEGER NOT NULL REFERENCES exercicios(id),
    ordem INTEGER NOT NULL DEFAULT 0,
    metodo TEXT NOT NULL DEFAULT 'manual' CHECK (metodo IN ('manual','dupla','percentagem','volume')),
    params TEXT NOT NULL DEFAULT '{}', -- JSON com parâmetros do método de progressão
    notas TEXT
  );

  -- Prescrição de um exercício numa semana.
  CREATE TABLE plano_prescricoes (
    id INTEGER PRIMARY KEY,
    plano_exercicio_id INTEGER NOT NULL REFERENCES plano_exercicios(id) ON DELETE CASCADE,
    semana INTEGER NOT NULL,
    -- força
    series INTEGER,
    reps_min INTEGER,
    reps_max INTEGER,
    carga_kg REAL,
    rpe REAL,
    rir INTEGER,
    descanso_seg INTEGER,
    -- resistência
    tipo_sessao TEXT CHECK (tipo_sessao IN ('continuo','intervalado','tempo') OR tipo_sessao IS NULL),
    duracao_min REAL,
    distancia_m INTEGER,
    zona_alvo INTEGER CHECK (zona_alvo BETWEEN 1 AND 5 OR zona_alvo IS NULL),
    ritmo_alvo_seg INTEGER,            -- por km ou por 500 m (ver exercicios.unidade_ritmo)
    int_repeticoes INTEGER,
    int_trabalho_seg INTEGER,
    int_recuperacao_seg INTEGER,
    notas TEXT,
    UNIQUE (plano_exercicio_id, semana)
  );

  CREATE INDEX idx_planos_cliente ON planos(cliente_id);
  CREATE INDEX idx_psessoes_plano ON plano_sessoes(plano_id);
  CREATE INDEX idx_pex_sessao ON plano_exercicios(sessao_id);
  `,

  // ---- v3: Fase 3 — registo de sessões (manual e Modo Treino), pacotes e pagamentos ----
  // O Modo Treino NÃO tem tabelas próprias: escreve nestas mesmas tabelas (estado 'em_curso').
  `
  CREATE TABLE tipos_pacote (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    sessoes INTEGER NOT NULL CHECK (sessoes BETWEEN 1 AND 500),
    validade_dias INTEGER NOT NULL CHECK (validade_dias BETWEEN 1 AND 1000),
    preco REAL,
    ativo INTEGER NOT NULL DEFAULT 1
  );

  -- Pacote adquirido pelo cliente. Sessões usadas/em falta NÃO são guardadas:
  -- calculam-se a partir das sessões que descontam deste pacote.
  CREATE TABLE pacotes (
    id INTEGER PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    tipo_pacote_id INTEGER REFERENCES tipos_pacote(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    sessoes_contratadas INTEGER NOT NULL CHECK (sessoes_contratadas BETWEEN 1 AND 500),
    data_inicio TEXT NOT NULL,
    data_validade TEXT NOT NULL,
    preco REAL,
    notas TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE pagamentos (
    id INTEGER PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    pacote_id INTEGER REFERENCES pacotes(id) ON DELETE SET NULL,
    data TEXT NOT NULL,
    valor REAL NOT NULL CHECK (valor > 0),
    metodo TEXT NOT NULL,              -- MB WAY | transferência | numerário | multibanco | outro
    estado TEXT NOT NULL CHECK (estado IN ('pago','pendente')),
    notas TEXT
  );

  -- Sessão: agendada (Fase 5) → em_curso (Modo Treino) → realizada; ou faltou / cancelada.
  CREATE TABLE sessoes (
    id INTEGER PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    hora_inicio TEXT,                  -- ISO data/hora local (aaaa-mm-ddThh:mm:ss)
    hora_fim TEXT,
    tipo TEXT NOT NULL CHECK (tipo IN ('treino','livre','reavaliacao')),
    estado TEXT NOT NULL CHECK (estado IN ('agendada','em_curso','realizada','faltou','cancelada')),
    plano_id INTEGER REFERENCES planos(id) ON DELETE SET NULL,
    plano_sessao_id INTEGER REFERENCES plano_sessoes(id) ON DELETE SET NULL,
    semana INTEGER,
    -- cronómetro: decorrido = (agora ou pausado_desde) − hora_inicio − pausa_seg
    pausa_seg INTEGER NOT NULL DEFAULT 0,
    pausado_desde TEXT,
    duracao_seg INTEGER,
    -- pacote
    desconta_pacote INTEGER NOT NULL DEFAULT 1,
    pacote_id INTEGER REFERENCES pacotes(id) ON DELETE SET NULL,
    -- reavaliação ligada
    avaliacao_id INTEGER REFERENCES avaliacoes(id) ON DELETE SET NULL,
    -- qualitativo (notas privadas)
    rpe_sessao REAL,                   -- RPE da sessão (carga interna = RPE × duração, Fase 4)
    sono INTEGER CHECK (sono BETWEEN 1 AND 5 OR sono IS NULL),
    stress INTEGER CHECK (stress BETWEEN 1 AND 5 OR stress IS NULL),
    dor INTEGER CHECK (dor BETWEEN 0 AND 10 OR dor IS NULL),
    motivo_falta TEXT,                 -- preparado para futuras regras de faltas
    notas TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
  -- Só pode haver UMA sessão em curso de cada vez.
  CREATE UNIQUE INDEX ux_sessao_em_curso ON sessoes(estado) WHERE estado = 'em_curso';
  CREATE INDEX idx_sessoes_cliente ON sessoes(cliente_id, data);
  CREATE INDEX idx_sessoes_pacote ON sessoes(pacote_id);

  CREATE TABLE sessao_exercicios (
    id INTEGER PRIMARY KEY,
    sessao_id INTEGER NOT NULL REFERENCES sessoes(id) ON DELETE CASCADE,
    exercicio_id INTEGER NOT NULL REFERENCES exercicios(id),
    plano_exercicio_id INTEGER REFERENCES plano_exercicios(id) ON DELETE SET NULL, -- NULL = acrescentado
    substitui_exercicio_id INTEGER REFERENCES exercicios(id),                     -- se foi substituído
    ordem INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','feito','saltado')),
    notas TEXT
  );
  CREATE INDEX idx_sex_sessao ON sessao_exercicios(sessao_id);
  CREATE INDEX idx_sex_exercicio ON sessao_exercicios(exercicio_id);

  -- Série: planeado (cópia do plano no início) + realizado.
  CREATE TABLE sessao_series (
    id INTEGER PRIMARY KEY,
    sessao_exercicio_id INTEGER NOT NULL REFERENCES sessao_exercicios(id) ON DELETE CASCADE,
    n INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','feita','saltada')),
    -- planeado (força)
    plan_carga_kg REAL, plan_reps INTEGER, plan_rpe REAL, plan_rir INTEGER, plan_descanso_seg INTEGER,
    -- realizado (força)
    carga_kg REAL, reps INTEGER, rpe REAL, rir INTEGER,
    qualidade INTEGER NOT NULL DEFAULT 2 CHECK (qualidade IN (0,1,2)),
    -- resistência (planeado em texto + realizado)
    plan_texto TEXT,
    duracao_seg INTEGER, distancia_m INTEGER, fc_media INTEGER,
    -- dor e notas
    dor INTEGER NOT NULL DEFAULT 0,
    dor_local TEXT,
    notas TEXT,
    concluida_em TEXT
  );
  CREATE INDEX idx_series_sex ON sessao_series(sessao_exercicio_id);

  -- Etiquetas rápidas (pesquisáveis) na sessão, num exercício ou numa série. Privadas.
  CREATE TABLE sessao_etiquetas (
    id INTEGER PRIMARY KEY,
    sessao_id INTEGER NOT NULL REFERENCES sessoes(id) ON DELETE CASCADE,
    sessao_exercicio_id INTEGER REFERENCES sessao_exercicios(id) ON DELETE CASCADE,
    serie_id INTEGER REFERENCES sessao_series(id) ON DELETE CASCADE,
    etiqueta TEXT NOT NULL
  );
  CREATE INDEX idx_etiquetas_sessao ON sessao_etiquetas(sessao_id);
  `,

  // ---- v4: Fase 4 — Hyrox (escalão, meta e simulações opcionais) ----
  `
  ALTER TABLE clientes ADD COLUMN hyrox_escalao TEXT;     -- open_ind | pro_ind | open_pares | pro_pares | NULL
  ALTER TABLE clientes ADD COLUMN hyrox_meta_seg INTEGER; -- tempo-meta da prova

  -- Simulação de Hyrox (teste opcional): tempos por segmento em JSON.
  CREATE TABLE hyrox_simulacoes (
    id INTEGER PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    escalao TEXT NOT NULL,
    tempos TEXT NOT NULL,              -- { corrida: seg por km (média), skierg: seg, … }
    total_seg INTEGER NOT NULL,
    completa INTEGER NOT NULL DEFAULT 1, -- 0 = simulação parcial (só alguns segmentos)
    notas TEXT
  );
  CREATE INDEX idx_hyrox_cliente ON hyrox_simulacoes(cliente_id, data);
  `,

  // ---- v5: Fase 5 — agenda (remarcações), metas e marcos, check-ins, pausas (streaks justos) ----
  // A agenda usa a MESMA tabela "sessoes" (estado 'agendada'); não há tabela de marcações à parte.
  `
  ALTER TABLE sessoes ADD COLUMN remarcada_de TEXT;     -- data/hora original se foi remarcada
  ALTER TABLE sessoes ADD COLUMN agendada_para TEXT;    -- hora marcada na agenda (se o treino veio de uma marcação)

  -- Meta do cliente. O progresso é SEMPRE calculado a partir dos registos (sessões e avaliações).
  CREATE TABLE metas (
    id INTEGER PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('e1rm','carga','reps','peso','mg_pct','perimetro','teste_aerobio')),
    exercicio_id INTEGER REFERENCES exercicios(id),
    perimetro TEXT,
    lado TEXT,
    titulo TEXT NOT NULL,
    valor_inicial REAL NOT NULL,
    valor_alvo REAL NOT NULL,
    marcos TEXT NOT NULL DEFAULT '[]',  -- JSON: valores intermédios opcionais
    data_inicio TEXT NOT NULL,
    data_alvo TEXT,
    estado TEXT NOT NULL DEFAULT 'ativa' CHECK (estado IN ('ativa','arquivada')),
    mostrar_cliente INTEGER NOT NULL DEFAULT 1,
    notas TEXT
  );
  CREATE INDEX idx_metas_cliente ON metas(cliente_id);

  -- Check-in semanal (1 por cliente e semana). Escalas 1–5:
  -- sono/energia/alimentação: 1 = mau, 5 = ótimo · dor: 1 = nenhuma, 5 = muita.
  CREATE TABLE checkins (
    id INTEGER PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    semana TEXT NOT NULL,              -- segunda-feira da semana (aaaa-mm-dd)
    data TEXT NOT NULL,
    sono INTEGER CHECK (sono BETWEEN 1 AND 5),
    energia INTEGER CHECK (energia BETWEEN 1 AND 5),
    dor INTEGER CHECK (dor BETWEEN 1 AND 5),
    alimentacao INTEGER CHECK (alimentacao BETWEEN 1 AND 5),
    notas TEXT,
    origem TEXT NOT NULL DEFAULT 'presencial' CHECK (origem IN ('presencial','whatsapp')),
    UNIQUE (cliente_id, semana)
  );

  -- Pausas justificadas (férias, doença, lesão…): essas semanas não contam nem quebram o streak.
  CREATE TABLE pausas (
    id INTEGER PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    data_inicio TEXT NOT NULL,
    data_fim TEXT NOT NULL,
    motivo TEXT NOT NULL
  );

  -- Limpeza: até à v4 as chaves estrangeiras podiam ficar desligadas depois de gravar
  -- (o export do sql.js repõe os PRAGMA). Apaga registos órfãos que tenham ficado
  -- de clientes/avaliações/planos/sessões apagados (filhos depois dos pais).
  DELETE FROM consentimentos WHERE cliente_id NOT IN (SELECT id FROM clientes);
  DELETE FROM lesoes WHERE cliente_id NOT IN (SELECT id FROM clientes);
  DELETE FROM contraindicacoes WHERE cliente_id NOT IN (SELECT id FROM clientes);
  UPDATE contraindicacoes SET lesao_id = NULL WHERE lesao_id IS NOT NULL AND lesao_id NOT IN (SELECT id FROM lesoes);
  DELETE FROM avaliacoes WHERE cliente_id NOT IN (SELECT id FROM clientes);
  DELETE FROM avaliacao_testes WHERE avaliacao_id NOT IN (SELECT id FROM avaliacoes);
  DELETE FROM avaliacao_composicao WHERE avaliacao_id NOT IN (SELECT id FROM avaliacoes);
  DELETE FROM avaliacao_perimetros WHERE avaliacao_id NOT IN (SELECT id FROM avaliacoes);
  DELETE FROM avaliacao_resistencia WHERE avaliacao_id NOT IN (SELECT id FROM avaliacoes);
  DELETE FROM planos WHERE cliente_id IS NOT NULL AND cliente_id NOT IN (SELECT id FROM clientes);
  DELETE FROM plano_semanas WHERE plano_id NOT IN (SELECT id FROM planos);
  DELETE FROM plano_sessoes WHERE plano_id NOT IN (SELECT id FROM planos);
  DELETE FROM plano_exercicios WHERE sessao_id NOT IN (SELECT id FROM plano_sessoes);
  DELETE FROM plano_prescricoes WHERE plano_exercicio_id NOT IN (SELECT id FROM plano_exercicios);
  DELETE FROM pacotes WHERE cliente_id NOT IN (SELECT id FROM clientes);
  DELETE FROM pagamentos WHERE cliente_id NOT IN (SELECT id FROM clientes);
  UPDATE pagamentos SET pacote_id = NULL WHERE pacote_id IS NOT NULL AND pacote_id NOT IN (SELECT id FROM pacotes);
  DELETE FROM sessoes WHERE cliente_id NOT IN (SELECT id FROM clientes);
  UPDATE sessoes SET pacote_id = NULL WHERE pacote_id IS NOT NULL AND pacote_id NOT IN (SELECT id FROM pacotes);
  UPDATE sessoes SET plano_id = NULL WHERE plano_id IS NOT NULL AND plano_id NOT IN (SELECT id FROM planos);
  UPDATE sessoes SET plano_sessao_id = NULL WHERE plano_sessao_id IS NOT NULL AND plano_sessao_id NOT IN (SELECT id FROM plano_sessoes);
  UPDATE sessoes SET avaliacao_id = NULL WHERE avaliacao_id IS NOT NULL AND avaliacao_id NOT IN (SELECT id FROM avaliacoes);
  DELETE FROM sessao_exercicios WHERE sessao_id NOT IN (SELECT id FROM sessoes);
  UPDATE sessao_exercicios SET plano_exercicio_id = NULL WHERE plano_exercicio_id IS NOT NULL AND plano_exercicio_id NOT IN (SELECT id FROM plano_exercicios);
  DELETE FROM sessao_series WHERE sessao_exercicio_id NOT IN (SELECT id FROM sessao_exercicios);
  DELETE FROM sessao_etiquetas WHERE sessao_id NOT IN (SELECT id FROM sessoes)
    OR (sessao_exercicio_id IS NOT NULL AND sessao_exercicio_id NOT IN (SELECT id FROM sessao_exercicios))
    OR (serie_id IS NOT NULL AND serie_id NOT IN (SELECT id FROM sessao_series));
  DELETE FROM hyrox_simulacoes WHERE cliente_id NOT IN (SELECT id FROM clientes);
  `,

  // ---- v6: Fase 6 — fotografias de progresso (metadados; a imagem fica no IndexedDB) ----
  `
  CREATE TABLE fotos (
    id INTEGER PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    angulo TEXT NOT NULL CHECK (angulo IN ('frente','lado','costas')),
    chave TEXT NOT NULL UNIQUE,        -- chave do blob no IndexedDB
    largura INTEGER, altura INTEGER, bytes INTEGER,
    notas TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_fotos_cliente ON fotos(cliente_id, data);
  `,
];
