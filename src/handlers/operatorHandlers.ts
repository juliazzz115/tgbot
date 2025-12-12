import { Telegraf } from 'telegraf';
import { BotContext, SenderType } from '../types';
import { conversationService } from '../services/conversationService';
import { operatorService } from '../services/operatorService';
import { formatOperatorStats } from '../utils/formatters';
import { message } from 'telegraf/filters';
import { messageToClient } from './clientHandlers';

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
      '💬 Сообщения от клиентов будут приходить прямо сюда.\n' +
      'Просто отвечайте на них как в обычном чате!\n\n' +
      'Доступные команды:\n' +
      '/stats - Моя статистика\n' +
      '/online - Войти в сеть (начать принимать обращения)\n' +
      '/offline - Выйти из сети'
    );
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
   * Обработка текстовых сообщений от операторов (ответы клиентам)
   */
  bot.on(message('text'), async (ctx) => {
    const telegramId = BigInt(ctx.from.id);

    if (!operatorService.isOperator(telegramId)) {
      return; // Не оператор
    }

    // Работать только в личном чате с ботом
    if (ctx.chat?.type !== 'private') {
      return;
    }

    // Пропустить команды
    if (ctx.message.text.startsWith('/')) {
      return;
    }

    try {
      // Проверить, это ответ на сообщение клиента?
      let clientTelegramId: bigint | undefined;
      const replyToMessage = (ctx.message as any).reply_to_message;

      if (replyToMessage) {
        // Оператор ответил на сообщение - найти клиента
        clientTelegramId = messageToClient.get(replyToMessage.message_id);
      }

      if (!clientTelegramId) {
        await ctx.reply(
          'ℹ️ Чтобы ответить клиенту, используйте функцию "Ответить" (reply) на его сообщение.\n\n' +
          'Или просто нажмите на сообщение клиента и выберите "Ответить".'
        );
        return;
      }

      // Найти диалог с этим клиентом
      const operator = await operatorService.getOrCreateOperator(telegramId);
      const conversations = await conversationService.getOperatorConversations(operator.id);
      const conversation = conversations.find(conv => conv.user.telegramId === clientTelegramId);

      if (!conversation) {
        await ctx.reply('❌ Диалог с этим клиентом не найден или закрыт');
        return;
      }

      // Сохранить сообщение
      await conversationService.saveMessage(
        conversation.id,
        telegramId,
        SenderType.OPERATOR,
        ctx.message.message_id,
        ctx.message.text
      );

      // Отправить клиенту
      await bot.telegram.sendMessage(
        clientTelegramId.toString(),
        `👨‍💼 Оператор:\n\n${ctx.message.text}`
      );

      // Подтверждение оператору
      await ctx.react('👍');

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

    // Работать только в личном чате с ботом
    if (ctx.chat?.type !== 'private') {
      return;
    }

    try {
      // Проверить, это ответ на сообщение клиента?
      let clientTelegramId: bigint | undefined;
      const replyToMessage = (ctx.message as any).reply_to_message;

      if (replyToMessage) {
        clientTelegramId = messageToClient.get(replyToMessage.message_id);
      }

      if (!clientTelegramId) {
        await ctx.reply('ℹ️ Чтобы отправить фото клиенту, ответьте (reply) на его сообщение.');
        return;
      }

      // Найти диалог
      const operator = await operatorService.getOrCreateOperator(telegramId);
      const conversations = await conversationService.getOperatorConversations(operator.id);
      const conversation = conversations.find(conv => conv.user.telegramId === clientTelegramId);

      if (!conversation) {
        await ctx.reply('❌ Диалог с этим клиентом не найден');
        return;
      }

      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const caption = (ctx.message as any).caption;

      // Сохранить сообщение
      await conversationService.saveMessage(
        conversation.id,
        telegramId,
        SenderType.OPERATOR,
        ctx.message.message_id,
        caption,
        photo.file_id,
        'photo'
      );

      // Отправить клиенту
      await bot.telegram.sendPhoto(
        clientTelegramId.toString(),
        photo.file_id,
        { caption: caption ? `👨‍💼 Оператор:\n\n${caption}` : '👨‍💼 Оператор' }
      );

      // Подтверждение
      await ctx.react('👍');

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
    if (!operatorService.isOperator(telegramId)) return;

    // Работать только в личном чате с ботом
    if (ctx.chat?.type !== 'private') {
      return;
    }

    try {
      // Проверить, это ответ на сообщение клиента?
      let clientTelegramId: bigint | undefined;
      const replyToMessage = (ctx.message as any).reply_to_message;

      if (replyToMessage) {
        clientTelegramId = messageToClient.get(replyToMessage.message_id);
      }

      if (!clientTelegramId) {
        await ctx.reply('ℹ️ Чтобы отправить документ клиенту, ответьте (reply) на его сообщение.');
        return;
      }

      // Найти диалог
      const operator = await operatorService.getOrCreateOperator(telegramId);
      const conversations = await conversationService.getOperatorConversations(operator.id);
      const conversation = conversations.find(conv => conv.user.telegramId === clientTelegramId);

      if (!conversation) {
        await ctx.reply('❌ Диалог с этим клиентом не найден');
        return;
      }

      const caption = (ctx.message as any).caption;

      // Сохранить сообщение
      await conversationService.saveMessage(
        conversation.id,
        telegramId,
        SenderType.OPERATOR,
        ctx.message.message_id,
        caption,
        ctx.message.document.file_id,
        'document'
      );

      // Отправить клиенту
      await bot.telegram.sendDocument(
        clientTelegramId.toString(),
        ctx.message.document.file_id,
        { caption: caption ? `👨‍💼 Оператор:\n\n${caption}` : '👨‍💼 Оператор' }
      );

      // Подтверждение
      await ctx.react('👍');

    } catch (error) {
      console.error('Error sending operator document:', error);
      await ctx.reply('❌ Ошибка при отправке документа');
    }
  });
}

// Вспомогательные функции

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
