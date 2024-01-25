const crypto = require('crypto');

module.exports.generateCode = function (len) {
    return new Promise((resolve, reject) => {
        crypto.randomBytes(len, function (ex, buf) {
            let code = buf.map((n) => n % 10);
            let stringCode = '';
            for(let i = 0;i<len;i++)
                stringCode = stringCode + code[i];
            resolve(stringCode);
        });
    })
}
