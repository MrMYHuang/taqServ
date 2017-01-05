'use strict';
var express = require('express');
var router = express.Router();

module.exports = function (aqFields, db, tabName) {
    // Init MongoDB tables.
    return router.get('/', function (req, res) {
        var fs = require("fs");
        var jfg = fs.readFileSync("geos.json", "utf8");
        var jGeos = JSON.parse(jfg);
        // 24 zeros.
        var zeros24 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (var s = 0; s < jGeos.length; s++) {
            var sn = jGeos[s]["SiteName"];
            var aqs = {};
            for (var a = 0; a < aqFields.length; a++) {
                var aqField = aqFields[a];
                aqs[aqField.replace(".", "_")] = zeros24.slice();
            }
            aqs["updateHour"] = 0;
            aqs["updateDate"] = "01-01";
            aqs["SiteName"] = sn;
            db.collection(tabName).insertOne(aqs, function (err, doc) {
            });
        }
        res.send("Done!");
    });
};
