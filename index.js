"use strict";

import express from "express";

const app = express();
const port = process.env.PORT || 3000; //heroku and others use 'process.env.PORT'


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
        res.send("error was caught")
    })
})

app.listen(port);

console.log("Server started at:", Date())
process.on("SIGTERM", ()=>console.log("it's:", Date(), "- bye!"));
