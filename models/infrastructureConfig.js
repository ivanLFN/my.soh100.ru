/**
 * Модуль описывает настройки сервиса, функции для работы со счётчиками зарядных сессий, станций, платежей
 */
const mongoose = require('mongoose');
const config = require('../config/config');
const Schema = mongoose.Schema;

const schema = new Schema({
    stationNumCounter: Number,// Количество станций, счетчик станций
    chargerSessionCounter: Number,// Счётчик зарядных сессий
    paymentValue: { type: Array, default: [30000, 50000, 100000, 250000, 500000] },// Тарифы для пополнения  баланса в копейках
    paymentOrderId: { type: Number, default: 167352 },// ID платежа. Работает как счётчик
    minimalStartBalance: { type: Number, require: true, default: 0 } // Минимальный баланс для запуска зарядной сессии в копейках
})

const InfrastructureConfig = module.exports = mongoose.model('InfrastructureConfig', schema);

module.exports.getChargerSessionCounter = function () {// Возвращает текущее значение счетчика зарядных сессий
    return new Promise((resolve, reject) => {
        try {
            // let config = await InfrastructureConfig.find(config);
            if (!config) {
                let newConf = new InfrastructureConfig();
                newConf.stationNumCounter = 0;
                newConf.chargerSessionCounter = 0;
                newConf.save();
                resolve(0);
            }
        } catch (e) {
            reject(e);
        }
    })
}



module.exports.incChargerStationCounter = function (callback) {// Инкремент счётчика зарядных станций
    InfrastructureConfig.findOne(async (err, config) => {
        if (err) throw err;
        config.stationNumCounter++;
        await InfrastructureConfig.updateOne({ _id: config._id }, config);
        callback(config.stationNumCounter);
    })
}

module.exports.incChargerSessionCounter = function (callback) {// Инкремент счётчика зарядных сессий
    InfrastructureConfig.findOne(async (err, config) => {
        if (err) throw err;
        config.chargerSessionCounter++;
        await InfrastructureConfig.updateOne({ _id: config._id }, config);
        callback(config.chargerSessionCounter);
    })
}


module.exports.getMinimumPaymentValue = function (callback) {// Возвращает значения возможных тарифов для пополнения
    InfrastructureConfig.findOne((err, config) => {
        if (err) throw err;
        return callback(config.paymentValue);
    })
}

module.exports.incPaymentOrderId = function (callback) {// Инкремент счётчика платежей
    InfrastructureConfig.findOne(async (err, config) => {
        if (err) throw err;
        let update = ++config.paymentOrderId;
        await InfrastructureConfig.updateOne({ _id: config._id }, { paymentOrderId: update });
        return callback(update);
    })
}

module.exports.getMinimalStartBalance = async function (callback) {// Возвращает минимальный баланс для запуска зарядной сессии
    InfrastructureConfig.findOne({}, (err, config) => {
        if (err) throw err;
        return callback(config.minimalStartBalance);
    });
}