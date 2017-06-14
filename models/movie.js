var mongoose = require('mongoose');

var movie = new mongoose.Schema({
  user_id: {type: String},
  title: {type: String},
  plot: {type: String},
  date: {type: String},
  runtime: {type: String},
  director: {type: String},
  cast: {type: String},
  rating: {type: String},
  poster_url: {type: String}
});
module.exports = mongoose.model('Movie', movie);
