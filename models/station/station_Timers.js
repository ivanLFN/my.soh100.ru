let Station = require('./station.js');
const config = require('../../config/config');
const mongoose = require('mongoose');


module.exports.addTimer = function (userId, timer, callback) {

    let stationNum = timer.stationNum;

    if (!stationNum)
        return callback({ status: false, msg: "Incorrect stationNum" });

    let isnum = /^\d+$/.test(stationNum);

    if (!isnum)
        return callback({ status: false, msg: "Incorrect stationNum" });

    Station.getStationByNumber(stationNum, (sta) => {

        if (!sta)
            return callback({ status: false, msg: "Ошибка добавления таймера станции" });
        let isOwn = false;
        for (let owner of sta.owners) {
            if (owner === userId) {
                isOwn = true;
                break;
            }
        }

        if (isOwn) {
            if (sta.timers.length < config.maxStationTimers) {




                var newTimerId = mongoose.Types.ObjectId();
                const newTimer = {
                    //       zoneOffset: 0,//minutes
                    timerValue: 0,//seconds
                    enabled: false,
                    hidden: false,
                    operation: "start",
                    userId: userId,
                    timerId: newTimerId
                }

                if (timer.zoneOffset)
                    newTimer.zoneOffset = timer.zoneOffset;
                else
                    newTimer.zoneOffset = 0;

                Station.updateOne({ _id: sta._id }, { $push: { timers: newTimer } }, (err, raw) => {
                    if (err) callback({ status: false, msg: "Internal Error" })
                    //if(raw)
                    console.log("AddTimer");
                    console.log(timer);
                    return callback({ status: true, msg: "Таймер добавлен", timerId: newTimerId });
                })
            }
            else
                return callback({ status: false, msg: "Можно добавить только " + config.maxStationTimers + " таймера станции" });
        }
        else
            return callback({ status: false, msg: "Ошибка прав доступа" });

    })
}


module.exports.removeTimer = function (userId, removedStationTimers, callback) {

    Station.getUserStations(userId, async (userStations) => {

        let results = [];

        for (let rmStaTim of removedStationTimers) {

            for (let usrSta of userStations) {
                if (usrSta.stationNum === rmStaTim.stationNum) {
                    for (let rmTimId of rmStaTim.timers) {
                        let result = await Station.updateOne({ stationNum: usrSta.stationNum }, { $pull: { timers: { _id: rmTimId, userId: userId } } });
                        console.log(result);
                        if (result.nModified)
                            results.push({ status: true, stationNum: usrSta.stationNum, timerId: rmTimId });
                        else
                            results.push({ status: false, stationNum: usrSta.stationNum, timerId: rmTimId });

                    }
                }
            }
        }
        console.log("RemoveTimerStations");
        console.log(results);
        return callback(results);
    })
}


module.exports.setTimers = function (userId, updatedStationTimers, callback) {
    Station.getUserStations(userId, async (userStations) => {

        let results = [];

        for (let upStaTim of updatedStationTimers) {

            for (let usrSta of userStations) {
                if (usrSta.stationNum === upStaTim.stationNum) {
                    for (let upTim of upStaTim.timers) {

                        const insertedTim = {
                            'timers.$.zoneOffset': upTim.zoneOffset,
                            'timers.$.timerValue': upTim.timerValue,
                            'timers.$.enabled': upTim.enabled,
                            //    'timers.$.hidden': upTim.hidden,
                            //    'timers.$.operation': upTim.operation,
                        }

                        if (upTim.operation && (upTim.operation === "start" || upTim.operation === "finish"))
                            insertedTim['timers.$.operation'] = upTim.operation;

                        if (typeof upTim.hidden === 'boolean')
                            insertedTim['timers.$.hidden'] = upTim.hidden;

                        let result = await Station.updateOne({ stationNum: usrSta.stationNum, timers: { $elemMatch: { _id: upTim.timerId, userId: userId } } }, { $set: insertedTim });
                        console.log(result);
                        if (result.nModified)
                            results.push({ status: true, stationNum: usrSta.stationNum, timerId: upTim.timerId });
                        else
                            results.push({ status: false, stationNum: usrSta.stationNum, timerId: upTim.timerId });

                    }
                }
            }
        }
        console.log("SetTimers ");
        console.log(results);

        return callback(results);
    })
}

module.exports.getTimers = function (userId, callback) {
    Station.getUserStations(userId, (userStations) => {

        let stationTimers = [];

        for (let usrSta of userStations) {

            for (let tim of usrSta.timers) {

                let t = {
                    zoneOffset: tim.zoneOffset,
                    timerValue: tim.timerValue,
                    enabled: tim.enabled,
                    hidden: tim.hidden,
                    operation: tim.operation,
                    timerId: tim._id,
                    stationNum: usrSta.stationNum
                };

                if ((tim.userId === userId)) {
                    t.own = true;
                }
                else {
                    t.own = false;
                }
                if (t.own || (!tim.hidden)) {
                    stationTimers.push(t);
                }
            }
        }
        return callback(stationTimers);
    })
}

module.exports.timerStationRoutine = function () {

    console.log("Timer task has started");

    let lastMinute = -1;

    setInterval(() => {

        Station.getStations((stations) => {

            let date = new Date();
            let hourNowUTC = date.getUTCHours();
            let minNowUTC = date.getUTCMinutes();

            if (lastMinute !== minNowUTC) {

                lastMinute = minNowUTC;
                try {

                    for (let sta of stations) {

                        for (let tim of sta.timers) {

                            let timeUTCseconds = tim.timerValue - tim.zoneOffset * 60;

                            if (timeUTCseconds < 0)
                                timeUTCseconds = 86400 + timeUTCseconds;

                            let timerHourUTC = parseInt(timeUTCseconds / 3600);

                            let timerMinUTC = parseInt((timeUTCseconds - timerHourUTC * 3600) / 60);

                            if ((hourNowUTC == timerHourUTC) && (minNowUTC == timerMinUTC) && (tim.enabled)) {
                                const controlParams = { stationNum: sta.stationNum, operation: tim.operation };
                                const userId = tim.userId;
                                Station.controlStation(controlParams, userId, (info) => {
                                    console.log("Timer trigger: sta " + sta.stationNum)
                                    console.log(info);
                                });

                            }
                        }
                    }

                }
                catch (e) {
                    console.log(e);
                }
            }
        })

    }, 1000 * 30);


}