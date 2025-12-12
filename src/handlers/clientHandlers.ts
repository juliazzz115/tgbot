import { Telegraf } from 'telegraf';
import { BotContext, SenderType } from '../types';
import { conversationService } from '../services/conversationService';
import { operatorService } from '../services/operatorService';
import { formatUserName } from '../utils/formatters';
import { message } from 'telegraf/filters';

// Маппинг: messageId у оператора -> telegramId клиента
const messageToClient = new Map<number, bigint>();

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

    // Работать только в личном чате с ботом
    if (ctx.chat?.type !== 'private') {
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

      // Получить доступного оператора
      const operator = conversation.operator || await getAvailableOperator();

      if (!operator) {
        await ctx.reply(
          '⏳ Ваше сообщение получено. В данный момент все операторы заняты.\n' +
          'Мы ответим вам как можно скорее!'
        );
        return;
      }

      // Назначить оператора, если еще не назначен
      if (!conversation.operatorId) {
        await conversationService.assignOperatorById(conversation.id, operator.id);
      }

      // Переслать сообщение оператору
      const userName = formatUserName(ctx.from);
      const userInfo = `👤 ${userName}${ctx.from.username ? ` (@${ctx.from.username})` : ''}`;

      const sentMessage = await bot.telegram.sendMessage(
        operator.telegramId.toString(),
        `${userInfo}:\n\n${ctx.message.text}`,
        {
          reply_markup: {
            force_reply: true,
          }
        }
      );

      // Сохранить маппинг для ответа
      messageToClient.set(sentMessage.message_id, telegramId);

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

    // Работать только в личном чате с ботом
    if (ctx.chat?.type !== 'private') {
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

      // Получить доступного оператора
      const operator = conversation.operator || await getAvailableOperator();

      if (!operator) {
        await ctx.reply('⏳ Ваше фото получено. Ожидайте ответа оператора.');
        return;
      }

      // Назначить оператора, если еще не назначен
      if (!conversation.operatorId) {
        await conversationService.assignOperatorById(conversation.id, operator.id);
      }

      // Переслать фото оператору
      const userName = formatUserName(ctx.from);
      const userInfo = `👤 ${userName}${ctx.from.username ? ` (@${ctx.from.username})` : ''}`;

      const sentMessage = await bot.telegram.sendPhoto(
        operator.telegramId.toString(),
        photo.file_id,
        {
          caption: caption ? `${userInfo}:\n\n${caption}` : userInfo,
          reply_markup: {
            force_reply: true,
          }
        }
      );

      // Сохранить маппинг для ответа
      messageToClient.set(sentMessage.message_id, telegramId);

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

    // Работать только в личном чате с ботом
    if (ctx.chat?.type !== 'private') {
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

      // Получить доступного оператора
      const operator = conversation.operator || await getAvailableOperator();

      if (!operator) {
        await ctx.reply('⏳ Ваш документ получен. Ожидайте ответа оператора.');
        return;
      }

      // Назначить оператора, если еще не назначен
      if (!conversation.operatorId) {
        await conversationService.assignOperatorById(conversation.id, operator.id);
      }

      // Переслать документ оператору
      const userName = formatUserName(ctx.from);
      const userInfo = `👤 ${userName}${ctx.from.username ? ` (@${ctx.from.username})` : ''}`;

      const sentMessage = await bot.telegram.sendDocument(
        operator.telegramId.toString(),
        ctx.message.document.file_id,
        {
          caption: caption ? `${userInfo}:\n\n${caption}` : userInfo,
          reply_markup: {
            force_reply: true,
          }
        }
      );

      // Сохранить маппинг для ответа
      messageToClient.set(sentMessage.message_id, telegramId);

    } catch (error) {
      console.error('Error handling client document:', error);
      await ctx.reply('❌ Произошла ошибка при отправке документа.');
    }
  });
}

/**
 * Получить доступного оператора
 */
async function getAvailableOperator() {
  const operators = await operatorService.getOnlineOperators();

  if (operators.length === 0) {
    return null;
  }

  // Взять оператора с наименьшим количеством активных чатов
  const sortedOperators = operators
    .filter((op: any) => op.conversations.length < op.maxChats)
    .sort((a: any, b: any) => a.conversations.length - b.conversations.length);

  return sortedOperators.length > 0 ? sortedOperators[0] : null;
}

export { messageToClient };
