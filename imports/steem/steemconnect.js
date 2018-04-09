const config = Meteor.settings.steemconnect;
let steem;

var https = require('https');
var querystring = require('querystring');

global.refreshSteemConnectUser = (username) => {
    const user = SteemConnectUsers.findOne({ username });
    if (!user) return;
    var postData = querystring.stringify({
        refresh_token: user.refresh_token,
        client_id: "minnowschool",
        client_secret: config.session.secret,
        grant_type: "refresh_token"
    });
    var options = {
        host: 'v2.steemconnect.com',
        port: 443,
        method: 'POST',
        path: '/api/oauth2/token',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': postData.length
        }
    };
    var req = https.request(options, Meteor.bindEnvironment(function (res) {
        var result = '';
        res.on('data', function (chunk) {
            result += chunk;
        });
        res.on('end', Meteor.bindEnvironment(() => {
            const data = JSON.parse(result);
            data.created = new Date();
            if (data.access_token) SteemConnectUsers.upsert({ username: data.username }, { $set: data });
            console.log(data);
        }));
        res.on('error', function (err) {
            console.log(err);
        })
    }));

    // req error
    req.on('error', function (err) {
        console.log(err);
    });

    //send request witht the postData form
    req.write(postData);
    req.end();
}

Meteor.methods({
    connectDone({ code }, url) {
        // form data
        var postData = querystring.stringify({
            code: code,
            client_id: "minnowschool",
            client_secret: config.session.secret,
            grant_type: "authorization_code"
        });

        // request option
        var options = {
            host: 'v2.steemconnect.com',
            port: 443,
            method: 'POST',
            path: '/api/oauth2/token',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': postData.length
            }
        };
        var req = https.request(options, Meteor.bindEnvironment(function (res) {
            var result = '';
            res.on('data', function (chunk) {
                result += chunk;
            });
            res.on('end', Meteor.bindEnvironment(() => {
                const data = JSON.parse(result);
                data.created = new Date();
                if (SteemConnectUsers.findOne({ username: data.username })) {
                    SteemConnectUsers.update({ username: data.username }, { $set: data });
                } else {
                    SteemConnectUsers.insert(data);
                }
                console.log(data);
            }));
            res.on('error', function (err) {
                console.log(err);
            })
        }));

        // req error
        req.on('error', function (err) {
            console.log(err);
        });

        //send request witht the postData form
        req.write(postData);
        req.end();

    }
});

module.exports = steem;