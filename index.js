const PORT = process.env.PORT || 3000;
var express = require("express");
var app = express();
var server = app.listen(PORT);
var request = require('request');

var aaretempstring = "0";
var ort;
var text;
var temp_past;
var chartData = [];
var min, max;

request('https://aareguru.existenz.ch/v2018/current?app=xyz.fheld.lametric.aaretemperatur&version=1.0',request_callback);

app.get('/', function (req, res) {
  request('https://aareguru.existenz.ch/v2018/current?app=xyz.fheld.lametric.aaretemperatur&version=1.0',request_callback);
  res.json({"frames":[{"text":aaretempstring,"icon":null},{"text":text,"icon":2355},{"index":1,"chartData":chartData}]});
});


function request_callback (error, response, body){
  var aaredata = JSON.parse(body);
 // console.log(typeof aaredata.aare);
  aaretempstring = aaredata.aare.temperature.toString();
  ort  = aaredata.aare.location;
  text = aaredata.aare.temperature_text;
  aaretempstring = ort + " " +  aaretempstring + "°";

  temp_past = aaredata.aarepast;
  console.log("DONE");
 // console.log(Math.round(3.1));
  for (i = 0; i < 37; i++) {
    chartData[i]=Math.round(100*temp_past[7*i].temperature);
  }
  min = Math.min(...chartData); max = Math.max(...chartData);

  for (i = 0; i < 37; i++) {
    chartData[i]=(chartData[i]-min)*8/(max-min);
  }

}

// https://aareguru.existenz.ch/v2018/current?app=xyz.fheld.lametric.aaretemperatur&version=1.0
