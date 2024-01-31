const express = require('express');
const router = express.Router();
// В моделях описаны структуры объектов и функционал для работы с ними
let Station = require('../models/station/station.js');
const User = require('../models/user');
const Payment = require('../models/payment');
const InfrastructureConfig = require('../models/infrastructureConfig');
const chargerSession = require('../models/chargerSession');

const path = require('path');
//
const redis = require("redis");

const config = require('../config/config');

const redisOptions = { host: config.redisStore.host }
const client = redis.createClient(redisOptions);

module.exports = router;
module.exports.client = client;

// Маршрут для обслуживания manifest.json
router.get('/manifest.json', (req, res) => {
    const manifestPath = path.join(process.cwd(), 'manifest.json');
    res.sendFile(manifestPath);
});

// Маршрут главной страницы
router.get('/', function (req, res) {
    res.render('home.hbs')
});

// Маршрут перехода на карту
router.get('/map', function (req, res) {
    res.render('map.hbs')
})

// Маршрут на страницу предпочтительного расположения станции от пользователя
router.get('/addStation', checkAuthenticated, function (req, res) {
    res.render('addStation.hbs')
})

// Вызывается при нажатии на кнопку "добавить предпочтительное расположение"
router.post('/addPreferredLocation', checkAuthenticated, function (req, res) {
    const location = req.body;
    if (!location)
        res.sendStatus(400);

    let userId = req.user.id;
    User.addPrefferedLocation(userId, location, () => {
        res.send({ success: true });
    })
})

// Получение списка станций или определенной станций
// Вывод в формате json
// Здесь есть замысловатый момент. Некоторые станции на карте должны быть видны только их владельцам.
// Если в свойстве станции указано hidden = true, то станция не отображается на карте, даже если она частная
// Если hidden = false, но при этом putlic = false, то станция видная на карте только тем пользователям, которые прописаны в
// свойстве owners.
// Поскольку в момент отображения на карте вызывается маршрут /stations с получением данных обо всех станций
// (то есть без указания конкретного номера станции), то в этот момент приходится анализировать, какие станции принадлежат пользователю,
// который сделал запрос.
// Поэтому в первом случае используется метод getStation, а во втором getStationsWithAccessCheck
router.get('/stations', function (req, res) {

    let userId;

    if (req.user == undefined)
        userId = 0;
    else
        userId = req.user.id;

    const stationNum = req.query.num; 
    if (stationNum && stationNum !== 'undefinded') { // если в запросе указан номер станции,
        let portNum = req.query.port;                // то отправляем данные только по ней
        if (portNum === 'undefinded')
            portNum = 0;

        
        if (portNum < 0 || portNum >= 3) {  // ограничение на индекс порта
            return res.redirect('/map');
        }

        // Это подпорка для того чтобы работала станция на ТЭЦ-2
        if(portNum === '1')
            portNum = 0;

        Station.getStation(stationNum, portNum, userId, (station) => {
            if (station) return res.send(station);
            else return res.redirect('/map');
        })
    }
    else {
        Station.getStationsWithAccessCheck(userId, (stations) => {
            return res.send(stations);
        })
    }
});

// По этому маршруту получают html страницу, на которой можно запустить зарядную сессию
// По-хорошему здесь должна быть промежуточная функция аутентификации. Но из-за того что
// на страницу станции СГК может заходить любой желающий, аутентификацию пришлось перенести ниже
router.get('/station', function (req, res) {
    console.log(req);
    let stationNum = req.query.num;
    if (!stationNum || stationNum === 'undefined') {// В запросе должен быть номер станции
        return res.redirect('/map');
    }
    // Отдельный сценарий для СГК станции. Здесь специфичная логика проверки, она нужна только для этой станции
    if (stationNum === "sgk") {
        stationNum = 45;
        let portNum = req.query.port;
        if (portNum === 'undefinded' || (portNum !== '1' && portNum !== '2'))
            portNum = '1';

        let userId;

        if (req.user === undefined) {
            userId = '0';
        }
        else {
            userId = req.user.id;
        }

        if (portNum == '1')
            portNum = '0';

        Station.getSgkStation(stationNum, portNum, userId, (station) => {
            if (!station)
                return res.redirect('/map');

            station.port = portNum;
            return res.render('sgkStation.hbs', { charger: station });
        })
    }
    // Для всех остальных станций работает эта ветка
    else {
        // Проверяем авторизацию пользователя
        if (!req.isAuthenticated()) {
            res.cookie('reqStationNum', stationNum, { signed: true, maxAge: 1000 * 60 * 3, httpOnly: true });
            return res.redirect('/login');
        }
        else {

            let portNum = req.query.port;  // Если номер порта не указан, то присваиваем по умолчанию - 0
            if (portNum === 'undefinded') 
                portNum = 0;

            if (portNum < 0 || portNum >= 3) { // Если порт указан, проверяем корректность номера
                return res.redirect('/map');
            }
            // Получаем данные о станции с учетом прав пользователя
            Station.getStationByNumberWithAccessCheck(stationNum, portNum, req.user.id, (station) => {
                if (!station)
                    return res.redirect('/map');
                station.voltage = Math.floor(station.voltage); // Для рендера страницы необходимо подготовить данные в корректном виде
                let balance = req.user.balance;
                let balanceRub = Math.trunc(balance / 100);
                let balanceKop_R = Math.abs(balance % 10);
                let balanceKop_L = Math.abs(Math.trunc(balance / 10) % 10);
                let balanceStr = `${balanceRub}.${balanceKop_L}${balanceKop_R}`;
                station.balance = balanceStr; 
                return res.render('location.hbs', { charger: station }); // Рендерим страницу и отправляем ее клиенту
            })
        }
    }
});

// Отдает пользователю страницу с его зарядными сессиями
// Для корректно отображения времени, непосредсвенно заполнение происходит на клиентской стороне
// Здесь отдается пустая страница с js скриптом, который сделает post запрос
router.get('/history', checkAuthenticated, function (req, res) {
    res.render('history.hbs');
});

// Получение зарядных сессий пользователя. Этот маршрут вызывается скриптом на странице, которую отдали в GET запросе
router.post('/history', checkAuthenticated, function (req, res) {
    const userId = req.user.id;
    chargerSession.getSessions(userId, sessions => {
        let table = [];
        for (let i = 0; i < sessions.length; i++) {
            let startedAt = sessions[i].startedAt;
            let endedAt = sessions[i].endedAt;
            let consumedPower = sessions[i].consumedPower;
            table[i] = { startedAt: startedAt, endedAt: endedAt, consumedPower: consumedPower }
        }
        res.send(table);
    })
})

// Страница оплаты
router.get('/payment', checkAuthenticated, function (req, res) {
    InfrastructureConfig.getMinimumPaymentValue((paymentValues) => {
        for (let i = 0; i < paymentValues.length; i++) {
            paymentValues[i] = paymentValues[i] / 100;
        }
        res.render('payment.hbs', { paymentValues: paymentValues });
    })
});

// Вызывается при нажатии кнопки "Оплатить"
router.post('/pay', checkAuthenticated, function (req, res) {
    let data = req.body;
    let user = req.user;
    User.pay(data.summ, user, (answer) => {
        res.send(answer);
    })
});

// Этот маршрут вызывается эквайрингом банка. Сигнализирует о статусе платежа
router.post('/paymentNotification', /*checkAuthenticated,*/ function (req, res) {
    let params = req.body;
    Payment.notifi(params, (ans) => {// Логика прописана в payment.js
        //console.log(req.body);
        if (ans.status) {
            res.status = 200;
            res.send("OK");
        }
        else {
            res.sendStatus(400);
        }
    });

});

// Возвращает станции, которые принадлежат пользователю
router.get('/myStations', checkAuthenticated, function (req, res) {
    let userId = req.user.id;
    Station.getUserStations(userId, (userStations) => {
        res.send(userStations);
    })
})

// Страница профиля
router.get('/profile', checkAuthenticated, async (req, res) => {
    let user = req.user;
    let params = { sesionButtonVisible: false };
    let balance = await User.getBalance(user._id);
    let balanceRub = Math.trunc(balance / 100);
    let balanceKop_R = Math.abs(balance % 10);
    let balanceKop_L = Math.abs(Math.trunc(balance / 10) % 10);
    let balanceStr = `${balanceRub}.${balanceKop_L}${balanceKop_R}`;
    params.balance = balanceStr;
    if (user.role) {
        if (user.role[1] === "admin") {
            params.sesionButtonVisible = true;
        }
    }
    res.render('profile.hbs', params);
})

// Вызывается при нажатии кнопки "Начать зарядку" и "Остановить зарядку"
router.post("/stationControl", checkAuthenticated, function (req, res) {
    const controlParams = req.body;
    let userId;
    if (req.user == undefined)
        userId = 0;
    else
        userId = req.user.id;
    Station.controlStation(controlParams, userId, (answer) => {
        return res.send(answer);
    })
});

// Аналогичный маршрут для станции СГК, но с дополнительной логикой
router.post("/stationControlSGK", function (req, res) {
    const controlParams = req.body;
    let userId;
    if (req.user == undefined)
        userId = 0;
    else
        userId = req.user.id;

    Station.controlStationSGK(controlParams, userId, (answer) => {
        return res.send(answer);
    })
});

function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next()
    }
    res.redirect('/login')
}

// Маршруты, обеспечивающие дополнительный функционал. Отдают html страницы и запускают функции на сервере
require('./router_Admin.js'); // Маршруты для получения страниц администрирования и мониторинга
require('./router_RegAndLogin.js'); // Маршруты, обеспечивающие регистрацию, вход, сброс пароля
require('./router_StationRequest.js'); // По этим маршрутам обращаются станции, которые работают по http
require('./router_API.js'); // Предоставляет интерфейс для сторонних сервисов
require('./router_Timers.js');  // Настройка таймеров станций
