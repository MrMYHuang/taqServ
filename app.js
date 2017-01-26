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

var aqFields = ["AQI", "PM2.5", "PM2.5_AVG", "PM10", "PM10_AVG", "O3", "O3_8hr", "CO", "CO_8hr", "SO2", "NO2", "NOx", "NO", "WindSpeed", "WindDirec"];

var tabName = "epatw";
var usersTabName = "users"

// Connect to MongoDB.
var db;
var MONGODB_URI = process.env.MONGODB_URI;
//var MONGODB_URI = "YourMongoDbUri"
//var MONGODB_URI = "YourMongoDbUri"
mongodb.MongoClient.connect(MONGODB_URI, function (err, _db) {
    db = _db
    var initTabs = require('./routes/initTabs')(aqFields, db, tabName);
    app.use('/initTabs', initTabs);

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

    // Get aq data of siteName. Depreciated.
    app.get("/" + tabName, function (req, res) {
        var siteName = req.query.siteName;
        db.collection(tabName).findOne({ SiteName: siteName }, function (err, doc) {
            res.json(doc);
        })
    });

    // Get aq data of siteName.
    app.post("/" + tabName, function (req, res) {
        var siteName = req.query.siteName;
        var jReq = req.body
        db.collection(usersTabName).findOne({ uid: jReq.uid, pwd: jReq.pwd }, function (err, doc) {
            if (err || doc == null) {
                res.send({ error: "Authentication failed!" })
            }
            else {
                db.collection(tabName).findOne({ SiteName: siteName }, function (err, doc) {
                    doc.error = ""
                    res.json(doc)
                })
            }
        })
    });

    // Depreciated.
    app.get("/aqJsonDb", function (req, res) {
        res.sendfile(aqJsonFile);
    })

    app.post("/aqJsonDb", function (req, res) {
        var jReq = req.body
        db.collection(usersTabName).findOne({ uid: jReq.uid, pwd: jReq.pwd }, function (err, doc) {
            if (err || doc == null) {
                res.send({ error: "Authentication failed!" })
            }
            else {
                var fs = require('fs')
                var aqJson = JSON.parse(fs.readFileSync(aqJsonFile, 'utf8'))
                aqJson.error = ""
                res.json(aqJson);
            }
        })
    })

    var fbAppId = "1802120716705558";
    var fbAppSecret = "6c2dec21d57d8c6392bc2d7ba08c943e";
    var longTokenBaseUri = "https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=" + fbAppId + "&client_secret=" + fbAppSecret + "&fb_exchange_token="

    var request = require('request');

    var fbAppToken
    var fbAppTokenUri = "https://graph.facebook.com/oauth/access_token?client_id=" + fbAppId + "& client_secret=" + fbAppSecret + "&grant_type=client_credentials"
    var validateUserTokenBaseUri
    // Get Facebook app access token.
    request(fbAppTokenUri, function (error, resFb, body) {
        fbAppToken = body.match(/access_token=(.*)/)[1]
        validateUserTokenBaseUri = "https://graph.facebook.com/debug_token?access_token=" + fbAppToken + "&input_token="
    })

    function genUserPwd(userPwdLen = 16) {
        var crypto = require('crypto');
        var userPwd = ""
        var randNums = crypto.randomBytes(userPwdLen)
        // ASCII printable character count.
        var printableCnt = 0x5f
        for (var i = 0; i < userPwdLen; i++) {
            // Get a printable character.
            userPwd += String.fromCharCode((randNums[i] % printableCnt) + 0x20)
        }
        return userPwd;
    }

    app.post("/UserReg", function (taqReq, taqRes) {
        var jReq = taqReq.body
        // Validate Facebook token.
        var validateUserTokenUri = validateUserTokenBaseUri + jReq.userToken
        request(validateUserTokenUri, function (error, fbRes, body) {
            var jFbRes = JSON.parse(body)
            if (jFbRes.error || jFbRes.data.is_valid == false || jFbRes.data.app_id != fbAppId) {
                taqRes.send({ error: "Bad Facebook user token." })
            }
            else {
                var uid = jFbRes.data.user_id
                // Check if a registered user
                db.collection(usersTabName).findOne({ uid: uid }, function (err, doc) {
                    if (doc) {
                        taqRes.send({ error: "", pwd: doc.pwd })
                    }
                    // Not a registered user.
                    else {
                        var userPwd = genUserPwd()
                        db.collection(usersTabName).insertOne(
                            { uid: uid, pwd: userPwd, email: jReq.email },
                            function (err, doc) {
                                taqRes.send({ error: "", pwd: userPwd })
                            });
                    }
                })
            }
        })
    })

    app.get("/fbLongToken", function (req, res) {
        var longTokenUri = longTokenBaseUri + req.query.shortToken;
        var request = require('request');
        request(longTokenUri, function (error, resFb, body) {
            if (!error) {
                var access_token = body.match(/access_token=(.*)&/)
                if (access_token) {
                    res.send({ state: "ok", longToken: access_token[1] })
                }
                else {
                    res.send({ state: "err" })
                }
            }
        })
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
})

module.exports = app;
