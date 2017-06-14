var express = require('express');
var request = require('request');
var bodyParser = require('body-parser');
require('dotenv').config({});

var app = express();
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.listen((process.env.PORT || 3000));

//Server Index Page
app.get('/', function(req, res, next){
    res.send('Deployed!');
});

//Facebook Webhook
app.get('/webhook', function(req, res, next){
    if(req.query['hub.verify_token'] == process.env.FACEBOOK_TOKEN){
        console.log('Verified');
        res.status(200).send(req.query['hub.challenge']);
    } else{
        console.error("Verification failed. The tokens do not match.");
        res.sendStatus(403);
    }
});

app.post('/webhook', function(req, res, next){
  if(req.body.object == 'page'){
    req.body.entry.forEach(function(entry){
      entry.messaging.forEach(function(event){
        if(event.postback){
          processPostback(event);
        }
      });
    });

    res.sendStatus(200);
  }
});


var processPostback = function(event){
  var senderId = event.sender.id;
  var payload = event.postback.payload;

  if(payload === 'Greeting'){
    //Get User's First name
    request({
      url: "https://graph.facebook.com/v2.6/" + senderId,
      qs: {
        access_token: process.env.PAGE_ACCESS_TOKEN,
        fields: 'first_name'
      },
      method: 'GET'
    }, function(error, response, body){
      var greeting = '';
      if(error){
        console.log("Error getting user's name: " +  error);
      } else{
        var bodyObj = JSON.parse(body);
        name = bodyObj.first_name;
        greeting = 'Hi ' + name + '.';
      }
      var message = greeting + ' My name is Hola Movie! I can tell you various details regarding movies. What movie would you like to know about?';
      sendMessage(senderId, {text: message});
    });
  }
}

var sendMessage = function(recipientId, message){
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token: process.env.PAGE_ACCESS_TOKEN},
    method: 'POST',
    json: {recipient: {id: recipientId}, message: message}
  }, function(error, response, body){
    if(error){
      console.log("Error sending message: " + response.error);
    } else{
      // console.log(response);
      console.log(body);
    }
  })
}
