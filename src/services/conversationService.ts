import { prisma } from '../db';
import { ConversationStatus, SenderType } from '../types';

export class ConversationService {
  /**
   * Получить или создать активный диалог для пользователя
   */
  async getOrCreateConversation(telegramId: bigint, username?: string, firstName?: string, lastName?: string) {
    // Получить или создать пользователя
    let user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId,
          username,
          firstName,
          lastName,
        },
      });
    } else {
      // Обновить информацию о пользователе
      await prisma.user.update({
        where: { id: user.id },
        data: { username, firstName, lastName },
      });
    }

    // Проверить, есть ли активный диалог
    let conversation = await prisma.conversation.findFirst({
      where: {
        userId: user.id,
        status: {
          in: [ConversationStatus.WAITING, ConversationStatus.ACTIVE],
        },
      },
      include: {
        operator: true,
      },
    });

    if (!conversation) {
      // Создать новый диалог
      conversation = await prisma.conversation.create({
        data: {
          userId: user.id,
          status: ConversationStatus.WAITING,
        },
        include: {
          operator: true,
        },
      });

      // Попытаться назначить оператора
      await this.assignOperator(conversation.id);
    }

    return conversation;
  }

  /**
   * Назначить оператора на диалог
   */
  async assignOperator(conversationId: number) {
    // Найти доступного оператора с минимальным количеством активных чатов
    const operators = await prisma.operator.findMany({
      where: {
        isActive: true,
        isOnline: true,
      },
      include: {
        conversations: {
          where: {
            status: ConversationStatus.ACTIVE,
          },
        },
      },
    });

    // Фильтр операторов, у которых не превышен лимит
    const availableOperators = operators
      .filter(op => op.conversations.length < op.maxChats)
      .sort((a, b) => a.conversations.length - b.conversations.length);

    if (availableOperators.length === 0) {
      return null;
    }

    const operator = availableOperators[0];

    // Назначить оператора
    const conversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        operatorId: operator.id,
        status: ConversationStatus.ACTIVE,
      },
      include: {
        user: true,
        operator: true,
      },
    });

    return conversation;
  }

  /**
   * Сохранить сообщение
   */
  async saveMessage(
    conversationId: number,
    senderId: bigint,
    senderType: SenderType,
    messageId: number,
    text?: string,
    fileId?: string,
    fileType?: string
  ) {
    return await prisma.message.create({
      data: {
        conversationId,
        senderId,
        senderType,
        messageId,
        text,
        fileId,
        fileType,
      },
    });
  }

  /**
   * Закрыть диалог
   */
  async closeConversation(conversationId: number) {
    return await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: ConversationStatus.CLOSED,
        closedAt: new Date(),
      },
    });
  }

  /**
   * Получить список ожидающих диалогов
   */
  async getWaitingConversations() {
    return await prisma.conversation.findMany({
      where: {
        status: ConversationStatus.WAITING,
      },
      include: {
        user: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Получить активные диалоги оператора
   */
  async getOperatorConversations(operatorId: number) {
    return await prisma.conversation.findMany({
      where: {
        operatorId,
        status: ConversationStatus.ACTIVE,
      },
      include: {
        user: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  /**
   * Получить диалог по ID
   */
  async getConversation(conversationId: number) {
    return await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        user: true,
        operator: true,
      },
    });
  }

  /**
   * Получить сообщения диалога
   */
  async getConversationMessages(conversationId: number, limit = 50) {
    return await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

export const conversationService = new ConversationService();
