import { Conversation, User, Operator, Message } from '@prisma/client';

/**
 * Форматировать имя пользователя
 */
export function formatUserName(user: { firstName?: string | null; lastName?: string | null; username?: string | null }): string {
  const parts = [user.firstName, user.lastName].filter(Boolean);
  const fullName = parts.length > 0 ? parts.join(' ') : null;
  const username = user.username ? `@${user.username}` : null;
  return fullName || username || 'Аноним';
}

/**
 * Форматировать ID пользователя для отображения
 */
export function formatUserId(telegramId: bigint): string {
  return `#${telegramId.toString().slice(-6)}`;
}

/**
 * Форматировать информацию о диалоге для оператора
 */
export function formatConversationForOperator(
  conversation: Conversation & { user: User; messages?: Message[] }
): string {
  const userName = formatUserName(conversation.user);
  const userId = formatUserId(conversation.user.telegramId);
  const status = conversation.status === 'waiting' ? '⏳ Ожидает' : '✅ Активен';
  const time = conversation.createdAt.toLocaleString('ru-RU');

  let text = `${status}\n`;
  text += `👤 ${userName} ${userId}\n`;
  text += `📅 ${time}\n`;
  text += `🆔 Диалог #${conversation.id}`;

  if (conversation.messages && conversation.messages.length > 0) {
    const lastMessage = conversation.messages[0];
    const preview = lastMessage.text ? lastMessage.text.substring(0, 50) : '[файл]';
    text += `\n💬 ${preview}${lastMessage.text && lastMessage.text.length > 50 ? '...' : ''}`;
  }

  return text;
}

/**
 * Форматировать статистику оператора
 */
export function formatOperatorStats(stats: { activeChats: number; totalChats: number; totalMessages: number }): string {
  return `📊 Ваша статистика:\n\n` +
    `💬 Активных диалогов: ${stats.activeChats}\n` +
    `📝 Всего диалогов: ${stats.totalChats}\n` +
    `✉️ Отправлено сообщений: ${stats.totalMessages}`;
}

/**
 * Форматировать время
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
