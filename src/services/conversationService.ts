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
   * Назначить конкретного оператора на диалог
   */
  async assignOperatorById(conversationId: number, operatorId: number) {
    return await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        operatorId,
        status: ConversationStatus.ACTIVE,
      },
      include: {
        user: true,
        operator: true,
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

  /**
   * Получить детальную информацию об активных диалогах оператора для меню
   */
  async getOperatorConversationsForMenu(operatorId: number) {
    const conversations = await prisma.conversation.findMany({
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

    // Получить количество сообщений для каждого диалога
    const result = await Promise.all(
      conversations.map(async (conv) => {
        const messageCount = await prisma.message.count({
          where: { conversationId: conv.id },
        });

        return {
          telegramId: conv.user.telegramId,
          username: conv.user.username,
          firstName: conv.user.firstName,
          lastName: conv.user.lastName,
          conversationId: conv.id,
          lastMessageTime: conv.messages[0]?.createdAt || conv.createdAt,
          messageCount,
        };
      })
    );

    return result;
  }

  /**
   * Найти активный диалог оператора с клиентом
   */
  async findActiveConversation(operatorId: number, clientTelegramId: bigint) {
    const user = await prisma.user.findUnique({
      where: { telegramId: clientTelegramId },
    });

    if (!user) return null;

    return await prisma.conversation.findFirst({
      where: {
        operatorId,
        userId: user.id,
        status: ConversationStatus.ACTIVE,
      },
      include: {
        user: true,
      },
    });
  }
}

export const conversationService = new ConversationService();
