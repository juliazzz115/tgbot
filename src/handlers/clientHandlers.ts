import { Telegraf } from 'telegraf';
import { BotContext, SenderType } from '../types';
import { conversationService } from '../services/conversationService';
import { operatorService } from '../services/operatorService';
import { operatorSessionService } from '../services/operatorSessionService';
import { formatUserName } from '../utils/formatters';
import { notifyOperatorNewMessage } from './operatorHandlers';
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

    // Проверить, есть ли активный диалог
    const activeConversation = await conversationService.getOrCreateConversation(
      telegramId,
      ctx.from.username,
      ctx.from.first_name,
      ctx.from.last_name
    );

    const hasActiveDialog = activeConversation.status === 'active' || activeConversation.status === 'waiting';

    if (hasActiveDialog) {
      // Уже есть активный диалог
      await ctx.reply(
        '💬 У вас уже есть активный диалог с оператором.\n\n' +
        'Просто напишите ваш вопрос, и оператор ответит вам.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Завершить диалог', callback_data: 'client_end_conversation' }]
            ]
          }
        }
      );
    } else {
      // Нет активного диалога - предложить начать
      await ctx.reply(
        '👋 Здравствуйте! Я бот поддержки.\n\n' +
        '💬 Нажмите кнопку ниже, чтобы начать диалог с оператором.\n\n' +
        '📎 Вы сможете отправлять текст, фото, документы и другие файлы.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📞 Начать диалог', callback_data: 'client_start_conversation' }]
            ]
          }
        }
      );
    }
  });

  /**
   * Обработка callback query от клиентов (нажатия на inline кнопки)
   */
  bot.on('callback_query', async (ctx) => {
    const telegramId = BigInt(ctx.from.id);

    // Пропустить операторов
    if (operatorService.isOperator(telegramId)) {
      return;
    }

    const data = (ctx.callbackQuery as any).data;
    console.log(`[Client Callback] Client ${telegramId} pressed button: ${data}`);

    if (data === 'client_start_conversation') {
      // Начать новый диалог
      await handleStartConversation(bot, ctx, telegramId);
      await ctx.answerCbQuery('Диалог начат');
    } else if (data === 'client_end_conversation') {
      // Завершить диалог
      await handleEndConversation(bot, ctx, telegramId);
      await ctx.answerCbQuery('Диалог завершен');
    }
  });

  // Текстовые сообщения от клиентов теперь обрабатываются в messageRouter.ts

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
      const caption = (ctx.message as any).caption;

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

      // Отправить уведомление оператору
      const messageText = caption ? `📷 Фото: ${caption}` : '📷 Фото';
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
        messageText
      );

      // Подтверждение клиенту (удалено)
      // await ctx.react('👍');

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

      const caption = (ctx.message as any).caption;

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

      // Отправить уведомление оператору
      const fileName = ctx.message.document.file_name || 'документ';
      const messageText = caption ? `📄 ${fileName}: ${caption}` : `📄 ${fileName}`;

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
        messageText
      );

      // Подтверждение клиенту (удалено)
      // await ctx.react('👍');

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

/**
 * Начать новый диалог
 */
async function handleStartConversation(bot: Telegraf<BotContext>, ctx: any, telegramId: bigint) {
  try {
    console.log(`[Client] Starting conversation for ${telegramId}`);

    // Создать или получить диалог
    const conversation = await conversationService.getOrCreateConversation(
      telegramId,
      ctx.from.username,
      ctx.from.first_name,
      ctx.from.last_name
    );

    // Получить доступного оператора
    const operator = await getAvailableOperator();

    if (!operator) {
      await ctx.editMessageText(
        '⏳ Диалог начат!\n\n' +
        'В данный момент все операторы заняты.\n' +
        'Как только оператор освободится, он свяжется с вами.\n\n' +
        'Можете написать ваш вопрос прямо сейчас.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Завершить диалог', callback_data: 'client_end_conversation' }]
            ]
          }
        }
      );
      return;
    }

    // Назначить оператора
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
      '📞 Новый клиент начал диалог'
    );

    await ctx.editMessageText(
      '✅ Диалог начат!\n\n' +
      'Оператор получил уведомление и скоро с вами свяжется.\n\n' +
      'Напишите ваш вопрос, и оператор ответит вам.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Завершить диалог', callback_data: 'client_end_conversation' }]
          ]
        }
      }
    );

    console.log(`[Client] Conversation started successfully for ${telegramId}`);

  } catch (error) {
    console.error('Error starting conversation:', error);
    await ctx.reply('❌ Произошла ошибка при начале диалога.');
  }
}

/**
 * Завершить диалог
 */
async function handleEndConversation(bot: Telegraf<BotContext>, ctx: any, telegramId: bigint) {
  try {
    console.log(`[Client] Ending conversation for ${telegramId}`);

    // Найти активный диалог
    const conversation = await conversationService.getOrCreateConversation(
      telegramId,
      ctx.from.username,
      ctx.from.first_name,
      ctx.from.last_name
    );

    if (conversation.status === 'closed') {
      await ctx.editMessageText(
        'ℹ️ У вас нет активного диалога.\n\n' +
        'Нажмите кнопку ниже, чтобы начать новый диалог.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📞 Начать диалог', callback_data: 'client_start_conversation' }]
            ]
          }
        }
      );
      return;
    }

    // Закрыть диалог
    await conversationService.closeConversation(conversation.id);

    // Уведомить оператора, если он назначен
    if (conversation.operatorId && conversation.operator) {
      try {
        const userName = formatUserName({
          first_name: ctx.from.first_name,
          last_name: ctx.from.last_name,
          username: ctx.from.username
        } as any);

        await bot.telegram.sendMessage(
          conversation.operator.telegramId.toString(),
          `📴 Клиент ${userName} завершил диалог`
        );
      } catch (error) {
        console.error('Error notifying operator about conversation end:', error);
      }
    }

    await ctx.editMessageText(
      '✅ Диалог завершен!\n\n' +
      'Спасибо за обращение. Если у вас возникнут еще вопросы, вы можете начать новый диалог.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📞 Начать новый диалог', callback_data: 'client_start_conversation' }]
          ]
        }
      }
    );

    console.log(`[Client] Conversation ended successfully for ${telegramId}`);

  } catch (error) {
    console.error('Error ending conversation:', error);
    await ctx.reply('❌ Произошла ошибка при завершении диалога.');
  }
}
