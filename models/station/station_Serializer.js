module.exports.serializeStationForUserRequest = function serializeStationForUserRequest(station, portNum, userId, role = ["user"]) {

    if (portNum === undefined)
        portNum = 0;

    if (portNum < 0 || portNum >= 3)
        portNum = 0;

   // if (station.stationNum !== 45)
   //     portNum = 0;
    let sta = {};
    sta.hideProperties = false;

    if (role[1] === "admin") {
        sta.signalRate = station.signalRate;
        sta.restarts = station.restarts;
        sta.temp = station.temp;
        sta.comission = station.outlets[portNum].comission;
        sta.faults = station.outlets[portNum].faults;
        sta.cPwr = station.outlets[portNum].session.cPwr;
        sta.cosFi = station.outlets[portNum].cosFi;
        sta.hideProperties = false;
        sta.simCardPhone = "+" + station.simCardPhone;
        // if(station.outlets[0].session.estabState){
        //     let query = station.outlets[0].session.userId;
        //     let usr = await user.findOne({ _id: query });
        //     sta.userPhone = usr.phone;
        // }

    }

    sta.stationNum = station.stationNum;

    sta.voltage = station.outlets[portNum].voltage;
    sta.current = station.outlets[portNum].current;
    sta.pwr = station.outlets[portNum].pwr;
    sta.startedAt = station.outlets[portNum].session.startedAt;
    sta.expectedFinishAt = station.outlets[portNum].session.expectedFinishAt;

    sta.estabState = station.outlets[portNum].session.estabState;
    sta.imageUrl = station.urlImages[portNum];
    sta.location = station.location;
    sta.hidden = station.hidden;
    sta.timers = station.timers;

    let price = station.outlets[portNum].price;

    let priceRub = Math.trunc(price / 100);

    let priceKop_R = Math.abs(price % 10);

    let priceKop_L = Math.abs(Math.trunc(price / 10) % 10);

    sta.price = `${priceRub}.${priceKop_L}${priceKop_R}`;


    if (role[1] !== "admin" && station.outlets[portNum].session.estabState != true) {
        sta.current = 0;
        sta.pwr = 0;
    }


    if (station.timestamps.lastDevReq + 200 * 1000 > Date.now()) {
        sta.onLink = true
    }
    else {
        sta.onLink = false
        sta.voltage = 0;
        sta.current = 0;
        sta.pwr = 0;
    }

    sta.address = station.address;
    sta.description = station.description;

    const staUserId = station.outlets[portNum].session.userId;

    if (staUserId === userId || station.outlets[portNum].session.userId === "0") {
        sta.userIsMatch = true;
        sta.cPwr = station.outlets[portNum].session.cPwr;
    }
    else {
        sta.userIsMatch = false;
    }

    return sta;

}

module.exports.serializeStationForUnknownUser = function serializeStationForUnknownUser(station, portNum) {

    if (portNum === undefined)
        portNum = 0;

    if (portNum < 0 || portNum >= 3)
        portNum = 0;

    if (station.stationNum !== 45)
        portNum = 0;



    let sta = {};
    sta.hideProperties = false;

    sta.stationNum = station.stationNum;

    sta.voltage = station.outlets[portNum].voltage;
    sta.current = station.outlets[portNum].current;
    sta.pwr = station.outlets[portNum].pwr;
    sta.startedAt = station.outlets[portNum].session.startedAt;
    sta.expectedFinishAt = station.outlets[portNum].session.expectedFinishAt;

    sta.estabState = station.outlets[portNum].session.estabState;
    sta.imageUrl = station.urlImages[portNum];
    sta.location = station.location;
    sta.hidden = station.hidden;
    sta.timers = station.timers;

    if (station.outlets[portNum].session.estabState != true) {
        sta.current = 0;
        sta.pwr = 0;
    }


    if (station.timestamps.lastDevReq + 200 * 1000 > Date.now()) {
        sta.onLink = true
    }
    else {
        sta.onLink = false
        sta.voltage = 0;
        sta.current = 0;
        sta.pwr = 0;
    }

    sta.address = station.address;
    sta.description = station.description;

    sta.cPwr = station.outlets[portNum].session.cPwr;



    if (station.outlets[portNum].session.userId === "0") {
        sta.userIsMatch = true;
        sta.cPwr = station.outlets[portNum].session.cPwr;
    }
    else {
        sta.userIsMatch = false;
    }


    return sta;
}


module.exports.serializeStationForAPIRequest = function serializeStationForAPIRequest(station, userId) {

    let sta = {};
    sta.outlets = [];

    sta.stationNum = station.stationNum;

    sta.stationId = station._id;
    sta.stationModel = station.systemDescription.boardVer;
    sta.firmwareVersion = station.systemDescription.codeVer;
    sta.stationVendor = "SOH100";


    sta.location = station.location;
    sta.hidden = station.hidden;
    //sta.timers = station.timers;

    sta.address = station.address;
    sta.description = station.description;

    if (station.timestamps.lastDevReq + 200 * 1000 > Date.now())
        sta.onLink = true
    else
        sta.onLink = false



    for (let j = 0; j < station.outlets.length; j++) {

        if(j == 2)// еще подпорка
            continue;

        let i = j;

        if(j == 1)// костыльная штука для смены портов местами
            i = 2;
        if(j == 2)
            i = 1;

        let outlet = {};

        outlet.portId = j+1;
        outlet.type = station.outlets[i].type;
        outlet.voltage = station.outlets[i].voltage;
        outlet.current = station.outlets[i].current;
        outlet.cPwr = station.outlets[i].session.cPwr;
        outlet.pwr = station.outlets[i].pwr;
        outlet.faults = station.outlets[i].faults;
        outlet.startedAt = station.outlets[i].session.startedAt;
        outlet.expectedFinishAt = station.outlets[i].session.expectedFinishAt;
        outlet.estabState = station.outlets[i].session.estabState;

        if (!sta.onLink) {
            outlet.voltage = 0;
            outlet.current = 0;
            outlet.pwr = 0;
        }


        let price = station.outlets[i].price;

        let priceRub = Math.trunc(price / 100);

        let priceKop_R = Math.abs(price % 10);

        let priceKop_L = Math.abs(Math.trunc(price / 10) % 10);

        outlet.price = `${priceRub}.${priceKop_L}${priceKop_R}`;
        const staUserId = station.outlets[i].session.userId;

        if (staUserId === userId || station.outlets[i].session.userId === "0") {
            outlet.userIsMatch = true;
        }
        else {
            outlet.userIsMatch = false;
        }

        sta.outlets.push(outlet);
    }

    return sta;
}