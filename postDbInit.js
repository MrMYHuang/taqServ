function postDbInit(app, db) {
    var aqFieldsOrig = ["AQI", "PM2.5", "PM2.5_AVG", "PM10", "PM10_AVG", "O3", "O3_8hr", "CO", "CO_8hr", "SO2", "NO2", "NOx", "NO", "WindSpeed", "WindDirec"];

    var aqFields = ["AQI", "PM2_5", "PM2_5_AVG", "PM10", "PM10_AVG", "O3", "O3_8hr", "CO", "CO_8hr", "SO2", "NO2", "NOx", "NO", "WindSpeed", "WindDirec"];

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

    var aqJsonFile = 'taqi.json'
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
                                    var aqFieldOrig = aqFieldsOrig[a];
                                    var aqField = aqFields[a];
                                    aqs[aqField][pubHour] = isNaN(v = parseFloat(jTaq[aqFieldOrig])) ? 0 : v;
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
}
module.exports = postDbInit