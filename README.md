# Treino — acompanhamento de clientes (v1.2.0)

App para personal trainer planear, acompanhar e comunicar a progressão dos clientes:
força como núcleo, resistência (corrida, remo, bike, Hyrox) como módulo opcional por cliente.

- **Funciona offline** e sem servidor: é uma app web instalável (PWA), pensada para o iPhone no ginásio.
- **Os dados ficam só no dispositivo** (SQLite + fotografias no armazenamento local). Nada vai para a internet.
- Português europeu: datas dd/mm/aaaa, kg, cm, min/km.

---

## Índice

1. [Instalar e abrir](#1-instalar-e-abrir)
2. [O dia a dia (guia rápido)](#2-o-dia-a-dia-guia-rápido)
3. [Módulos](#3-módulos)
4. [Backup, restauro e passar dados entre dispositivos](#4-backup-restauro-e-passar-dados-entre-dispositivos)
5. [Segurança e RGPD](#5-segurança-e-rgpd)
6. [Fórmulas e regras](#6-fórmulas-e-regras)
7. [Atualizar a app](#7-atualizar-a-app)
8. [Resolução de problemas](#8-resolução-de-problemas)
9. [Estrutura do código](#9-estrutura-do-código)

---

## 1. Instalar e abrir

### No portátil (Windows)
1. Duplo clique em **`iniciar.bat`** → abre `http://localhost:8080`. Mantém a janela preta aberta.
2. Para experimentar: **Clientes → Carregar 3 clientes de exemplo** (força, resistência e misto).

Não é preciso instalar nada (usa o PowerShell do Windows).

### No iPhone (via GitHub Pages)
Só o **código** vai para o GitHub; os dados dos clientes nunca saem do iPhone.

1. Cria uma conta em <https://github.com>.
2. **New repository** → nome `treino` → *Public* → **Create repository**.
3. **No portátil** (Chrome ou Edge), abre a pasta do projeto no Explorador, seleciona `index.html`,
   `sw.js`, `manifest.webmanifest` **e as pastas** `css`, `js`, `lib`, `icons` (opcional: `testes.html`,
   `docs`) e **arrasta-as** para a página **Add file → Upload files**. ⚠ O botão “choose your files”
   não aceita pastas — tem de ser a arrastar. Não envies `iniciar.bat`, `servidor.ps1` nem `.claude`.
   → **Commit changes**. Confirma no repositório que vês as pastas `css`, `js`, `lib`, `icons`
   ao lado do `index.html` (e não dentro de outra pasta).
4. **Settings → Pages** → *Deploy from a branch* → `main` / `(root)` → **Save**.
5. Ao fim de 1–2 min: `https://<o-teu-utilizador>.github.io/treino/`.
6. No iPhone, abre esse endereço no **Safari** → **Partilhar → Adicionar ao ecrã principal**.
7. Usa **sempre** a app a partir desse ícone (o Safari e a app instalada guardam dados em sítios diferentes).

### Primeiro uso
O painel mostra os primeiros passos: nome do negócio, logótipo e cores (**Definições → Marca**),
PIN da app (opcional), primeiro cliente com consentimentos, e backup.

---

## 2. O dia a dia (guia rápido)

| Quando | O que fazer |
|---|---|
| **Início do dia** | **Painel**: quem treina hoje, quem precisa de atenção, pacotes a renovar, reavaliações. |
| **Sessão** | Agenda/Painel → **▶ Iniciar** → Modo Treino: séries com −/+, “Série concluída”, descanso automático. **Terminar treino** → presença + desconto do pacote. |
| **Mostrar progresso** | No treino: **👁 Mostrar ao cliente** (sair pede PIN). |
| **Fim de semana** | **Painel → Resumos para clientes**: PDF/imagem + WhatsApp para cada um. Check-ins em falta → “💬 Pedir”. |
| **Planeamento** | Ficha → **Planos** → “Sugerir progressão” (usa o que foi realmente feito). |
| **A cada 4–6 semanas** | Reavaliação (aparece na agenda e no painel): ficha de testes pré-preenchida + comparação automática. |
| **Semanalmente** | **Definições → Criar backup encriptado** → guardar no portátil (o painel lembra-te). |

---

## 3. Módulos

- **Clientes**: ficha (dados, objetivos, disponibilidade, notas privadas), perfil força/resistência,
  consentimentos (dados de saúde, fotografias, WhatsApp), lesões e contraindicações por exercício ou
  padrão de movimento (aviso visível com alternativas ao planear e no treino).
- **Avaliações**: baseline e reavaliações — força (1RM estimado, força relativa, assimetria),
  potência (saltos), bioimpedância (como tendência) e perímetros, resistência (FC repouso, teste
  aeróbio, recuperação). Comparação com a baseline e com a anterior; variantes diferentes não se comparam.
- **Treino** (separador ▤): biblioteca de **≈ 200 exercícios** (força, potência, olímpicos, unilaterais,
  isolamento, core, carries, pliometria, lançamentos, cardio e mobilidade), com filtros por grupo muscular,
  pesquisa sem acentos e alternativas; templates e planos por blocos (semanas,
  sessões, séries/reps/carga/RPE/RIR/descanso; resistência com tipo, duração, zona e ritmo),
  duplicação entre clientes, progressão semanal sugerida.
- **Sessões e Modo Treino**: registo em tempo real ou depois da sessão, no mesmo registo. Cronómetro
  que sobrevive a recarregar, descanso automático, PRs, dor e etiquetas, gravação imediata.
  - **Eliminar série**: 🗑 à esquerda da série (longe do “Série concluída”). Série por fazer → apaga logo;
    série feita → pede confirmação. Aparece “Série eliminada · **Anular**” durante 6 s. Opção “remover
    também do plano”. As séries são renumeradas e a série eliminada deixa de contar em tudo (volume,
    1RM, recordes, análise, relatórios).
  - **Aquec.**: marca uma série como aquecimento — fica registada, mas não conta para volume, recordes,
    1RM, análise, progressão nem relatórios.
- **Superséries** (tri-séries e circuitos): no plano, toca em “⛓ ligar em supersérie” entre dois
  exercícios (A1/A2); toca na ligação para definir o descanso entre exercícios (por defeito nenhum) e
  no fim da ronda, ou para desligar. No Modo Treino também se pode ligar (“⛓ Supersérie com …”).
  O treino alterna sozinho A1 → A2 → A1…, destaca o exercício “a seguir” e, se um tiver mais séries,
  continua sozinho. Cada exercício guarda as suas séries e cargas (a análise não muda). Avisa se
  algum exercício for contraindicado para o cliente.
- **Pacotes e pagamentos**: tipos configuráveis, sessões usadas/em falta calculadas, alertas de
  renovação, pagamentos manuais (sem cartões) e resumo mensal.
- **Análise**: alertas (estagnação, queda, assiduidade, carga brusca, RPE alto, check-in, reavaliação,
  pacote), destaques, indicadores de carga, comparações e gráficos.
- **Zonas**: FC, ritmos de corrida/remo, previsões, Hyrox (metas por estação e simulações). Estimativas.
- **Agenda** (▦): semana com carga por dia, marcar/repetir/remarcar/faltas, reavaliações previstas, `.ics`.
- **Metas**: metas e marcos com progresso automático, streak e score de consistência (com pausas
  justificadas), check-in semanal de 30 s (incluindo colar a resposta do WhatsApp).
- **Relatórios**: resumo semanal e relatório de período (PDF A4 e imagem vertical), WhatsApp.
  O resumo semanal mostra treinos vs combinado, tempo total, séries, repetições, volume (kg/t), carga
  média por sessão, volume por grupo muscular, RPE médio, recordes (+kg e %), exercício da semana,
  streak e metas, comparação com a semana anterior (linguagem neutra/positiva; numa semana a decorrer
  compara até ao mesmo dia) e, na resistência, distância e ritmo. Dados em falta não aparecem.
  **Equivalentes** (“o equivalente a cerca de 3 elefantes”): lista editável em Definições → Resumo
  semanal (nome, valor, singular/plural, ícone, ativo; para peso, repetições, distância e tempo).
- **Fotografias**: frente/lado/costas, linha temporal, comparação lado a lado.
- **Modo cliente**: ecrã para o cliente, com linguagem positiva e sem dados internos; sair pede PIN.

---

### Usar no telemóvel e no tablet
- **Ficha do cliente**: os 4 separadores mais usados ficam sempre à vista; os restantes estão em **Mais ▾**
  (grelha com ícones). No tablet aparecem todos.
- **Caixas de edição**: no telemóvel abrem de baixo para cima, com título e **Guardar** sempre visíveis.
- **Escolher exercício**: filtros por grupo muscular, “Usados recentemente” com o cliente e pesquisa sem acentos.
- **Lista de clientes**: botão ▶ em cada cliente para iniciar o treino diretamente.
- Ao voltar a uma lista, a posição mantém-se.
- **Tablet** (≥ 900 px de largura): painel, resumo, metas, zonas e gráficos em duas colunas; **Modo Treino
  em ecrã dividido** (lista de exercícios à esquerda, exercício atual à direita).
- **Barra inferior** sempre fixa no fundo (a página não desliza por baixo dela; respeita a zona do gesto do iPhone).
- **Sem zoom acidental** no Modo Treino, registo/edição de sessões, editor de planos e modo cliente
  (nem pinça, nem duplo toque, nem ao tocar num campo). O resto da app (ex.: biblioteca) mantém o zoom.

## 4. Backup, restauro e passar dados entre dispositivos

- **Definições → 🔐 Criar backup encriptado**: um único ficheiro `.treino` com **tudo** (base de
  dados e fotografias), encriptado com a tua palavra-passe (AES-256-GCM; chave PBKDF2-SHA-256 com
  310 000 iterações). No iPhone, “Partilhar” permite **AirDrop** para o portátil.
- **Se perderes a palavra-passe, o backup não pode ser recuperado.** Guarda-a num gestor de palavras-passe.
- **Restaurar backup** substitui **todos** os dados do dispositivo (pede a palavra-passe e confirmação).
  Backups antigos `.sqlite` (sem fotos) continuam a poder ser restaurados.
- **Passar do iPhone para o portátil** (ou ao contrário): criar backup num, restaurar no outro.
  Os dois dispositivos não sincronizam sozinhos; trabalha num de cada vez.
- O painel lembra-te se não houver backup há mais de 7 dias (configurável).

---

## 5. Segurança e RGPD

**Proteção do dispositivo**
- Usa **código de bloqueio no iPhone** — é o que encripta os dados no dispositivo.
- **PIN da app** (opcional, Definições): pedido ao abrir e após X minutos em segundo plano.
  Evita acessos casuais; não encripta os dados. “Esqueci o PIN” só permite recomeçar apagando
  tudo (e depois restaurar um backup).
- **PIN do modo cliente**: diferente do PIN da app; necessário para sair do ecrã do cliente.
- Os PIN são guardados apenas como hash com sal.

**RGPD — o essencial**
- Dados de saúde, lesões e fotografias são **categorias especiais** (art. 9.º): exigem consentimento
  **explícito**, de preferência escrito. Modelo em [`docs/modelo-consentimento.md`](docs/modelo-consentimento.md).
- A app regista data, forma e versão do texto de cada consentimento, **não deixa registar avaliações
  sem consentimento de dados de saúde** e **não guarda fotos sem consentimento de fotografias**.
- **Acesso e portabilidade**: Ficha → Resumo → **Exportar dados do cliente (RGPD)** (JSON com
  todos os dados do titular, fotos opcionais).
- **Apagamento**: Ficha → **Apagar cliente** remove tudo, incluindo fotografias. Os backups antigos
  ainda contêm esses dados — apaga-os ou deixa-os expirar.
- **Conservação**: Definições → prazo (24 meses por defeito); os ex-clientes inativos além do prazo
  aparecem para exportar/apagar, e o painel avisa.
- **Partilha**: o WhatsApp só é usado com consentimento e sempre por ação tua (nada é enviado
  automaticamente). O `.ics` exporta por defeito só as iniciais. Evita guardar backups em clouds
  (se o fizeres, estão encriptados).
- As fotografias são recodificadas no dispositivo, o que remove os metadados (incluindo GPS).
- Isto não é aconselhamento jurídico; em caso de dúvida, consulta a CNPD (www.cnpd.pt).

---

## 6. Fórmulas e regras

| Cálculo | Fórmula |
|---|---|
| 1RM estimado | **Epley**: carga × (1 + reps ÷ 30); reps = 1 → a própria carga; > 10 reps = baixa fiabilidade |
| Força relativa | 1RM estimado ÷ peso corporal (2 casas): agachamento, RDL, supino, remada com carga |
| Assimetria | (lado forte − lado fraco) ÷ lado forte × 100; limiares 10% / 15% (editáveis) |
| FC máxima | **Tanaka**: 208 − 0,7 × idade (estimada); sugere a FC pico observada se for superior |
| Zonas de FC | Reserva (Karvonen): FCrep + % × (FCmáx − FCrep); % editáveis |
| Recuperação | FC pico − FC 1 min após o teste |
| Volume | Σ carga × reps das séries de força feitas com qualidade 1–2 (sem aquecimento, saltadas ou eliminadas) |
| Peso corporal | por defeito conta séries e repetições à parte; opção (Definições) para entrar no volume: último peso × % do exercício (pull-up 100%, flexões 65%…, editável na biblioteca) |
| Carga média por sessão | volume da semana ÷ sessões feitas |
| Equivalentes | item ativo que dê entre 1 e 20 unidades (editável), “cerca de”, varia por semana |
| Carga interna | RPE da sessão × duração (min); sem RPE da sessão, média do RPE das séries |
| Rácio agudo:crónico | carga interna de 7 dias ÷ média semanal de 28 dias (com 3+ semanas de registos) |
| Previsões de corrida | **Riegel**: T2 = T1 × (D2/D1)^1,06 a partir do teste de 3 km ou 12 min |
| Zonas de ritmo | ritmo de 5 km estimado + desvio por zona (s/km); remo: parcial de 2 km + desvio (s/500 m) |
| Metas Hyrox | tempos de referência do escalão × (tempo-meta ÷ total de referência) — valores aproximados, editáveis |
| PR | 1RM estimado acima do melhor anterior, só com qualidade técnica 1–2, no mesmo exercício/variante |
| Consistência | semana cumprida = sessões ≥ combinado; streak = semanas cumpridas seguidas; pausas não contam nem quebram |

**Progressão semanal sugerida** (pré-visualização “atual → sugerido”; só grava o que aceitares)

| Método | Regra |
|---|---|
| Dupla progressão | +1 rep/semana até ao topo da gama; no topo, +carga (2,5 kg) e volta ao mínimo |
| +% de carga | carga × (1 + %), arredondada ao passo dos discos (2,5 kg) |
| Volume (resistência) | +10% de duração, ou +1 repetição nos intervalados |
| Deload | 50% das séries/duração, 90% da carga, RPE −1,5; depois retoma da última semana normal |
| Com registos | topo da gama em todas as séries → sobe carga; reps abaixo do alvo → repete; RPE ≥ previsto + 1 → mantém |

**Alertas** (só para o treinador; limiares editáveis): estagnação (melhor 1RM est. de 4 semanas não
supera o anterior), queda de força (> 5%), quebra de assiduidade (< 50% em 2 semanas ou > 10 dias sem
treinar), aumento brusco de carga (rácio > 1,5), RPE alto (≥ 9 em 3 das últimas 4), check-in (dor ≥ 4,
sono/energia ≤ 2), reavaliação em atraso, pacote a acabar. Estagnação e quedas comparam **só séries de
treino** (um teste de avaliação é um esforço máximo; os testes comparam-se nas Avaliações).

Os valores calculados **não são guardados**: calculam-se sempre a partir dos dados brutos, com as mesmas
fórmulas. **Testes automáticos**: abre `testes.html` (58 testes às fórmulas e regras; não mexe nos dados).

---

## 7. Atualizar a app

1. Envia os ficheiros novos para o GitHub (passo 3 da instalação), por cima dos antigos.
2. A cada versão, `VERSAO` em `sw.js` (e `VERSAO_APP` em `js/versao.js`) muda.
3. No iPhone, abre a app: aparece “Nova versão disponível — Recarregar”. Os dados não são afetados;
   a base de dados é atualizada automaticamente (migrações).
4. **Antes de atualizar, faz um backup** — por precaução.

---

## 8. Resolução de problemas

| Problema | Solução |
|---|---|
| Página sem estilo, parada em “A carregar…” | Faltam as pastas no GitHub (ver passo 3). Ao fim de 8 s a página mostra que ficheiros faltam. Teste: `…/treino/css/app.css` tem de mostrar texto, não um erro 404. |
| A app no iPhone não tem os meus dados | Estás a usar o Safari em vez do ícone do ecrã principal (são armazenamentos diferentes). |
| Perdi o telemóvel | Instala no novo iPhone e restaura o último backup `.treino`. |
| Esqueci o PIN da app | “Esqueci o PIN” → apaga os dados → restaura um backup. |
| Esqueci o PIN do modo cliente | Recarregar não sai do modo cliente; sem o PIN, só apagando os dados e restaurando um backup. |
| Esqueci a palavra-passe do backup | Não há forma de o abrir. Cria já um novo backup com uma palavra-passe guardada. |
| “Imprimir” não gera PDF no iPhone | Na pré-visualização de impressão, afasta os dedos → Partilhar → Guardar em Ficheiros. |
| O WhatsApp não aparece ao partilhar a imagem | A imagem fica guardada; anexa-a manualmente na conversa aberta por “💬 Abrir WhatsApp”. |
| A vibração do descanso não funciona no iPhone | O Safari não deixa apps web vibrar; fica o som (Definições → Modo Treino). |
| `iniciar.bat` não abre | Verifica se a porta 8080 está livre; fecha outras janelas do servidor. |

---

## 9. Estrutura do código

```
index.html / sw.js / manifest.webmanifest    app, offline e instalação
css/app.css            estilos (cores da marca em variáveis :root; impressão A4; modo escuro)
lib/                   sql.js (SQLite) e Chart.js, copiados localmente
icons/                 ícones da app
testes.html            testes automáticos das fórmulas
docs/                  modelo de consentimento (RGPD)
js/
  app.js               arranque, tema, router, guarda do modo cliente, bloqueio, aviso de atualização
  db.js                SQLite + IndexedDB (base e fotografias), migrações, gravação
  schema.js            tabelas (migrações v1–v8; nunca alterar uma migração publicada)
  catalogos.js         testes, variantes, valores por defeito
  calc.js / progressao.js / ritmos.js     fórmulas puras
  repo.js              clientes, consentimentos, lesões, avaliações
  repo-planos.js       biblioteca e planos
  repo-sessoes.js      registo de sessões — fonte única do realizado (manual, Modo Treino, agenda)
  repo-pacotes.js      pacotes e pagamentos
  repo-agenda.js       agenda (estado 'agendada' na mesma tabela de sessões)
  repo-motivacao.js    metas, check-ins, pausas, consistência
  repo-fotos.js        fotografias (só com consentimento)
  analise.js           indicadores, alertas, destaques
  visao-cliente.js     o que o CLIENTE pode ver (privacidade + linguagem positiva)
  backup.js            backup encriptado (AES-GCM) com fotografias
  exportar-cliente.js  exportação RGPD por cliente
  pin.js / bloqueio.js PIN (hash com sal) e bloqueio da app
  graficos.js          gráficos (paleta validada, um eixo, tabela alternativa)
  imagem-resumo.js     imagem 1080×1920 em Canvas
  superseries.js       superséries: grupos, rótulos A1/A2, alternância e descansos (funções puras)
  equivalentes.js      equivalentes do resumo semanal
  estabilidade.js      sem zoom nos ecrãs de registo
  ics.js               lembretes para o calendário
  seed.js              biblioteca inicial e dados de exemplo
  views/               ecrãs
iniciar.bat / servidor.ps1   servidor local para o portátil
```

---

## Estado

Todas as fases (1–7) concluídas na v1.0.0. **v1.1.0**: biblioteca expandida (44 → 202 exercícios, sem alterar os existentes) e melhorias de usabilidade em telemóvel e tablet. **v1.2.0**: barra inferior fixa, eliminar série com
“Anular”, séries de aquecimento, superséries, sem zoom nos ecrãs de registo e resumo semanal mais completo
(com equivalentes editáveis).
