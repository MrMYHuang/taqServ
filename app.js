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
    if (err) {
        console.log("MongoDB failed: " + err)
    }
    db = _db
    var initTabs = require('./routes/initTabs')(aqFields, db, tabName);
    app.use('/initTabs', initTabs);

    function loadAqJson2Db() {
        // Download AQ db json from TW EPA.
        var request = require('request');
        request('http://opendata.epa.gov.tw/webapi/api/rest/datastore/355000000I-001805/?format=json&sort=SiteName&token=EVrPslGk9U2ftHxkwwkW4g', updateAllSites2Db)
    }

    function updateAllSites2Db(error, response, body) {
        if (error || response.statusCode != 200) {
            console.log(error)
            return
        }

        if (body != "") {
            // Read json.
            var fs = require("fs")
            // Save to file.
            fs.writeFileSync(aqJsonFile, body, 'utf8')
            fs.closeSync()
        }
        var jb = JSON.parse(body)
        var jTaqs = jb.result.records;

        // Loop for each site.
        // Use let for async calls, not var here!
        for (let s = 0; s < jTaqs.length; s++) {
            updateOneSite2Db(jTaqs[s])
        }
    }

    function updateOneSite2Db(jTaq) {
        db.collection(tabName).findOne({ SiteName: jTaq["SiteName"] }, (err, doc) => {
            if (err) {
                console.log("MongoDB failed: " + err)
                return
            }

            updateAllAqs2Db(err, doc, jTaq)
        })
    }

    function updateAllAqs2Db(err, doc, jTaq) {
        if (doc == null) {
            return
        }

        var aqs = doc;
        var id = aqs._id;
        delete aqs._id;

        var pubHour = Number(String(jTaq["PublishTime"]).substring(11, 13));
        aqs["updateDate"] = String(jTaq["PublishTime"]).substring(5, 10);
        aqs["updateHour"] = pubHour;

        // Loop for each AQ.
        var v;
        for (var a = 0; a < aqFields.length; a++) {
            var aqField = aqFields[a];
            // MongoDB disallows "." in a field name.
            // Convert to 0 if is NaN.
            aqs[aqField.replace(".", "_")][pubHour] = isNaN(v = parseFloat(jTaq[aqField])) ? 0 : v;
        }
        // Update DB.
        db.collection(tabName).updateOne({ _id: id }, aqs, { upsert: true }, (err) => {
            if (err) {
                console.log(err)
                return
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
        loadAqJson2Db();
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
        var fs = require("fs")
        if (!fs.existsSync(aqJsonFile)) {
            loadAqJson2Db()
        }

        res.sendfile(aqJsonFile);
    })

    app.post("/aqJsonDb", function (req, res) {
        var jReq = req.body
        db.collection(usersTabName).findOne({ uid: jReq.uid, pwd: jReq.pwd }, function (err, doc) {
            if (err || doc == null) {
                res.send({ error: "Authentication failed!" })
            }
            else {
                var fs = require("fs")
                if (!fs.existsSync(aqJsonFile)) {
                    loadAqJson2Db()
                }

                var aqJson = JSON.parse(fs.readFileSync(aqJsonFile, 'utf8'))
                aqJson.error = ""
                res.json(aqJson);
            }
        })
    })

    var auth0Domain = "myh.auth0.com";
    var validateUserTokenUri = "https://" + auth0Domain + "/userinfo"

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

    app.post("/userReg", function (taqReq, taqRes) {
        var jReq = taqReq.body
        var options = {
            url: validateUserTokenUri,
            headers: {
                "Authorization": "Bearer " + jReq.userToken,
                "content-type": "application/json"
            }
        };
        var request = require('request');
        // Validate Aut0 token.
        request(options, function (error, fbRes, body) {
            if (fbRes.statusCode != 200) {
                taqRes.send({ error: "Bad user token. Respose from Auth0: " + body })
            }
            else {
                var jFbRes = JSON.parse(body)
                var uid = jFbRes.user_id
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
