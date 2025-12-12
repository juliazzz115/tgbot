import { Context } from 'telegraf';
import { Message, Update } from 'telegraf/types';

export interface BotContext extends Context {
  update: Update;
}

export enum ConversationStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  CLOSED = 'closed'
}

export enum SenderType {
  USER = 'user',
  OPERATOR = 'operator'
}

export interface ConversationInfo {
  id: number;
  userId: number;
  userTelegramId: bigint;
  userName: string;
  operatorId?: number;
  status: string;
  createdAt: Date;
  messageCount: number;
}
