import { Telegraf } from 'telegraf';
import { BotContext, SenderType } from '../types';
import { conversationService } from '../services/conversationService';
import { operatorService } from '../services/operatorService';
import { operatorSessionService } from '../services/operatorSessionService';
import { formatOperatorStats } from '../utils/formatters';
import { createClientListMenu, createChatHeader, createNewMessageNotification } from '../utils/operatorMenu';
import { message } from 'telegraf/filters';

export function registerOperatorHandlers(bot: Telegraf<BotContext>) {
  /**
   * Команда /start для операторов
   */
  bot.command('start', async (ctx) => {
    const telegramId = BigInt(ctx.from.id);

    if (!operatorService.isOperator(telegramId)) {
      return; // Не оператор
    }

    const operator = await operatorService.getOrCreateOperator(
      telegramId,
      ctx.from.username,
      ctx.from.first_name,
      ctx.from.last_name
    );

    await operatorService.setOnlineStatus(operator.id, true);

    await ctx.reply(
      '👨‍💼 Панель оператора\n\n' +
      'Добро пожаловать! Вы вошли в систему как оператор поддержки.\n\n' +
      '📋 Используйте /clients - чтобы увидеть список активных клиентов\n' +
      '💬 Выберите клиента из списка, чтобы начать с ним общение\n' +
      '✍️ Все ваши сообщения будут отправляться выбранному клиенту\n\n' +
      'Доступные команды:\n' +
      '/clients - Список активных клиентов\n' +
      '/stats - Моя статистика\n' +
      '/online - Войти в сеть\n' +
      '/offline - Выйти из сети'
    );
  });

  /**
   * Команда /clients - показать список клиентов
   */
  bot.command('clients', async (ctx) => {
    await handleClientsCommand(ctx, bot);
  });

  /**
   * Статистика оператора
   */
  bot.command('stats', async (ctx) => {
    await handleStatsCommand(ctx);
  });

  /**
   * Войти в сеть
   */
  bot.command('online', async (ctx) => {
    await handleOnlineCommand(ctx, true);
  });

  /**
   * Выйти из сети
   */
  bot.command('offline', async (ctx) => {
    await handleOnlineCommand(ctx, false);
  });

  /**
   * Обработка callback query (нажатия на inline кнопки)
   */
  bot.on('callback_query', async (ctx) => {
    const telegramId = BigInt(ctx.from.id);

    if (!operatorService.isOperator(telegramId)) {
      return;
    }

    const data = (ctx.callbackQuery as any).data;
    console.log(`[Callback] Operator ${telegramId} pressed button: ${data}`);

    if (data === 'back_to_list') {
      // Вернуться к списку клиентов
      operatorSessionService.clearActiveClient(telegramId);
      await handleClientsCommand(ctx, bot);
      await ctx.answerCbQuery('Возврат к списку клиентов');
    } else if (data.startsWith('open_chat_')) {
      // Открыть чат с клиентом
      const clientId = BigInt(data.replace('open_chat_', ''));
      await openClientChat(ctx, bot, telegramId, clientId);
      await ctx.answerCbQuery();
    } else if (data.startsWith('history_')) {
      // Показать историю сообщений
      const clientId = BigInt(data.replace('history_', ''));
      await showChatHistory(ctx, telegramId, clientId);
      await ctx.answerCbQuery('История загружена');
    }
  });

  /**
   * Обработка текстовых сообщений от операторов
   */
  bot.on(message('text'), async (ctx) => {
    const telegramId = BigInt(ctx.from.id);

    // Проверить, это оператор? Если нет - просто выходим БЕЗ return, чтобы не блокировать другие обработчики
    if (!operatorService.isOperator(telegramId)) {
      // Не оператор - ничего не делаем, просто выходим из функции
      // НЕ ИСПОЛЬЗУЕМ return, чтобы дать другим обработчикам шанс обработать сообщение
      return; // TODO: возможно нужно использовать next() вместо return
    }

    // Это оператор - продолжаем обработку
    if (ctx.chat?.type !== 'private') {
      return;
    }

    if (ctx.message.text.startsWith('/')) {
      return;
    }

    // Проверим, есть ли активная сессия
    const activeClientId = operatorSessionService.getActiveClient(telegramId);

    if (!activeClientId) {
      console.log(`[Operator Text] No active session for operator ${telegramId}`);
      await ctx.reply(
        'ℹ️ Сначала выберите клиента из списка.\n\n' +
        'Используйте команду /clients чтобы увидеть активные диалоги.'
      );
      return;
    }

    try {
      console.log(`[Operator Text] Operator ${telegramId} sent message: "${ctx.message.text}"`);
      console.log(`[Operator Text] Active client ID: ${activeClientId}`);

      // Найти диалог с этим клиентом
      const operator = await operatorService.getOrCreateOperator(telegramId);
      console.log(`[Operator Text] Operator DB ID: ${operator.id}`);

      const conversation = await conversationService.findActiveConversation(operator.id, activeClientId);
      console.log(`[Operator Text] Found conversation: ${conversation?.id}`);

      if (!conversation) {
        console.log(`[Operator Text] No conversation found`);
        await ctx.reply(
          '❌ Диалог с этим клиентом не найден или закрыт.\n\n' +
          'Используйте /clients для выбора другого клиента.'
        );
        operatorSessionService.clearActiveClient(telegramId);
        return;
      }

      // Сохранить сообщение
      console.log(`[Operator Text] Saving message to conversation ${conversation.id}`);
      await conversationService.saveMessage(
        conversation.id,
        telegramId,
        SenderType.OPERATOR,
        ctx.message.message_id,
        ctx.message.text
      );

      // Отправить клиенту
      console.log(`[Operator Text] Sending message to client ${activeClientId}`);
      await bot.telegram.sendMessage(
        activeClientId.toString(),
        `👨‍💼 Оператор:\n\n${ctx.message.text}`
      );

      console.log(`[Operator Text] Message sent successfully`);

      // Подтверждение оператору (заменить react на обычное сообщение)
      await ctx.reply('✅ Отправлено');

    } catch (error) {
      console.error('Error sending operator message:', error);
      await ctx.reply('❌ Ошибка при отправке сообщения');
    }
  });

  /**
   * Обработка фото от операторов
   */
  bot.on(message('photo'), async (ctx) => {
    const telegramId = BigInt(ctx.from.id);

    if (!operatorService.isOperator(telegramId)) {
      return; // Не оператор - пропускаем
    }

    if (ctx.chat?.type !== 'private') {
      return;
    }

    const activeClientId = operatorSessionService.getActiveClient(telegramId);

    if (!activeClientId) {
      await ctx.reply('ℹ️ Сначала выберите клиента из списка. Используйте /clients');
      return;
    }

    try {

      const operator = await operatorService.getOrCreateOperator(telegramId);
      const conversation = await conversationService.findActiveConversation(operator.id, activeClientId);

      if (!conversation) {
        await ctx.reply('❌ Диалог с этим клиентом не найден');
        operatorSessionService.clearActiveClient(telegramId);
        return;
      }

      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const caption = (ctx.message as any).caption;

      await conversationService.saveMessage(
        conversation.id,
        telegramId,
        SenderType.OPERATOR,
        ctx.message.message_id,
        caption,
        photo.file_id,
        'photo'
      );

      await bot.telegram.sendPhoto(
        activeClientId.toString(),
        photo.file_id,
        { caption: caption ? `👨‍💼 Оператор:\n\n${caption}` : '👨‍💼 Оператор' }
      );

      await ctx.reply('✅ Фото отправлено');

    } catch (error) {
      console.error('Error sending operator photo:', error);
      await ctx.reply('❌ Ошибка при отправке фото');
    }
  });

  /**
   * Обработка документов от операторов
   */
  bot.on(message('document'), async (ctx) => {
    const telegramId = BigInt(ctx.from.id);

    if (!operatorService.isOperator(telegramId)) {
      return; // Не оператор - пропускаем
    }

    if (ctx.chat?.type !== 'private') {
      return;
    }

    const activeClientId = operatorSessionService.getActiveClient(telegramId);

    if (!activeClientId) {
      await ctx.reply('ℹ️ Сначала выберите клиента из списка. Используйте /clients');
      return;
    }

    try {

      const operator = await operatorService.getOrCreateOperator(telegramId);
      const conversation = await conversationService.findActiveConversation(operator.id, activeClientId);

      if (!conversation) {
        await ctx.reply('❌ Диалог с этим клиентом не найден');
        operatorSessionService.clearActiveClient(telegramId);
        return;
      }

      const caption = (ctx.message as any).caption;

      await conversationService.saveMessage(
        conversation.id,
        telegramId,
        SenderType.OPERATOR,
        ctx.message.message_id,
        caption,
        ctx.message.document.file_id,
        'document'
      );

      await bot.telegram.sendDocument(
        activeClientId.toString(),
        ctx.message.document.file_id,
        { caption: caption ? `👨‍💼 Оператор:\n\n${caption}` : '👨‍💼 Оператор' }
      );

      await ctx.reply('✅ Документ отправлен');

    } catch (error) {
      console.error('Error sending operator document:', error);
      await ctx.reply('❌ Ошибка при отправке документа');
    }
  });
}

// Вспомогательные функции

async function handleClientsCommand(ctx: any, bot: Telegraf<BotContext>) {
  const telegramId = BigInt(ctx.from.id);
  if (!operatorService.isOperator(telegramId)) return;

  try {
    const operator = await operatorService.getOrCreateOperator(telegramId);
    const clients = await conversationService.getOperatorConversationsForMenu(operator.id);

    const menu = createClientListMenu(telegramId, clients);

    // Если есть активная сессия, очистить её
    operatorSessionService.clearActiveClient(telegramId);

    await ctx.reply(menu.text, {
      reply_markup: menu.markup,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('Error in clients command:', error);
    await ctx.reply('❌ Ошибка при получении списка клиентов');
  }
}

async function openClientChat(ctx: any, bot: Telegraf<BotContext>, operatorId: bigint, clientId: bigint) {
  try {
    console.log(`[Open Chat] Operator ${operatorId} opening chat with client ${clientId}`);

    // Установить активную сессию
    operatorSessionService.setActiveClient(operatorId, clientId);
    console.log(`[Open Chat] Session set successfully`);

    const operator = await operatorService.getOrCreateOperator(operatorId);
    console.log(`[Open Chat] Operator DB ID: ${operator.id}`);

    const conversation = await conversationService.findActiveConversation(operator.id, clientId);
    console.log(`[Open Chat] Conversation found: ${conversation?.id}`);

    if (!conversation) {
      console.log(`[Open Chat] No conversation found, clearing session`);
      await ctx.editMessageText('❌ Диалог с этим клиентом не найден или закрыт');
      operatorSessionService.clearActiveClient(operatorId);
      return;
    }

    const clientInfo = {
      telegramId: conversation.user.telegramId,
      username: conversation.user.username,
      firstName: conversation.user.firstName,
      lastName: conversation.user.lastName,
      conversationId: conversation.id,
      lastMessageTime: new Date(),
      messageCount: 0
    };

    const header = createChatHeader(clientInfo, operatorId);

    await ctx.editMessageText(header.text, {
      reply_markup: header.markup
    });

    // Показать последние 10 сообщений
    const messages = await conversationService.getConversationMessages(conversation.id, 10);

    if (messages.length > 0) {
      let historyText = '📜 Последние сообщения:\n━━━━━━━━━━━━━━━━━━━━━━\n\n';

      // Сообщения приходят в обратном порядке (новые первые), нужно развернуть
      messages.reverse();

      for (const msg of messages) {
        const time = msg.createdAt.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit'
        });

        const sender = msg.senderType === 'user' ? '👤 Клиент' : '👨‍💼 Вы';
        historyText += `[${time}] ${sender}:\n${msg.text || '[файл]'}\n\n`;
      }

      await ctx.reply(historyText);
    }
  } catch (error) {
    console.error('Error opening client chat:', error);
    await ctx.reply('❌ Ошибка при открытии чата');
  }
}

async function showChatHistory(ctx: any, operatorId: bigint, clientId: bigint) {
  try {
    const operator = await operatorService.getOrCreateOperator(operatorId);
    const conversation = await conversationService.findActiveConversation(operator.id, clientId);

    if (!conversation) {
      await ctx.answerCbQuery('❌ Диалог не найден', { show_alert: true });
      return;
    }

    const messages = await conversationService.getConversationMessages(conversation.id, 30);

    if (messages.length === 0) {
      await ctx.reply('📜 История сообщений пуста');
      return;
    }

    let historyText = '📜 История сообщений (последние 30):\n━━━━━━━━━━━━━━━━━━━━━━\n\n';

    messages.reverse();

    for (const msg of messages) {
      const time = msg.createdAt.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit'
      });

      const sender = msg.senderType === 'user' ? '👤 Клиент' : '👨‍💼 Вы';
      historyText += `[${time}] ${sender}:\n${msg.text || '[файл]'}\n\n`;
    }

    await ctx.reply(historyText);
  } catch (error) {
    console.error('Error showing history:', error);
    await ctx.reply('❌ Ошибка при загрузке истории');
  }
}

async function handleStatsCommand(ctx: BotContext) {
  const telegramId = BigInt(ctx.from.id);
  if (!operatorService.isOperator(telegramId)) return;

  try {
    const operator = await operatorService.getOrCreateOperator(telegramId);
    const stats = await operatorService.getOperatorStats(operator.id);

    await ctx.reply(formatOperatorStats(stats));
  } catch (error) {
    console.error('Error in stats command:', error);
    await ctx.reply('❌ Ошибка при получении статистики');
  }
}

async function handleOnlineCommand(ctx: BotContext, isOnline: boolean) {
  const telegramId = BigInt(ctx.from.id);
  if (!operatorService.isOperator(telegramId)) return;

  try {
    const operator = await operatorService.getOrCreateOperator(telegramId);
    await operatorService.setOnlineStatus(operator.id, isOnline);

    if (isOnline) {
      await ctx.reply('🟢 Вы вошли в сеть. Теперь вы будете получать новые обращения.');
    } else {
      await ctx.reply('🔴 Вы вышли из сети. Новые обращения не будут поступать.');
    }
  } catch (error) {
    console.error('Error in online command:', error);
    await ctx.reply('❌ Ошибка при изменении статуса');
  }
}

// Экспортировать функцию для отправки уведомлений о новых сообщениях
export async function notifyOperatorNewMessage(
  bot: Telegraf<BotContext>,
  operatorId: bigint,
  clientInfo: {
    telegramId: bigint;
    username?: string;
    firstName?: string;
    lastName?: string;
    conversationId: number;
    lastMessageTime: Date;
    messageCount: number;
  },
  messageText: string
) {
  try {
    // Увеличить счетчик непрочитанных
    operatorSessionService.incrementUnread(operatorId, clientInfo.telegramId);

    // Проверить, общается ли оператор с этим клиентом сейчас
    const activeClientId = operatorSessionService.getActiveClient(operatorId);

    if (activeClientId === clientInfo.telegramId) {
      // Оператор уже в чате с этим клиентом, не отправлять уведомление
      return;
    }

    // Отправить уведомление
    const notification = createNewMessageNotification(clientInfo, messageText);

    await bot.telegram.sendMessage(
      operatorId.toString(),
      notification.text,
      {
        reply_markup: notification.markup
      }
    );
  } catch (error) {
    console.error('Error notifying operator:', error);
  }
}
