﻿'use strict';
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

var aqJsonFile = 'taqi.json'

// Connect to MongoDB.
var db;
//mongodb.MongoClient.connect("YourMongoDbUri", function (err, _db) {
mongodb.MongoClient.connect(process.env.MONGODB_URI, function (err, _db) {
    db = _db
    db.authenticate("taq", "YourDbPassword")
})

var aqFields = ["AQI", "PM2.5", "PM2.5_AVG", "PM10", "PM10_AVG", "O3", "O3_8hr", "CO", "CO_8hr", "SO2", "NO2", "NOx", "NO", "WindSpeed", "WindDirec"];

var tabName = "epatw";

var initTabs = require('./routes/initTabs')(aqFields, db, tabName);
app.use('/initTabs', initTabs);

// Get aq data of siteName.
app.get("/" + tabName, function (req, res) {
    var siteName = req.query.siteName;
    db.collection(tabName).findOne({ SiteName: siteName }, function (err, doc) {
        res.json(doc);
    })
});

var fs = require("fs");
/*
var jf = fs.readFileSync("taqi2.json", "utf8");
var jb = JSON.parse(jf);
var jTaqs = jb.result.records;
*/

function loadAq2Db() {
    var request = require('request');
    request('http://opendata.epa.gov.tw/webapi/api/rest/datastore/355000000I-001805/?format=json&sort=SiteName&token=EVrPslGk9U2ftHxkwwkW4g', function (error, response, body) {
        if (!error && response.statusCode == 200) {
            // Save to file.
            fs.writeFile(aqJsonFile, body, 'utf8');

            var jb = JSON.parse(body)
            var jTaqs = jb.result.records;
            db.collection(tabName, function (err, collection) {
                collection.find(function (err, cursor) {
                    cursor.each(function (err, doc) {
                        if (doc != null) {
                            var aqs = doc;
                            var id = aqs._id;
                            delete aqs._id;

                            var s = 0;
                            for (; s < jTaqs.length; s++) {
                                if (jTaqs[s]["SiteName"] == aqs["SiteName"]) {
                                    break;
                                }
                            }
                            var jTaq = jTaqs[s];

                            var pubHour = Number(String(jTaq["PublishTime"]).substring(11, 13));
                            aqs["updateDate"] = String(jTaq["PublishTime"]).substring(5, 10);
                            aqs["updateHour"] = pubHour;

                            var v;
                            for (var a = 0; a < aqFields.length; a++) {
                                var aqField = aqFields[a];
                                // MongoDB disallows "." in a field name.
                                // Convert to 0 if is NaN.
                                aqs[aqField.replace(".", "_")][pubHour] = isNaN(v = parseFloat(jTaq[aqField])) ? 0 : v;
                            }
                            db.collection(tabName).updateOne({ _id: id }, aqs, { upsert: true }, function (err) {
                                if (err) {
                                    res.send(err);
                                }
                            })
                        }
                    })
                })
            })
        }
    })
}

/*
setInterval(function () {
    var t = new Date();
    console.log("Load AQ data to database start: " + t.toLocaleDateString() + " " + t.toLocaleTimeString());
    loadAq2Db();
    t = new Date();
    console.log("Load AQ data to database end: " + t.toLocaleDateString() + " " + t.toLocaleTimeString());
}, 1000 * 60 * 10);
*/

app.get("/loadAq2Db", function (req, res) {
    loadAq2Db();
    res.send("Done!");
})


app.get("/aqJsonDb", function (req, res) {
    res.sendfile(aqJsonFile);
})


// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});
// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

module.exports = app;
