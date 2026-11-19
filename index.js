require('dotenv').config();
const http = require('http');
const { Client, GatewayIntentBits, Events } = require('discord.js');

// Servidor web mínimo para hospedagens gratuitas (ex: Render Web Service).
// Um monitor externo (UptimeRobot) acessa esse endereço a cada 5 minutos
// para impedir que o serviço seja colocado para dormir.
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Dual Capital bot online');
  })
  .listen(PORT, () => console.log(`Servidor de status na porta ${PORT}`));

const {
  DISCORD_TOKEN,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  SOURCE_CHANNEL_IDS,
  ALLOWED_USER_IDS = '',
  PREFIX = '!call',
  REQUIRE_PREFIX = 'false',
  CHANNEL_NAME = 'DUAL CAPITAL',
  DISCLAIMER = '⚠️ Conteúdo informativo. Não é recomendação de investimento. Opere com gestão de risco.',
} = process.env;

for (const [name, value] of Object.entries({
  DISCORD_TOKEN,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  SOURCE_CHANNEL_IDS,
})) {
  if (!value) {
    console.error(`Variável ${name} não definida no arquivo .env`);
    process.exit(1);
  }
}

const sourceChannels = new Set(
  SOURCE_CHANNEL_IDS.split(',').map((id) => id.trim()).filter(Boolean)
);

const allowedUsers = new Set(
  ALLOWED_USER_IDS.split(',').map((id) => id.trim()).filter(Boolean)
);

// ---------- Utilidades ----------

const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Converte o texto do Discord para o formato HTML do Telegram, mantendo o conteúdo intacto.
// **negrito** do Discord vira negrito no Telegram; o resto (links, emojis) segue igual.
const toTelegramHtml = (text) =>
  escapeHtml(text).replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>');

// Remove @everyone e @here do texto do Discord. No Telegram, "@everyone" vira
// a marcação de um usuário/grupo com esse nome, então não deve ser copiado.
const stripMassMentions = (text) =>
  text
    .replace(/@(everyone|here)\b/gi, '')
    .replace(/[ \t]+$/gm, '') // espaços que sobram no fim das linhas
    .replace(/\n{3,}/g, '\n\n') // linhas em branco que sobram
    .trim();

const normalizeKey = (key) =>
  key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * Lê mensagens no formato:
 *
 * !call
 * ativo: BTCUSDT
 * direcao: LONG
 * entrada: 65000
 * stop: 64000
 * alvo1: 66000
 * alvo2: 67000
 * obs: texto livre
 */
function parseCall(body) {
  const data = { alvos: [] };
  let found = false;

  for (const line of body.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;

    const key = normalizeKey(line.slice(0, idx));
    const value = line.slice(idx + 1).trim();
    if (!value) continue;

    if (['ativo', 'par', 'ticker', 'moeda'].includes(key)) data.ativo = value;
    else if (['direcao', 'tipo', 'lado', 'operacao'].includes(key)) data.direcao = value;
    else if (['entrada', 'preco', 'entry'].includes(key)) data.entrada = value;
    else if (['stop', 'sl', 'stoploss'].includes(key)) data.stop = value;
    else if (/^(alvo|alvos|tp|take|target)\s*\d*$/.test(key)) data.alvos.push(value);
    else if (['alavancagem', 'lev', 'leverage'].includes(key)) data.alavancagem = value;
    else if (['obs', 'observacao', 'observacoes', 'nota'].includes(key)) data.obs = value;
    else continue;

    found = true;
  }

  return found ? data : null;
}

function directionEmoji(direcao = '') {
  const d = normalizeKey(direcao);
  if (/(long|compra|buy)/.test(d)) return '🟢';
  if (/(short|venda|sell)/.test(d)) return '🔴';
  return '⚪';
}

function formatCall(data) {
  const lines = [`📊 <b>NOVA CALL | ${escapeHtml(CHANNEL_NAME)}</b>`, ''];

  if (data.ativo) lines.push(`🪙 <b>Ativo:</b> ${escapeHtml(data.ativo)}`);
  if (data.direcao)
    lines.push(`${directionEmoji(data.direcao)} <b>Direção:</b> ${escapeHtml(data.direcao)}`);
  if (data.alavancagem) lines.push(`⚙️ <b>Alavancagem:</b> ${escapeHtml(data.alavancagem)}`);
  if (data.entrada) lines.push(`🎯 <b>Entrada:</b> ${escapeHtml(data.entrada)}`);
  if (data.stop) lines.push(`🛑 <b>Stop:</b> ${escapeHtml(data.stop)}`);

  data.alvos.forEach((alvo, i) => {
    lines.push(`✅ <b>Alvo ${i + 1}:</b> ${escapeHtml(alvo)}`);
  });

  if (data.obs) lines.push('', `📝 <b>Obs:</b> ${escapeHtml(data.obs)}`);
  if (DISCLAIMER) lines.push('', `<i>${escapeHtml(DISCLAIMER)}</i>`);

  return lines.join('\n');
}

// ---------- Telegram ----------

async function telegram(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json;
}

async function sendToTelegram(text, imageUrls) {
  const base = { chat_id: TELEGRAM_CHAT_ID, parse_mode: 'HTML' };

  // Legenda de foto no Telegram tem limite de 1024 caracteres
  const fitsCaption = text.length <= 1024;

  if (imageUrls.length === 0) {
    return telegram('sendMessage', { ...base, text });
  }

  if (imageUrls.length === 1) {
    if (fitsCaption) {
      return telegram('sendPhoto', { ...base, photo: imageUrls[0], caption: text });
    }
    await telegram('sendPhoto', { chat_id: TELEGRAM_CHAT_ID, photo: imageUrls[0] });
    return telegram('sendMessage', { ...base, text });
  }

  const media = imageUrls.slice(0, 10).map((url, i) => ({
    type: 'photo',
    media: url,
    ...(i === 0 && fitsCaption ? { caption: text, parse_mode: 'HTML' } : {}),
  }));
  await telegram('sendMediaGroup', { chat_id: TELEGRAM_CHAT_ID, media });
  if (!fitsCaption) await telegram('sendMessage', { ...base, text });
}

// ---------- Discord ----------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Bot online como ${c.user.tag}`);
  console.log(`Monitorando ${sourceChannels.size} canal(is) e ${allowedUsers.size} usuário(s) autorizado(s)`);
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;

    console.log(
      `[debug] mensagem recebida | canal=${message.channelId} | autor=${message.author.id} | texto="${(message.content || '').slice(0, 40)}"`
    );

    if (!sourceChannels.has(message.channelId)) {
      console.log('[debug] ignorada: o ID deste canal não está em SOURCE_CHANNEL_IDS');
      return;
    }
    if (!allowedUsers.has(message.author.id)) {
      console.log('[debug] ignorada: o ID deste autor não está em ALLOWED_USER_IDS');
      return;
    }
    const content = stripMassMentions(message.content || '');
    const hasPrefix = content.toLowerCase().startsWith(PREFIX.toLowerCase());

    if (REQUIRE_PREFIX === 'true' && !hasPrefix) {
      console.log(`[debug] ignorada: o texto não começa com "${PREFIX}"`);
      return;
    }

    const body = hasPrefix ? content.slice(PREFIX.length).trim() : content.trim();
    const images = [...message.attachments.values()]
      .filter((a) => a.contentType && a.contentType.startsWith('image/'))
      .map((a) => a.url);

    // Nada para enviar (sem texto e sem imagem)
    if (!body && images.length === 0) {
      console.log('[debug] ignorada: mensagem sem texto e sem imagem');
      return;
    }

    // O modelo padrão só é usado quando a mensagem começa com o prefixo (!call).
    // Qualquer outra mensagem é enviada exatamente como foi escrita, sem perder nada.
    const parsed = hasPrefix ? parseCall(body) : null;
    const text = parsed ? formatCall(parsed) : toTelegramHtml(body);

    await sendToTelegram(text, images);
    await message.react('✅');
    console.log(`Call enviada por ${message.author.tag}`);
  } catch (err) {
    console.error('Erro ao enviar call:', err);
    try {
      await message.react('❌');
    } catch (_) {}
  }
});

client.login(DISCORD_TOKEN);
