const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const axios = require('axios');
const path = require('path');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Обслуживаем статические файлы

// Rate limiting
const submitLimiter = rateLimit({
    windowMs: 2 * 60 * 1000, // 2 минуты
    max: 3, // максимум 3 отправки формы
    message: { error: 'Слишком много попыток отправки' }
});

// Валидаторы
const discordIdValidator = body('discordId')
    .isLength({ min: 17, max: 20 })
    .isNumeric()
    .withMessage('Неверный формат Discord ID');

const nameStaticValidator = body('nameStatic')
    .matches(/^[A-Za-zА-Яа-яёЁ\s]+\s\|\s\d+$/)
    .withMessage('Неверный формат имени и статика');

const urlValidator = body(['tabletScreenshot', 'inventoryScreenshot'])
    .isURL()
    .withMessage('Неверный формат URL');

// Эндпоинт для получения IP
app.get('/api/get-ip', (req, res) => {
    const clientIP = req.ip || req.connection.remoteAddress || 
                    req.headers['x-forwarded-for'] || 'Не определен';
    const cleanIP = clientIP.replace(/^::ffff:/, '');
    
    res.json({ ip: cleanIP });
});

// Эндпоинт для проверки Discord
app.post('/api/verify-discord', discordIdValidator, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                valid: false, 
                exists: false, 
                message: errors.array()[0].msg 
            });
        }

        const { discordId } = req.body;
        
        // В реальном приложении здесь должен быть запрос к Discord API
        // Для демонстрации используем симуляцию
        const userExists = await simulateDiscordCheck(discordId);
        
        res.json({
            valid: true,
            exists: userExists,
            message: userExists ? 'Пользователь существует в Discord' : 'Пользователь не найден в Discord'
        });

    } catch (error) {
        console.error('Ошибка проверки Discord:', error);
        res.status(500).json({ 
            valid: false, 
            exists: false, 
            message: 'Ошибка сервера' 
        });
    }
});

// Эндпоинт для отправки формы
app.post('/api/submit-resignation', submitLimiter, [
    discordIdValidator,
    nameStaticValidator,
    body('rank').isNumeric().withMessage('Ранг должен быть числом'),
    body('department').isIn(['DEA', 'CID', 'IB', 'AF', 'NSB', 'HRT', 'FA', 'GS', 'HRB']),
    urlValidator,
    body('reason').isLength({ min: 1 }).withMessage('Причина обязательна')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false, 
                message: errors.array()[0].msg 
            });
        }

        const formData = req.body;

        // Логирование запроса
        console.log('📝 Новая заявка на увольнение:', {
            discordId: formData.discordId,
            name: formData.nameStatic,
            rank: formData.rank,
            department: formData.department,
            reason: formData.reason,
            userIP: formData.userIP,
            timestamp: new Date().toISOString()
        });

        // Здесь можно добавить отправку в Discord/Telegram
        // await sendToDiscord(formData);
        
        res.json({ 
            success: true, 
            message: 'Рапорт успешно отправлен! Ожидайте ответа в Discord.' 
        });

    } catch (error) {
        console.error('Ошибка обработки формы:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Внутренняя ошибка сервера' 
        });
    }
});

// Заглушка для проверки Discord
async function simulateDiscordCheck(discordId) {
    return new Promise(resolve => {
        setTimeout(() => {
            // В реальном приложении здесь должен быть запрос к Discord API
            resolve(true); // Всегда возвращаем true для демонстрации
        }, 500);
    });
}

// Функция для отправки в Discord (раскомментируйте когда добавите webhook URL)
async function sendToDiscord(data) {
    try {
        const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
        
        if (!DISCORD_WEBHOOK_URL) {
            console.warn('Discord webhook URL не настроен');
            return true;
        }

        const unixTimestamp = Math.floor(Date.now() / 1000);
        
        const discordMessage = {
            username: 'FIB Forms Bot',
            avatar_url: 'https://cdn-icons-png.flaticon.com/512/5968/5968524.png',
            content: `<@&1069528090679705622> | Время: <t:${unixTimestamp}:R>`,
            embeds: [{
                title: "📋 Рапорт на увольнение FIB",
                color: 65535,
                fields: [
                    { name: "Discord ID", value: `<@${data.discordId}>`, inline: true },
                    { name: "Имя Фамилия | Статик", value: data.nameStatic || "Не указано", inline: false },
                    { name: "Порядковый ранг", value: data.rank || "Не указано", inline: false },
                    { name: "Отдел", value: data.department || "Не указано", inline: true },
                    { name: "IP-адрес", value: `\`${data.userIP}\``, inline: true },
                    { name: "Скриншот планшета", value: data.tabletScreenshot || "Не указано", inline: false },
                    { name: "Скриншот инвентаря", value: data.inventoryScreenshot || "Не указано", inline: false },
                    { name: "Причина увольнения", value: data.reason || "Не указано", inline: false }
                ],
                footer: { text: "by k.i.t.i.k.o.t" },
                timestamp: new Date().toISOString()
            }]
        };

        const response = await axios.post(DISCORD_WEBHOOK_URL, discordMessage, {
            timeout: 10000
        });

        return response.status === 204;

    } catch (error) {
        console.error('Ошибка отправки в Discord:', error.message);
        return false;
    }
}

// Обслуживаем главную страницу
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📍 Форма доступна по адресу: http://localhost:${PORT}`);
});