# Inteligência de Mercado

> **Antes de mexer no workflow, leia `ARQUITETURA.md`.** Ele traz o esqueleto lógico, a cadeia de nós, o contrato de dados e as regras que não podem ser quebradas. Este arquivo aqui cuida da visão, do processo e do roadmap.

Projeto pessoal de Victor Borges para transformar dados de mercado em decisão. A tese: começar simples (briefing diário automatizado), acumular **histórico próprio** e, com essa base, evoluir para um especialista que usa machine learning sobre números reais para desenhar estratégias.

Regra que guia tudo: **nada de dado sintético ou opinião solta — toda camada nova precisa se apoiar em número verificável e ficar registrada.**

---

## 1. Estado atual (fase 1)

Automação n8n que envia um briefing de mercado por e-mail, seg-sex às 7h30.

```
Agendamento
  → Ibovespa (brapi, 5d)
  → Câmbio USD/EUR + históricos (AwesomeAPI)
  → Selic + IPCA (BCB SGS)
  → S&P 500, Nasdaq, WTI, Ouro (Yahoo chart, 5d)
  → RSS InfoMoney + CNBC
  → Code "Consolidar dados"   → monta indicadores + prompt
  → Gemini 3.5 Flash          → devolve JSON (manchete, análises, 5 notícias)
  → Code "Montar e-mail"      → gera o HTML com os números reais
  → Gmail                     → envia
```

**Decisão de arquitetura importante:** o LLM **nunca** gera HTML nem repete números. Ele recebe dados prontos e devolve **só texto em JSON**; o layout e os valores são montados em código. Isso impede alucinação de número e quebra de layout. Mantenha assim em qualquer evolução.

### Arquivos

| Arquivo | Papel |
|---|---|
| `workflow/briefing-mercado.local.json` | Workflow atual, importável no n8n |
| `ARQUITETURA.md` | Esqueleto lógico, cadeia de nós, contrato de dados e invariantes |
| `scripts/start-n8n.cmd` | Sobe o n8n sem telemetria e com o fuso certo |
| `docs/preview-email.html` | Preview do e-mail com dados de exemplo (abrir no navegador) |
| `build/builder.js` | Gera o HTML do e-mail (design + sparklines) |
| `build/consolidar.js` | Coleta/normaliza dados e monta o prompt |
| `build/make.js` | Junta tudo: gera o preview e o JSON do workflow |
| `docs/pesquisa-agentes-mercado.md` | Pesquisa base: o que os melhores agentes olham, catálogo de APIs |
| `historico/` | Versões antigas do workflow |

### Ambiente e credenciais

- n8n **self-hosted** em `localhost:5678`
- LLM: **Gemini 3.5 Flash** — chave no header `x-goog-api-key`, modelo na URL (`.../models/gemini-3.5-flash:generateContent`)
- Google Cloud: projeto **"Especialista de Mercado"** (`gen-lang-client-0039155807`) — mesma casa da chave Gemini e do OAuth do Gmail
- Envio: **SMTP com senha de app** (smtp.gmail.com:465, SSL) no nó `emailSend`. O nó Gmail OAuth foi abandonado porque o token expira a cada 7 dias com o app em modo de teste. Remetente e destinatário ficam em `build/config.local.js`, que está no `.gitignore`.
- brapi: token gratuito (dashboard em brapi.dev)
- Gráficos: QuickChart (imagem PNG por URL, sem chave) — e-mail não executa JavaScript

---

## 2. Como editar (processo)

**Nunca edite o JSON do workflow à mão.** Ele é gerado. O fluxo é:

```bash
# na pasta build/
node make.js     # regenera o preview E o JSON do workflow
```

1. Mexer no visual do e-mail → editar `build/builder.js`
2. Mexer em fontes de dados, cálculos ou no prompt → editar `build/consolidar.js`
3. Adicionar/remover nós, mudar horário, trocar modelo → editar `build/make.js`
4. Rodar `node make.js`, abrir o preview no navegador e conferir
5. No n8n: importar o JSON novo, recolocar as 3 credenciais (token brapi, chave Gemini, Gmail), **Execute Workflow** para testar
6. Se aprovado, desativar a versão anterior e mover o JSON antigo para `historico/`

**Sempre suba a versão** (v5 → v6) em mudança estrutural: o histórico de versões é o que permite voltar atrás.

### Checklist antes de dar por pronto
- [ ] `node make.js` roda sem erro
- [ ] Preview abre e os 7 indicadores aparecem com sparkline e delta
- [ ] O nó de envio é `emailSend` (SMTP), nunca o nó Gmail
- [ ] Links e imagens das notícias vêm do feed, não do modelo
- [ ] Nenhum número no texto contradiz o painel (o LLM às vezes arredonda — o painel é a verdade)
- [ ] Todo nó de coleta tem `onError: continueRegularOutput` (uma API fora do ar não pode derrubar o briefing)
- [ ] Nomes de nós referenciados no código (`$('Nome')`) batem com os nós reais

### Design system (Malibu Finance)

| Uso | Cor |
|---|---|
| Fundo masthead/rodapé | `#040F2B` |
| Faixa de indicadores | `#0A1E4A` |
| Destaque / kicker | `#00BFFF` / `#0099CC` |
| Texto principal | `#1A2442` · secundário `#5A6880` · muted `#8B9EC7` |
| Alta / baixa | `#4ADE80` / `#F87171` |
| Fundo do e-mail | `#F0F4FF` · divisórias `#E8ECF5` |

Tipografia: Arial/Helvetica 14px no corpo (padrão Exame), Georgia só na manchete, Courier New nos números. Tudo com CSS inline e tabelas — é a única coisa que Gmail e Outlook renderizam igual.

Tom do texto: newsletter tipo *the news* / Morning Brew — frases encadeadas com causa e efeito, explicando por que importa. Sem emoji, sem exclamação, sem clichê de mercado.

---

## 3. Roadmap — do briefing ao especialista

A ordem importa: cada fase produz o insumo da seguinte. **A fase 2 é a mais importante e a mais adiada por todo mundo** — sem histórico gravado, não existe ML depois.

### Fase 2 — Memória (próximo passo)
Gravar cada execução em base estruturada (Postgres ou Google Sheets para começar): data, todos os indicadores, e o texto/manchete gerados. Duas linhas novas no workflow, valor enorme: em 6 meses você tem uma série própria que nenhuma API te vende pronta, já casada com o noticiário do dia.

### Fase 3 — Contexto histórico no briefing
Com a base da fase 2, o e-mail passa a comparar: "Ibovespa no menor nível em 3 semanas", "dólar acumula -2,1% no mês", "quarta queda seguida do Nasdaq". É o que separa um relatório de um analista — e é só SQL, ainda sem ML.

### Fase 4 — Watchlist e fundamentos
Acompanhar sua carteira/tese específica: preço, múltiplos, dividendos, calendário de resultados (brapi + Finnhub). Aqui o briefing vira pessoal, não genérico.

### Fase 5 — Multi-agente (padrão TradingAgents)
Sub-workflows especialistas — técnico, notícias/sentimento, macro, fundamentos — e um agente que confronta visão bull vs bear antes de concluir. É a arquitetura que os melhores repositórios convergiram (ver `docs/pesquisa-agentes-mercado.md`).

### Fase 6 — Camada quantitativa / ML
Só faz sentido com 6-12 meses de histórico. Caminho realista, do mais simples ao mais ambicioso:
1. **Features** sobre a base: retornos, volatilidade, correlações, z-scores, regime de mercado
2. **Backtest honesto** de regras simples antes de qualquer modelo — a maioria das ideias morre aqui, e isso é bom
3. **Modelos supervisionados** (gradient boosting em dados tabulares costuma bater deep learning nesse volume) para probabilidade de movimento, não para "prever preço"
4. **Sentimento quantificado** das notícias (FinBERT / FinGPT) como feature
5. **Registro de acurácia**: toda previsão gravada e comparada com o realizado — o TradingAgents faz isso com um log de reflexão, e é o que impede autoengano

### Fase 7 — Estratégia assistida
O especialista deixa de "informar" e passa a propor: cenários com probabilidade, tamanho de posição por risco, o que invalidaria a tese. Sempre com o número real e o histórico de acerto na mesa.

**Guarda-corpos permanentes:** nada de execução automática de ordens; toda saída é insumo para decisão sua. Rentabilidade passada não garante futuro, e modelo que não erra é modelo com vazamento de dados.

---

## 4. Ideias de projetos-satélite

Coisas que ampliam a área de inteligência de mercado sem atrapalhar o núcleo:

- **Alertas intraday**: workflow separado que avisa (e-mail/WhatsApp) se dólar ou Ibovespa estourar X% no dia
- **Radar setorial**: briefing semanal por setor (bancos, commodities, varejo) usando os mesmos blocos
- **Agenda econômica**: Copom, payroll, CPI, resultados — antecipando o que move a semana
- **Dashboard vivo**: painel HTML que lê a base da fase 2 e mostra as séries acumuladas
- **Boletim de tese**: para cada ativo da watchlist, um dossiê que atualiza sozinho

---

## 5. Preferências de trabalho

- Português, linguagem direta, sem enrolação
- Victor não é desenvolvedor: explicar onde clicar, o que colar e onde — passo a passo, uma tela por vez
- Entregar arquivo pronto e testado, não trecho de código para ele montar
- Verificar as APIs de fato (chamar e olhar a resposta) antes de escrever código em cima
