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
  } else if(payload == 'Correct'){
    sendMessage(senderId, {text: "Awesome! What would you like to find out? Enter 'plot', 'date', 'runtime', 'director', 'cast' or 'rating' for the various details."});
  } else if(payload == 'Incorrect'){
    sendMessage(senderId, {text: "Oops! Sorry about that. Try using the exact title of the movie"});
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
        case 'runtime':
        case 'cast':
        case 'rating':
        case 'director':
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
      if(field == 'cast'){
        sendMessage(userId, {text: movie.cast.join()});
      } else{
        sendMessage(userId, {text: movie[field]});
      }
    }
  })
}

function findMovie(userId, movieTitle) {
  var cast = [];
  var movieObj = {};
  var director;
  request("https://api.themoviedb.org/3/search/movie?api_key="+process.env.MOVIE_API_KEY+"&language=en-US&query="+movieTitle+"&page=1&include_adult=true" + movieTitle, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      var reqBody = JSON.parse(body);
      if(reqBody.results.length == 0){
        sendMessage(userId, {text: 'No movies found.'});
      }
      var movieId = reqBody.results[0].id;
      request("https://api.themoviedb.org/3/movie/"+movieId+"/credits?api_key="+process.env.MOVIE_API_KEY, function(error, response, body){
        if(error){
          sendMessage(userId, {text: 'Something went wrong. Please try again.'});
        } else{
          var castBody = JSON.parse(body).cast;
          director = JSON.parse(body).crew[0].name;
          for(var i in castBody){
            cast.push(castBody[i].name);
          }
          request("https://api.themoviedb.org/3/movie/"+movieId+"?api_key="+process.env.MOVIE_API_KEY, function(error, response, body){
            movieObj = JSON.parse(body);
            if (movieObj) {
              var query = {user_id: userId};
              var update = {
                user_id: userId,
                title: movieObj.title,
                plot: movieObj.overview,
                date: movieObj.release_date,
                rating: movieObj.vote_average,
                poster_url: movieObj.poster_path ? "http://image.tmdb.org/t/p/w500" + movieObj.poster_path : 'http://placehold.it/350',
                runtime: movieObj.runtime,
                cast: cast,
                director: director
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
                          title: movieObj.title,
                          subtitle: "Is this the movie you are looking for?",
                          image_url: update.poster_url,
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
                // console.log(movieObj.Error);
                sendMessage(userId, {text: 'Something went wrong. Try again.'});
            }
          })
        }
      })

    } else {
      sendMessage(userId, {text: "Something went wrong. Try again."});
    }
  });
}
