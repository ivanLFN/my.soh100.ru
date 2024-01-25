/**
 * Модуль содержит маршруты администрирования и просмотра статистики
 */

let router = require('./router.js');
let Station = require('../models/station/station.js');
const User = require('../models/user');
const Payment = require('../models/payment');
const chargerSession = require('../models/chargerSession');

// Список платежей
router.get('/paymentList', checkAuthenticated, function (req, res) {
    let user = req.user;
    if (user.role) {
        if (user.role[1] !== "admin") {
            res.redirect('/map')
        }
    }
    Payment.getPaymentList((list) => {
        res.render('paymentList.hbs', { paymentList: list });
    });
});

// Список всех зарядных сессий
router.get('/sessions', checkAuthenticated, function (req, res) {
    res.render('sessions.hbs');
});

router.post('/sessions', checkAuthenticated, function (req, res) {
    User.getUsers((err, users) => {
        Station.getStations((stations) => {
            chargerSession.getAllSessions(sessions => {

                let table = [];
                let i = sessions.length - 100;
                if (i < 0)
                    i = 0;

                for (i; i < sessions.length; i++) {

                    let startedAt = sessions[i].startedAt;
                    let endedAt = sessions[i].endedAt;
                    let consumedPower = sessions[i].consumedPower;
                    let _userId = sessions[i].userId;
                    let _staId = sessions[i].stationId;

                    let usr = users.find(user => user.id === _userId);

                    if (!usr)
                        continue;

                    let sta = stations.find(sta => sta.id === _staId);

                    table.push({ startedAt: startedAt, endedAt: endedAt, consumedPower: consumedPower, phone: usr.phone, stationNum: sta.stationNum });
                }
                res.send(table);
            })
        })
    })
})

// Простая страница просмотра суммарного заряда конкретной станции.
// Лучше использовать stationBilling
router.get('/consumedPwr', function (req, res) {
    const stationNum = req.query.num;
    if (!stationNum || stationNum === 'undefined')
        return res.sendStatus(404);
    if (!req.isAuthenticated())
        return res.redirect('/login');
    else {
        Station.getConsumedPwrWithAccessCheck(req.user.id, stationNum, (cPwr) => {
            return res.send(cPwr + " кВт*ч");
        })
    }
});

// Суммарное потребление по каждой станции
router.get('/totalConsumedPwr', function (req, res) {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    }
    else {
        Station.getConsumedPwrWithAccessCheckTotal(req.user.id, (data) => {
            return res.render('consumedPower.hbs', { data: data });
        })
    }
});

// Просмотр мест, где пользователи хотят поставить зарядные станции
router.get('/preferredLocation', checkAuthenticated, function (req, res) {
    res.render('preferredLocation.hbs');
})

router.post('/prefferedLocation', checkAuthenticated, function (req, res) {
    User.getPrefferedLocation((locations) => {
        res.send(locations);
    })
})

// Потребление конкретной станции во временном интервале с показом зарядных сессий
router.get('/stationBilling', checkAuthenticated, (req, res) => {
    const stationNum = req.query.num;
    if (!stationNum || stationNum === 'undefined') {
        return res.redirect('/map');
    }
    Station.getStationBillingInfo(stationNum, req.user, (stationBillingInfo) => {
        if (!stationBillingInfo)
            return res.redirect('/map');
        return res.render('billingInfo.hbs', { info: stationBillingInfo });
    })
})

// Получение списка зарядных сессий станции
router.post('/stationSessions', checkAuthenticated, (req, res) => {
    const params = req.body;
    const user = req.user;
    Station.getSessionsStationWithOwnerCheck(params, user, (stationSessions) => {
        return res.send(stationSessions);
    })
})

// Страница управления стоимостью кВт*ч и просмотр состояния станции
router.get('/billingControl', checkAuthenticated, (req, res) => {
    const user = req.user;
    if (user.role[1] === "admin") {
        return res.render('billingControl.hbs');
    }
    else
        return res.redirect('/map');
})

// Вызывается при нажатии на кнопку "обновить" на странице billingControl
router.post('/updateBillingParams', checkAuthenticated, (req, res) => {
    const params = req.body;
    const usr = req.user;
    Station.updateBillingParams(params, usr, (status) => {
        return res.send(status);
    })
})

// Список зарядных сессий конкретного пользователя
router.get('/userSessions', checkAuthenticated, function (req, res) {
    let user = req.user;
    if (user.role) {
        if (user.role[1] !== "admin") {
            return res.redirect('/map')
        }
    }
    const userPhone = req.query.userPhone;
    if (!userPhone || userPhone === 'undefined') {
        return res.redirect('/map');
    }
    chargerSession.getUserSessions(userPhone, (list) => {
        return res.render('userSessions.hbs', { userSessions: list });
    });
});

function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next()
    }
    res.redirect('/login')
}