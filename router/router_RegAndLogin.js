/**
 * Модуль содержит маршруты для регистрации и авторизации пользователей.
 * В сигнатуре каждой функции содержится промежуточная функция checkNotAuthenticated или checkAuthenticated, служащая
 * для проверки авторизации пользователя на сайте.
 * Как правило для одного имени содержится GET и POST запрос.
 * GET запросы отдают отрендеренную страницу со скриптом. Скрипт в свою очередь после действий пользователя делает запрос
 * на этот же адрес, но с запросом POST.
 */

let router = require('./router.js');
const User = require('../models/user');
const smsCodeGen = require('../smsCodeGen');
const config = require('../config/config');
const requestInstance = require('request');
const passport = require('passport');
const redis = require("redis");
const client = router.client;

// Строка запроса к API сервиса по доставке СМС уведомлений
const urlSMSAeroAPI = 'https://harrier97@mail.ru:TbCmbskhjJQZrpCS46FgdWzwhdo@gate.smsaero.ru/v2/sms/send?';

router.get('/registration', checkNotAuthenticated, (req, res) => {
    res.render('registration.hbs')// Отправляем html страницу со скриптом
})

router.post('/registration', checkNotAuthenticated, (req, res) => {// вызывается в момент отправки формы
    let data = req.body;
    // Проверяем формат номера телефона
    let phone = (data.phone).replace(/[-+()\s]/g, '');  // Убираем лишнее
    if (phone.length != 11) {
        res.send({ codeSent: false, msg: "Wrong phone" });
        return;
    }
    if (phone[0] == '8') phone = phone.replace('8', '7'); // Стандартизируем все номера под +7...

    client.get(phone, async function (err, reply) {// Перед регистрацией пользователю отправляеся СМС с кодом подтверждения.
        if (reply) {                                //Отправка кода идет в маршруте /checkPhone. Код хранится в Redis. В качестве
            const cachedData = JSON.parse(reply)    //Ключа используется номер телефона. Если код был отправлен и не истек, то 
            if (cachedData.code === data.code) {    // попадаем сюда. Сравниваем, то что отправили в СМС и что прислал пользователь
                let newUser = new User({            
                    phone: phone,
                    password: data.password
                });
                User.checkUserExistByPhone(phone, (exist) => { // Проверяем, существует ли уже пользователь с таким номером через
                    if (!exist) {                               // функцию в модуле User (user.js)
                        User.addUser(newUser, (success, msg) => {// Если польз-ль новый - добавляем
                            client.del(phone);                   // Удаляем запись в Redis
                            req.login(newUser, function (err) {  // Заодно авторизуем пользователя, чтобы ему заново не вводить логин-пароль  
                                if (err) {
                                    console.log(err);
                                }

                                let url = '/';                   // url для возврата на главную.
                                if (req.signedCookies.reqStationNum) { // Если пользователь перешел на стра-цу рег-ции со страницы станции,
                                    url = `/station?num=${req.signedCookies.reqStationNum}`;// то редиректим его на эту страницу станции
                                }
                                return res.send({ success: success, msg: msg, url: url })// Даем ответ ajax запросу скрипту
                            });

                        })
                    }
                    else {
                        res.send({ success: false, refresh: true, msg: 'Пользователь с таким номером телефона уже существует' })
                    }
                });
            }
            else {
                res.send({ success: false, refresh: false, msg: 'Неверный код подтверждения.' });
            }
        }
        else {
            res.send({ success: false, refresh: true, msg: 'Превышено время ожидания. Повторите регистрацию.' });
        }
    })
})

// Проверка принадлежности номера телефона, отправка СМС с кодом подтверждения
router.post('/checkPhone', checkNotAuthenticated, (req, res) => {
    let data = req.body;
    // Проверка формата номера
    let phone = (data.phone).replace(/[-+()\s]/g, '');

    if (phone.length != 11) {
        res.send({ codeSent: false, msg: "Wrong phone" });
        return;
    }
    if (phone[0] == '8') phone = phone.replace('8', '7');

    // Проверяем, есть ли такой пользователь
    User.checkUserExistByPhone(phone, (exist) => {
        if (!exist) {
            client.get(phone, async function (err, reply) { // Проверяем, отправляли ли СМС
                if (!reply) {

                    const code = await smsCodeGen.generateCode(config.smsCodeLen); // Генерируем код
                    const codeExpires = Date.now() + config.smsStoreTime_sec * 1000;
                    const checkPhoneStructure = { code: code, expire: codeExpires }; // 
                    //console.log(code);
                    //Сохраняем код в Redis с таймаутом
                    client.set(phone, JSON.stringify(checkPhoneStructure), 'EX', config.smsStoreTime_sec, redis.print);

                    if (config.sendSmsEnabled) {// Если режим отладки выключен, то отправляем СМС
                        const url = `${urlSMSAeroAPI}number=${phone}&text=${code}&sign=SMS Aero`;// Формируем строку запроса
                        requestInstance(url, { json: true }, (err, response, bodyResponse) => {// Делаем запрос к сервису рассылок СМС
                            if (err) { return console.log(err); }
                            const success = bodyResponse.success;
                            if (success) {// Если сервис отправил СМС на номер, то уведомляем пользователя об отправке
                                res.send({ codeSent: true, expire: codeExpires });
                            }
                        });
                    }
                    else
                        res.send({ codeSent: true, expire: codeExpires });// В режиме отладки как будто отправили СМС
                }
                else {
                    const storedPhoneStructure = JSON.parse(reply);
                    res.send({ codeSent: false, expire: storedPhoneStructure.expire, msg: 'Код подтверждения уже отправлен' });
                }
            });
        }
        else
            res.send({ codeSent: false, msg: 'Пользователь с таким номером телефона уже существует' });
    })
})

// Отдает страницу для сброса пароля
router.get('/resetPassword', checkNotAuthenticated, function (req, res) {
    res.render('resetPassword.hbs')
})

// Вызывается при нажатии на кнопку "Восстановить пароль"
router.post('/resetPassword', checkNotAuthenticated, function (req, res) {
    let data = req.body;
    // Проверяем формат телефона
    let phone = (data.phone).replace(/[-+()\s]/g, '');
    if (phone.length != 11) {
        res.send({ codeSent: false, msg: "Wrong phone" });
        return;
    }
    if (phone[0] == '8') phone = phone.replace('8', '7');


    client.get(phone, async function (err, reply) {
        if (reply) {
            const cachedData = JSON.parse(reply)
            if (cachedData.code === data.code) { // Сравниваем коды в СМС и от пользователя
                const password = data.password
                User.checkUserExistByPhone(phone, (exist) => { // На всякий случай проверяем, существует ли польз-ль с таким ном. тел.
                    if (exist) {
                        User.resetPassword(phone, password, (success, msg) => { // Сбрасываем пароль через функция user.js
                            client.del(phone);  // отчищаем запись в Redis
                            let url = '/login'; // редиректим на страницу входа
                            return res.send({ success: success, msg: msg, url: url })

                        })
                    }
                    else {
                        res.send({ success: false, refresh: true, msg: 'Пользователь с таким номером телефона не существует' })
                    }
                });
            }
            else {
                res.send({ success: false, refresh: false, msg: 'Неверный код подтверждения.' });
            }
        }
        else {
            res.send({ success: false, refresh: true, msg: 'Превышено время ожидания. Повторите регистрацию.' });
        }
    })
})

// Отправка СМС для подтверждения телефона при сбросе пароля
// Вызывается при нажатии на кнопке "Отправить код подтверждения"
// Практичеси тоже самое, что /checkPhone
router.post('/checkPhoneResetPass', checkNotAuthenticated, (req, res) => {
    let data = req.body;
    let phone = (data.phone).replace(/[-+()\s]/g, '');

    if (phone.length != 11) {
        res.send({ codeSent: false, msg: "Wrong phone" });
        return;
    }
    if (phone[0] == '8') phone = phone.replace('8', '7');
    User.checkUserExistByPhone(phone, (exist) => {
        if (exist) {
            client.get(phone, async function (err, reply) {
                if (!reply) {

                    const code = await smsCodeGen.generateCode(config.smsCodeLen);
                    const codeExpires = Date.now() + config.smsStoreTime_sec * 1000;
                    const checkPhoneStructure = { code: code, expire: codeExpires };
                    console.log(code);
                    client.set(phone, JSON.stringify(checkPhoneStructure), 'EX', config.smsStoreTime_sec, redis.print);

                    if (config.sendSmsEnabled) {
                        const url = `${urlSMSAeroAPI}number=${phone}&text=${code}&sign=SMS Aero`;
                        requestInstance(url, { json: true }, (err, response, bodyResponse) => {
                            if (err) { return console.log(err); }
                            const success = bodyResponse.success;
                            if (success) {
                                res.send({ codeSent: true, expire: codeExpires });
                            }
                        });
                    }
                    else
                        res.send({ codeSent: true, expire: codeExpires });
                }
                else {
                    const storedPhoneStructure = JSON.parse(reply);
                    res.send({ codeSent: false, expire: storedPhoneStructure.expire, msg: 'Код подтверждения уже отправлен' });
                }
            });
        }
        else
            res.send({ codeSent: false, msg: 'Пользователь с таким номером телефона не существует' });
    })
})

// Страница авторизации на сайт
router.get('/login', checkNotAuthenticated, function (req, res) {
    res.render('login.hbs')
});

// Данные с формы авторизации попадают через этот маршрут
router.post('/login', checkNotAuthenticated, (req, res, next) => {
    passport.authenticate('local', function (err, user) {
        if (err) {
            return next(err);
        }
        if (!user) {
            return res.send({ success: false, msg: 'Неверный логин или пароль' });
        }
        req.logIn(user, function (err) {
            if (err) {
                return next(err);
            }
            let url = '/';
            if (req.signedCookies.reqStationNum) {
                url = `/station?num=${req.signedCookies.reqStationNum}`;
            }
            return res.send({ success: true, url: url });
        });
    })(req, res, next);
});

router.post('/logout', checkAuthenticated, function (req, res) {
    if (req.session) {
        req.session.destroy(() => {
            res.send({ success: true })
        });
    } else {
        res.send({ success: true })
    }
})

function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next()
    }
    res.redirect('/login')
}

function checkNotAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return res.redirect('/')
    }
    next()
}