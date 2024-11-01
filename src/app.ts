import path from 'path';
import { MongoClient, Db, WithId, Document } from 'mongodb';
import express from 'express';
import axios, { AxiosResponse } from 'axios';
import {params} from './Params';
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

import { router as routes } from './routes/index';
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
export var app = express();

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/', routes);
/*
app.use('/users', users);
*/

var aqJsonFile = 'taqi.json'

var tabName = "epatw";
var usersTabName = "users"

// Connect to MongoDB.
let db: Db;

const client = new MongoClient(params.MongoDBUrl);

async function init() {
    try {
        await client.connect();
        db = client.db("taqv2");
        console.log("MongoDB connection succeeds!");
    } catch (error) {
        console.log("MongoDB failed: " + error);
    }
}
init();

app.use('/initTabs', function (req, res) {
    //require('./routes/initTabs')(aqFields, db, tabName);
    res.send("Done!");
});

async function loadAqJson2Db() {
    // Download AQ db json from TW EPA.
    const res = await axios.get('https://data.moenv.gov.tw/api/v2/aqx_p_432?format=JSON&limit=10000&api_key=' + params.EpatwAqiDataServToken, {
        responseType: 'json',
    });
    return updateAllSites2Db(res);
}

let jTaqs: any;
let aqFields: string[] = [];
const scalarFields = ['sitename', 'siteid', 'county', 'publishtime', 'longitude', 'latitude'];
async function updateAllSites2Db(response: AxiosResponse) {
    if (response.status != 200) {
        console.log(response.statusText);
        return
    }

    jTaqs = await response.data;
    aqFields = jTaqs.fields.map((f: any) => f.id).filter((f: string) => !scalarFields.some(v => v === f));
    var fs = require("fs")
    // Save to file.
    fs.writeFileSync(aqJsonFile, JSON.stringify(jTaqs), 'utf8');

    // Loop for each site.
    // Use let for async calls, not var here!
    for (let s = 0; s < jTaqs.records.length; s++) {
        updateOneSite2Db(jTaqs.records[s])
    }
}

async function updateOneSite2Db(jTaq: any) {
    const sitename = jTaq["sitename"];
    try {
        let doc = await db.collection(tabName).findOne({ sitename });
        if (doc == null) {
            var zeros24 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            var aqs: any = {};
            for (var a = 0; a < aqFields.length; a++) {
                var aqField = aqFields[a];
                aqs[aqField.replace(".", "_")] = zeros24.slice();
            }
            aqs["updateHour"] = 0;
            aqs["updateDate"] = "01-01";
            aqs["sitename"] = sitename;
            const res = await db.collection(tabName).insertOne(aqs);
            doc = await db.collection(tabName).findOne({ sitename });
        }

        updateAllAqs2Db(doc!, jTaq)
    } catch (err) {
        console.error("MongoDB failed: " + err);
        return;
    }
}

async function updateAllAqs2Db(doc: WithId<Document>, jTaq: any) {

    var aqs = doc;
    var id = aqs._id;

    var pubHour = Number(String(jTaq["publishtime"]).substring(11, 13));
    aqs["updateDate"] = String(jTaq["publishtime"]).substring(5, 10);
    aqs["updateHour"] = pubHour;
    scalarFields.forEach((f) => {
        aqs[f] = jTaq[f];
    });

    // Loop for each AQ.
    var v;
    for (var a = 0; a < aqFields.length; a++) {
        var aqField = aqFields[a];
        // MongoDB disallows "." in a field name.
        // Convert to 0 if is NaN.
        aqs[aqField.replace(".", "_")][pubHour] = isNaN(v = parseFloat(jTaq[aqField])) ? 0 : v;
    }
    // Update DB.
    try {
        await db.collection(tabName).updateOne({ _id: id }, { $set: aqs }, { upsert: true });
    } catch (error) {
        console.error(error);
    }
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
    try {
        loadAqJson2Db();
        res.send("Done!");
    }
    catch (error) {
        console.error(error);
        res.send(error);
    }
});

// Get aq data of siteName. Depreciated.
app.get("/" + tabName, async function (req, res) {
    var siteName = req.query.siteName;
    try {
        const doc = await db.collection(tabName).findOne({ sitename: siteName });
        res.json(doc);
    } catch (error) {
        console.error(error);
        res.send({ error: error });
    }
});

// Get aq data of siteName.
app.post("/" + tabName, async function (req, res) {
    var siteName = req.query.siteName;
    var jReq = req.body;
    try {
        const doc = await db.collection(usersTabName).findOne({ uid: jReq.uid, pwd: jReq.pwd });

        if (doc == null) {
            throw new Error("doc is null");
        } else {
            try {
                let doc2 = await db.collection(tabName).findOne({ sitename: siteName });
                if (doc2 == null) {
                    throw new Error("doc2 is null");
                } else {
                    doc2.error = "";
                    res.json(doc2);
                }
            } catch (error) {
                console.error(error);
                res.send({ error: "Table not found!: " + siteName });
                return
            }
        }
    } catch (error) {
        console.error(error);
        res.send({ error: "Authentication failed!" });
    }
});

// Depreciated.
app.get("/aqJsonDb", function (req, res) {
    var fs = require("fs")
    if (!fs.existsSync(aqJsonFile)) {
        loadAqJson2Db()
    }

    res.sendfile(aqJsonFile);
})

app.post("/aqJsonDb", async function (req, res) {
    var jReq = req.body
    try {
        const doc = await db.collection(usersTabName).findOne({ uid: jReq.uid, pwd: jReq.pwd });
        if (doc == null) {
            throw new Error("doc is null");
        } else {
            var fs = require("fs");
            let aqJson: any = {};
            if (!fs.existsSync(aqJsonFile)) {
                loadAqJson2Db()
                aqJson.error = "Database is not ready.";
                res.json(aqJson);
            } else {
                var jStr;
                try {
                    jStr = fs.readFileSync(aqJsonFile, 'utf8')
                    aqJson = JSON.parse(jStr)
                    aqJson.error = ""
                }
                catch (err) {
                    aqJson.error = err + ": " + jStr
                }
                finally {
                    res.json(aqJson)
                }
            }
        }
    } catch (error) {
        console.error(error);
        res.send({ error: "Authentication failed!" });
    }
})

var validateUserTokenUri = "https://" + params.auth0Domain + "/userinfo"

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

app.post("/userReg", async function (taqReq, taqRes) {
    var jReq = taqReq.body;
    const fbRes = await axios.get(validateUserTokenUri, {
        headers: {
            "Authorization": "Bearer " + jReq.userToken,
            "content-type": "application/json"
        },
        responseType: 'json',
    })
    const jFbRes = fbRes.data;

    if (fbRes.status != 200) {
        taqRes.send({ error: "Bad user token. Respose from Auth0: " + jFbRes })
    } else {
        var uid = jFbRes.sub;
        // Check if a registered user
        try {
            const doc = await db.collection(usersTabName).findOne({ uid: uid })
            if (doc) {
                taqRes.send({ error: "", pwd: doc.pwd })
            } else {
                // Not a registered user.
                var userPwd = genUserPwd()
                await db.collection(usersTabName).insertOne({ uid: uid, pwd: userPwd, email: jReq.email });
                taqRes.send({ error: "", pwd: userPwd });
            }
        } catch (error) {
            console.error(error);
            taqRes.send({ error: error });
        }
    }
});

/*
// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error(`Not Found ${req.originalUrl}`);
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
*/
