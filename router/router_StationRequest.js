/**
 * Этот модуль описывает маршруты, к которым обращаются станции, работающие по протоколу http
 * 
 */
let router = require('./router.js');
let Station = require('../models/station/station_StationRequest.js');

// По этому маршруту станция обращается для получения конфигурации
// Конфигурация заправшивается при старте станции
router.post("/deviceConfig", function (req, res) {
    const params = req.body;
    Station.getStationConfig(params, (config) => {
        if (!config) return res.sendStatus(404);
        return (res.send(config));
    })
});

// Стандартный запрос от станции
// Логика работы прописана в модуле station.js в функции processStation
router.post("/device", function (req, res) {
    let paramsFromStation = (req.body);
    Station.processStation(paramsFromStation, (controlParams) => {
        if (controlParams) {
            return res.send(controlParams);
        }
        else
            return res.sendStatus(404);
    });
});