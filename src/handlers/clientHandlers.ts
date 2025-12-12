import { Telegraf } from 'telegraf';
import { BotContext, SenderType } from '../types';
import { conversationService } from '../services/conversationService';
import { operatorService } from '../services/operatorService';
import { formatUserName } from '../utils/formatters';
import { message } from 'telegraf/filters';

export function registerClientHandlers(bot: Telegraf<BotContext>) {
  /**
   * Команда /start для клиентов
   */
  bot.command('start', async (ctx) => {
    const telegramId = BigInt(ctx.from.id);

    // Проверить, не оператор ли это
    if (operatorService.isOperator(telegramId)) {
      return; // Операторы получат свое приветствие
    }

    await ctx.reply(
      '👋 Здравствуйте! Я бот поддержки.\n\n' +
      '💬 Просто напишите ваш вопрос, и наш оператор ответит вам в ближайшее время.\n\n' +
      '📎 Вы также можете отправлять фото, документы и другие файлы.'
    );
  });

  /**
   * Обработка текстовых сообщений от клиентов
   */
  bot.on(message('text'), async (ctx) => {
    const telegramId = BigInt(ctx.from.id);

    // Пропустить, если это оператор
    if (operatorService.isOperator(telegramId)) {
      return;
    }

    // Пропустить команды
    if (ctx.message.text.startsWith('/')) {
      return;
    }

    try {
      // Получить или создать диалог
      const conversation = await conversationService.getOrCreateConversation(
        telegramId,
        ctx.from.username,
        ctx.from.first_name,
        ctx.from.last_name
      );

      // Сохранить сообщение
      await conversationService.saveMessage(
        conversation.id,
        telegramId,
        SenderType.USER,
        ctx.message.message_id,
        ctx.message.text
      );

      // Если диалог в ожидании, отправить уведомление
      if (conversation.status === 'waiting') {
        await ctx.reply(
          '⏳ Ваше сообщение получено. Пожалуйста, подождите, пока оператор подключится к диалогу.\n\n' +
          'Мы ответим вам в ближайшее время!'
        );

        // Уведомить всех онлайн операторов о новом обращении
        await notifyOperatorsAboutNewConversation(bot, conversation.id);
      } else if (conversation.operatorId && conversation.operator) {
        // Переслать сообщение оператору
        const userName = formatUserName(ctx.from);
        await bot.telegram.sendMessage(
          conversation.operator.telegramId.toString(),
          `💬 Сообщение от ${userName} (#${conversation.id}):\n\n${ctx.message.text}`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✉️ Ответить', callback_data: `reply_${conversation.id}` }],
                [{ text: '✅ Закрыть диалог', callback_data: `close_${conversation.id}` }],
              ],
            },
          }
        );
      }
    } catch (error) {
      console.error('Error handling client message:', error);
      await ctx.reply('❌ Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
  });

  /**
   * Обработка фото от клиентов
   */
  bot.on(message('photo'), async (ctx) => {
    const telegramId = BigInt(ctx.from.id);

    if (operatorService.isOperator(telegramId)) {
      return;
    }

    try {
      const conversation = await conversationService.getOrCreateConversation(
        telegramId,
        ctx.from.username,
        ctx.from.first_name,
        ctx.from.last_name
      );

      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const caption = ctx.message.caption;

      await conversationService.saveMessage(
        conversation.id,
        telegramId,
        SenderType.USER,
        ctx.message.message_id,
        caption,
        photo.file_id,
        'photo'
      );

      if (conversation.status === 'waiting') {
        await ctx.reply('⏳ Ваше фото получено. Ожидайте ответа оператора.');
        await notifyOperatorsAboutNewConversation(bot, conversation.id);
      } else if (conversation.operatorId && conversation.operator) {
        const userName = formatUserName(ctx.from);
        await bot.telegram.sendPhoto(
          conversation.operator.telegramId.toString(),
          photo.file_id,
          {
            caption: `📸 Фото от ${userName} (#${conversation.id})${caption ? `:\n\n${caption}` : ''}`,
            reply_markup: {
              inline_keyboard: [
                [{ text: '✉️ Ответить', callback_data: `reply_${conversation.id}` }],
                [{ text: '✅ Закрыть диалог', callback_data: `close_${conversation.id}` }],
              ],
            },
          }
        );
      }
    } catch (error) {
      console.error('Error handling client photo:', error);
      await ctx.reply('❌ Произошла ошибка при отправке фото.');
    }
  });

  /**
   * Обработка документов от клиентов
   */
  bot.on(message('document'), async (ctx) => {
    const telegramId = BigInt(ctx.from.id);

    if (operatorService.isOperator(telegramId)) {
      return;
    }

    try {
      const conversation = await conversationService.getOrCreateConversation(
        telegramId,
        ctx.from.username,
        ctx.from.first_name,
        ctx.from.last_name
      );

      const caption = ctx.message.caption;

      await conversationService.saveMessage(
        conversation.id,
        telegramId,
        SenderType.USER,
        ctx.message.message_id,
        caption,
        ctx.message.document.file_id,
        'document'
      );

      if (conversation.status === 'waiting') {
        await ctx.reply('⏳ Ваш документ получен. Ожидайте ответа оператора.');
        await notifyOperatorsAboutNewConversation(bot, conversation.id);
      } else if (conversation.operatorId && conversation.operator) {
        const userName = formatUserName(ctx.from);
        await bot.telegram.sendDocument(
          conversation.operator.telegramId.toString(),
          ctx.message.document.file_id,
          {
            caption: `📎 Документ от ${userName} (#${conversation.id})${caption ? `:\n\n${caption}` : ''}`,
            reply_markup: {
              inline_keyboard: [
                [{ text: '✉️ Ответить', callback_data: `reply_${conversation.id}` }],
                [{ text: '✅ Закрыть диалог', callback_data: `close_${conversation.id}` }],
              ],
            },
          }
        );
      }
    } catch (error) {
      console.error('Error handling client document:', error);
      await ctx.reply('❌ Произошла ошибка при отправке документа.');
    }
  });
}

/**
 * Уведомить операторов о новом обращении
 */
async function notifyOperatorsAboutNewConversation(bot: Telegraf<BotContext>, conversationId: number) {
  try {
    const conversation = await conversationService.getConversation(conversationId);
    if (!conversation) return;

    const operators = await operatorService.getOnlineOperators();
    const userName = formatUserName(conversation.user);

    for (const operator of operators) {
      try {
        await bot.telegram.sendMessage(
          operator.telegramId.toString(),
          `🔔 Новое обращение!\n\n👤 ${userName}\n🆔 Диалог #${conversationId}`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Взять в работу', callback_data: `take_${conversationId}` }],
              ],
            },
          }
        );
      } catch (error) {
        console.error(`Failed to notify operator ${operator.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error notifying operators:', error);
  }
}
