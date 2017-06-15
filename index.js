var express = require('express');
var request = require('request');
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var db = mongoose.connect(process.env.MONGO_URI);
var Movie = require('./models/movie');
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
        } else if(event.message){
          console.log('message');
          processMessage(event);
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
      var message = greeting + ' My name is Hola Movie' + ((name == 'Jigyasa') ? ' and I love you! ' : '') +' I can tell you various details regarding movies. What movie would you like to know about?';
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

var processMessage = function(event){
  if(!event.message.is_echo){
    var message = event.message;
    var senderId = event.sender.id;

    console.log('Received Message from ' +senderId + ' at: ' +new Date().toISOString());
    console.log('Message is: ' + message);

    if(message.text){
      var formattedMsg = message.text.toLowerCase().trim();
      // If we receive a text message, check to see if it matches any special
      // keywords and send back the corresponding movie detail.
      // Otherwise, search for new movie.
      switch (formattedMsg) {
        case 'plot':
        case 'date':
        case 'runTime':
        case 'director':
        case 'cast':
        case 'rating':
          getMovieDetail(senderId, formattedMsg);
          break;
        default:
          findMovie(senderId, formattedMsg);
          break;
      }
    } else if(message.attachments){
      sendMessage(senderId, {text: "Sorry, I don't understand your request."});
    }
  }
}

var getMovieDetail = function(userId, field){
  Movie.findOne({user_id: userId}, function(err, movie){
    if(err){
      sendMessage(userId, {text: 'Something went wrong. Try again'});
    } else{
      sendMessage(userId, {text: movie[field]});
    }
  })
}

function findMovie(userId, movieTitle) {
  request("https://api.themoviedb.org/3/search/movie?api_key="+process.env.MOVIE_API_KEY+"&language=en-US&query="+movieTitle+"&page=1&include_adult=true" + movieTitle, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      console.log(body);
      if (movieObj) {

        var query = {user_id: userId};
        var update = {
          user_id: userId,
          title: movieObj.Title,
          plot: movieObj.Plot,
          date: movieObj.Released,
          runtime: movieObj.Runtime,
          director: movieObj.Director,
          cast: movieObj.Actors,
          rating: movieObj.imdbRating,
          poster_url:movieObj.Poster
        };
        var options = {upsert: true};
        Movie.findOneAndUpdate(query, update, options, function(err, mov) {
          if (err) {
            console.log("Database error: " + err);
          } else {
            message = {
              attachment: {
                type: "template",
                payload: {
                  template_type: "generic",
                  elements: [{
                    title: movieObj.Title,
                    subtitle: "Is this the movie you are looking for?",
                    image_url: movieObj.Poster === "N/A" ? "http://placehold.it/350x150" : movieObj.Poster,
                    buttons: [{
                      type: "postback",
                      title: "Yes",
                      payload: "Correct"
                    }, {
                      type: "postback",
                      title: "No",
                      payload: "Incorrect"
                    }]
                  }]
                }
              }
            };
            sendMessage(userId, message);
          }
        });
      } else {
          console.log(movieObj.Error);
          sendMessage(userId, {text: movieObj.Error});
      }
    } else {
      sendMessage(userId, {text: "Something went wrong. Try again."});
    }
  });
}
