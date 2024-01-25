const config = require('../../config/config');
const InfrastructureConfig = require('../infrastructureConfig');
const ChargerSession = require('../chargerSession');
const stationDefaultConfigs = require('../../stationDefaultConfigs');
const StationRequest = require('./station_StationRequest.js');
let TcpRoutine = require('../../tcpRoutine');


// Добавление станции в БД. Вызывается при первом после сборки подключении станции к сервису
function add(params, callback) {    

    let Station = require('./station.js');

    const codeVer = params.codeVer;
    const boardVer = params.boardVer;
    const _id = params._id;

    if ((codeVer == undefined || boardVer == undefined || _id == undefined))
        return null;

    if (config.regStationEnabled) {
        InfrastructureConfig.incChargerStationCounter((index) => {

            let station = new Station();
            station._id = _id;
            station.stationNum = index;

            station.restarts = params.restN;
            station.systemDescription.codeVer = params.codeVer;
            station.systemDescription.boardVer = params.boardVer;
            station.timestamps.createdAt = Date.now();
            station.timestamps.updatedAt = Date.now();

            station.description = " ";
            station.urlImages[0] = 'img/defaultPicture.png';

            station.outlets[0] = {};
            station.outlets[0].price = 0;
            station.outlets[0].type = 10;

            station.config = stationDefaultConfigs.defaultConfig_A1_1;
            station.config.p0 = index;

            station.save();
            return callback(station);

        })
    }
}

// Возвращает конфигурацию станции при загрузке
module.exports.getStationConfig = function (params, callback) {

    let Station = require('./station.js');

    let query = { _id: params._id };
    Station.findOne(query, (err, stationDb) => {
        if (err) return console.error(err);
        if (stationDb == null) {

            add(params, (newStation) => {
                if (!newStation) return callback(null);
                const config = newStation.config;
                return callback(config);
            })
        }
        else {
            const config = stationDb.config;
            callback(config);
            let update = { opCode: 0, restarts: params.restN, config: config, systemDescription: {} };
            if (params.codeVer)
                update.systemDescription.codeVer = params.codeVer;

            if (params.boardVer)
                update.systemDescription.boardVer = params.boardVer;

            if (params.IMEI)
                update.systemDescription.IMEI = params.IMEI;

            update.config.crc = params.crc;
            Station.updateOne({ _id: stationDb._id }, update, (err, raw) => {
                return;
            });
        }
    });
}

// Функиця-обработчик. Вызывается при рабочем запросе. Принимает данные от станции, обновляет документ в БД,
// в зависимости от текущего состояния сервиса выдает ответ станции.
// Для многопортовых станций реализация грубая
module.exports.processStation = function (paramsFromStation, callback) {

    let Station = require('./station.js');

    let query = { _id: paramsFromStation._id };
    Station.findOne(query, (err, stationDb) => {// Находим документ в БД по ID станции
        if (err) return console.error(err);
        if (stationDb == null) return callback(null);

        updateParamsStation(paramsFromStation, stationDb, async () => {// Обновляем документ по данным, что пришли от станции
            processOutlet(stationDb, 0, paramsFromStation, (controlParams) => {

                let answer = { outlets: [] };
                answer.outlets.push(controlParams);
                if (stationDb.outlets[2]) {

                    processOutlet(stationDb, 2, paramsFromStation, (controlParams) => {
                        answer.outlets.push({ // заглушка для второго "1" порта
                            opCode: 0,
                            estSt: false, sessSaved: false,
                            sessNum: 0,
                            maxConsPwr: 60.0, maxDur: 6000
                        });
                        answer.outlets.push(controlParams);
                        return callback(answer);

                    })

                }
                else {
                    return callback(answer);
                }
            });
        });
    });
}

// Обработчик машины-состояний порта
function processOutlet(stationDb, outletNum, paramsFromStation, callback) {
    const currentSession = stationDb.outlets[outletNum].session.sessNum;
    if (currentSession != 0) {
        if (currentSession == paramsFromStation.outlets[outletNum].sessNum) {

            if (paramsFromStation.outlets[outletNum].chgDone) {    // если сессия завершилась от станции

                const sessNum = paramsFromStation.outlets[outletNum].sessNum;
                const cPwr = paramsFromStation.outlets[outletNum].cPwr;
                const sessionParams =
                {
                    sessNum: sessNum,
                    cPwr: cPwr
                }
                ChargerSession.add(stationDb, sessionParams, () => {

                    StationRequest.resetLocalSession(stationDb, outletNum, true, () => {

                        const controlParams = {

                            opCode: stationDb.opCode,
                            estSt: false, sessSaved: true,
                            sessNum: paramsFromStation.outlets[outletNum].sessNum,
                            maxConsPwr: 60.0, maxDur: 6000

                        }
                        return callback(controlParams);

                    })
                })
            }
            else {
                const controlParams = {

                    opCode: stationDb.opCode,
                    estSt: true, sessSaved: false,
                    sessNum: paramsFromStation.outlets[outletNum].sessNum,
                    maxConsPwr: 60.0, maxDur: 6000

                }
                return callback(controlParams);
            }
        }
        else {
            if (paramsFromStation.outlets[outletNum].sessNum != 0) {

                const sessionParams =
                {
                    sessNum: paramsFromStation.outlets[outletNum].sessNum,
                    cPwr: paramsFromStation.outlets[outletNum].cPwr
                }

                ChargerSession.updateParams(sessionParams, () => {
                    const controlParams = {

                        opCode: stationDb.opCode,
                        estSt: false, sessSaved: true,
                        sessNum: paramsFromStation.outlets[outletNum].sessNum,
                        maxConsPwr: 0, maxDur: 0

                    }
                    return callback(controlParams);
                })
            }
            else {
                const controlParams = {

                    opCode: stationDb.opCode,
                    estSt: true, sessSaved: false,
                    sessNum: stationDb.outlets[outletNum].session.sessNum,
                    maxConsPwr: 60.0, maxDur: 6000

                }
                return callback(controlParams);
            }
        }
    }
    else {
        if (paramsFromStation.outlets[outletNum].sessNum != 0) {
            const sessionParams =
            {
                sessNum: paramsFromStation.outlets[outletNum].sessNum,
                cPwr: paramsFromStation.outlets[outletNum].cPwr
            }
            ChargerSession.updateParams(sessionParams, () => {
                const controlParams = {

                    opCode: stationDb.opCode,
                    estSt: false, sessSaved: true,
                    sessNum: paramsFromStation.outlets[outletNum].sessNum,
                    maxConsPwr: 0, maxDur: 0

                }
                return callback(controlParams);
                //return controlParams;

            })
        }
        else {
            const controlParams = { opCode: stationDb.opCode, estSt: false, sessSaved: false, sessNum: 0, maxConsPwr: 0, maxDur: 0 }
            return callback(controlParams);
        }

    }

}

// Вспомогательная функция для обновления данных в документе станции при запросе от нее
function updateParamsStation(paramsFromStation, station, callback) {


    let Station = require('./station.js');

    const signalRate = paramsFromStation.sigRate;
    const temp = paramsFromStation.tmp;

    const voltage_0 = paramsFromStation.outlets[0].vol;
    const current_0 = paramsFromStation.outlets[0].cur;
    const pwr_0 = paramsFromStation.outlets[0].pwr;
    const cPwr_0 = paramsFromStation.outlets[0].cPwr;
    const actualState_0 = paramsFromStation.outlets[0].state;
    const faults_0 = paramsFromStation.outlets[0].faults;
    const cosFi_0 = paramsFromStation.outlets[0].cosFi;

    let update = station;

    update.outlets[0].voltage = voltage_0;
    update.outlets[0].current = current_0;
    update.outlets[0].actualState = actualState_0;
    update.outlets[0].pwr = pwr_0;
    update.outlets[0].session.cPwr = cPwr_0;
    update.outlets[0].cosFi = cosFi_0;
    update.outlets[0].faults = faults_0;

    if (paramsFromStation.outlets[1]) {
        const voltage_1 = paramsFromStation.outlets[1].vol;
        const current_1 = paramsFromStation.outlets[1].cur;
        const pwr_1 = paramsFromStation.outlets[1].pwr;
        const cPwr_1 = paramsFromStation.outlets[1].cPwr;
        const actualState_1 = paramsFromStation.outlets[1].state;
        const faults_1 = paramsFromStation.outlets[1].faults;
        const cosFi_1 = paramsFromStation.outlets[1].cosFi;

        update.outlets[1].voltage = voltage_1;
        update.outlets[1].current = current_1;
        update.outlets[1].actualState = actualState_1;
        update.outlets[1].pwr = pwr_1;
        update.outlets[1].session.cPwr = cPwr_1;
        update.outlets[1].cosFi = cosFi_1;
        update.outlets[1].faults = faults_1;
    }

    if (paramsFromStation.outlets[2]) {
        const voltage_2 = paramsFromStation.outlets[2].vol;
        const current_2 = paramsFromStation.outlets[2].cur;
        const pwr_2 = paramsFromStation.outlets[2].pwr;
        const cPwr_2 = paramsFromStation.outlets[2].cPwr;
        const actualState_2 = paramsFromStation.outlets[2].state;
        const faults_2 = paramsFromStation.outlets[2].faults;
        const cosFi_2 = paramsFromStation.outlets[2].cosFi;

        update.outlets[2].voltage = voltage_2;
        update.outlets[2].current = current_2;
        update.outlets[2].actualState = actualState_2;
        update.outlets[2].pwr = pwr_2;
        update.outlets[2].session.cPwr = cPwr_2;
        update.outlets[2].cosFi = cosFi_2;
        update.outlets[2].faults = faults_2;
    }
    update.signalRate = signalRate;
    update.temp = temp;

    update.timestamps.lastDevReq = Date.now();
    Station.findOneAndUpdate({ _id: station._id }, update, { new: true, useFindAndModify: false }, (err, station) => {
        if (err) throw err;
        return callback();

    })
}
// Обнуляет раздел сессии в документе станции. Вызывается при завершении зарядной сессии
module.exports.resetLocalSession = function resetLocalSession(station, portNum, resetByStation, callback) {
    let Station = require('./station.js');
    let update = station;
    update.outlets[portNum].session.sessNum = 0;
    update.outlets[portNum].session.cPwr = 0;
    update.outlets[portNum].session.userId = 0;
    update.outlets[portNum].session.fixedPrice = 0;
    update.outlets[portNum].session.fixedComission = 0;
    update.outlets[portNum].session.estabState = false;
    station.outlets[portNum].session.expectedFinishAt = 0;

    Station.findOneAndUpdate({ _id: station._id }, update, { new: true, useFindAndModify: false }, (err, station) => {
        if (err) throw err;

        if (!resetByStation) {
            // notify station
            TcpRoutine.notifyStation(station);
        }
        return callback();
    });
}

// Возвращает сведения об обновлении
module.exports.getNewFirmwareInfo = function (_staId, callback) {
    let Station = require('./station.js');
    Station.findOne({ _id: _staId }, (err, sta) => {
        if (err) throw err;
        let newFirmwareInfo = sta.newFirmware;
        return callback(newFirmwareInfo);
    })
}