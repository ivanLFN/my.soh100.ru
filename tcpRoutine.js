
/*
        Этот файл содержит функционал для взаимодействия со станциями по протоколу TCP. Некоторые станции работают по HTTP,
    поэтому убрать маршруты из файла routers.js невозможно. Протокол TCP значительно экономит трафик, позволяя использовать
    самые дешевые тарифы. Также взаимодействие по HTTP происходит в режиме запрос от станции - ответ от сервера, что не позволяет мгновенно изменять
    состояние станции или запросить от нее данные.

    На данный момент реализованы:
        -Запрос конфигурации станции;
        -Обработка состояния портов от станции;
        -Удаленное обновление ПО станции (доступно в станциях с CodeVer "2"). Запрос на обновление ПО и передача части файла ПО;
        -Уведомление станции. Фактически отправка текущего состояния зарядных портов, после которого станция повторно запрашивает
        состояние с сервера.
    
    Данные передаются в формате JSON. Кроме обработчика запроса части прошивки "getFwPart"
*/

const net = require('net');
let CRC32 = require("crc-32");

const config = require('./config/config');
const host = config.tcpRoutine.host;
const port = config.tcpRoutine.port;

const server = net.createServer();
let connections = 0;  // кол-во активных подключений
let socketArray = []; // хранит состояние всех активных соединений со станциями

server.listen(port, host, () => {
    console.log('TCP Server is running on port ' + port + '.');
});

server.on('connection', function (sock) { /*при попытке подключения создается новый сокет (sock). Соединение незащищенное,
                                            также невозможно понять, станция это подключилась или нет! */
    console.log('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);
    connections++;
    sock.connectionId = '' + (new Date()).getTime(); // задаём уникальный номер подключения
    socketArray.push(sock); // добавляем новое соединение в список всех соединений  

    let paramsFromStation; // хранит принятые от станции данные

    sock.on('data', function (data) { // если что-то приходит от станции, попадаем в этот обработчик
        //console.log('TCP DATA ' + ': ' + data);

        try {
            paramsFromStation = JSON.parse(data);
        } catch (error) {
            console.log(error);
            return;
        }

        let staId = paramsFromStation._id; // id станции. Он совпадает с id документа в БД коллекции "stations". Фактически это id микроконтроллера
        let mesId = paramsFromStation.mesId; // id сообщения. Используется для опредения повторной отправки
        let command = paramsFromStation.com; // тип запроса. Что необходимо выполнить

        for (let i = 0; i < socketArray.length; i++) {  // Этот цикл проверяет, есть ли в списке соединений сокет с такой станцией. Исключает дублирование
            if (socketArray[i].staId === staId) {
                if (socketArray[i].connectionId !== sock.connectionId) { // Если сокет есть, тогда закрываем старое соединение, удаляем сокет
                    socketArray[i].destroy();
                    socketArray.splice(i, 1);
                    i--;
                    connections--;
                    console.log("Socket id = " + socketArray[i].connectionId + " has been destroyed");
                }
            }
        }

        let Station_SR = require('./models/station/station_StationRequest'); // подключаем файл-модель станции (он аналогичен для всех станций). Хранит функции для работы со станциями
       
        if (command === "deviceConfig") { // если станция запрашивает конфигурацию
            Station_SR.getStationConfig(paramsFromStation, (config) => { // получаем конфиг из БД через модель
                if (config) {
                    let answer = { mesId: mesId, config: config }; // формируем ответ
                    return sock.write(JSON.stringify(answer)); // отправляем конфигурацию станции
                }
                else {
                    console.log("Get config error");
                }
            })
        }
        else if (command === "device") { // запрос на обработку состояния портов. Аналогично, как и в маршруте "/device", вызываем функцию "processStation"
            Station_SR.processStation(paramsFromStation, (controlParams) => {
                controlParams.mesId = mesId;
                controlParams.outlets[0].maxDur = 720; // это поле указывает на максимальную продолжительность зарядной сессии
                sock.write(JSON.stringify(controlParams)); // отправляем данные станции
            });
        }


        /*
        Pапрос на обновление ПО. Его инициирует станция. Ответ содержит размер, версию ПО и др-ю служебную инфор-ю. Описание
        о новой прошивке хранится в БД в документе конкретной станции в коллекции "stations". Для доступа существует
        специальный запрос в модели "getNewFirmwareInfo". Сам файл прошивки хранится в дириктории "firmware". По-хорошему файл
        тоже необходимо перенести в БД. Создать модель и отдельную коллекцию прошивок. Потому как загружать-обновлять файл приходится
        вместе с сайтом.
        Файл станции по частям.
        */
        else if (command === "getNewFwInfo") { 
            Station_SR.getNewFirmwareInfo(staId, (newFwInfo) => {
                let answer = {};
                if (newFwInfo) { // если информация в БД есть
                    try {
                        const fs = require("fs"); // задействуем модуль работы с файловой системой
                        sock.newFW = {}; // в сокете также будет храниться информация о прошивке
                        sock.newFW.fs = fs;
                        sock.newFW.file = fs.readFileSync(newFwInfo.path); // считываем бинарный файл прошивки
                        let partSize = paramsFromStation.partSize; // размер части прошивки. Обычно он 256 байт
                        sock.newFW.partSize = partSize;
                        let numOfParts = newFwInfo.size / partSize; // вычисляем кол-во частей. По-хорошему размер прошивки надо вычислять автоматически
                        sock.newFW.numOfParts = numOfParts;         // Сейчас раз-р хранится в БД, вычисляется и записывается вручную

                        answer.mesId = mesId;   
                        answer.codeVersion = newFwInfo.codeVer;
                        answer.numOfParts = newFwInfo.size / partSize;
                        answer.startAddress = Number(newFwInfo.startAddress); // адрес начала записи прошивки
                        answer.size = Number(newFwInfo.size);
                        answer.success = true; // флаг успешного запроса
                    } catch (err) {
                        if (err.code === 'ENOENT') {
                            console.log('File not found!');
                        } else {
                            throw err;
                        }
                        answer.mesId = mesId;
                        answer.success = false;
                    }
                }
                else {
                    answer.success = false;
                }
                sock.write(JSON.stringify(answer)); // отправляем данные о прошивке станции
            })

        }
        else if (command === "getFwPart") { // Запрос конкретной части прошивки. Данные в бинарном коде

            let partSize = paramsFromStation.partSize;
            let partNum = paramsFromStation.partNum;
            // размер пакета, отправляемого станции
            const bufLen = 1 /*null byte*/ + 1 /**reservedByte */ + 2 /*mesId*/ + 4 /** partNum */ + 2 /* partSize */ + 4 /* crc32 */ + partSize /** data */;
            let buffer = new ArrayBuffer(bufLen); // буфер для отправляемого пакета
            let arrayU8 = new Uint8Array(buffer); // обертка для работы с буфером побайтно

            let bufferForCRC = new ArrayBuffer(partSize); // этот буфер используется для копирования конкретной части из файла прошивки и вычисления CRC32
            let arrayU32_CRC = new Uint8Array(bufferForCRC); // обертка для работы с буфером побайтно

            for (let i = 0; i < partSize; i++) { // побайтно заполняем буферы отправляемого пакета и буфера для вычисления CRC32.
                arrayU8[14 + i] = sock.newFW.file[i + partNum * partSize];
                arrayU32_CRC[i] = sock.newFW.file[i + partNum * partSize];
            }

            let crc = CRC32.buf(arrayU32_CRC); // вычисляем CRC32 от текущей части прошивки

            // Заполняем служебную информацию
            arrayU8[3] = mesId & 0xFF; // Номер сообщения
            arrayU8[2] = (mesId & 0xFF00) >> 8;
            arrayU8[1] = 0; // Эти байты не используются
            arrayU8[0] = 0;

            // Номер части
            arrayU8[7] = partNum & 0xFF;
            arrayU8[6] = (partNum & 0xFF00) >> 8;
            arrayU8[5] = (partNum & 0xFF0000) >> 16;
            arrayU8[4] = (partNum & 0xFF000000) >> 24;

            // Размер части
            arrayU8[9] = partSize & 0xFF;
            arrayU8[8] = (partSize & 0xFF00) >> 8;

            // Контрольная сумма
            arrayU8[13] = crc & 0xFF;
            arrayU8[12] = (crc & 0xFF00) >> 8;
            arrayU8[11] = (crc & 0xFF0000) >> 16;
            arrayU8[10] = (crc & 0xFF000000) >> 24;
            sock.write(arrayU8); // Отправляем заполненную структуру-пакет станции
        }
        else {
            sock.close(); // В каждом запросе от станции должна быть команда. Если ее нет, то закрываем соединение
        }

    });

    sock.on('close', function (data) {// Обычно этот обработчик не используется, поскольку станция не отправляет запрос на закрытие сокета
    });

    sock.on('error', function (err) {
        console.log(err)
    })

});

function sendDataToStationWithId(staId, data) { // отправка данных конкретной станции через сокет
    let socket = socketArray.find(s => s.staId === staId);
    if (socket) {

        try {
            let controlParams = {};
            controlParams.mesId = 0;
            socket.write(JSON.stringify(data));
        } catch (error) {
            throw err;
        }
    }
}

// Эта функция вызывается если необходимо уведомить станцию сделать запрос на сервер
// В текущем исполнении она просто передает состояние портов
module.exports.notifyStation = function notifyStation(stationDb) { 
    const controlParams = {
        mesId: 0,
        outlets: [{
            opCode: stationDb.opCode,
            estSt: stationDb.outlets[0].session.sessNum, sessSaved: stationDb.outlets[0].session.saved,
            sessNum: stationDb.outlets[0].sessNum,
            maxConsPwr: 60.0, maxDur: 720
        }]
    }
    sendDataToStationWithId(stationDb._id, controlParams);
}