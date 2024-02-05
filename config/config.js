let config =
{
    PORT: 3000, // порт для HTTP сервера
    PORT_SSL: 3443, // порт для HTTPS сервера
    // MONGO_URL: 'mongodb://user:Interguide.1@localhost:27018/soh', // URL-строка для подключения к БД на сервере
    MONGO_URL: 'mongodb://user:alexrimsDM24`@e-chargers.ru/evseDb', // Это удобно использовать для отладки на локальной машине,
                                                                      // но с данными на рабочем сервере
    secretSessionKey: "nNTQeWMlaSbz9UgN8dAszfDkKG-hcsDddGlS3Tz49q9gCwHDaNLpFWINCHM4nN72", // Приватный ключ, которым шифруются все http-сессии
    redisStore: { host: 'localhost', port: 6379 }, // Настройки хранилища Redis
    // tcpRoutine : {host: '45.132.17.140', port: 7070}, // Настройки TCP-обработчика на сервере. localhost почему-то 
    tcpRoutine : {host: 'localhost', port: 7070},       // не работает на хостинге. При выгрузке на сервер раскомм-ть 1 строку
                                                        // и закомм-ть вторую
    dev: true,                                          // не используется
    sendSmsEnabled: true,                               // если необходимо заблокировать отправку СМС-сообщений, выставить false
    stationControlTimeout: 10,                          // таймаут между запусками зарядных сессий в секундах
    smsStoreTime_sec: 180,                              // таймаут хранения/повторной отправки SMS-сообщения
    smsCodeLen: 5,                                      // кол-во цифр в SMS-сообщении
    regStationEnabled: true,                            // разрешить добавление новых станций
    maxStationTimers: 3,                                // макс. кол-во таймеров для станции
    timerStationEnabled: true,                          // разрешить запуск обрботчика таймера станций
    mongoose_debug: false,                              // работа с БД в режиме отладки
    sessionTimeoutDays: 90,                             // время хранения http-сессии
    api_key: "8fcc9cb4-b55d-49f5-a4a1-0246c5ee57f5",    // ключ доступа к api сайта
    TerminalKey: "1632468971798",//                     // ключ для взаимодействия с TinkoffPay
    TerminalPassword: "ys8yc04aumodfg5h"//              // пароль для взаимодействия с TinkoffPay
                                                        // подробнее на https://www.tinkoff.ru/kassa/dev/payments/ 
};
module.exports = config;

