/**
 * Этот файл описывает подключение к БД
 * URL-строка подключения к БД содержится в конфиге.
 * Этот модуль возвращает promise, в котором при удачном подключении вызывается метод resolve.
 * Что и отслеживается в модуле server.js
 */

const config = require('./config/config');
const mongoose = require('mongoose');// для работы с БД mongodb используется библиотека mongoose

module.exports = () => {
    return new Promise((resolve, reject) => {
        mongoose.Promise = global.Promise;
        mongoose.set('debug', config.mongoose_debug);

        mongoose.connection
            .on('error', error => reject(error))
            .on('close', () => console.log('Database connection closed.'))
            .once('open', () => resolve(mongoose.connection));
        mongoose.connect(config.MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true });
    })
}