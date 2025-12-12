/**
 * Сервис для управления активными сессиями операторов
 * Каждый оператор может общаться с одним клиентом за раз
 */

// Маппинг: operatorTelegramId -> активный clientTelegramId
const activeSessions = new Map<bigint, bigint>();

// Маппинг: operatorTelegramId -> количество непрочитанных от каждого клиента
const unreadMessages = new Map<bigint, Map<bigint, number>>();

export class OperatorSessionService {
  /**
   * Установить активного клиента для оператора
   */
  setActiveClient(operatorId: bigint, clientId: bigint): void {
    activeSessions.set(operatorId, clientId);
    console.log(`[Session] Operator ${operatorId} -> Client ${clientId}`);
    console.log(`[Session] Total active sessions: ${activeSessions.size}`);

    // Сбросить счетчик непрочитанных для этого клиента
    this.clearUnreadForClient(operatorId, clientId);
  }

  /**
   * Получить активного клиента для оператора
   */
  getActiveClient(operatorId: bigint): bigint | undefined {
    const clientId = activeSessions.get(operatorId);
    console.log(`[Session] Get active client for operator ${operatorId}: ${clientId}`);
    console.log(`[Session] Session exists: ${activeSessions.has(operatorId)}`);

    // Debug: показать все ключи в Map
    console.log(`[Session] All operator IDs in map:`, Array.from(activeSessions.keys()));

    return clientId;
  }

  /**
   * Очистить активную сессию оператора (вернуться к списку)
   */
  clearActiveClient(operatorId: bigint): void {
    activeSessions.delete(operatorId);
    console.log(`[Session] Operator ${operatorId} cleared active client`);
  }

  /**
   * Проверить, есть ли активная сессия у оператора
   */
  hasActiveSession(operatorId: bigint): boolean {
    return activeSessions.has(operatorId);
  }

  /**
   * Увеличить счетчик непрочитанных сообщений от клиента
   */
  incrementUnread(operatorId: bigint, clientId: bigint): void {
    if (!unreadMessages.has(operatorId)) {
      unreadMessages.set(operatorId, new Map());
    }

    const operatorUnread = unreadMessages.get(operatorId)!;
    const currentCount = operatorUnread.get(clientId) || 0;
    operatorUnread.set(clientId, currentCount + 1);
  }

  /**
   * Получить количество непрочитанных от клиента
   */
  getUnreadCount(operatorId: bigint, clientId: bigint): number {
    const operatorUnread = unreadMessages.get(operatorId);
    return operatorUnread?.get(clientId) || 0;
  }

  /**
   * Очистить счетчик непрочитанных для клиента
   */
  clearUnreadForClient(operatorId: bigint, clientId: bigint): void {
    const operatorUnread = unreadMessages.get(operatorId);
    if (operatorUnread) {
      operatorUnread.delete(clientId);
    }
  }

  /**
   * Получить общее количество непрочитанных для оператора
   */
  getTotalUnread(operatorId: bigint): number {
    const operatorUnread = unreadMessages.get(operatorId);
    if (!operatorUnread) return 0;

    let total = 0;
    for (const count of operatorUnread.values()) {
      total += count;
    }
    return total;
  }
}

export const operatorSessionService = new OperatorSessionService();
