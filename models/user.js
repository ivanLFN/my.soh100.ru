/**
 * Модуль описывает модель хранения данных пользователя и функции для работы с объектами
 * 
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const bcrypt = require('bcryptjs');
const config = require('../config/config');
const tokenGen = require('../tokenGen');
const requestInstance = require('request');
const InfrastructureConfig = require('./infrastructureConfig');
const Payment = require('./payment');

const schema = new Schema({
    //_id: Object,
    name: {
        type: String
    },
    userType: {
        type: String,
        required: false
    },
    phone: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: false
    },
    password: {
        type: String,
        required: true
    },
    timestamps: {
        createdAt: { type: Number, required: true },
        updatedAt: { type: Number, required: true }
    },
    role: {
        type: Array,
        required: true
    },
    balance: {
        type: Number, Number,
        required: true,
        default: 0
    },
    ownedStations: {
        type: Number, Array,
        required: false
    },
    favoritStations: {
        type: Number, Array,
        required: false
    },
    preferredLocation: Array
})

schema.set('toJSON', {
    virtuals: true
});

const User = module.exports = mongoose.model('User', schema);

module.exports.comparePass = function (passFromUser, userDBPass, callback) {
    bcrypt.compare(passFromUser, userDBPass, (err, isMatch) => {
        if (err) throw err;
        callback(null, isMatch);
    })
}

module.exports.getUserByPhone = function (phone, callback) {

    phone = phone.replace(/[-+()\s]/g, '');
    if (phone[0] == '8') phone = phone.replace('8', '7');

    const query = { phone: phone };
    User.findOne(query, callback)
}

module.exports.getUserById = function (id, callback) {
    const filter = { _id: id };
    User.findOne(filter, (callback))
}

module.exports.getUsers = function (callback) {
    User.find(callback)
}

module.exports.checkUserExistByPhone = function (phone, callback) {

    const query = { phone: phone };
    User.exists(query, (err, exist) => {
        if (err) throw err;
        callback(exist);
    })
}

// Добавляет точку на карте, где пользователь желает
// усановить станцию
module.exports.addPrefferedLocation = function (id, location, callback) {
    const query = { _id: id };
    const loc = [location.lat, location.lng];
    User.updateOne(query, { preferredLocation: loc }, (err, raw) => {
        if (err) throw err;
        callback(true);
    })
}


module.exports.getPrefferedLocation = function (callback) {

    User.find((err, users) => {
        if (err) throw err;

        let locations = [];

        let i = 0;
        for (let u of users) {

            if (!u.preferredLocation[0])
                continue;

            const latLng = [u.preferredLocation[0], u.preferredLocation[1]];
            locations[i] = { phone: u.phone, latLng };
            i++;
        }
        callback(locations);
    })
}

module.exports.addUser = function (newUser, callback) {

    const query = { phone: newUser.phone };

    User.exists(query, (err, exist) => {
        if (err) throw err;

        if (!exist) {
            bcrypt.genSalt(10, function (err, salt) {
                bcrypt.hash(newUser.password, salt, function (err, hash) {
                    if (err)
                        throw err;
                    newUser.password = hash;

                    newUser.timestamps.createdAt = Date.now();
                    newUser.timestamps.updatedAt = newUser.timestamps.createdAt;
                    newUser.role = 'user';
                    newUser.balance = 0;
                    newUser.save(err => {
                        if (err) callback(false, 'Internal Error')
                        callback(true, 'User added')
                    }
                    );
                });
            });
        }
        else {
            callback(false, 'User already exists')
        }
    })
};

module.exports.resetPassword = function (phone, newPassword, callback) {
    const query = { phone: phone };

    User.findOne(query, (err, user) => {
        if (err) throw err;

        if (user) {
            bcrypt.genSalt(10, function (err, salt) {
                bcrypt.hash(newPassword, salt, function (err, hash) {
                    if (err) throw err;
                    const password = hash;
                    const updatedAt = Date.now();

                    let update = {};

                    update = password;
                    //update.timestamps =
                        //updatedAt = updatedAt;

                        User.updateOne(query, { 'password': password, 'timestamps.updatedAt': updatedAt }, (err, raw) => {
                            if (err) callback(false, 'Internal Error')
                            callback(true, 'Password updated')
                        })

                });
            });
        }
        else {
            callback(false, 'User does not exist')
        }
    })
};



module.exports.pay = function (summ, user, callback) {

    const notificationURL = "https://my.soh100.ru/paymentNotification";

    InfrastructureConfig.incPaymentOrderId((OrderId) => {

        if (!Number.isInteger(parseInt(summ)))
            return callback({ success: false, message: "Неправильный формат записи" });

        let summInKop = summ * 100;
        let description = `Пополнение баланса на ${summ} руб.`;

        const tokenInitGenParams = {
            Amount: summInKop,
            OrderId: OrderId,
            Description: description
        }
        let tokenInit = tokenGen.generateInitToken(tokenInitGenParams);
        let userPhone = "+" + user.phone;

        const initReq = {
            TerminalKey: config.TerminalKey,
            Amount: summInKop,
            OrderId: OrderId,
            Description: description,
            Token: tokenInit,
            NotificationURL: notificationURL,
            DATA: {
                "DefaultCard": "none"
            },
            Receipt: {
                Phone: userPhone,
                Taxation: "usn_income",
                Items: [
                    {
                        Name: "Пополнение баланса",
                        Price: summInKop,
                        Quantity: 1.00,
                        Amount: summInKop,
                        PaymentMethod: "full_prepayment",
                        PaymentObject: "payment",
                        Tax: "none"
                    }
                ]
            }
        }
        console.log(initReq);

        //return callback({success: false});

        const urlInit = `https://securepay.tinkoff.ru/v2/Init`;
        requestInstance({ url: urlInit, method: "POST", json: true, body: initReq }, (err, response, bodyResponse) => {
            if (err) { return console.log(err); }
            const ErrorCode = bodyResponse.ErrorCode;

            console.log(bodyResponse);

            if (ErrorCode === "0") {

                const PaymentURL = bodyResponse.PaymentURL;
                const PaymentId = bodyResponse.PaymentId;

                let tokenGetStatusParams = { PaymentId: PaymentId };
                let tokenGetStatus = tokenGen.generateGetStatusToken(tokenGetStatusParams);
                console.log(tokenGetStatus);


                let paymentParams = {};
                paymentParams.OrderId = OrderId;
                paymentParams.PaymentId = PaymentId;
                paymentParams.Amount = summInKop;
                paymentParams.userId = user._id;
                paymentParams.userPhone = userPhone;
                paymentParams.balanceBeforeCrediting = user.balance;
                paymentParams.TerminalKey = config.TerminalKey;
                paymentParams.ErrorCode = ErrorCode;
                paymentParams.PaymentURL = PaymentURL;

                Payment.add(paymentParams, () => {
                    console.log('Payment initiated');
                    return callback({ success: true, url: PaymentURL });
                })
            }
            else {
                return callback({ success: false, message: bodyResponse.Message, details: bodyResponse.Details });
            }
        });

    });
}


module.exports.addBalance = async function (userId, addedSumm) {
    let usr = await User.findOne({ _id: userId });
    if (usr) {
        let balance = usr.balance;
        balance = balance + addedSumm;

        let raw = await User.updateOne({ _id: userId }, { balance: balance })

        if (raw.n === 1)
            return (true);
        else
            return (false);

    }
    else
        return (false);
}

module.exports.withdrawFromBalance = async function (userId, summ) {
    let usr = await User.findOne({ _id: userId });
    if (usr) {
        let balance = usr.balance;
        balance = balance - summ;

        let raw = await User.updateOne({ _id: userId }, { balance: balance })

        if (raw.n === 1)
            return (true);
        else
            return (false);

    }
    else
        return (false);
}

module.exports.getBalance = async function (userId) {
    let usr = await User.findOne({ _id: userId });
    let balance = usr.balance;
    return (balance);
}