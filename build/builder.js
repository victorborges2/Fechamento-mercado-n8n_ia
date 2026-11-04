// Monta o HTML do briefing. Padrão visual Malibu + estrutura editorial de research institucional.
// Regra: este arquivo NUNCA inventa número. Recebe `base` (dados reais) e `ia` (texto do modelo).

function montarEmail(base, ia) {
  var NAVY = '#040F2B', BANDA = '#0A1E4A', CYAN = '#00BFFF', CYAN_DK = '#0099CC';
  var TXT = '#1A2442', SEC = '#5A6880', MUTED = '#8B9EC7', LINHA = '#E8ECF5', OFF = '#F0F4FF';
  var UP = '#4ADE80', DOWN = '#F87171', FLAT = '#B9C6E4';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // delta: trata o quase-zero (evita o "-0,00%") e devolve sinal, cor e rótulo
  function lerDelta(d) {
    if (d === null || d === undefined || !isFinite(d)) return null;
    var zero = Math.abs(d) < 0.005;
    return {
      zero: zero,
      up: !zero && d > 0,
      down: !zero && d < 0,
      cor: zero ? FLAT : (d > 0 ? UP : DOWN),
      texto: zero ? '0,00%' : (d > 0 ? '+' : '−') + Math.abs(d).toFixed(2).replace('.', ',') + '%',
      seta: zero ? '&#9644;' : (d > 0 ? '&#9650;' : '&#9660;')
    };
  }

  // sparkline como imagem (e-mail não executa JS). Cor segue o MESMO sinal do delta do dia.
  function spark(closes, cor) {
    if (!closes || closes.length < 3) return '';
    var dados = closes.filter(function (c) { return c !== null && isFinite(c); })
      .map(function (c) { return Math.round(c * 10000) / 10000; });
    if (dados.length < 3) return '';
    var cfg = "{type:'sparkline',data:{datasets:[{data:[" + dados.join(',') +
      "],borderColor:'" + cor + "',borderWidth:2.5,fill:false,pointRadius:0}]}}";
    return 'https://quickchart.io/chart?w=92&h=30&c=' + encodeURIComponent(cfg);
  }

  // ---------------- faixa de indicadores ----------------
  var linhas = (base.indicadores || []).map(function (i) {
    var dl = lerDelta(i.delta);
    var cor = dl ? dl.cor : FLAT;
    var chip = '<span style="font-family:\'Courier New\',monospace;font-size:13px;color:' + MUTED + ';">&mdash;</span>';
    if (dl) {
      var fundo = dl.zero ? 'rgba(139,158,199,0.15)' : (dl.up ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)');
      chip = '<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:' + fundo +
        ';color:' + cor + ';font-family:\'Courier New\',monospace;font-size:13px;font-weight:700;white-space:nowrap;">' +
        dl.seta + ' ' + dl.texto + '</span>';
    }
    var url = spark(i.closes, cor);
    var grafico = url
      ? '<img src="' + url + '" width="92" height="30" alt="" style="display:block;border:0;" />'
      : '<span style="font-family:Arial,sans-serif;font-size:10px;color:#2E4572;">s/ s&eacute;rie</span>';

    return '<tr>' +
      '<td style="padding:11px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:1.2px;color:#B9C6E4;text-transform:uppercase;font-weight:700;">' + esc(i.nome) + '</td>' +
      '<td align="center" width="104" style="padding:11px 0;">' + grafico + '</td>' +
      '<td align="right" style="padding:11px 0;font-family:\'Courier New\',monospace;font-size:18px;color:#FFFFFF;font-weight:700;white-space:nowrap;">' + esc(i.valor) + '</td>' +
      '<td align="right" width="108" style="padding:11px 0 11px 14px;">' + chip + '</td>' +
      '</tr>';
  }).join('<tr><td colspan="4" style="border-bottom:1px solid rgba(139,158,199,0.15);font-size:0;line-height:0;">&nbsp;</td></tr>');

  // ---------------- blocos reutilizáveis ----------------
  function kicker(num, titulo) {
    return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:12px;"><tr>' +
      '<td width="3" style="background:' + CYAN + ';font-size:0;line-height:0;">&nbsp;</td>' +
      '<td style="padding-left:10px;font-family:\'Courier New\',monospace;font-size:11px;letter-spacing:1.6px;color:' + CYAN_DK + ';text-transform:uppercase;font-weight:700;">' +
      (num ? num + ' // ' : '') + titulo + '</td></tr></table>';
  }

  function secao(num, titulo, texto) {
    if (!texto) return '';
    return '<tr><td style="padding:28px 36px 0;">' + kicker(num, titulo) +
      '<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.62;color:#33415C;text-align:justify;">' + esc(texto) + '</p>' +
      '</td></tr>';
  }

  // ---------------- notícias (link e imagem vêm do feed, nunca do modelo) ----------------
  var catalogo = base.noticias || [];
  var escolhidas = (ia.noticias || []).slice(0, 5).map(function (n) {
    var orig = (typeof n.i === 'number' && catalogo[n.i]) ? catalogo[n.i] : {};
    return {
      titulo: n.titulo || orig.titulo || '',
      contexto: n.contexto || '',
      link: orig.link || '',
      imagem: orig.imagem || '',
      fonte: orig.fonte || ''
    };
  }).filter(function (n) { return n.titulo; });

  function selo(fonte) {
    if (!fonte) return '';
    return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:' + OFF +
      ';font-family:Arial,Helvetica,sans-serif;font-size:9.5px;letter-spacing:0.8px;text-transform:uppercase;font-weight:700;color:' + CYAN_DK + ';">' + esc(fonte) + '</span>';
  }
  function linkar(texto, url, estilo) {
    return url
      ? '<a href="' + esc(url) + '" style="' + estilo + 'text-decoration:none;" target="_blank">' + texto + '</a>'
      : '<span style="' + estilo + '">' + texto + '</span>';
  }

  // feeds costumam servir miniatura redimensionada; para o destaque pedimos o original
  function imagemGrande(u) {
    var s = String(u || '');
    var i = s.indexOf('?');
    if (i < 0) return s;
    var base = s.slice(0, i);
    var resto = s.slice(i + 1).split('&').filter(function (p) {
      return !/^(fit|resize|w|width|h|height)=/i.test(p);
    });
    return resto.length ? base + '?' + resto.join('&') : base;
  }

  var destaque = '';
  if (escolhidas.length) {
    var d = escolhidas[0];
    destaque =
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + OFF + ';border-radius:12px;overflow:hidden;">' +
      (d.imagem
        ? '<tr><td>' + linkar('<img src="' + esc(imagemGrande(d.imagem)) + '" width="528" alt="" style="display:block;width:100%;max-width:528px;height:auto;border:0;border-radius:12px 12px 0 0;" />', d.link, '') + '</td></tr>'
        : '') +
      '<tr><td style="padding:16px 20px 18px;">' +
      selo(d.fonte) +
      '<div style="margin-top:8px;">' +
      linkar(esc(d.titulo), d.link, 'font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:' + TXT + ';line-height:1.38;display:block;') +
      '</div>' +
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:' + SEC + ';line-height:1.58;margin-top:7px;">' + esc(d.contexto) + '</div>' +
      (d.link ? '<div style="margin-top:10px;"><a href="' + esc(d.link) + '" target="_blank" style="font-family:Arial,Helvetica,sans-serif;font-size:11.5px;font-weight:700;letter-spacing:0.6px;color:' + CYAN_DK + ';text-decoration:none;text-transform:uppercase;">Ler no ' + esc(d.fonte || 'portal') + ' &rarr;</a></div>' : '') +
      '</td></tr></table>';
  }

  var restantes = escolhidas.slice(1).map(function (n, idx) {
    var thumb = n.imagem
      ? '<td width="78" valign="top" style="padding-right:14px;">' +
        linkar('<img src="' + esc(n.imagem) + '" width="78" height="58" alt="" style="display:block;width:78px;height:58px;object-fit:cover;border:0;border-radius:6px;" />', n.link, '') +
        '</td>'
      : '<td width="40" valign="top" style="font-family:\'Courier New\',monospace;font-size:18px;font-weight:700;color:' + CYAN + ';">' + ('0' + (idx + 2)) + '</td>';
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;"><tr>' + thumb +
      '<td valign="top">' +
      selo(n.fonte) +
      '<div style="margin-top:5px;">' +
      linkar(esc(n.titulo), n.link, 'font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:' + TXT + ';line-height:1.42;display:block;') +
      '</div>' +
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:' + SEC + ';line-height:1.55;margin-top:4px;">' + esc(n.contexto) + '</div>' +
      '</td></tr></table>';
  }).join('');

  var blocoNoticias = escolhidas.length
    ? '<tr><td style="padding:28px 36px 0;">' + kicker('04', 'O que importa hoje') + destaque + restantes + '</td></tr>'
    : '';

  // ---------------- entenda (box didático, no espírito do "por que isso acontece") ----------------
  var blocoEntenda = (ia.entenda && ia.entenda.texto)
    ? '<tr><td style="padding:28px 36px 0;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ' + LINHA + ';border-radius:10px;"><tr><td style="padding:16px 20px;">' +
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13.5px;font-weight:700;color:' + TXT + ';">' + esc(ia.entenda.titulo || 'Entenda') + '</div>' +
      '<p style="margin:7px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:' + SEC + ';">' + esc(ia.entenda.texto) + '</p>' +
      '</td></tr></table></td></tr>'
    : '';

  // ---------------- movimentos do dia ----------------
  var movs = (base.movimentos || []).map(function (m) {
    var dl = lerDelta(m.delta);
    return '<td align="center" style="padding:12px 6px;background:' + OFF + ';border-radius:9px;">' +
      '<div style="font-family:\'Courier New\',monospace;font-size:12.5px;font-weight:700;color:' + TXT + ';letter-spacing:0.5px;">' + esc(m.ticker) + '</div>' +
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:' + SEC + ';margin-top:3px;">' + esc(m.valor) + '</div>' +
      '<div style="font-family:\'Courier New\',monospace;font-size:12.5px;font-weight:700;color:' + (dl ? (dl.zero ? SEC : (dl.up ? '#16A34A' : '#DC2626')) : SEC) + ';margin-top:3px;">' + (dl ? dl.seta + ' ' + dl.texto : '&mdash;') + '</div>' +
      '</td>';
  }).join('<td width="8"></td>');

  var blocoMovimentos = (base.movimentos || []).length
    ? '<tr><td style="padding:28px 36px 0;">' + kicker('', 'Movimentos do dia na B3') +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' + movs + '</tr></table>' +
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:' + MUTED + ';margin-top:8px;">Maiores altas e quedas entre as a&ccedil;&otilde;es acompanhadas.</div>' +
      '</td></tr>'
    : '';

  // ---------------- implicação estratégica ----------------
  var blocoImplicacao = ia.implicacao
    ? '<tr><td style="padding:28px 36px 0;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + OFF + ';border-radius:10px;"><tr>' +
      '<td width="4" style="background:' + CYAN + ';font-size:0;line-height:0;border-radius:10px 0 0 10px;">&nbsp;</td>' +
      '<td style="padding:18px 22px;">' +
      '<div style="font-family:\'Courier New\',monospace;font-size:11px;letter-spacing:1.6px;color:' + CYAN_DK + ';text-transform:uppercase;font-weight:700;margin-bottom:8px;">03 // Implica&ccedil;&atilde;o estrat&eacute;gica</div>' +
      '<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.62;color:' + TXT + ';font-style:italic;">' + esc(ia.implicacao) + '</p>' +
      (ia.vetor ? '<p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;line-height:1.55;color:' + SEC + ';"><strong style="color:' + TXT + ';">Vetor a monitorar:</strong> ' + esc(ia.vetor) + '</p>' : '') +
      '<p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:' + MUTED + ';">Leitura de cen&aacute;rio, n&atilde;o recomenda&ccedil;&atilde;o de investimento.</p>' +
      '</td></tr></table></td></tr>'
    : '';

  // ---------------- macro ----------------
  var cards = (base.macro || []);
  var macroCols = cards.map(function (m) {
    return '<td align="center" width="' + Math.floor(100 / cards.length) + '%" style="padding:14px 10px;background:' + OFF + ';border-radius:10px;">' +
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:1.2px;color:' + MUTED + ';text-transform:uppercase;font-weight:700;">' + esc(m.nome) + '</div>' +
      '<div style="font-family:\'Courier New\',monospace;font-size:17px;font-weight:700;color:' + TXT + ';margin-top:5px;">' + esc(m.valor) + '</div>' +
      (m.nota ? '<div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:' + MUTED + ';margin-top:3px;">' + esc(m.nota) + '</div>' : '') +
      '</td>';
  }).join('<td width="10"></td>');

  var blocoMacro = cards.length
    ? '<tr><td style="padding:28px 36px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' + macroCols + '</tr></table></td></tr>'
    : '';

  // ---------------- documento ----------------
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:' + OFF + ';">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + OFF + ';"><tr><td align="center" style="padding:28px 12px;">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">' +

    // masthead
    '<tr><td style="background:' + NAVY + ';border-radius:14px 14px 0 0;padding:30px 36px 26px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:800;letter-spacing:-0.2px;color:#FFFFFF;">INTELIG&Ecirc;NCIA DE MERCADO<span style="color:' + CYAN + ';">.</span></td>' +
    '<td align="right" style="font-family:\'Courier New\',monospace;font-size:10px;letter-spacing:1.4px;color:' + MUTED + ';text-transform:uppercase;">' + esc(base.edicao || 'Briefing diário') + '</td>' +
    '</tr></table>' +
    '<div style="font-family:\'Courier New\',monospace;font-size:10.5px;letter-spacing:1.1px;color:' + MUTED + ';text-transform:uppercase;margin-top:20px;">' + esc(base.dataFmt) + ' &middot; ' + esc(base.recorte || '') + '</div>' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:25px;line-height:1.28;color:#FFFFFF;margin-top:10px;font-weight:700;">' + esc(ia.manchete || 'Resumo do mercado') + '</div>' +
    (ia.lead ? '<p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.6;color:#B9C6E4;font-style:italic;">' + esc(ia.lead) + '</p>' : '') +
    '</td></tr>' +

    // faixa de mercados
    '<tr><td style="background:' + BANDA + ';padding:24px 36px 20px;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1.8px;color:' + CYAN + ';text-transform:uppercase;font-weight:800;margin-bottom:12px;">Mercados agora &middot; tend&ecirc;ncia 5 dias</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + linhas + '</table>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:10.5px;line-height:1.5;color:#5A6880;margin-top:14px;">Varia&ccedil;&atilde;o no dia. Minigr&aacute;fico: fechamentos dos &uacute;ltimos 5 preg&otilde;es. Captura &agrave;s ' + esc(base.horaFmt) + '.</div>' +
    '</td></tr>' +

    // corpo
    '<tr><td style="background:#FFFFFF;padding:2px 0 0;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
    secao('', 'Visão geral', ia.visao_geral) +
    blocoMacro +
    secao('01', 'Brasil', ia.brasil) +
    blocoMovimentos +
    secao('02', 'EUA e mundo', ia.eua_mundo) +
    blocoImplicacao +
    blocoEntenda +
    blocoNoticias +

    // assinatura
    '<tr><td style="padding:30px 36px 0;">' +
    '<div style="border-top:2px solid ' + LINHA + ';padding-top:16px;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:' + TXT + ';">Victor Borges</div>' +
    '<div style="font-family:\'Courier New\',monospace;font-size:11px;letter-spacing:1px;color:' + MUTED + ';text-transform:uppercase;margin-top:3px;">Intelig&ecirc;ncia de Mercado &middot; briefing automatizado</div>' +
    '</div></td></tr>' +
    '<tr><td style="padding:26px 36px;"></td></tr>' +
    '</table></td></tr>' +

    // rodapé
    '<tr><td style="background:' + NAVY + ';border-radius:0 0 14px 14px;padding:22px 36px;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:' + MUTED + ';line-height:1.65;">Gerado automaticamente &agrave;s ' + esc(base.horaFmt) + ' (hor&aacute;rio de Bras&iacute;lia). Cota&ccedil;&otilde;es: B3 via brapi, c&acirc;mbio via AwesomeAPI, &iacute;ndices e commodities via Yahoo Finance com fallback Stooq. Macro: s&eacute;ries SGS do Banco Central. Not&iacute;cias: InfoMoney, Money Times, Exame, G1 Economia e CNBC. Texto redigido por modelo de linguagem a partir desses dados; os n&uacute;meros do painel v&ecirc;m direto das fontes, sem interm&eacute;dio do modelo.</div>' +
    ((base.falhas && base.falhas.length)
      ? '<div style="font-family:\'Courier New\',monospace;font-size:10.5px;color:' + DOWN + ';line-height:1.6;margin-top:8px;">Fontes indispon&iacute;veis nesta execu&ccedil;&atilde;o: ' + esc(base.falhas.join(', ')) + '</div>'
      : '') +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#5A6880;line-height:1.6;margin-top:10px;">Material de car&aacute;ter exclusivamente informativo, de uso pessoal. N&atilde;o constitui oferta, recomenda&ccedil;&atilde;o ou aconselhamento de investimento. Rentabilidade passada n&atilde;o garante resultados futuros.</div>' +
    '</td></tr>' +

    '</table></td></tr></table></body></html>';
}

if (typeof module !== 'undefined') module.exports = { montarEmail };
