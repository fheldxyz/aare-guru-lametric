"use strict";

const express = require("express");
const app = express();
const port = process.env.PORT || 3000; //heroku and others use 'process.env.PORT'
const errorFrame = {"frames":[{"text":"ke ahnig","icon":null}]};
const timeoutFrame = {"frames":[{"text":"ke plan","icon":null}]};


const wait_period = 1000 * 60 // 60sec
var last_failed_request = 0;

function processData(body,withgraph) {
  
  var chartData = [];
  var aaredata = JSON.parse(body);
  var aaretemperaturestring = aaredata.aare.temperature.toString();
  var loc  = aaredata.aare.location;
  var temperature_text = aaredata.aare.temperature_text;
  
  aaretemperaturestring = loc + " " +  aaretemperaturestring + "°";
  
    
  var temp_past = aaredata.aarepast;
  var size_of_temp_past = temp_past.length;
    
  var end = Math.min(7*37, size_of_temp_past);
 
  for (let i = 0; i < Math.floor(end/7); i++) {
    chartData[i]=Math.round(100*temp_past[7*i].temperature);
  }
  
  var min = Math.min(...chartData); 
  var max = Math.max(...chartData);

  
  for (let i = 0; i < 37; i++) {
    chartData[i]=Math.round((chartData[i]-min)*8/(max-min));
  }
  
  
  var result;
  if (withgraph=="true" ||
      withgraph=="1"
  ){
	  result = {"frames":[
		{"text":aaretemperaturestring,"icon":null},
		{"text":temperature_text,"icon":2355},
		{"index":1,"chartData":chartData} 
	  ]};
  }
  else if (withgraph=="false" ||
           withgraph=="0"
  ){
	  result = {"frames":[
		{"text":aaretemperaturestring,"icon":null},
		{"text":temperature_text,"icon":2355}
	  ]};
  }

   
  return result;

}



app.get("/", (req, res) => {
    if (Date.now() - last_failed_request < wait_period) {
      res.send(timeoutFrame)
    } else {
      last_failed_request = 0;
      fetch(
        "https://aareguru.existenz.ch/v2018/current?city="
        + req.query.city 
        + "&" 
        + "app=xyz.fheld.lametric.aaretemperatur&version=1.1.1")
      .then(r=>r.text())
      .then((response)=>processData(response,req.query.graph || "false" ))
      .then(response => {
          res.send(response)
      })
      .catch(error => {
          last_failed_request = Date.now();
          console.dir(error, { depth: null });
          res.send(errorFrame)
      })
    }
})

app.listen(port);
