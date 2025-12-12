import { prisma } from '../db';
import { config } from '../config';

export class OperatorService {
  /**
   * Проверить, является ли пользователь оператором
   */
  isOperator(telegramId: bigint): boolean {
    return config.operatorIds.includes(telegramId);
  }

  /**
   * Получить или создать оператора
   */
  async getOrCreateOperator(
    telegramId: bigint,
    username?: string,
    firstName?: string,
    lastName?: string
  ) {
    let operator = await prisma.operator.findUnique({
      where: { telegramId },
    });

    if (!operator) {
      operator = await prisma.operator.create({
        data: {
          telegramId,
          username,
          firstName,
          lastName,
          maxChats: config.maxChatsPerOperator,
        },
      });
    } else {
      // Обновить информацию
      await prisma.operator.update({
        where: { id: operator.id },
        data: { username, firstName, lastName },
      });
    }

    return operator;
  }

  /**
   * Установить статус онлайн/оффлайн
   */
  async setOnlineStatus(operatorId: number, isOnline: boolean) {
    return await prisma.operator.update({
      where: { id: operatorId },
      data: { isOnline },
    });
  }

  /**
   * Получить статистику оператора
   */
  async getOperatorStats(operatorId: number) {
    const [activeChats, totalChats, totalMessages] = await Promise.all([
      prisma.conversation.count({
        where: {
          operatorId,
          status: 'active',
        },
      }),
      prisma.conversation.count({
        where: { operatorId },
      }),
      prisma.message.count({
        where: {
          senderType: 'operator',
          conversation: {
            operatorId,
          },
        },
      }),
    ]);

    return {
      activeChats,
      totalChats,
      totalMessages,
    };
  }

  /**
   * Получить всех онлайн операторов
   */
  async getOnlineOperators() {
    return await prisma.operator.findMany({
      where: {
        isActive: true,
        isOnline: true,
      },
      include: {
        conversations: {
          where: {
            status: 'active',
          },
        },
      },
    });
  }
}

export const operatorService = new OperatorService();
