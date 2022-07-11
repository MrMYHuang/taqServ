
import express from 'express';
export var router = express.Router();

/* GET home page. */
router.get('/', function (req, res) {
    res.send('Hello!');
});
