/**
 * Этот модуль содержит маршруты для доступа к функциям сайта по API
 */

let router = require('./router.js');
const config = require('../config/config');
let Station = require('../models/station/station.js');
const User = require('../models/user');
const chargerSession = require('../models/chargerSession');

/* Для регистрации необходимо, чтобы в теле запрос был API-ключ и номер телефона для регистрации
{
    "api_key" : "8fcc9cb4-b55d-49f5-a4a1-0246c5ee57f5",
    "phone" : "+71234567890"
}
*/
router.post('/api/registration', (req, res) => {
    let data = req.body;

    if (data.api_key) { // Проверяем API ключ
        if (data.api_key !== config.api_key)
            return res.sendStatus(401);
    }
    else
        return res.sendStatus(401);


    if (data.phone === undefined)  //  Проверяем наличие поля номера телефона
        return res.sendStatus(400);

    let phone = (data.phone).replace(/[-+()\s]/g, '');// Проверяем формат номера телефона
    if (phone.length != 11) {                         // Для этого оставляем только цифры и проверяем длину номера
        res.send({ codeSent: false, msg: "Wrong phone" });
        return;
    }
    if (phone[0] == '8') phone = phone.replace('8', '7'); // Приводим к стандартному виду, чтобы все номера начинались с "7", без плюса

    let newUser = new User({ phone: phone, password: data.password }); // Формируем объект для запроса в модель User
    User.checkUserExistByPhone(phone, (exist) => { // Проверяем, есть ли уже такой пользователь
        if (!exist) {
            User.addUser(newUser, (success, msg) => { // Если новый пользователь, то добавляем в БД и отвечаем клиенту
                return res.send({ success: success, msg: msg, url: '/' }); // !!! здесь необходимо сделать более адекватный ответ клиенту
            })
        }
        else {
            res.send({ success: false, refresh: true, msg: 'Пользователь с таким номером телефона уже существует' })
        }
    });

})

// Сброс пароля пользователя через API. Хорошо бы добавить проверку на минимальную длину пароля
/*
{
    "api_key" : "8fcc9cb4-b55d-49f5-a4a1-0246c5ee57f5",
    "phone" : "+71234567890",
    "password" : "123456"
}
*/
router.post('/api/resetPassword', function (req, res) {
    let data = req.body;

    if (data.api_key) {
        if (data.api_key !== config.api_key)
            return res.sendStatus(401);
    }
    else {
        return res.sendStatus(401);
    }

    if (data.phone === undefined || data.password === undefined)  //  Проверяем наличие поля номера телефона и пароля
        return res.sendStatus(400);

    let phone = (data.phone).replace(/[-+()\s]/g, '');
    if (phone.length != 11) {
        res.send({ codeSent: false, msg: "Wrong phone" });
        return;
    }
    if (phone[0] == '8') phone = phone.replace('8', '7');

    const password = data.password
    User.checkUserExistByPhone(phone, (exist) => {
        if (exist) {
            User.resetPassword(phone, password, (success, msg) => { // Сбрасываем пароль через функцию модели User
                let url = '/login';
                return res.send({ success: success, msg: msg, url: url })
            })
        }
        else {
            res.send({ success: false, refresh: true, msg: 'Пользователь с таким номером телефона не существует' })// Для API вполне допустим такой ответ
        }
    });
})

// Получение списка всех станций или конкретной станции по её номеру
/**Пример:
 * localhost:3000/api/stations?api_key=8fcc9cb4-b55d-49f5-a4a1-0246c5ee57f5&userPhone=+71234567890&num=1
 * userPhone и num - опционально
 */
router.get('/api/stations', function (req, res) {
    const apiKeyReq = req.query.api_key;
    let userPhone = req.query.userPhone;

    if (apiKeyReq) {
        if (apiKeyReq !== config.api_key)
            return res.sendStatus(401);
    }
    else
        return res.sendStatus(401);

    if (!userPhone) userPhone = ""; // Если номера тел. нет в запросе - оставляем пустым, но не undefined (иначе запрос к БД не сработает)

    // Номер телефона нужен для определения, какие станции и портыы включил пользователь. В ответе будет содержаться поле "userIsMatch"
    // для каждого порта станции. С помощью него на клиенте можно определить, этот ли пользователь запустил сессию.
    // Если номер не указан, то поле по умолчанию true. Что не совсем корректно. Предполагается, что клиент не будет обращать на
    // него внимание при таком запросе
    User.getUserByPhone(userPhone, (err, user) => {

        let userId;
        if (user) userId = user.id;
        else userId = 0;

        const stationNum = req.query.num; // Если номер станции не задан, отдаём список всех станций
        if (stationNum && stationNum !== 'undefinded') {
            Station.getStationForApiRequest(stationNum, userId, (station) => {
                return res.send(station);
            })
        }
        else {
            Station.getStationsForApiRequest(userId, (stations) => {
                return res.send(stations);
            })
        }
    })
});

// Получение списка зарядных сессий для конкретного пользователя по номеру телефона
router.get('/api/history', function (req, res) {

    let api_key = req.query.api_key;
    let phone = req.query.phone;

    if (api_key) {
        if (api_key !== config.api_key)
            return res.sendStatus(401);
    }
    else {
        return res.sendStatus(401);
    }

    if (!phone)
        return res.sendStatus(400);

    User.getUserByPhone(phone, (err, user) => {

        const userId = user.id;
        chargerSession.getSessions(userId, sessions => {

            // Формируем массив с зарядными сессиями пользователя. Время начала, завершения, кол-во кВт*ч
            // Время указано в Unix-time
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
})

// Управление станцией по API
/**
{
    "api_key" : "8fcc9cb4-b55d-49f5-a4a1-0246c5ee57f5",
    "phone" : "+71234567890",
    "portId" : 0,
    "operation" : "start"
}
    portId - номер порта. Для запроса нумерация начинается с 1
 */
router.post("/api/stationControl", function (req, res) {
    const controlParams = req.body;

    let data = req.body;
    if (data.api_key) {
        if (data.api_key !== config.api_key)
            return res.sendStatus(401);
    }
    else return res.sendStatus(401);

    if (!data.phone)
        return res.sendStatus(400);

    if (!data.portId)
        return res.sendStatus(400);

    const userPhone = data.phone;
    User.getUserByPhone(userPhone, (err, user) => {
        let userId;
        if (user == undefined)
            return res.send({ success: false, msg: "Пользователь не найден" })//userId = 0;
        else
            userId = user.id;

        /** Начало подпорки */
        // Из-за договоренности с разработчиком сервиса OCPP пришлось поменять порты 2 и 3 местами.
        // Это работает только для контроллеров CSC1.
        if (controlParams.portId == 3)
            return res.send("Wrong port"); // теперь только порты 1 и 2 
        if (controlParams.portId == 2)// смена 1(2) и 2(3) портов местами
            controlParams.portId = 3;
        // Поскольку нумерация портов для клиентов начинается с 1, а в БД с 0, приходится отнимать единицу 
        controlParams.port = controlParams.portId - 1;// указываем индекс как в БД
        /** Конец подпорки */

        Station.controlStation(controlParams, userId, (answer) => { // Остальная логика прописана в stations.js
            return res.send(answer);
        })

    })

});

// Получение списка пользователей
router.get('/api/getUsers', function (req, res) {
    let data = req.body;
    if (data.api_key) {
        if (data.api_key !== config.api_key)
            return res.sendStatus(401);
    }
    else return res.sendStatus(401);

    User.getUsers((err, users) => {
        res.send(users);
    })
})

// Установка координат станции. Минимальный вариант без проверки полей
router.post('/api/setStationLocation', function (req, res) {
    let data = req.body;
    if (data.api_key) {
        if (data.api_key !== config.api_key)
            return res.sendStatus(401);
    }
    else return res.sendStatus(401);
    Station.setLocation(data, (info) => {
        return res.send(info);
    })
})
