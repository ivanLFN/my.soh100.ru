
let establishedState = false;
let startTime = 0;
let expectedFinishTime = 0;

var url_string = window.location.href;
var url = new URL(url_string);
var sta = url.searchParams.get("num");
var port = url.searchParams.get("port");

if (port === null)
  port = 0;

let sec = 0;
let min = 0;
let hours = 0;

reqestRoutine();
setInterval(() => {
  reqestRoutine();
}, 5000);


function reqestRoutine() {
  $.ajax({
    url: `stations?num=${sta}&port=${port}`,
    type: 'GET',
    dataType: 'json',
    success: function (data) {
      console.log(data);

      let voltage = " " + Math.trunc(data.voltage) + " В";
      $("#voltage").text(voltage);

      let power = " " + data.pwr + " кВт";
      $("#power").text(power);

      let consumedPower = " " + data.cPwr + " кВт*ч";
      $("#consumedPower").text(consumedPower);

      startTime = data.startedAt;
      expectedFinishTime = data.expectedFinishAt;
      establishedState = data.estabState;

      if (data.userIsMatch) {
        $('#controlButton').css('opacity', '1');
        $('#controlButton').prop("disabled", false);
        $('#consumedPowerTitle').show();
        $('#consumedPower').show();

      }
      else {
        $('#controlButton').css('opacity', '0');
        $('#controlButton').prop("disabled", true);
        $('#consumedPowerTitle').hide();
        $('#consumedPower').hide();
      }

      if (establishedState) {
        $('#controlButton').text("Остановить зарядку");
        if (data.onLink)
          $('#status').children('span').text("в сети / занята");
        else
          $('#status').children('span').text("не в сети / занята");
      }
      else {
        $('#controlButton').text("Начать зарядку");
        if (data.onLink)
          $('#status').children('span').text("в сети / свободна");
        else
          $('#status').children('span').text("не в сети / свободна");

      }
    }
  });
}


setInterval(() => {
  let secStr;
  let minStr;
  let hoursStr;

  let expectedFinishTimeStr;

  let tick = (Date.now() - startTime) / 1000;

  sec = Math.trunc(tick % 60);
  min = Math.trunc((tick / 60) % 60);
  hours = Math.trunc((tick / 3600));


  if (establishedState) {
    sec++;
    if (sec >= 60) {
      sec = 0;
      min++;
      if (min >= 60) {
        min = 0;
        hours++;
      }
    }

    secStr = sec + "";
    if (sec < 10)
      secStr = "0" + secStr;

    minStr = min + "";
    if (min < 10)
      minStr = "0" + minStr;

    hoursStr = hours + "";
    if (hours < 10)
      hoursStr = "0" + hoursStr;


    let expHours, expMin;

    if (expectedFinishTime) {
      expHours = new Date(expectedFinishTime).getHours();
      if (expHours < 10)
        expHours = "0" + expHours;

      expMin = new Date(expectedFinishTime).getMinutes();
      if (expMin < 10)
        expMin = "0" + expMin;

      expectedFinishTimeStr = expHours + ':' + expMin;
    }
    else
      expectedFinishTimeStr = '--:--';
  }
  else {
    sec = 0;
    min = 0;
    hours = 0;

    secStr = "--";
    minStr = "--";
    hoursStr = "--"

    expectedFinishTimeStr = "--:--"
  }
  $("#sec").text(secStr);
  $("#min").text(minStr);
  $("#hours").text(hoursStr);
  $("#expectedTime").text(expectedFinishTimeStr);

}, 1000);


function ControlButtonClick() {
  let controlParams = { stationNum: sta , port: port};
  if (establishedState) {
    controlParams.operation = 'finish';
  }
  else {
    let expectedDuration = prompt('Предполагаемое время зарядки, минут: ', 180);
    controlParams.expectedDuration = expectedDuration;
    controlParams.operation = 'start';
  }

  if (controlParams.operation === 'finish')
    if (!window.confirm('Остановить зарядку?')) {
      return;
    }

  $.ajax({
    url: `/stationControl`,
    type: 'POST',
    data: controlParams,
    dataType: 'json',
    success: function (res) {
      console.log(res);

      //startTime = data.startedAt;
      establishedState = res.currentEstabState;


      if (establishedState) {
        startTime = res.startedAt;
        expectedFinishTime = res.expectedFinishAt;


        $('#controlButton').text("Остановить зарядку");
      }
      else {
        $('#controlButton').text("Начать зарядку");
      }

      if (res.success) {
        console.log('succsess');
      }
      else {
        if (res.busy) {
          $('#controlButton').css('opacity', '0');
          $('#controlButton').prop("disabled", true);
          $('#consumedPowerTitle').hide();
          $('#consumedPower').hide();
          alert('Станция уже занята')
        }
        else
          alert(res.msg);

        if (res.msg === "Недостаточно средств")
          window.location.href = "/payment";


      }

    }
  });
}
