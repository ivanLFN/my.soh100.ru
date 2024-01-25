/**
 * Генератор токенов для взаимодействия с эквайрингом банка
 */
const crypto = require('crypto');
const config = require('./config/config')

const TerminalKey = config.TerminalKey;
const Password = config.TerminalPassword;

module.exports.generateInitToken = function (params) {
    const stringParams = params.Amount + params.Description + params.OrderId + Password + TerminalKey;
    const token = crypto.createHash('sha256').update(stringParams).digest('hex');
    return token;
}

module.exports.generateGetStatusToken = function (params) {
    const stringParams = Password + params.PaymentId + TerminalKey;
    const token = crypto.createHash('sha256').update(stringParams).digest('hex');
    return token;
}

module.exports.generateNotificationToken = function (params) {
    let copyedParams = Object.assign({}, params)
    delete copyedParams.Token;
    copyedParams.Password = Password;
    const orderedParams = Object.keys(copyedParams).sort().reduce(
        (obj, key) => { 
          obj[key] = copyedParams[key]; 
          return obj;
        }, 
        {}
      );
    
    const valuesArray = Object.values(orderedParams);
    let stringValues = '';
    for(let value of valuesArray){
        stringValues = stringValues + value;
    }
    
    const token = crypto.createHash('sha256').update(stringValues).digest('hex');
    return token;
}


