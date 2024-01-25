/**
 * Модуль содержит функции для добавления истории платежей в БД, а также некоторые функции эквайринга
 * Подробнее на https://www.tinkoff.ru/kassa/dev/payments/ 
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const tokenGen = require('../tokenGen');

const paymentSchema = new Schema({
    OrderId: {
        type: String,
        required: true
    },
    PaymentId: {
        type: String,
        required: false
    },
    Amount: {
        type: Number,
        required: true
    },
    userId: {
        type: String,
        required: true
    },
    userPhone: {
        type: String,
        required: true
    },
    Status: {
        type: String,
        required: false
    },
    timeStamps: {
        createdAt: { type: Number, required: true, default: 0 },
        authorizedAt: { type: Number, required: true, default: 0 },
        confirmedAt: { type: Number, required: true, default: 0 },
        updatedAt: { type: Number, required: true, default: 0 }
    },
    balanceBeforeCrediting: Number,
    TerminalKey: String,
    ErrorCode: String,
    PaymentURL: String
})

paymentSchema.set('toJSON', {
    virtuals: true
});

const Payment = module.exports = mongoose.model('Payments', paymentSchema);

module.exports.add = function (paymentParams, callback) {// добавление в БД информацию о платеже

    let newPayment = new Payment;
    newPayment.OrderId = paymentParams.OrderId;
    newPayment.PaymentId = paymentParams.PaymentId;
    newPayment.Amount = paymentParams.Amount;
    newPayment.userId = paymentParams.userId;

    newPayment.userPhone = paymentParams.userPhone;
    newPayment.userPhone.replace('+','');

    newPayment.Status = "Initiated";
    newPayment.timeStamps.createdAt = Date.now();
    newPayment.timeStamps.updatedAt = Date.now();
    newPayment.balanceBeforeCrediting = paymentParams.balanceBeforeCrediting;

    newPayment.TerminalKey = paymentParams.TerminalKey;
    newPayment.ErrorCode = paymentParams.ErrorCode;
    newPayment.PaymentURL = paymentParams.PaymentURL;

    newPayment.save((err) => {
        if (err) throw err;
        return callback(true);
    })

};

module.exports.getPaymentList = function (callback) {
    Payment.find({ Status: "CONFIRMED" }).limit(50).sort('-OrderId').exec((err, payments) => {
        let list = [];
        for (let p of payments) {

            let date = new Date(p.timeStamps.confirmedAt);

            let dateStr = date.getDate() + '.' + (date.getMonth() + 1);

            let timeHours = date.getHours();
            if (timeHours < 10)
                timeHours = "0" + timeHours;
            let timeMinuts = date.getMinutes();
            if (timeMinuts < 10)
                timeMinuts = "0" + timeMinuts;

            let timeStr = timeHours + ":" + timeMinuts;

            list.push({ userPhone: p.userPhone.replace('+',''), Amount: p.Amount / 100, date: dateStr, time: timeStr });
        }
        return callback(list);
    });
}

// Банк уведомляет о статусе платежа. Обработчки маршрута вызывает
// эту функцию и актуализирует статус платежа, сохраненного в БД.
// Логика подготовки к платежу реализована в user.js в функии pay
module.exports.notifi = function (notificationParams, callback) {

    const User = require('./user');
    let operationStatus = false;
    if (!notificationParams) return callback({ status: operationStatus });

    // Для подтверждения подлинности уведомления используется механизм токенов
    // Токены вычисляются на основе полей платежа, а также terminalPassword и TerminalKey
    // Проверяем, что уведомление валидно
    let generatedToken = tokenGen.generateNotificationToken(notificationParams);
    if (generatedToken !== notificationParams.Token) {
        return callback({ status: false });
    }

    // Находим платеж в БД и меняем его статус. Обновление записываем в БД
    Payment.findOne({ PaymentId: notificationParams.PaymentId }, (err, payment) => {
        if (err) throw err;

        if (payment) {
            let update = { timeStamps: {} };

            if (payment.Amount !== notificationParams.Amount)
                return callback({ status: operationStatus });

            let timeStamps = payment.timeStamps;
            update.timeStamps = timeStamps;

            switch (notificationParams.Status) {

                case "AUTHORIZED":
                    update.timeStamps.authorizedAt = Date.now();
                    update.Status = notificationParams.Status;
                    operationStatus = true;
                    break;
                case "CONFIRMED":
                    if (payment.Status !== "CONFIRMED") {
                        if (User.addBalance(payment.userId, notificationParams.Amount)) {
                            update.timeStamps.confirmedAt = Date.now();
                            update.Status = notificationParams.Status;
                            operationStatus = true;
                        }
                    }
                    break;
                default:
                    break;
            }
            update.timeStamps.updatedAt = Date.now();
            update.ErrorCode = notificationParams.ErrorCode;

            Payment.updateOne({ _id: payment._id }, update, (err, raw) => {
                if (err) throw err;
                return callback({ status: operationStatus });
            })
        }
        else {
            return callback({ status: false });
        }

    })
}