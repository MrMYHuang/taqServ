'use strict';
var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var routes = require('./routes/index');
var users = require('./routes/users');

var mongodb = require("mongodb");

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/users', users);

// Connect to MongoDB.
var db;
//mongodb.MongoClient.connect("YourMongoDbUri", function (err, _db) {
mongodb.MongoClient.connect(process.env.MONGODB_URI, function (err, _db) {
    db = _db
    db.authenticate("taq", "YourDbPassword")
    require("./postDbInit")(app, db)
})

module.exports = app;
