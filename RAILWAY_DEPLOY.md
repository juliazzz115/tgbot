# 🚂 Деплой на Railway

Railway - современная платформа для деплоя приложений. Идеально подходит для запуска Telegram ботов 24/7.

## 📋 Подготовка

### Шаг 1: Создать аккаунт на Railway

1. Перейдите на [railway.app](https://railway.app)
2. Нажмите "Start a New Project"
3. Войдите через GitHub

## 🚀 Деплой бота

### Способ 1: Через GitHub (Рекомендуется)

1. **Подключите репозиторий:**
   - В Railway нажмите "New Project"
   - Выберите "Deploy from GitHub repo"
   - Выберите репозиторий `tgbot`

2. **Railway автоматически:**
   - Определит Node.js проект
   - Установит зависимости (`npm install`)
   - Соберет проект (`npm run build` через postinstall)
   - Запустит бота (`npm start`)

3. **Настройте переменные окружения:**

   В Railway проекте откройте вкладку "Variables" и добавьте:

   ```
   BOT_TOKEN=8231405428:AAESPjSsRwvDuk3XuXILcp0BXh0LMHbEB28
   OPERATOR_IDS=2115070994,5591152828
   ADMIN_ID=2115070994
   MAX_CHATS_PER_OPERATOR=5
   DATABASE_URL=file:./data/production.db
   ```

4. **Готово!** 🎉
   - Railway автоматически задеплоит бота
   - Бот начнет работать в течение 1-2 минут
   - При каждом push в GitHub бот автоматически переразвернется

### Способ 2: Через Railway CLI

```bash
# 1. Установить Railway CLI
npm install -g @railway/cli

# 2. Войти в Railway
railway login

# 3. Инициализировать проект
railway init

# 4. Добавить переменные окружения
railway variables set BOT_TOKEN=8231405428:AAESPjSsRwvDuk3XuXILcp0BXh0LMHbEB28
railway variables set OPERATOR_IDS=2115070994,5591152828
railway variables set ADMIN_ID=2115070994
railway variables set MAX_CHATS_PER_OPERATOR=5
railway variables set DATABASE_URL=file:./data/production.db

# 5. Задеплоить
railway up
```

## 📊 Мониторинг

После деплоя вы можете:

1. **Просмотреть логи:**
   - В Railway UI откройте вкладку "Deployments"
   - Кликните на активный деплой
   - Увидите логи в реальном времени

2. **Проверить работу:**
   - Откройте бота в Telegram
   - Отправьте `/start` как клиент
   - Отправьте `/start` как оператор
   - Проверьте, что сообщения доходят

## 💾 База данных

Railway автоматически создаст файл `production.db` для SQLite.

**Важно:** При каждом редеплое файл БД может быть потерян.

### Решение: Использовать Railway Volume

1. В Railway проекте:
   - Откройте "Settings"
   - Создайте Volume
   - Mount Path: `/app/data`

2. Обновите `DATABASE_URL`:
   ```
   DATABASE_URL=file:/app/data/production.db
   ```

Теперь база данных будет сохраняться между деплоями!

## 🔄 Автоматическое обновление

Railway автоматически переразворачивает бота при:
- Push в главную ветку GitHub
- Изменении переменных окружения
- Ручном редеплое

## 💰 Стоимость

Railway предоставляет:
- **$5 бесплатно** каждый месяц
- Этого хватит для работы бота 24/7
- После $5 платишь только за использование

## 🐛 Решение проблем

### Бот не запускается

Проверьте логи в Railway:
```
Railway UI → Deployments → Active Deployment → View Logs
```

### База данных теряется

Создайте Volume (см. выше в разделе "База данных")

### Переменные не работают

Убедитесь что:
1. Переменные добавлены в Railway
2. После добавления переменных бот был перезапущен
3. Имена переменных точно совпадают

## ✅ Проверка работы

После деплоя проверьте:

```bash
# В логах Railway должны быть строки:
🤖 Starting Telegram Support Bot...
✅ Database connected (mock Prisma Client)
✅ Database connected
✅ Bot is running!
👥 Operators configured: 2
```

## 📱 Тестирование

1. **Как клиент:**
   - Найдите бота в Telegram
   - Отправьте `/start`
   - Напишите: "Привет, тестовое сообщение"

2. **Как оператор:**
   - Вы должны получить сообщение от бота
   - Нажмите "Ответить" на сообщение клиента
   - Напишите ответ

3. **Проверка:**
   - Клиент должен получить ваш ответ
   - Переписка работает!

## 🎯 Готово!

Теперь ваш бот работает 24/7 на Railway! 🚀

При любых проблемах проверяйте логи в Railway UI.
