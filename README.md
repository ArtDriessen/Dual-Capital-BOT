# Bot Discord → Telegram (Dual Capital)

Lê as calls postadas no chat do Discord (apenas de usuários autorizados) e publica no canal do Telegram em um modelo padrão. Imagens anexadas (prints de gráfico) também são enviadas.

## 1. Configurar o Telegram
1. No Telegram, fale com **@BotFather** e use `/newbot`. Guarde o token.
2. Adicione o bot como **administrador** do canal Dual Capital, com permissão de publicar mensagens.
3. Descubra o ID do canal: se for público, use `@nome_do_canal`. Se for privado, encaminhe uma mensagem do canal para o bot **@RawDataBot** e copie o `chat id` (começa com `-100`).

## 2. Configurar o Discord
1. Acesse https://discord.com/developers/applications e clique em **New Application**.
2. Na aba **Bot**, copie o token e ative **Message Content Intent**.
3. Na aba **OAuth2 → URL Generator**, marque o escopo `bot` e as permissões *View Channels*, *Read Message History*, *Add Reactions* e *Send Messages*. Abra o link gerado e adicione o bot ao seu servidor.
4. No Discord, ative **Modo Desenvolvedor** (Configurações → Avançado) e, com o botão direito, copie:
   - o **ID de cada um dos 5 canais** das calls (`SOURCE_CHANNEL_IDS`, separados por vírgula);
   - o **ID de usuário** seu e do outro administrador (`ALLOWED_USER_IDS`).

## 3. Rodar
```bash
npm install
cp .env.example .env   # preencha os valores
npm start
```
Requer Node.js 18 ou superior. Para ficar online 24h, hospede em um VPS, Railway ou Render (com `pm2` se for VPS: `pm2 start index.js --name dual-capital`).

## 4. Como postar uma call
No chat do Discord, envie (com ou sem imagem anexada):

```
!call
ativo: BTCUSDT
direcao: LONG
alavancagem: 5x
entrada: 65000
stop: 64000
alvo1: 66000
alvo2: 67000
alvo3: 68500
obs: aguardar fechamento da vela de 1h
```

Resultado no Telegram:

```
📊 NOVA CALL | DUAL CAPITAL

🪙 Ativo: BTCUSDT
🟢 Direção: LONG
⚙️ Alavancagem: 5x
🎯 Entrada: 65000
🛑 Stop: 64000
✅ Alvo 1: 66000
✅ Alvo 2: 67000
✅ Alvo 3: 68500

📝 Obs: aguardar fechamento da vela de 1h

⚠️ Conteúdo informativo. Não é recomendação de investimento...
```

O bot reage com ✅ na mensagem quando a call foi enviada e com ❌ se houve erro. Só `ativo`, `direcao`, `entrada`, `stop`, `alvoN`, `alavancagem` e `obs` são lidos; campos vazios são omitidos. Ajuste o modelo na função `formatCall` do `index.js`.

## 5. Hospedagem gratuita no Render (Web Service + UptimeRobot)
1. No Render: **New → Web Service**, escolha este repositório, plano **Free**, Build Command `npm install`, Start Command `npm start`.
2. Em **Environment**, adicione as variáveis (`DISCORD_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SOURCE_CHANNEL_IDS`, `ALLOWED_USER_IDS`).
3. Copie o endereço público do serviço (algo como `https://dual-capital-bot.onrender.com`).
4. No UptimeRobot (uptimerobot.com, plano gratuito): **Add New Monitor**, tipo **HTTP(s)**, cole o endereço e use intervalo de **5 minutos**.
O bot responde "Dual Capital bot online" nesse endereço, o que mantém o serviço acordado.

## 6. Prefixo opcional
Por padrão, **qualquer mensagem** dos admins autorizados nos canais monitorados é enviada ao Telegram (texto, links e imagens), sem precisar de `!call`.
- Mensagens normais vão **exatamente como foram escritas**. Só o **negrito** do Discord (`**texto**`) é convertido para negrito do Telegram.
- Se a mensagem começar com `!call` e tiver os campos (`ativo:`, `entrada:`, `stop:`, `alvo1:`...), ela é formatada no modelo padrão.
- Para exigir o `!call` em todas as mensagens, crie a variável `REQUIRE_PREFIX` com o valor `true`.
