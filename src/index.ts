import { Telegraf } from 'telegraf';
import { BotContext } from './types';
import { config } from './config';
import { prisma } from './db';
import { registerClientHandlers } from './handlers/clientHandlers';
import { registerOperatorHandlers } from './handlers/operatorHandlers';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🤖 Starting Telegram Support Bot...');

  // Создать директорию для базы данных, если её нет
  const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './dev.db';
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`📁 Created database directory: ${dbDir}`);
  }

  // Проверка подключения к БД
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
    process.exit(1);
  }

  // Инициализация операторов
  try {
    console.log('👥 Initializing operators...');
    for (const operatorId of config.operatorIds) {
      const operator = await prisma.operator.upsert({
        where: { telegramId: operatorId },
        update: {
          isOnline: true,
          isActive: true
        },
        create: {
          telegramId: operatorId,
          isOnline: true,
          isActive: true,
          maxChats: config.maxChatsPerOperator
        }
      });
      console.log(`  ✅ Operator ${operatorId} is online`);
    }
  } catch (error) {
    console.error('❌ Failed to initialize operators:', error);
  }

  // Создание бота
  const bot = new Telegraf<BotContext>(config.botToken);

  // Регистрация обработчиков (ВАЖНО: операторы первыми!)
  registerOperatorHandlers(bot);
  registerClientHandlers(bot);

  // Обработка ошибок
  bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    console.error('Update:', ctx.update);
  });

  // Graceful shutdown
  process.once('SIGINT', () => {
    console.log('\n🛑 SIGINT received, shutting down gracefully...');
    bot.stop('SIGINT');
    prisma.$disconnect();
  });

  process.once('SIGTERM', () => {
    console.log('\n🛑 SIGTERM received, shutting down gracefully...');
    bot.stop('SIGTERM');
    prisma.$disconnect();
  });

  // Запуск бота
  await bot.launch();
  console.log('✅ Bot is running!');
  console.log(`👥 Operators configured: ${config.operatorIds.length}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
