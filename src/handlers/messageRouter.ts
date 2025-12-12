import { Telegraf, Middleware } from 'telegraf';
import { BotContext, SenderType } from '../types';
import { conversationService } from '../services/conversationService';
import { operatorService } from '../services/operatorService';
import { operatorSessionService } from '../services/operatorSessionService';
import { formatUserName } from '../utils/formatters';
import { notifyOperatorNewMessage } from './operatorHandlers';

/**
 * Роутер сообщений - определяет, кто отправил сообщение (клиент или оператор)
 * и вызывает соответствующую логику
 */
export function createMessageRouter(bot: Telegraf<BotContext>): Middleware<BotContext> {
  return async (ctx, next) => {
    // Обрабатываем только текстовые сообщения в личных чатах
    if (!ctx.message || !('text' in ctx.message) || ctx.chat?.type !== 'private') {
      return next();
    }

    // Пропускаем команды
    if (ctx.message.text.startsWith('/')) {
      return next();
    }

    const telegramId = BigInt(ctx.from.id);
    const isOperator = operatorService.isOperator(telegramId);

    console.log(`[Message Router] Message from ${telegramId}, isOperator: ${isOperator}`);

    if (isOperator) {
      // Это оператор - проверяем активную сессию
      const activeClientId = operatorSessionService.getActiveClient(telegramId);
      console.log(`[Message Router] Operator has active session: ${!!activeClientId}`);

      if (activeClientId) {
        // Есть активная сессия - обрабатываем как сообщение оператора клиенту
        await handleOperatorMessage(bot, ctx, telegramId, activeClientId);
        return; // НЕ вызываем next() - сообщение обработано
      } else {
        // Нет активной сессии - показываем подсказку
        await ctx.reply(
          'ℹ️ Сначала выберите клиента из списка.\n\n' +
          'Используйте команду /clients чтобы увидеть активные диалоги.'
        );
        return; // НЕ вызываем next() - сообщение обработано
      }
    } else {
      // Это клиент - обрабатываем как клиентское сообщение
      await handleClientMessage(bot, ctx, telegramId);
      return; // НЕ вызываем next() - сообщение обработано
    }
  };
}

/**
 * Обработка сообщения от клиента
 */
async function handleClientMessage(bot: Telegraf<BotContext>, ctx: any, telegramId: bigint) {
  try {
    console.log(`[Client Message] From ${telegramId}: "${ctx.message.text}"`);

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

    // Отправить уведомление оператору
    await notifyOperatorNewMessage(
      bot,
      operator.telegramId,
      {
        telegramId,
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        conversationId: conversation.id,
        lastMessageTime: new Date(),
        messageCount: 0
      },
      ctx.message.text
    );

    console.log(`[Client Message] Notification sent to operator ${operator.telegramId}`);

  } catch (error) {
    console.error('Error handling client message:', error);
    await ctx.reply('❌ Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
}

/**
 * Обработка сообщения от оператора клиенту
 */
async function handleOperatorMessage(bot: Telegraf<BotContext>, ctx: any, operatorTelegramId: bigint, clientTelegramId: bigint) {
  try {
    console.log(`[Operator Message] From ${operatorTelegramId} to ${clientTelegramId}: "${ctx.message.text}"`);

    // Найти диалог с этим клиентом
    const operator = await operatorService.getOrCreateOperator(operatorTelegramId);
    const conversation = await conversationService.findActiveConversation(operator.id, clientTelegramId);

    if (!conversation) {
      console.log(`[Operator Message] Conversation not found`);
      await ctx.reply(
        '❌ Диалог с этим клиентом не найден или закрыт.\n\n' +
        'Используйте /clients для выбора другого клиента.'
      );
      operatorSessionService.clearActiveClient(operatorTelegramId);
      return;
    }

    // Сохранить сообщение
    await conversationService.saveMessage(
      conversation.id,
      operatorTelegramId,
      SenderType.OPERATOR,
      ctx.message.message_id,
      ctx.message.text
    );

    // Отправить клиенту
    await bot.telegram.sendMessage(
      clientTelegramId.toString(),
      `👨‍💼 Оператор:\n\n${ctx.message.text}`
    );

    console.log(`[Operator Message] Message sent to client successfully`);

    // Подтверждение оператору
    await ctx.reply('✅ Отправлено');

  } catch (error) {
    console.error('Error sending operator message:', error);
    await ctx.reply('❌ Ошибка при отправке сообщения');
  }
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
