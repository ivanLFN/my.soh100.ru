/*
    Стартовый модуль приложения
    Практически в любом .js файле можно встретить "const config = require('./config/config');" - 
    это получение настроек сервера
*/

const server = require('./app');
const database = require('./database'); // подключение к БД непосредсвенно в момент объявления
const config = require('./config/config');
let StationTimer = require('./models/station/station_Timers.js');
require('./tcpRoutine'); // запуск обработчика взаимодействий со станциями по протоколу TCP

database().then(info => { // результат подключения к БД
    console.log(`Connected to ${info.host}:${info.port}/${info.name}`);
    server.serverHttp.listen({ port: config.PORT, exclusive: false }, () => {// Если БД работает, то запускаем сервер. Настройки
        console.log(`A server has started on port ${config.PORT}`);          // express, handlebars, passport, session были в app.js
        if (config.timerStationEnabled)// Старт таймера станций              // Этот экзепляр для незащищенного HTTP протокола работает
            StationTimer.timerStationRoutine();                              // на 3000 порту
    })


    server.serverHttpSSL.listen({ port: config.PORT_SSL, exclusive: false }, () => { // HTTPS версия сервера, работает на 3443 порту
        console.log(`A server has started on port ${config.PORT_SSL}`);              // Экземпляр аналогичен серверу на 3000 порту
    })
})
    .catch(() => {
        console.error('Unabel to connect to database');
    })

// Далее обрабатываются входящие запросы в router.js и tcpRoutine.js