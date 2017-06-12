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
})