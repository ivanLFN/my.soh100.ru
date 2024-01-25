/**
 * Модуль описывает функции для учёта зарядных сессий
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const User = require('./user');


const schema = new Schema({
    sessNum: Number,
    stationId: String,
    userId: String,
    consumedPower: Number,
    totalCost: Number,
    comissionCost: Number, // в процентах
    fixedPrice: Number, // стоимость в копейках
    fixedComission: Number,
    startedAt: Number,
    endedAt: Number
})

const ChargerSession = module.exports = mongoose.model('ChargerSession', schema);

module.exports.add = function (station, sessionParams, callback) {
    ChargerSession.exists({ sessNum: sessionParams.sessNum }, (err, exist) => {
        if (!exist) {
            if (sessionParams.cPwr !== 0 && station.outlets[0].session.userId != '0') {
                let newSession = new ChargerSession();
                newSession.sessNum = sessionParams.sessNum;
                newSession.stationId = station._id;
                newSession.userId = station.outlets[0].session.userId;
                newSession.consumedPower = sessionParams.cPwr;
                newSession.startedAt = station.outlets[0].session.startedAt;

                newSession.fixedPrice = station.outlets[0].session.fixedPrice;
                if (newSession.fixedPrice === undefined) newSession.fixedPrice = 0;
                newSession.fixedComission = station.outlets[0].session.fixedComission;
                if (newSession.fixedComission === undefined) newSession.fixedComission = 0;

                newSession.totalCost = (Math.floor(newSession.consumedPower * newSession.fixedPrice));
                newSession.comissionCost = Math.floor((newSession.totalCost * newSession.fixedComission) / 100);

                newSession.endedAt = Date.now();
                newSession.save();
                console.log(`chargerSession ${sessionParams.sessNum} added`);

                if (!station.owners.includes(station.outlets[0].session.userId))
                    User.withdrawFromBalance(newSession.userId, newSession.totalCost);

            }
            callback();
        }
    })

}


module.exports.updateParams = function (sessionParams, callback) {// Это функция заглушка, не используется
    //const query = sessionParams.sessNum;
    //ChargerSession.findOne(query,(err,session)=>{
    //    if(err) throw err;
    //})
    console.log('chargerSession updated')
    callback();
}

module.exports.getSessions = function (userId, callback) {// Получение истории сессий для пользователя
    ChargerSession.find({ userId: userId }, (err, sessions) => {
        if (err) throw err;
        return callback(sessions);
    })
}

module.exports.getAllSessions = function (callback) {

    ChargerSession.find((err, sessions) => {
        if (err) throw err;
        return callback(sessions);
    })
}

module.exports.getStationSessions = function (stationId, params, callback) {// Получение сессий станции в опред-м пром-ке времени
    ChargerSession.find({ stationId: stationId, startedAt: { $gte: params.startDate, $lte: params.finishDate } }, (err, sessions) => {
        if (err) throw err;

        let stationSessions = [];

        for (let i = 0; i < sessions.length; i++) {

            let startedAt = sessions[i].startedAt;
            let endedAt = sessions[i].endedAt;
            let consumedPower = sessions[i].consumedPower;
            let fixedComission = sessions[i].fixedComission;
            let fixedPrice = sessions[i].fixedPrice;
            let comissionCost = sessions[i].comissionCost;
            let totalCost = sessions[i].totalCost;
            let userId = sessions[i].userId;

            stationSessions[i] = {
                startedAt: startedAt, endedAt: endedAt,
                consumedPower: consumedPower, fixedComission: fixedComission, fixedPrice: fixedPrice,
                comissionCost: comissionCost, totalCost: totalCost, userId: userId
            }
        }


        return callback(stationSessions);
    })

}

module.exports.getUserSessions = function (userPhone, callback) {// Получение сессий пользователя. Фактически дублирует getSessions

    let Station = require('./station/station');
    userPhone = userPhone.replace('+', '');
    User.findOne({ phone: userPhone }, (err, user) => {

        if(err) throw err;

        if(!user)
            return callback([]);

        ChargerSession.find({ userId: user._id }).limit(20).sort('-sessNum').exec( async (err, sessions) => {
            if (err) throw err;

            let userSessions = [];

            for (let i = 0; i < sessions.length; i++) {

                let startedAt = sessions[i].startedAt;
                let endedAt = sessions[i].endedAt;
                let consumedPower = sessions[i].consumedPower;
                //let fixedComission = sessions[i].fixedComission;
                //let fixedPrice = sessions[i].fixedPrice;
                //let comissionCost = sessions[i].comissionCost;
                let totalCost = sessions[i].totalCost;
                //let userId = sessions[i].userId;
                
                let sta = await Station.findOne({_id: sessions[i].stationId});
                let stationNum = sta.stationNum;
                let date = new Date(startedAt);
                let dateStr = date.getDate() + '.' + (date.getMonth() + 1);

                userSessions[i] = {
                    date: dateStr, endedAt: endedAt,
                    consumedPower: consumedPower, totalCost: totalCost/100, stationNum: stationNum
                }
            }
            return callback(userSessions);
        })

    })
}