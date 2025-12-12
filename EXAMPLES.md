# 📝 Примеры использования

## Сценарий 1: Новое обращение клиента

### Действия клиента:

1. **Клиент находит бота и запускает**
   ```
   Клиент: /start
   Бот: 👋 Здравствуйте! Я бот поддержки...
   ```

2. **Клиент отправляет вопрос**
   ```
   Клиент: У меня не работает оплата картой
   Бот: ⏳ Ваше сообщение получено. Пожалуйста, подождите...
   ```

### Что происходит на стороне системы:

```javascript
// 1. Создается или получается пользователь
const user = await prisma.user.create({
  data: {
    telegramId: 123456789,
    username: "client_user",
    firstName: "Иван",
  }
});

// 2. Создается новый диалог
const conversation = await prisma.conversation.create({
  data: {
    userId: user.id,
    status: 'waiting',
  }
});

// 3. Сохраняется сообщение
const message = await prisma.message.create({
  data: {
    conversationId: conversation.id,
    senderId: user.telegramId,
    senderType: 'user',
    text: 'У меня не работает оплата картой',
    messageId: 12345,
  }
});

// 4. Уведомляются все онлайн операторы
for (const operator of onlineOperators) {
  bot.telegram.sendMessage(
    operator.telegramId,
    "🔔 Новое обращение!\n\n👤 Иван\n🆔 Диалог #1",
    { reply_markup: { inline_keyboard: [[
      { text: '✅ Взять в работу', callback_data: 'take_1' }
    ]]}}
  );
}
```

---

## Сценарий 2: Оператор берет диалог в работу

### Действия оператора:

1. **Оператор получает уведомление**
   ```
   Бот: 🔔 Новое обращение!
        👤 Иван
        🆔 Диалог #1
        [✅ Взять в работу]
   ```

2. **Оператор нажимает кнопку**
   ```
   Бот: ✅ Вы взяли диалог #1 в работу
        👤 Клиент: Иван

        Теперь просто пишите сообщения...

        📜 История сообщений:
        👤 Клиент: У меня не работает оплата картой
   ```

3. **Клиент получает уведомление**
   ```
   Бот: ✅ Оператор подключился к диалогу. Можете задавать свои вопросы!
   ```

### Что происходит на стороне системы:

```javascript
// 1. Получаем оператора
const operator = await prisma.operator.findUnique({
  where: { telegramId: operatorId }
});

// 2. Обновляем диалог
await prisma.conversation.update({
  where: { id: conversationId },
  data: {
    operatorId: operator.id,
    status: 'active',
  }
});

// 3. Устанавливаем контекст оператора
operatorContext.set(operatorTelegramId.toString(), conversationId);

// 4. Отправляем историю оператору
const messages = await prisma.message.findMany({
  where: { conversationId },
  orderBy: { createdAt: 'asc' }
});

// 5. Уведомляем клиента
bot.telegram.sendMessage(
  clientTelegramId,
  '✅ Оператор подключился к диалогу...'
);
```

---

## Сценарий 3: Общение между оператором и клиентом

### Диалог:

```
Оператор: Здравствуйте! Какую карту вы используете?

↓ [Сообщение передается клиенту]

Клиент: Visa, заканчивается на 1234
👨‍💼 Оператор: Здравствуйте! Какую карту вы используете?

↓ [Сообщение передается оператору]

Оператор: [Получает]
💬 Сообщение от Иван (#1):
Visa, заканчивается на 1234
[✉️ Ответить] [✅ Закрыть диалог]

Оператор: Попробуйте пересохранить карту в настройках

↓ [Сообщение передается клиенту]

Клиент: [Получает]
👨‍💼 Оператор: Попробуйте пересохранить карту в настройках
```

### Код обработки:

```javascript
// Сообщение от оператора
bot.on(message('text'), async (ctx) => {
  const operatorId = BigInt(ctx.from.id);

  if (!operatorService.isOperator(operatorId)) {
    return; // Не оператор
  }

  const conversationId = operatorContext.get(operatorId.toString());

  if (!conversationId) {
    await ctx.reply('ℹ️ Выберите диалог для ответа');
    return;
  }

  // Сохранить в БД
  await conversationService.saveMessage(
    conversationId,
    operatorId,
    'operator',
    ctx.message.message_id,
    ctx.message.text
  );

  // Отправить клиенту
  const conversation = await conversationService.getConversation(conversationId);
  await bot.telegram.sendMessage(
    conversation.user.telegramId.toString(),
    `👨‍💼 Оператор: ${ctx.message.text}`
  );

  await ctx.reply('✅ Сообщение отправлено');
});
```

---

## Сценарий 4: Отправка файлов

### Клиент отправляет фото:

```
Клиент: [Отправляет фото экрана с ошибкой]
        Caption: Вот что у меня показывает

↓ [Фото передается оператору]

Оператор: [Получает фото]
📸 Фото от Иван (#1):
Вот что у меня показывает
[✉️ Ответить] [✅ Закрыть диалог]
```

### Код обработки:

```javascript
// В clientHandlers.ts
bot.on(message('photo'), async (ctx) => {
  const telegramId = BigInt(ctx.from.id);

  const conversation = await conversationService.getOrCreateConversation(
    telegramId,
    ctx.from.username,
    ctx.from.first_name,
    ctx.from.last_name
  );

  const photo = ctx.message.photo[ctx.message.photo.length - 1];

  await conversationService.saveMessage(
    conversation.id,
    telegramId,
    'user',
    ctx.message.message_id,
    ctx.message.caption,
    photo.file_id,
    'photo'
  );

  if (conversation.operatorId && conversation.operator) {
    await bot.telegram.sendPhoto(
      conversation.operator.telegramId.toString(),
      photo.file_id,
      {
        caption: `📸 Фото от ${userName} (#${conversation.id})${
          ctx.message.caption ? `:\n\n${ctx.message.caption}` : ''
        }`,
        reply_markup: { ... }
      }
    );
  }
});
```

---

## Сценарий 5: Завершение диалога

### Вариант А: Оператор завершает

```
Оператор: Проблема решена?

Клиент: Да, спасибо!

Оператор: /done

Бот (оператору): ✅ Диалог #1 закрыт

Бот (клиенту): ✅ Диалог завершен. Спасибо за обращение!
                Если у вас возникнут еще вопросы, просто напишите нам снова.
```

### Вариант Б: Через кнопку

```
Оператор: [Нажимает "✅ Закрыть диалог"]

Бот (оператору): ✅ Диалог #1 закрыт

Бот (клиенту): ✅ Диалог завершен...
```

### Код:

```javascript
// Команда /done
bot.command('done', async (ctx) => {
  const telegramId = BigInt(ctx.from.id);
  const conversationId = operatorContext.get(telegramId.toString());

  if (!conversationId) {
    await ctx.reply('❌ У вас нет активного диалога');
    return;
  }

  const conversation = await conversationService.getConversation(conversationId);

  // Закрыть диалог
  await conversationService.closeConversation(conversationId);

  // Очистить контекст
  operatorContext.delete(telegramId.toString());

  // Уведомить оператора
  await ctx.reply(`✅ Диалог #${conversationId} закрыт`);

  // Уведомить клиента
  await bot.telegram.sendMessage(
    conversation.user.telegramId.toString(),
    '✅ Диалог завершен. Спасибо за обращение!...'
  );
});
```

---

## Сценарий 6: Работа с несколькими диалогами

### Оператор имеет 3 активных диалога:

```
Оператор: /active

Бот: 💬 Ваши активные диалоги: 3

     ✅ Активен
     👤 Иван #ABC123
     📅 12.12.2025, 10:30
     🆔 Диалог #1
     💬 У меня не работает оплата картой
     [✉️ Ответить] [✅ Закрыть диалог]

     ✅ Активен
     👤 Мария #DEF456
     📅 12.12.2025, 10:45
     🆔 Диалог #2
     💬 Как изменить адрес доставки?
     [✉️ Ответить] [✅ Закрыть диалог]

     ✅ Активен
     👤 Петр #GHI789
     📅 12.12.2025, 11:00
     🆔 Диалог #3
     💬 [файл]
     [✉️ Ответить] [✅ Закрыть диалог]
```

### Переключение между диалогами:

```
Оператор: [Нажимает "✉️ Ответить" на диалоге #2]

Бот: ✍️ Режим ответа на диалог #2
     Следующее сообщение будет отправлено клиенту.

Оператор: Адрес можно изменить в личном кабинете

Бот: ✅ Сообщение отправлено

[Контекст переключен на диалог #2]
[Все последующие сообщения идут в диалог #2]

Оператор: [Нажимает "✉️ Ответить" на диалоге #1]

[Контекст переключен на диалог #1]
```

---

## Сценарий 7: Статистика оператора

```
Оператор: /stats

Бот: 📊 Ваша статистика:

     💬 Активных диалогов: 3
     📝 Всего диалогов: 47
     ✉️ Отправлено сообщений: 234
```

### Запрос к БД:

```javascript
async getOperatorStats(operatorId: number) {
  const [activeChats, totalChats, totalMessages] = await Promise.all([
    // Активные диалоги
    prisma.conversation.count({
      where: {
        operatorId,
        status: 'active',
      },
    }),

    // Всего диалогов
    prisma.conversation.count({
      where: { operatorId },
    }),

    // Всего сообщений
    prisma.message.count({
      where: {
        senderType: 'operator',
        conversation: {
          operatorId,
        },
      },
    }),
  ]);

  return { activeChats, totalChats, totalMessages };
}
```

---

## Сценарий 8: Управление статусом оператора

### Выход из сети:

```
Оператор: /offline

Бот: 🔴 Вы вышли из сети. Новые обращения не будут поступать.

[Оператор перестает получать новые обращения]
[Активные диалоги остаются активными]
```

### Вход в сеть:

```
Оператор: /online

Бот: 🟢 Вы вошли в сеть. Теперь вы будете получать новые обращения.

[Оператор начинает получать новые обращения]
```

### Код:

```javascript
async function handleOnlineCommand(ctx: BotContext, isOnline: boolean) {
  const telegramId = BigInt(ctx.from.id);

  const operator = await operatorService.getOrCreateOperator(telegramId);

  await prisma.operator.update({
    where: { id: operator.id },
    data: { isOnline }
  });

  if (isOnline) {
    await ctx.reply('🟢 Вы вошли в сеть...');
  } else {
    await ctx.reply('🔴 Вы вышли из сети...');
  }
}
```

---

## Сценарий 9: Очередь обращений

### Все операторы заняты:

```
[Клиент 1 пишет] → Диалог #1 → waiting
[Клиент 2 пишет] → Диалог #2 → waiting
[Клиент 3 пишет] → Диалог #3 → waiting

Оператор 1: 10/10 чатов (занят)
Оператор 2: Offline
```

### Оператор просматривает очередь:

```
Оператор: /queue

Бот: 📋 Ожидающие обращения: 3

     ⏳ Ожидает
     👤 Иван #ABC123
     📅 12.12.2025, 11:00
     🆔 Диалог #1
     💬 Срочно! Нужна помощь
     [✅ Взять в работу]

     ⏳ Ожидает
     👤 Мария #DEF456
     📅 12.12.2025, 11:05
     🆔 Диалог #2
     💬 Вопрос по заказу
     [✅ Взять в работу]

     ⏳ Ожидает
     👤 Петр #GHI789
     📅 12.12.2025, 11:07
     🆔 Диалог #3
     💬 Где мой заказ?
     [✅ Взять в работу]
```

---

## Сценарий 10: Повторное обращение клиента

### Клиент пишет после закрытого диалога:

```
[Диалог #1 был закрыт]

Клиент: Привет, у меня снова вопрос

Бот: ⏳ Ваше сообщение получено...

[Создается новый диалог #4]
[Уведомляются операторы]
```

### Код:

```javascript
async getOrCreateConversation(telegramId: bigint, ...) {
  // Проверить активный диалог
  let conversation = await prisma.conversation.findFirst({
    where: {
      userId: user.id,
      status: {
        in: ['waiting', 'active'],
      },
    },
  });

  // Если нет активного - создать новый
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        status: 'waiting',
      },
    });
  }

  return conversation;
}
```

---

## Полезные советы

### Для операторов:

1. **Быстрый workflow:**
   - Войдите в сеть: `/online`
   - При получении уведомления нажмите "Взять в работу"
   - Просто пишите ответы
   - После решения проблемы: `/done`

2. **Работа с несколькими диалогами:**
   - Используйте `/active` для просмотра всех диалогов
   - Кнопка "✉️ Ответить" переключает контекст
   - Текущий диалог всегда активен - просто пишите

3. **Организация работы:**
   - Проверяйте `/queue` периодически
   - Следите за количеством активных диалогов
   - Закрывайте диалоги после решения

### Для разработчиков:

1. **Добавление новых типов сообщений:**
   ```javascript
   bot.on(message('voice'), async (ctx) => {
     // Обработка голосовых
   });
   ```

2. **Добавление команд:**
   ```javascript
   bot.command('transfer', async (ctx) => {
     // Передать диалог другому оператору
   });
   ```

3. **Расширение статистики:**
   ```javascript
   // Добавить среднее время ответа
   // Добавить рейтинг операторов
   // Добавить аналитику по категориям
   ```
