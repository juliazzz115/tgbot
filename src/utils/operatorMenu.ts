import { InlineKeyboardButton, InlineKeyboardMarkup } from 'telegraf/types';
import { formatUserName } from './formatters';
import { operatorSessionService } from '../services/operatorSessionService';

interface ClientInfo {
  telegramId: bigint;
  username?: string;
  firstName?: string;
  lastName?: string;
  conversationId: number;
  lastMessageTime: Date;
  messageCount: number;
}

/**
 * Создать меню со списком активных клиентов
 */
export function createClientListMenu(
  operatorId: bigint,
  clients: ClientInfo[]
): { text: string; markup: InlineKeyboardMarkup } {
  if (clients.length === 0) {
    return {
      text: '📋 АКТИВНЫЕ КЛИЕНТЫ\n\n' +
            'У вас пока нет активных диалогов.\n' +
            'Когда клиент напишет боту, он появится здесь.',
      markup: {
        inline_keyboard: []
      }
    };
  }

  // Сортировать по времени последнего сообщения
  const sortedClients = [...clients].sort((a, b) =>
    b.lastMessageTime.getTime() - a.lastMessageTime.getTime()
  );

  let text = `📋 АКТИВНЫЕ КЛИЕНТЫ (${clients.length})\n`;
  text += '━━━━━━━━━━━━━━━━━━━━━━\n\n';

  const buttons: InlineKeyboardButton[][] = [];

  for (const client of sortedClients) {
    const userName = formatUserName({
      first_name: client.firstName,
      last_name: client.lastName,
      username: client.username
    } as any);

    const unreadCount = operatorSessionService.getUnreadCount(operatorId, client.telegramId);
    const unreadBadge = unreadCount > 0 ? ` 🔔${unreadCount}` : '';

    // Форматировать время
    const now = new Date();
    const diff = now.getTime() - client.lastMessageTime.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);

    let timeStr = '';
    if (hours > 0) {
      timeStr = `${hours}ч назад`;
    } else if (minutes > 0) {
      timeStr = `${minutes}м назад`;
    } else {
      timeStr = 'только что';
    }

    text += `👤 ${userName}${unreadBadge}\n`;
    text += `   💬 ${client.messageCount} сообщ. • ${timeStr}\n\n`;

    // Добавить кнопку
    buttons.push([{
      text: `💬 ${userName}${unreadBadge}`,
      callback_data: `open_chat_${client.telegramId}`
    }]);
  }

  text += '━━━━━━━━━━━━━━━━━━━━━━';

  return {
    text,
    markup: {
      inline_keyboard: buttons
    }
  };
}

/**
 * Создать заголовок активного чата с кнопками
 */
export function createChatHeader(
  clientInfo: ClientInfo,
  operatorId: bigint
): { text: string; markup: InlineKeyboardMarkup } {
  const userName = formatUserName({
    first_name: clientInfo.firstName,
    last_name: clientInfo.lastName,
    username: clientInfo.username
  } as any);

  const usernameStr = clientInfo.username ? ` (@${clientInfo.username})` : '';

  let text = `💬 ЧАТ С: ${userName}${usernameStr}\n`;
  text += '━━━━━━━━━━━━━━━━━━━━━━\n\n';
  text += '✍️ Все ваши сообщения будут отправлены этому клиенту.\n';
  text += 'Для возврата к списку нажмите кнопку ниже.';

  return {
    text,
    markup: {
      inline_keyboard: [
        [
          { text: '⬅️ К списку клиентов', callback_data: 'back_to_list' },
          { text: '📊 История', callback_data: `history_${clientInfo.telegramId}` }
        ]
      ]
    }
  };
}

/**
 * Создать уведомление о новом сообщении с кнопками
 */
export function createNewMessageNotification(
  clientInfo: ClientInfo,
  messageText: string
): { text: string; markup: InlineKeyboardMarkup } {
  const userName = formatUserName({
    first_name: clientInfo.firstName,
    last_name: clientInfo.lastName,
    username: clientInfo.username
  } as any);

  const usernameStr = clientInfo.username ? ` (@${clientInfo.username})` : '';

  let text = '🔔 НОВОЕ СООБЩЕНИЕ\n';
  text += '━━━━━━━━━━━━━━━━━━━━━━\n\n';
  text += `👤 ${userName}${usernameStr}\n\n`;

  // Обрезать длинное сообщение
  const preview = messageText.length > 100
    ? messageText.substring(0, 100) + '...'
    : messageText;

  text += `💬 ${preview}`;

  return {
    text,
    markup: {
      inline_keyboard: [
        [
          { text: '💬 Открыть чат', callback_data: `open_chat_${clientInfo.telegramId}` }
        ],
        [
          { text: '📋 К списку клиентов', callback_data: 'back_to_list' }
        ]
      ]
    }
  };
}
