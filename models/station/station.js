/**
 * Этот модуль реализует логику управления станциями, описывает модель хранения объектов станции в БД
 * Наиболее значимые функции:
 * controlStation - отвечает за начало и завершение зарядных сессий; В этой функции вызываются вспомогательные методы -
 * prepareStationForNewSession и resetLocalSession.
 * getStation - отдает сериализованные данные о станции. Сериализация выполняется в модуле station_Serializer.js
 * getStationsWithAccessCheck - возвращает станции с учетом свойства public
 */

const mongoose = require('mongoose');
const config = require('../../config/config');
const Schema = mongoose.Schema;
const InfrastructureConfig = require('../infrastructureConfig');
const ChargerSession = require('../chargerSession');
const redis = require("redis");
const user = require('../user');

const Serializer = require('./station_Serializer'); // Модуль сериализации данных. Не все данные нужно отдавать клиентам. Эти функции формируют
                                                    // ответ в зависимости от запроса

const redisOptions = { host: config.redisStore.host }
const client = redis.createClient(redisOptions);

let TcpRoutine = require('../../tcpRoutine');// Модуль реализует взаимодействие со станциями по TCP протоколу
const StationRequest = require('./station_StationRequest.js');// Модуль реализует взаимодействие со станциями по HTTP протоколу

const schema = new Schema({ // Модель хранения данных в БД в коллекции Stations
    _id: Object,    // id станции. По факту id микроконтроллера. Со стороны пользовательских запросов используется номер станции. Со стороны запросов станций - Id станции
    opCode: { type: Number, default: 0 },   // Команда для станции. Указание команды происходит через ручной ввод в БД.
    stationNum: { type: Number, default: 0 },  // Номер станции. Удобочитаемый способ определения станции. По факту счетчик
    signalRate: { type: Number, default: 0 },   // Уровень сигнала. 1-16 - плохой сигнал. 17-32 - хороший
    restarts: { type: Number, default: 0 },     // Количество загрузок станции. Инкрементируется при подаче питания
    temp: { type: Number, default: 0 },     // Температура на плате(улице). Некоторые станции не откалиброваны, показывают некорректную температуру
    outlets: [// Порты станции. Содержит массив объектов портов.
        {
            type: { type: Number, default: 0 }, // Тип порта. Классификация взята с сайта plugshare
            actualState: { type: Boolean, default: false }, // Текущее состояние порта. Если true - идет зарядная сессия.
                                                            // Если есть ошибки порта (физически обесточен), то флаг все равно может быть true
            voltage: { type: Number, default: 0 },  // Напряжение на выводах в Вольтах
            current: { type: Number, default: 0 },  // Выходной ток в Амперах
            pwr: { type: Number, default: 0 },  // Мощность на выходе порта в кВт
            cosFi: { type: Number, default: 0 },   // Косинус фи. Несмотря на название - это коэффицент мощности
            faults: { type: Number, default: 0 },   // Ошибки порта. В норме должно быть 0. Иначе возможно сработала защита по току или нажали кнопку сброса
            price: { type: Number, default: 0 },    // Цена за кВт*ч
            comission: { type: Number, default: 0 },    // Комиссия СГК

            session: {    // Хранит информацию о текущей зарядной сессии
                sessNum: { type: Number, default: 0 }, // Номер зарядной сессии
                cPwr: { type: Number, default: 0 }, // Кол-во потребленно энергии в кВт*ч
                estabState: { type: Boolean, default: false },  //Текущее установленное состояние. true - идет зарядная сессия. false - станция(порт) свободна
                saved: { type: Boolean, default: false },   // Сохранена ли текущая сессия в БД. Не используется
                chgDone: { type: Boolean, default: false },   // Завершена ли зарядная сессия. Этот флаг приходит от станции
                maxConsumedPower: { type: Number, default: 0 }, // Ограничение по потреблению. Не используется
                maxDuration: { type: Number, default: 0 },  // Максимальная продолжительность сессии в минутах
                fixedPrice: { type: Number, default: 0 },   // Цена за кВт*ч в копейках на момент начала сессии
                fixedComission: { type: Number, default: 0 },   // Комиссия на момент начало зарядной сессии
                startedAt: { type: Number, default: 0 },    //  Время старта сессии
                expectedFinishAt: { type: Number, default: 0 }, // Предполагаемое время завершения сессии
                userId: { type: String, default: 0 }    // ID пользователя, который запустил сессию
            }
        }
    ],

    owners: Array,  // id вадельцев станции
    hidden: { type: Boolean, default: true },   // Скрывать станцию на карте
    public: { type: Boolean, default: true },   // Станцию могут включать все пользователи
    simCardPhone: String,  // Номер телефона симкарты в станции
    description: String,    // Описание. Не используется
    address: String,    // Месторасположение станции
    location: Array,    // Координаты на карте 2ГИС
    urlImages: Array,   // Ссылка на картинку со станцией. Не используется

    timestamps: {   // Временные маркеры в формате Unix-time
        lastDevReq: Number, // Последнее обращение станции к сервису
        uptime: Number, // Время подключения к сервису во время запроса конфига. Конфиг запрашиватся во время появления питания на станции
        createdAt: Number   // Время создания станции. Первое подключение к сервису
    },
    config: Object, // Конфигурация станции

    systemDescription: {    
        codeVer: String,    // Версия кода
        boardVer: String,   // Версия платы
        IMEI: String        // ID GSM-модуля
        //protocolType: {type: String, default: "http"}
    },

    timers: [   // Таймеры станции
        {
            zoneOffset: Number,//minutes
            timerValue: Number,//seconds
            enabled: Boolean,
            hidden: Boolean,
            operation: String,
            userId: String,
            //     timerId: ObjectId
        }
    ],
    newFirmware: {  // Информация об обновлении ПО станции
        codeVer: { type: String, default: "" },
        startAddress: { type: String, default: "0x08002000" },
        size: { type: Number, default: 0 },
        path: { type: String, default: "" },
    }
})

schema.set('toJSON', {
    virtuals: true
});

const Station = module.exports = mongoose.model('Station', schema);

module.exports.controlStation = function (controlParams, userId, callback) {// Функция запуска/остановки зарядной сессии
    const stationNum = controlParams.stationNum;
    if (controlParams.port === undefined)
        controlParams.port = 0;

    let portNum = controlParams.port;
    if (portNum === undefined)
        portNum = 0;

    if (portNum < 0 || portNum >= 3)
        return callback({ success: false, currentEstabState: false, msg: 'Wrong port' });

    const operation = controlParams.operation;
    const expectedDuration = controlParams.expectedDuration;

    Station.findOne({ stationNum: stationNum }, (err, station) => {
        if (err) throw err;

        if (!station) return callback({ success: false, msg: 'Wrong station number' })

        if (!station.outlets[portNum]) return callback({ success: false, msg: 'Wrong port' });

        if (station.outlets[portNum].session.userId === "0") {
            if (operation === 'start') {

                client.get(userId, async function (err, reply) {
                    if (!reply) {
                        prepareStationForNewSession(station, portNum, userId, expectedDuration, (details) => {
                            if (details.status) {
                                client.set(userId, 'value', 'EX', config.stationControlTimeout, redis.print);
                                return callback({ success: true, startedAt: station.outlets[portNum].session.startedAt, expectedFinishAt: station.outlets[portNum].session.expectedFinishAt, currentEstabState: true, msg: 'Сессия создана' });
                            }
                            else {
                                return callback({ success: false, currentEstabState: false, msg: details.message });
                            }

                        });
                    }
                    else {
                        return callback({ success: false, currentEstabState: false, msg: 'Превышен лимит стартов. Повторите попытку через 3 минуты' });
                    }

                });
            }
            else if (operation === 'finish') {
                return callback({ success: false, currentEstabState: false, msg: 'Ошибка операции' })
            }
            else {
                return callback({ success: false, currentEstabState: false, msg: 'Wrong operation' })
            }
        }
        else {
            if (station.outlets[portNum].session.userId === userId) {
                if (operation === 'start') {
                    return callback({ success: false, currentEstabState: true, msg: 'Станция уже включена' })
                }
                else if (operation === 'finish') {

                    const sessNum = station.outlets[portNum].session.sessNum;
                    const cPwr = station.outlets[portNum].session.cPwr;

                    const sessionParams =
                    {
                        sessNum: sessNum,
                        cPwr: cPwr
                    }

                    ChargerSession.add(station, sessionParams, () => {

                        StationRequest.resetLocalSession(station, portNum, false, () => {
                            return callback({ success: true, currentEstabState: false, msg: 'Станция отключена' })
                        })
                    })
                }
            }
            else {
                return callback({ success: false, currentEstabState: true, busy: true, msg: 'Станция уже занята' })
            }
        }
    })
}


module.exports.controlStationSGK = function (controlParams, userId, callback) { // Аналогичная функция для управления, но для станций СГК

    const stationNum = controlParams.stationNum;

    if (controlParams.port === undefined)
        controlParams.port = 0;

    let portNum = controlParams.port;

    if (portNum === undefined)
        portNum = 0;

    if (portNum < 0 || portNum >= 3)
        return callback({ success: false, currentEstabState: false, msg: 'Wrong port' });

    const operation = controlParams.operation;
    const expectedDuration = controlParams.expectedDuration;

    Station.findOne({ stationNum: stationNum }, (err, station) => {
        if (err) throw err;

        if (!station) return callback({ success: false, msg: 'Wrong station number' })

        if (!station.outlets[portNum]) return callback({ success: false, msg: 'Wrong port' });

        const staUserId = station.outlets[portNum].session.userId;

        const staEstState = station.outlets[portNum].session.estabState;

        if (staUserId === "0" && staEstState === false) {
            if (operation === 'start') {

                client.get(userId, async function (err, reply) {
                    if (!reply) {
                        prepareStationForNewSession(station, portNum, userId, expectedDuration, (details) => {
                            if (details.status) {
                                client.set(userId, 'value', 'EX', config.stationControlTimeout, redis.print);
                                return callback({ success: true, startedAt: station.outlets[portNum].session.startedAt, expectedFinishAt: station.outlets[portNum].session.expectedFinishAt, currentEstabState: true, msg: 'Сессия создана' });
                            }
                            else {
                                return callback({ success: false, currentEstabState: false, msg: details.message });
                            }

                        });
                    }
                    else {
                        return callback({ success: false, currentEstabState: false, msg: 'Превышен лимит стартов. Повторите попытку через 3 минуты' });
                    }
                });
            }
            else if (operation === 'finish') {
                return callback({ success: false, currentEstabState: false, msg: 'Ошибка операции' })
            }
            else {
                return callback({ success: false, currentEstabState: false, msg: 'Wrong operation' })
            }
        }
        else {
            if (station.outlets[portNum].session.userId === userId || station.outlets[portNum].session.userId === '0') {
                if (operation === 'start') {
                    return callback({ success: false, currentEstabState: true, msg: 'Станция уже включена' })
                }
                else if (operation === 'finish') {

                    const sessNum = station.outlets[portNum].session.sessNum;
                    const cPwr = station.outlets[portNum].session.cPwr;

                    const sessionParams =
                    {
                        sessNum: sessNum,
                        cPwr: cPwr
                    }
                    ChargerSession.add(station, sessionParams, () => {

                        StationRequest.resetLocalSession(station, portNum, false, () => {
                            return callback({ success: true, currentEstabState: false, msg: 'Станция отключена' })
                        })
                    })
                }
            }
            else {
                return callback({ success: false, currentEstabState: true, busy: true, msg: 'Станция уже занята' })
            }
        }
    })
}
// Функция заполняет поля в БД в документе конкретной станции 
// в момент старта зарядной сессии
// Первый if нужен только для станции СГК, которую может запустить даже не авторизованный пользователь
function prepareStationForNewSession(station, portNum, userId, expectedDuration, callback) {
    if (userId == 0 && station.stationNum == 45) {                                          
        InfrastructureConfig.incChargerSessionCounter((sessNum) => {
            station.outlets[portNum].session.sessNum = sessNum;
            station.outlets[portNum].session.cPwr = 0;
            station.outlets[portNum].session.estabState = true;
            station.outlets[portNum].session.userId = '0';
            station.outlets[portNum].session.fixedPrice = 0;
            station.outlets[portNum].session.fixedComission = 0;

            station.outlets[portNum].session.startedAt = Date.now();

            if (expectedDuration && expectedDuration < 1200)
                station.outlets[portNum].session.expectedFinishAt = Date.now() + expectedDuration * 60 * 1000;
            else
                station.outlets[portNum].session.expectedFinishAt = 0;

            Station.updateOne({ _id: station._id }, station, (err, raw) => {
                if (err) throw err;

                TcpRoutine.notifyStation(station);
                return callback({ status: true });

            })
        })
    }
    else {
        user.getUserById(userId, (err, usr) => {
            if (err) throw err;

            InfrastructureConfig.getMinimalStartBalance((minimalStartBalance) => {
                if (!station.owners.includes(userId)) {
                    if (station.outlets[portNum].price !== 0)
                        if (usr.balance < minimalStartBalance)
                            return callback({ status: false, message: "Недостаточно средств" });
                }

                InfrastructureConfig.incChargerSessionCounter((sessNum) => {
                    station.outlets[portNum].session.sessNum = sessNum;
                    station.outlets[portNum].session.cPwr = 0;
                    station.outlets[portNum].session.estabState = true;
                    station.outlets[portNum].session.userId = userId;
                    if (!station.owners.includes(userId)) {
                        station.outlets[portNum].session.fixedPrice = station.outlets[portNum].price;
                        station.outlets[portNum].session.fixedComission = station.outlets[portNum].comission;
                    }
                    else {
                        station.outlets[portNum].session.fixedPrice = 0;
                        station.outlets[portNum].session.fixedComission = 0;
                    }

                    station.outlets[portNum].session.startedAt = Date.now();

                    if (expectedDuration && expectedDuration < 1200)
                        station.outlets[portNum].session.expectedFinishAt = Date.now() + expectedDuration * 60 * 1000;
                    else
                        station.outlets[portNum].session.expectedFinishAt = 0;

                    Station.updateOne({ _id: station._id }, station, (err, raw) => {
                        if (err) throw err;

                        TcpRoutine.notifyStation(station);
                        return callback({ status: true });

                    })
                })
            });


        })


    }
}


module.exports.getStationByNumber = function (num, callback) {  // Получение станции по номеру
    Station.findOne({ stationNum: num }, (err, station) => {
        if (err) throw err;
        if (!station) return callback(false);
        callback(station);
    })
}


module.exports.getStationsByNumber = function (nums, callback) {    // Не используется
    Station.find({ stationNum: nums }, (err, stations) => {
        if (err) throw err;
        if (!stations) return callback(false);
        callback(stations);
    })
}


module.exports.getStationByNumberWithAccessCheck = function (num, portNum, userId, callback) {  // Формирует список станций с учетом свойства public
    Station.findOne({ stationNum: num }, (err, station) => {
        if (err) throw err;
        if (!station) return callback(false);
        user.findOne({ _id: userId }, (err, user) => {
            let role = [];
            if (user) role = user.role;

            if (!station.public && (!role.includes("admin"))) {
                if (!station.owners.includes(userId)) {
                    callback(null);
                }
            }
            let sta = Serializer.serializeStationForUserRequest(station, portNum, userId, role);
            callback(sta);
        });
    })
}


module.exports.getStation = function (num, portNum, userId, callback) { // устаревшая функция getSgkStation
    Station.findOne({ stationNum: num }, (err, station) => {
        if (err) throw err;
        if (!station) return callback(false);
        if (userId != 0) {
            user.findOne({ _id: userId }, (err, user) => {
                let role = [];
                if (user) role = user.role;
                if (!station.public && (!role.includes("admin"))) {
                    if (!station.owners.includes(userId)) {
                        callback(null);
                    }
                }
                let sta = Serializer.serializeStationForUserRequest(station, portNum, userId, role);
                callback(sta);
            });
        }
        else {
            let sta = Serializer.serializeStationForUnknownUser(station, portNum, userId);
            callback(sta);
        }
    })
}

module.exports.getStationBillingInfo = function (num, user, callback) {
    Station.findOne({ stationNum: num }, (err, station) => {
        if (err) throw err;
        if (!station) return callback(false);
        if (station.owners.includes(user._id) || user.role[1] === "admin") {
            let stationBillingInfo = {};
            stationBillingInfo.priceRub = (station.outlets[0].price / 100) + '.' + (station.outlets[0].price % 100);
            stationBillingInfo.comission = station.outlets[0].comission;
            return callback(stationBillingInfo);
        }
        else {
            callback(false);
        }
    })
}

module.exports.updateBillingParams = function (params, usr, callback) {
    Station.findOne({ stationNum: params.stationNum }, (err, station) => {
        if (err) throw err;
        if (!station) return callback(false);
        if (usr.role[1] === "admin") {
            let update = {};
            update.outlets = [{}];
            update.outlets[0].price = params.price;
            update.outlets[0].comission = params.comission;

            Station.findOneAndUpdate({ stationNum: params.stationNum }, update, { new: true, useFindAndModify: false }, (err, station) => {

                if (err) throw err;
                return callback(true);
            })
        }
        else {
            callback(false);
        }
    })
}

//  Возвращает зарядные сессии пользователю с учётом его прав
module.exports.getSessionsStationWithOwnerCheck = function (params, usr, callback) {
    const stationNum = params.stationNum;
    Station.findOne({ stationNum: stationNum }, (err, station) => {
        if (err) throw err;
        if (!station) return callback(false);
        if (station.owners.includes(usr._id) || usr.role[1] === "admin") {
            ChargerSession.getStationSessions(station._id, params, async (stationSessions) => {
                for (let s of stationSessions) {

                    let usr = await user.findOne({ _id: s.userId });
                    s.userPhone = usr.phone;
                }
                return callback(stationSessions);
            })
        }
        else {
            callback(false);
        }
    })
}

// Возвращает данные станций с учётом прав пользователя
module.exports.getStationsWithAccessCheck = function (userId, callback) {
    Station.find({}, async (err, stationsDb) => {
        if (err) throw err;
        let stations = [];
        user.findOne({ _id: userId }, (err, user) => {
            let role = [];
            if (user) role = user.role;
            let i = 0;
            for (let s of stationsDb) {
                if (!s.public && (!role.includes("admin"))) {
                    if (!s.owners.includes(userId)) {
                        continue;
                    }
                }
                stations[i] = Serializer.serializeStationForUserRequest(s, 0, userId, role);
                i++;
            }
            callback(stations);
        });
    })
}


module.exports.getStationsForApiRequest = function (userId, callback) {
    Station.find({}, async (err, stationsDb) => {
        if (err) throw err;
        let stations = [];
        let i = 0;
        for (let s of stationsDb) {
            stations[i] = Serializer.serializeStationForAPIRequest(s, userId);
            i++;
        }
        callback(stations);
    })
}

module.exports.getStationForApiRequest = function (staNum, userId, callback) {
    Station.findOne({ stationNum: staNum }, async (err, sta) => {
        if (err) throw err;
        if (!sta)
            callback({});

        let station = Serializer.serializeStationForAPIRequest(sta, userId);
        callback(station);
    })
}

// Возвращает потребление энергии на станции за все время с учетом прав пользователя
module.exports.getConsumedPwrWithAccessCheck = function (userId, stationNum, callback) {
    user.findOne({ _id: userId }, (err, user) => {
        let role = [];
        if (user) role = user.role;

        if (role[1] === "admin") {
            Station.findOne({ stationNum: stationNum }, (err, sta) => {
                if (sta) {
                    const stationId = sta._id;
                    ChargerSession.find({ stationId: stationId }, (err, sessions) => {

                        if (!sessions) return callback(-1);
                        let cp = 0;

                        for (let session of sessions) {
                            cp = cp + session.consumedPower;
                        }
                        return callback(cp);
                    })
                }
                else
                    return callback(-1);
            })
        }
        else {
            return callback(-1);
        }
    });

}

// Возвращает потребление энергии на каждой станции за все время с учетом прав пользователя
module.exports.getConsumedPwrWithAccessCheckTotal = function (userId, callback) {
    user.findOne({ _id: userId }, (err, user) => {
        let role = [];
        if (user) role = user.role;
        if (role[1] === "admin") {
            Station.find({}, async (err, stations) => {
                if (stations.length) {
                    let consumedPower = [];
                    for (let sta of stations) {
                        const stationId = sta._id;
                        let sessions = await ChargerSession.find({ stationId: stationId });
                        let cp = 0;
                        for (let session of sessions) {
                            cp = cp + session.consumedPower;
                        }
                        cp = cp.toFixed(3);
                        consumedPower.push({ stationNum: sta.stationNum, cp: cp });
                    }
                    return callback(consumedPower);
                }
                else
                    return callback(-1);
            })
        }
        else {
            return callback(-1);
        }
    });
}

// Возвращает список станций, принадлежащих пользователю
module.exports.getUserStations = function (userId, callback) {
    Station.find({}, (err, stations) => {
        if (err) throw err;
        let userStations = [];
        user.findOne({ _id: userId }, (err, user) => {
            let role = [];
            if (user) role = user.role;
            for (let sta of stations) {
                for (let owner of sta.owners) {
                    if (owner === userId) {
                        userStations.push(Serializer.serializeStationForUserRequest(sta, 0, userId, role));
                    }
                }
            }
            callback(userStations);
        });
    })
}

// Возвращает список станций из БД без фильтрации данных
module.exports.getStations = function (callback) {
    Station.find({}, (err, stations) => {
        if (err) throw err;
        callback(stations);
    })
}

// Задание координат станции
module.exports.setLocation = function (params, callback) {
    const stationNum = params.stationNum;
    const hidden = params.hidden;
    const lat = params.lat;
    const lng = params.lng;
    const address = params.address;
    const description = params.description;
    if (stationNum !== undefined) {

        let update = {};

        if (hidden !== undefined)
            update.hidden = hidden;

        if (lat !== undefined && lng !== undefined) {
            update.location = [];
            update.location.push(lat);
            update.location.push(lng);
        }

        if (address !== undefined) {
            update.address = address;
        }

        if (description !== undefined) {
            update.description = description;
        }

        Station.findOneAndUpdate({ stationNum: stationNum }, update, { new: true, useFindAndModify: false }, (err, station) => {
            if (err) throw err;
            if (station)
                return callback({ success: true });
            else
                return callback({ success: false });

        })
    }
    else {
        return callback({ success: false });
    }
}

require('./station_StationRequest');
require('./station_Timers');