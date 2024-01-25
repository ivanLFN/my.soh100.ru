/**
 * Маршруты для работы с таймерами станций
 */

let router = require('./router.js');
let StationTimers = require('../models/station/station_Timers.js');

router.get('/getTimers', checkAuthenticated, function (req, res) {
    let userId = req.user.id;
    StationTimers.getTimers(userId, (stationtimersTimers) => {
        res.send(stationtimersTimers);
    })
})

// Редактирование таймеров
router.post('/setTimers', checkAuthenticated, function (req, res) {
    let data = req.body;
    const userId = req.user.id;
    console.log(data);
    StationTimers.setTimers(userId, data, (info) => {
        res.send(info);
    });
})

router.post('/addTimer', checkAuthenticated, function (req, res) {
    let userId = req.user.id;
    let timer = req.body;
    StationTimers.addTimer(userId, timer, (info) => {
        res.send(info);
    })
})

router.post('/removeTimers', checkAuthenticated, function (req, res) {
    let userId = req.user.id;
    let stationtimersTimers = req.body;
    StationTimers.removeTimer(userId, stationtimersTimers, (info) => {
        res.send(info);
    })
})
// Промежуточная функция проверки аутентификации пользователя
function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next()
    }
    res.redirect('/login')
}
