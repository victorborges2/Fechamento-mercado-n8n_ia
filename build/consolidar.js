// Coleta, normaliza e monta o prompt. Node "Consolidar dados" do n8n.
// Toda fonte que falha entra em `falhas` e é impressa no rodapé do e-mail.
// O modelo escolhe notícia por ÍNDICE; link, imagem e fonte vêm daqui, nunca dele.

const fmtBR = (n, dec) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const indicadores = [];
const macro = [];
const movimentos = [];
const paraTexto = [];
const falhas = [];
// registra o motivo junto com o nome: sem isso, diagnosticar uma queda em massa vira adivinhação
const falhou = (nome, e) => {
  const msg = (e && (e.message || String(e))) || 'sem detalhe';
  falhas.push(nome + ' (' + String(msg).slice(0, 90) + ')');
};

// n8n entrega array JSON como itens separados; isto tolera os dois formatos
const itens = (node) => {
  const arr = $(node).all().map(i => i.json);
  if (arr.length === 1 && Array.isArray(arr[0])) return arr[0];
  return arr;
};

// ---------- Ibovespa (brapi) ----------
try {
  const ibov = $('Ibovespa (brapi)').first().json.results[0];
  if (!ibov || ibov.regularMarketPrice == null) throw new Error('sem cotação');
  // O plano gratuito da brapi devolve a cotação, mas não a série histórica.
  // Os fechamentos de 5 pregões vêm do Yahoo, igual aos demais ativos.
  let closes = [];
  try { closes = (ibov.historicalDataPrice || []).map(h => h.close).filter(c => c != null).slice(-6); } catch (e) {}
  if (!closes.length) {
    try {
      const r = $('Ibovespa 5d (Yahoo)').first().json.chart.result[0];
      closes = r.indicators.quote[0].close.filter(c => c != null).slice(-6);
    } catch (e) {}
  }
  if (!closes.length) falhou('série 5d do Ibovespa', new Error('brapi sem histórico e Yahoo indisponível'));
  indicadores.push({
    nome: 'Ibovespa',
    valor: fmtBR(ibov.regularMarketPrice, 0) + ' pts',
    delta: ibov.regularMarketChangePercent ?? null,
    closes
  });
  paraTexto.push('Ibovespa: ' + fmtBR(ibov.regularMarketPrice, 0) + ' pts (' + (ibov.regularMarketChangePercent ?? 0).toFixed(2) + '% no dia)');
} catch (e) { falhou('Ibovespa (brapi)', e); }

// ---------- Câmbio (AwesomeAPI) ----------
const fxHist = (node, rotulo) => {
  try {
    const lista = itens(node).map(x => Number(x.bid)).filter(v => isFinite(v));
    if (lista.length < 3) throw new Error('série curta');
    return lista.reverse();
  } catch (e) { falhou('série 5d do ' + rotulo, e); return []; }
};
try {
  const fx = $('Câmbio (AwesomeAPI)').first().json;
  indicadores.push({ nome: 'Dólar', valor: 'R$ ' + fmtBR(fx.USDBRL.bid, 2), delta: Number(fx.USDBRL.pctChange), closes: fxHist('Histórico Dólar (AwesomeAPI)', 'dólar') });
  indicadores.push({ nome: 'Euro', valor: 'R$ ' + fmtBR(fx.EURBRL.bid, 2), delta: Number(fx.EURBRL.pctChange), closes: fxHist('Histórico Euro (AwesomeAPI)', 'euro') });
  paraTexto.push('Dólar: R$ ' + fmtBR(fx.USDBRL.bid, 2) + ' (' + fx.USDBRL.pctChange + '% no dia)');
  paraTexto.push('Euro: R$ ' + fmtBR(fx.EURBRL.bid, 2) + ' (' + fx.EURBRL.pctChange + '% no dia)');
} catch (e) { falhou('Câmbio (AwesomeAPI)', e); }

// ---------- Índices e commodities: Yahoo, com Stooq de reserva ----------
const doYahoo = (node) => {
  const r = $(node).first().json.chart.result[0];
  const m = r.meta;
  if (m.regularMarketPrice == null) throw new Error('sem preço');
  const ant = m.chartPreviousClose ?? m.previousClose;
  let closes = [];
  try { closes = r.indicators.quote[0].close.filter(c => c != null).slice(-6); } catch (e) {}
  return { preco: m.regularMarketPrice, delta: ant ? ((m.regularMarketPrice - ant) / ant) * 100 : null, closes };
};
const doStooq = (node) => {
  const first = $(node).first().json;
  const txt = typeof first === 'string' ? first : (first.data || first.body || JSON.stringify(first));
  const closes = String(txt).trim().split('\n').slice(1).map(l => Number(l.split(',')[4])).filter(v => isFinite(v));
  if (closes.length < 2) throw new Error('csv vazio');
  const ult = closes[closes.length - 1], ant = closes[closes.length - 2];
  return { preco: ult, delta: ((ult - ant) / ant) * 100, closes: closes.slice(-6) };
};
const ativo = (nome, nodeYahoo, nodeStooq, prefixo, dec) => {
  let r = null, ultimoErro = null;
  try { r = doYahoo(nodeYahoo); } catch (e) { ultimoErro = e; }
  if (!r) { try { r = doStooq(nodeStooq); falhas.push(nome + ': Yahoo fora, usei Stooq'); } catch (e) { ultimoErro = e; } }
  if (!r) { falhou(nome, ultimoErro || new Error('Yahoo e Stooq indisponíveis')); return; }
  indicadores.push({ nome, valor: prefixo + fmtBR(r.preco, dec), delta: r.delta, closes: r.closes });
  paraTexto.push(nome + ': ' + prefixo + fmtBR(r.preco, dec) + ' (' + (r.delta ?? 0).toFixed(2) + '% no dia)');
};
ativo('S&P 500', 'S&P 500 (Yahoo)', 'S&P 500 (Stooq)', '', 2);
ativo('Nasdaq', 'Nasdaq (Yahoo)', 'Nasdaq (Stooq)', '', 2);
ativo('Petróleo WTI', 'Petróleo WTI (Yahoo)', 'Petróleo WTI (Stooq)', 'US$ ', 2);
ativo('Ouro', 'Ouro (Yahoo)', 'Ouro (Stooq)', 'US$ ', 2);

// ---------- Movimentos do dia: maiores altas e baixas da B3 ----------
// Dois nós distintos: o endpoint ordena numa direção só. Pedir "as últimas da lista de altas"
// devolvia papéis que SUBIRAM pouco, apresentados como se fossem quedas.
//
// Filtro de relevância: fora fracionários (sufixo F), BDRs (34/35/39) e papéis sem liquidez.
// Sem isso o bloco vira vitrine de ação ilíquida com +260% que não diz nada sobre o mercado.
const VOLUME_MINIMO = 1000000; // R$ 1 mi no dia
const relevante = (a) => {
  if (!a || a.change == null || !isFinite(a.change) || a.close == null) return false;
  const t = String(a.stock || '');
  if (!/^[A-Z]{4}(3|4|5|6|11)$/.test(t)) return false;        // só ON, PN e units
  if (/(34|35|39)$/.test(t)) return false;                     // BDR
  const vol = Number(a.volume || 0) * Number(a.close || 0);
  return vol >= VOLUME_MINIMO;
};
const pegarRanking = (node, rotulo, quantos) => {
  const lista = (($(node).first().json || {}).stocks) || [];
  const bons = lista.filter(relevante);
  if (!bons.length) throw new Error(rotulo + ': nenhum papel passou no filtro de liquidez');
  return bons.slice(0, quantos);
};
try {
  const altas = pegarRanking('Ranking B3 altas (brapi)', 'altas', 2);
  altas.forEach(a => movimentos.push({ ticker: a.stock, valor: 'R$ ' + fmtBR(a.close, 2), delta: Number(a.change) }));
  paraTexto.push('Maiores altas da B3: ' + altas.map(a => a.stock + ' ' + a.change.toFixed(2) + '%').join(', '));
} catch (e) { falhou('Maiores altas (brapi)', e); }
try {
  const baixas = pegarRanking('Ranking B3 baixas (brapi)', 'baixas', 2);
  baixas.forEach(a => movimentos.push({ ticker: a.stock, valor: 'R$ ' + fmtBR(a.close, 2), delta: Number(a.change) }));
  paraTexto.push('Maiores quedas da B3: ' + baixas.map(a => a.stock + ' ' + a.change.toFixed(2) + '%').join(', '));
} catch (e) { falhou('Maiores quedas (brapi)', e); }

// ---------- Macro (séries SGS do Banco Central) ----------
const serieBCB = (node) => {
  const lista = itens(node);
  const ultimo = lista[lista.length - 1];
  if (!ultimo || ultimo.valor == null) throw new Error('sem série');
  return ultimo;
};
try {
  const s = serieBCB('Selic (BCB)');
  macro.push({ nome: 'Selic (meta)', valor: String(s.valor).replace('.', ',') + '% a.a.', nota: 'vigente' });
  paraTexto.push('Selic meta: ' + s.valor + '% a.a.');
} catch (e) { falhou('Selic (BCB)', e); }
try {
  const i = serieBCB('IPCA (BCB)');
  macro.push({ nome: 'IPCA', valor: String(i.valor).replace('.', ',') + '%', nota: 'último mês fechado' });
  paraTexto.push('IPCA do último mês fechado: ' + i.valor + '%');
} catch (e) { falhou('IPCA (BCB)', e); }

// ---------- Notícias: vários portais, com link e imagem reais ----------
const limpar = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const url = (s) => String(s || '').replace(/&amp;/g, '&').trim();
const acharImagem = (it) => {
  const cand = [
    it.enclosure && it.enclosure.url,
    it.enclosure && it.enclosure.link,
    it['media:content'] && (it['media:content'].url || (it['media:content'].$ && it['media:content'].$.url)),
    it['media:thumbnail'] && (it['media:thumbnail'].url || (it['media:thumbnail'].$ && it['media:thumbnail'].$.url)),
    it.image && (it.image.url || it.image),
    it.thumbnail
  ];
  for (const c of cand) if (typeof c === 'string' && /^https?:\/\//.test(c)) return url(c);
  const html = String(it['content:encoded'] || it.content || it.description || it.summary || '');
  const m = html.match(/<img[^>]+src=["']?(https?:\/\/[^"'\s>]+)/i);
  return m ? url(m[1]) : '';
};
const noticias = [];
const lerFeed = (node, fonte) => {
  try {
    const arr = $(node).all().map(i => i.json);
    if (!arr.length) throw new Error('feed vazio');
    arr.slice(0, 8).forEach(it => {
      const titulo = limpar(it.title);
      if (!titulo) return;
      noticias.push({
        fonte,
        titulo,
        link: url(typeof it.link === 'string' ? it.link : ((it.link && it.link.href) || '')),
        imagem: acharImagem(it),
        resumo: limpar(it.contentSnippet || it.description || it.summary).slice(0, 220)
      });
    });
  } catch (e) { falhou(fonte, e); }
};
lerFeed('Notícias BR (InfoMoney)', 'InfoMoney');
lerFeed('Notícias BR (Money Times)', 'Money Times');
lerFeed('Notícias BR (Exame)', 'Exame');
lerFeed('Notícias BR (G1 Economia)', 'G1 Economia');
lerFeed('Notícias Global (CNBC)', 'CNBC');

// Intercala os portais (round-robin). Sem isso o catálogo fica em blocos por fonte
// e o modelo tende a escolher as 5 primeiras, todas do mesmo lugar.
const porFonte = {};
noticias.forEach(n => { (porFonte[n.fonte] = porFonte[n.fonte] || []).push(n); });
const fontes = Object.keys(porFonte);
const intercaladas = [];
for (let r = 0; intercaladas.length < noticias.length; r++) {
  let achou = false;
  for (const f of fontes) {
    if (porFonte[f][r]) { intercaladas.push(porFonte[f][r]); achou = true; }
  }
  if (!achou) break;
}
noticias.length = 0;
noticias.push(...intercaladas);

const catalogo = noticias.map((n, i) => '[' + i + '] (' + n.fonte + ') ' + n.titulo + (n.resumo ? ' — ' + n.resumo : '')).join('\n');
const fontesDisponiveis = fontes.length;

// ---------- Contexto temporal ----------
const agora = new Date();
const dataFmt = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
const horaFmt = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const hora = Number(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }));

let recorte, instrucaoTempo;
if (hora < 10) {
  recorte = 'antes da abertura';
  instrucaoTempo = 'O briefing sai antes da abertura do pregão brasileiro. Os números de ações locais referem-se ao fechamento anterior: fale no passado sobre ontem e no futuro sobre o que o dia reserva.';
} else if (hora < 18) {
  recorte = 'pregão em andamento';
  instrucaoTempo = 'O pregão está aberto. Deixe claro que os números brasileiros são parciais e use o presente: opera, avança, recua.';
} else {
  recorte = 'após o fechamento';
  instrucaoTempo = 'O pregão já fechou. Use o passado: fechou, encerrou o dia.';
}

const prompt = 'Você assina o briefing de mercado de ' + dataFmt + ', publicado ' + recorte + ' (' + horaFmt + ' de Brasília), para um investidor brasileiro.\n\n' +
  'ESTILO: newsletter de research, escrita fluida, frases encadeadas por causa e efeito. Sempre que citar projeção ou opinião de terceiro, atribua a quem disse. Quando um número for grande demais para intuir, dê uma referência de comparação. Proibido: emoji, exclamação, clichê de mercado, e qualquer número que não esteja nos dados abaixo. ' + instrucaoTempo + '\n\n' +
  'DADOS DE MERCADO (esta é a lista COMPLETA do que existe hoje):\n' + paraTexto.join('\n') + '\n\n' +
  'REGRA ABSOLUTA: só escreva sobre indicador que aparece na lista acima. Se não há dado de índices americanos, commodities ou macro, devolva STRING VAZIA ("") no campo correspondente. Uma seção omitida é correta; uma seção escrita sem dado é erro grave. Não use conhecimento próprio sobre o mercado para preencher lacuna, não descreva clima de mercado genérico ("postura defensiva", "cautela dos investidores") sem número que sustente.\n\n' +
  'NOTÍCIAS DISPONÍVEIS (escolha pelo índice entre colchetes):\n' + (catalogo || 'indisponível') + '\n\n' +
  'Responda SOMENTE com JSON válido, sem markdown, neste formato:\n' +
  '{\n' +
  '  "manchete": "título do dia, máx 95 caracteres, com o fato principal e um número quando couber",\n' +
  '  "lead": "2 a 3 frases que resumem a edição inteira; quem ler só isso entende o dia",\n' +
  '  "visao_geral": "2 a 3 frases ligando o cenário externo ao doméstico",\n' +
  '  "brasil": "3 a 5 frases sobre Ibovespa, câmbio, maiores altas e quedas e o que explica os movimentos",\n' +
  '  "eua_mundo": "3 a 5 frases sobre índices americanos, commodities e o pano de fundo macro",\n' +
  '  "implicacao": "2 a 3 frases de leitura estratégica: que tese ganha ou perde força. Comece pela avaliação, não por resumo",\n' +
  '  "vetor": "uma frase: o indicador, evento ou preço a acompanhar para confirmar ou derrubar a leitura acima",\n' +
  '  "entenda": { "titulo": "pergunta curta sobre o mecanismo menos óbvio do dia", "texto": "2 a 3 frases explicando esse mecanismo para quem não é do mercado" },\n' +
  '  "noticias": []   // se não houver notícia no catálogo, devolva lista vazia\n' +
  '  // formato quando houver: [ { "i": 0, "titulo": "manchete reescrita de forma clara e direta", "contexto": "1 a 2 frases de por que isso importa para quem investe" } ]\n' +
  '}\n' +
  'Qualquer campo de texto cujo assunto não tenha dado disponível deve vir como "" (string vazia), e "noticias" como lista vazia se o catálogo estiver indisponível. Em "noticias" escolha 5 itens, misturando Brasil e mundo, priorizando impacto de mercado e descartando fait divers. ' +
  (fontesDisponiveis >= 3
    ? 'Obrigatório: as 5 escolhas devem vir de pelo menos 3 portais diferentes entre os disponíveis, e no máximo 2 podem ser do mesmo portal. '
    : '') +
  'O campo "i" é obrigatório e deve ser o índice exato da notícia escolhida: é por ele que o link e a imagem originais são recuperados. Não repita índice. Texto puro nos valores, sem HTML e sem aspas duplas internas.';

return [{ json: { prompt, indicadores, macro, movimentos, noticias, dataFmt, horaFmt, recorte, falhas, edicao: 'Briefing diário' } }];
