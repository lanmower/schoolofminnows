import steem from 'steem';
import './collections.js';
import './api.js';
import './reward.js';
import steemconnect from './steemconnect.js';
import crypto from 'crypto';
import './chess.js';
import './boost.js';
global.steemconnect = steemconnect;
let available = [];
const promotion = Meteor.bindEnvironment(() => {
    try {
        available = [];
        const time = new Date().getTime();
        const ago = new Date();
        ago.setDate(new Date().getDate() - 3);
        const checkUser = ({ username, _id }) => {

            let account = null;
            try {
                account = Meteor.call("steemGetAccount", username, true);
            } catch (e) {
                Meteor.setServer(e);
                return 1;
            }

            const bandwidth = getBandwidth(account, false);
            const then = new Date(account.last_vote_time);
            const seconds_since_last_vote = (time - then) / 1000;
            const vp = (seconds_since_last_vote * 10000 / 86400 / 5) + account.voting_power;
            const power = vp / 100;
            const hours = (0.5 * (100 - Number(power).toFixed(3))) * 2.4;
            SteemConnectUsers.update(_id, { $set: { wait: time + (hours * 1000 * 60 * 60) } })
            if (bandwidth >= 99 && power >= 100) {
                available.push(username);
                return 1;
            } else return 1;
        };
        let calls = 0;
        SteemConnectUsers.find({ manual: { $exists: false }, $or: [{ wait: { $lt: time } }, { wait: { $exists: false } }] }).forEach((user) => {
            if (calls < 3) {
                calls += checkUser(user);
            }
        });
        if (calls == 0) {
            busy = SteemConnectUsers.findOne({ manual: { $exists: false } }, { sort: { wait: 1 } }).wait;
        } else {
            busy = new Date().getTime() + 180000;
        }

        while (available.length) {
            const startLength = available.length;
            for (var x in available) {
                const username = available[x];
                const promo = SteemPromotion.findOne({ created: { $gt: ago }, cheetah: { $exists: false }, ignore: { $exists: false }, author: { $ne: username }, voters: { $nin: [username] } }, { sort: { altruism: -1 } });
                if (!promo) continue;
                const { author, permlink } = promo;
                let weight = 8000 + Math.round(Math.random() * 1000);
                const reward = Meteor.call('predictVote', [username]);
                if (reward > 0.05) weight = Math.round(10000 * (0.05 / reward));
                try {
                    Meteor.call("steemVote", [author, username, weight, permlink]);
                } catch (e) {

                }
                delete available[x];
            }
            const endLength = available.length;
            if (startLength == endLength) break;
        }
    } catch (e) {
        console.error(e);
    }
});

if (!disable) {
    let busy = new Date().getTime();
    const run = () => {
        try {
            if (new Date().getTime() < busy) {
                console.log("Sleeping till:" + new Date(busy));
                return;
            }
            promotion();
        } catch (e) {
            console.error(e);
        }
    }
    setInterval(run, 10000);
}
Meteor.methods({
    promote([author, permlink]) {
        const user = SteemConnectUsers.findOne({ username: author });
        const { given, gotten } = user;
        if (this.connection == null) {
            //do something
        }
        else {
            throw (new Meteor.Error(500, 'Permission denied!'));
        }
        const date = new Date();

        if (SteemUsers.findOne({ username: author })) {
            DiscordQueue.insert({ server: "steemPunks", channel: "post-promotion", message: "$upvote http://steemit.com/@" + author + "/" + permlink });
        }
        SteemPromotion.upsert({ author, permlink }, { $set: { created: date, author, permlink, voters: [], given, reward: 0, gotten, altruism: given - gotten } });
    }
})

