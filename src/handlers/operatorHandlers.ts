import { Telegraf, Markup } from 'telegraf';
import { BotContext, SenderType } from '../types';
import { conversationService } from '../services/conversationService';
import { operatorService } from '../services/operatorService';
import { formatConversationForOperator, formatOperatorStats, formatUserName } from '../utils/formatters';
import { message } from 'telegraf/filters';

// Хранилище текущего контекста оператора (для ответов)
const operatorContext = new Map<string, number>(); // telegramId -> conversationId

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
      'Доступные команды:\n' +
      '/queue - Посмотреть очередь ожидающих обращений\n' +
      '/active - Мои активные диалоги\n' +
      '/stats - Моя статистика\n' +
      '/online - Войти в сеть (начать принимать обращения)\n' +
      '/offline - Выйти из сети\n\n' +
      '💡 Когда поступит новое обращение, вы получите уведомление.',
      Markup.keyboard([
        ['📋 Очередь', '💬 Активные'],
        ['📊 Статистика', '🟢 Онлайн / 🔴 Оффлайн'],
      ]).resize()
    );
  });

  /**
   * Просмотр очереди ожидающих
   */
  bot.command('queue', async (ctx) => {
    await handleQueueCommand(ctx);
  });

  bot.hears('📋 Очередь', async (ctx) => {
    await handleQueueCommand(ctx);
  });

  /**
   * Просмотр активных диалогов
   */
  bot.command('active', async (ctx) => {
    await handleActiveCommand(ctx);
  });

  bot.hears('💬 Активные', async (ctx) => {
    await handleActiveCommand(ctx);
  });

  /**
   * Статистика оператора
   */
  bot.command('stats', async (ctx) => {
    await handleStatsCommand(ctx);
  });

  bot.hears('📊 Статистика', async (ctx) => {
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

  bot.hears(/🟢 Онлайн|🔴 Оффлайн/, async (ctx) => {
    const telegramId = BigInt(ctx.from.id);
    if (!operatorService.isOperator(telegramId)) return;

    const operator = await operatorService.getOrCreateOperator(telegramId);
    const newStatus = !operator.isOnline;
    await handleOnlineCommand(ctx, newStatus);
  });

  /**
   * Обработка callback кнопок
   */
  bot.action(/^take_(\d+)$/, async (ctx) => {
    const conversationId = parseInt(ctx.match[1]);
    const telegramId = BigInt(ctx.from.id);

    if (!operatorService.isOperator(telegramId)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      const conversation = await conversationService.getConversation(conversationId);

      if (!conversation) {
        await ctx.answerCbQuery('❌ Диалог не найден');
        return;
      }

      if (conversation.status !== 'waiting') {
        await ctx.answerCbQuery('❌ Диалог уже взят другим оператором');
        return;
      }

      // Взять диалог в работу
      const operator = await operatorService.getOrCreateOperator(telegramId);
      await conversationService.assignOperator(conversationId);

      await ctx.answerCbQuery('✅ Диалог взят в работу');

      // Установить контекст для быстрых ответов
      operatorContext.set(telegramId.toString(), conversationId);

      // Отправить историю сообщений
      const messages = await conversationService.getConversationMessages(conversationId);
      const userName = formatUserName(conversation.user);

      await ctx.reply(
        `✅ Вы взяли диалог #${conversationId} в работу\n👤 Клиент: ${userName}\n\n` +
        'Теперь просто пишите сообщения, и они будут отправлены клиенту.\n' +
        'Используйте /done для завершения диалога.'
      );

      if (messages.length > 0) {
        await ctx.reply(`📜 История сообщений (последние ${Math.min(messages.length, 10)}):`);

        const recentMessages = messages.reverse().slice(-10);
        for (const msg of recentMessages) {
          const prefix = msg.senderType === 'user' ? '👤 Клиент' : '👨‍💼 Оператор';
          const text = msg.text || '[файл]';
          await ctx.reply(`${prefix}: ${text}`);
        }
      }

      // Уведомить клиента
      await bot.telegram.sendMessage(
        conversation.user.telegramId.toString(),
        '✅ Оператор подключился к диалогу. Можете задавать свои вопросы!'
      );
    } catch (error) {
      console.error('Error taking conversation:', error);
      await ctx.answerCbQuery('❌ Ошибка при взятии диалога');
    }
  });

  bot.action(/^reply_(\d+)$/, async (ctx) => {
    const conversationId = parseInt(ctx.match[1]);
    const telegramId = BigInt(ctx.from.id);

    if (!operatorService.isOperator(telegramId)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    // Установить контекст для ответа
    operatorContext.set(telegramId.toString(), conversationId);

    await ctx.answerCbQuery('✍️ Напишите ваш ответ');
    await ctx.reply(
      `✍️ Режим ответа на диалог #${conversationId}\n\n` +
      'Следующее сообщение будет отправлено клиенту.\n' +
      'Для отмены используйте /cancel'
    );
  });

  bot.action(/^close_(\d+)$/, async (ctx) => {
    const conversationId = parseInt(ctx.match[1]);
    const telegramId = BigInt(ctx.from.id);

    if (!operatorService.isOperator(telegramId)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      const conversation = await conversationService.getConversation(conversationId);

      if (!conversation) {
        await ctx.answerCbQuery('❌ Диалог не найден');
        return;
      }

      await conversationService.closeConversation(conversationId);
      operatorContext.delete(telegramId.toString());

      await ctx.answerCbQuery('✅ Диалог закрыт');
      await ctx.reply(`✅ Диалог #${conversationId} закрыт`);

      // Уведомить клиента
      await bot.telegram.sendMessage(
        conversation.user.telegramId.toString(),
        '✅ Диалог завершен. Спасибо за обращение!\n\n' +
        'Если у вас возникнут еще вопросы, просто напишите нам снова.'
      );
    } catch (error) {
      console.error('Error closing conversation:', error);
      await ctx.answerCbQuery('❌ Ошибка при закрытии диалога');
    }
  });

  /**
   * Команда /done для завершения текущего диалога
   */
  bot.command('done', async (ctx) => {
    const telegramId = BigInt(ctx.from.id);
    if (!operatorService.isOperator(telegramId)) return;

    const conversationId = operatorContext.get(telegramId.toString());
    if (!conversationId) {
      await ctx.reply('❌ У вас нет активного диалога');
      return;
    }

    try {
      const conversation = await conversationService.getConversation(conversationId);
      if (conversation) {
        await conversationService.closeConversation(conversationId);
        operatorContext.delete(telegramId.toString());

        await ctx.reply(`✅ Диалог #${conversationId} закрыт`);

        await bot.telegram.sendMessage(
          conversation.user.telegramId.toString(),
          '✅ Диалог завершен. Спасибо за обращение!\n\n' +
          'Если у вас возникнут еще вопросы, просто напишите нам снова.'
        );
      }
    } catch (error) {
      console.error('Error closing conversation:', error);
      await ctx.reply('❌ Ошибка при закрытии диалога');
    }
  });

  /**
   * Команда /cancel для отмены режима ответа
   */
  bot.command('cancel', async (ctx) => {
    const telegramId = BigInt(ctx.from.id);
    if (!operatorService.isOperator(telegramId)) return;

    operatorContext.delete(telegramId.toString());
    await ctx.reply('❌ Режим ответа отменен');
  });

  /**
   * Обработка сообщений от операторов (ответы клиентам)
   */
  bot.on(message('text'), async (ctx) => {
    const telegramId = BigInt(ctx.from.id);

    if (!operatorService.isOperator(telegramId)) {
      return; // Не оператор
    }

    // Пропустить команды
    if (ctx.message.text.startsWith('/')) {
      return;
    }

    const conversationId = operatorContext.get(telegramId.toString());
    if (!conversationId) {
      await ctx.reply(
        'ℹ️ Выберите диалог для ответа:\n' +
        '• /queue - посмотреть ожидающие обращения\n' +
        '• /active - посмотреть активные диалоги'
      );
      return;
    }

    try {
      const conversation = await conversationService.getConversation(conversationId);

      if (!conversation || conversation.status === 'closed') {
        operatorContext.delete(telegramId.toString());
        await ctx.reply('❌ Диалог закрыт или не найден');
        return;
      }

      // Сохранить сообщение
      await conversationService.saveMessage(
        conversationId,
        telegramId,
        SenderType.OPERATOR,
        ctx.message.message_id,
        ctx.message.text
      );

      // Отправить клиенту
      await bot.telegram.sendMessage(
        conversation.user.telegramId.toString(),
        `👨‍💼 Оператор: ${ctx.message.text}`
      );

      await ctx.reply('✅ Сообщение отправлено');
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
    if (!operatorService.isOperator(telegramId)) return;

    const conversationId = operatorContext.get(telegramId.toString());
    if (!conversationId) {
      await ctx.reply('ℹ️ Сначала выберите диалог для ответа');
      return;
    }

    try {
      const conversation = await conversationService.getConversation(conversationId);
      if (!conversation || conversation.status === 'closed') {
        operatorContext.delete(telegramId.toString());
        await ctx.reply('❌ Диалог закрыт или не найден');
        return;
      }

      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const caption = ctx.message.caption;

      await conversationService.saveMessage(
        conversationId,
        telegramId,
        SenderType.OPERATOR,
        ctx.message.message_id,
        caption,
        photo.file_id,
        'photo'
      );

      await bot.telegram.sendPhoto(
        conversation.user.telegramId.toString(),
        photo.file_id,
        { caption: caption ? `👨‍💼 Оператор: ${caption}` : '👨‍💼 Оператор:' }
      );

      await ctx.reply('✅ Фото отправлено');
    } catch (error) {
      console.error('Error sending operator photo:', error);
      await ctx.reply('❌ Ошибка при отправке фото');
    }
  });
}

// Вспомогательные функции

async function handleQueueCommand(ctx: BotContext) {
  const telegramId = BigInt(ctx.from.id);
  if (!operatorService.isOperator(telegramId)) return;

  try {
    const waiting = await conversationService.getWaitingConversations();

    if (waiting.length === 0) {
      await ctx.reply('📋 Очередь пуста');
      return;
    }

    await ctx.reply(`📋 Ожидающие обращения: ${waiting.length}`);

    for (const conv of waiting) {
      const text = formatConversationForOperator(conv);
      await ctx.reply(text, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Взять в работу', callback_data: `take_${conv.id}` }],
          ],
        },
      });
    }
  } catch (error) {
    console.error('Error in queue command:', error);
    await ctx.reply('❌ Ошибка при получении очереди');
  }
}

async function handleActiveCommand(ctx: BotContext) {
  const telegramId = BigInt(ctx.from.id);
  if (!operatorService.isOperator(telegramId)) return;

  try {
    const operator = await operatorService.getOrCreateOperator(telegramId);
    const active = await conversationService.getOperatorConversations(operator.id);

    if (active.length === 0) {
      await ctx.reply('💬 У вас нет активных диалогов');
      return;
    }

    await ctx.reply(`💬 Ваши активные диалоги: ${active.length}`);

    for (const conv of active) {
      const text = formatConversationForOperator(conv);
      await ctx.reply(text, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✉️ Ответить', callback_data: `reply_${conv.id}` }],
            [{ text: '✅ Закрыть диалог', callback_data: `close_${conv.id}` }],
          ],
        },
      });
    }
  } catch (error) {
    console.error('Error in active command:', error);
    await ctx.reply('❌ Ошибка при получении активных диалогов');
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
