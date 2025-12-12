import { Telegraf } from 'telegraf';
import { BotContext } from './types';
import { config } from './config';
import { prisma } from './db';
import { registerClientHandlers } from './handlers/clientHandlers';
import { registerOperatorHandlers } from './handlers/operatorHandlers';

async function main() {
  console.log('🤖 Starting Telegram Support Bot...');

  // Проверка подключения к БД
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
    process.exit(1);
  }

  // Создание бота
  const bot = new Telegraf<BotContext>(config.botToken);

  // Регистрация обработчиков
  registerClientHandlers(bot);
  registerOperatorHandlers(bot);

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
