import rate from './rate.js';
import steem from 'steem';
import sc2 from 'sc2-sdk';

global.voteLimiter = rate(5000, "vote");
const apiLimiter = rate(100, "api");
global.SteemVotes = new Mongo.Collection('steem-vote');
global.SteemConnectUsers = new Mongo.Collection('steem-connect-users');
global.SteemPromotion = new Mongo.Collection('steem-promotion');

global.getBandwidth = (account, market) => {

    try {
        const dynamic_global_properties = Meteor.call("steemDynamicGlobalProperties");
        const STEEMIT_BANDWIDTH_AVERAGE_WINDOW_SECONDS = 60 * 60 * 24 * 7;
        let vestingShares = parseFloat(account.vesting_shares.replace(" VESTS", ""))
        let receivedVestingShares = parseFloat(account.received_vesting_shares.replace(" VESTS", ""))
        let totalVestingShares = parseFloat(dynamic_global_properties.total_vesting_shares.replace(" VESTS", ""))
        let max_virtual_bandwidth = parseInt(dynamic_global_properties.max_virtual_bandwidth, 10)
        let average_bandwidth = parseInt(market ? account.average_market_bandwidth : account.average_bandwidth, 10)
        if (!dynamic_global_properties) {
            Meteor.setServer({ message: 'bad dynamic_global_properties' });
        }
        if (isNaN(vestingShares)) {
            Meteor.setServer({ message: 'nan vestingShares' });
        }
        if (isNaN(totalVestingShares)) {
            Meteor.setServer({ message: 'nan totalVestingShares' });
        }
        if (isNaN(average_bandwidth)) {
            Meteor.setServer({ message: 'nan average_bandwidth' });
        }
        let delta_time = ((new Date().getTime() - 7200000) - new Date(account.last_bandwidth_update + "Z").getTime()) / 1000
        if (isNaN(delta_time)) {
            Meteor.setServer({ message: 'nan delta_time' });
        }
        let bandwidthAllocated = (max_virtual_bandwidth * (vestingShares + receivedVestingShares) / totalVestingShares)
        bandwidthAllocated = Math.round(bandwidthAllocated / 1000000);
        if (isNaN(bandwidthAllocated)) {
            Meteor.setServer({ message: 'nan bandwidthAllocated' });
        }
        let new_bandwidth = 0
        if (delta_time < STEEMIT_BANDWIDTH_AVERAGE_WINDOW_SECONDS) {
            new_bandwidth = (((STEEMIT_BANDWIDTH_AVERAGE_WINDOW_SECONDS - delta_time) * average_bandwidth) / STEEMIT_BANDWIDTH_AVERAGE_WINDOW_SECONDS)
        }
        new_bandwidth = Math.round(new_bandwidth / 1000000)
        if (isNaN(new_bandwidth)) {
            Meteor.setServer({ message: 'bad new_bandwidth' });
        }
        //console.log("current bandwidth used", new_bandwidth, "allocated", bandwidthAllocated)
        //console.log("bandwidth % used", 100 * new_bandwidth / bandwidthAllocated)
        //console.log("bandwidth % remaining", 100 - (100 * new_bandwidth / bandwidthAllocated))
        //if (new_bandwidth/1024 < 200) return 0;
        if (bandwidthAllocated - new_bandwidth < 10240) bandwidth = 0;

        if (isNaN((100 * new_bandwidth / bandwidthAllocated))) {
            Meteor.setServer({ message: 'bad final bandwidth ' + new_bandwidth + ":" + bandwidthAllocated });
        }
        console.log("BANDWIDTH:" + (100 - (100 * new_bandwidth / bandwidthAllocated)));
        return (100 - (100 * new_bandwidth / bandwidthAllocated));

    } catch (e) {
        Meteor.setServer({ message: 'bad dynamic_global_properties' });
    }
}

Meteor.methods({
    steemDynamicGlobalProperties() {
        return new Promise((resolve, reject) => {
            const cache = global.dynamicGlobalProperties;
            if (cache && new Date().getTime() - global.lastDynamicGlobalPropertiesLoad < 10 * 60 * 1000) {
                resolve(cache);
            } else {
                apiLimiter.add(() => {
                    try {
                        steem.api.getDynamicGlobalProperties(function (err, result) {
                            if (!err) {
                                global.lastDynamicGlobalPropertiesLoad = new Date().getTime();
                                global.dynamicGlobalProperties = result;
                                resolve(result);
                            }
                            else {
                                Meteor.setServer(err);
                                reject(err);
                            }
                        }
                        );
                    } catch (e) {

                        Meteor.setServer(e);
                        reject(e);
                    }
                });
            }
        });
    },
    steemRewardFund() {
        return new Promise((resolve, reject) => {
            const cache = global.reward_fund;
            if (cache && new Date().getTime() - global.lastRewardFundLoad < 60000) {
                resolve(cache);
            } else {
                apiLimiter.add(() => {
                    steem.api.getRewardFund("post", function (err, result) {
                        if (!err) {
                            global.lastRewardFundLoad = new Date().getTime();
                            global.reward_fund = result;
                            resolve(result);
                        }
                        else {
                            Meteor.setServer(err);
                            reject(err);
                        }
                    }
                    );
                });
            }
        });
    },
    steemCurrentMedianHistoryPrice() {
        return new Promise((resolve, reject) => {
            const cache = global.reward_fund;
            if (cache && new Date().getTime() - global.SteemPriceLoad < 3600000) {
                resolve(cache);
            } else {
                apiLimiter.add(() => {
                    steem.api.getCurrentMedianHistoryPrice(function (err, result) {
                        if (!err) {
                            global.lastSteemPriceLoad = new Date().getTime();
                            global.steemPrice = result;
                            resolve(result);
                        }
                        else {
                            Meteor.setServer(err);
                            reject(err);
                        }
                    }
                    );
                });
            }
        });
    },
    updateVote([author, voter, weight, permlink, unvote]) {
        console.log('process upvote');
        let connectUser = SteemConnectUsers.findOne({ username: voter });
        let authorUser = SteemConnectUsers.findOne({ username: author });
        const reward = Meteor.call('predictVote', [voter]);
        if (!reward) {
            Meteor.setServer({ message: "bad reward" + reward });
            return;
        }
        const weightedReward = reward * (weight / 10000);
        const given = (connectUser.given ? connectUser.given : 0) + weightedReward;
        const gotten = (authorUser.gotten ? authorUser.gotten : 0) + weightedReward;
        const voterstats = { given, altruism: given - connectUser.gotten };
        const authorstats = { gotten, altruism: authorUser.given - gotten };
        if (SteemVotes.findOne({ username: voter, author, permlink, weight })) return;
        SteemVotes.upsert({ username: voter, author, permlink }, { $set: { username: voter, author, permlink, weight, created: new Date() } });
        SteemPromotion.find({ author }).forEach(({ _id }) => {
            SteemPromotion.update(_id, { $set: authorstats });
        });
        SteemPromotion.find({ author: voter }).forEach(({ _id }) => {
            SteemPromotion.update(_id, { $set: voterstats });
        });
        SteemPromotion.update(SteemPromotion.findOne({ author, permlink })._id, { $push: { voters: voter }, $set: { reward: (reward ? reward : 0) + weightedReward } });
        SteemConnectUsers.update(SteemConnectUsers.findOne({ username: voter }), { $set: voterstats });
        SteemConnectUsers.update(SteemConnectUsers.findOne({ username: author }), { $set: authorstats });
    },
    steemVote([author, username, weight, permlink, tries = 0, _id]) {
        if (this.connection == null) {
            //do something
        } else {
            throw (new Meteor.Error(500, 'Permission denied!'));
        }
        return new Promise((resolve, reject) => {
            const account = Meteor.call("steemGetAccount", username, true);
            const user = SteemUsers.findOne({ username });
            let connectUser = SteemConnectUsers.findOne({ username });
            const bandwidth = getBandwidth(account, false);
            const then = new Date(account.last_vote_time);
            const now = new Date();
            const seconds_since_last_vote = (now - then) / 1000;
            const vp = (seconds_since_last_vote * 10000 / 86400 / 5) + account.voting_power;
            const power = vp / 100;
            const reward = Meteor.call('predictVote', [username]);

            if (SteemVotes.findOne({ author, permlink, username }) && weight != 0) {
                console.log("prevented double vote", author, permlink);
                Meteor.call('c', [author, username, weight, permlink, false]);
                reject("prevented double vote", author, permlink);
                return;
            }
            if (SteemVotes.findOne({ author, permlink, username, weight })) {
                console.log("prevented double vote", author, permlink);
                Meteor.call('updateVote', [author, username, weight, permlink, false]);
                reject("prevented double vote", author, permlink);
                return;
            }

            console.log("VOTING:", username, author, permlink);
            if (username == author) {
                console.log("prevented self vote");
                reject("prevented self vote");
                return;
            }//test


            voteLimiter.add(
                () => {
                    if ((bandwidth < 91 || power < 91) && weight != 0) {
                        resolve(null);
                    } else {
                        if (connectUser) {
                            if (new Date(connectUser.created).getTime() < new Date(new Date()).getTime() - (1000 * 60 * 60 * 24)) {
                                console.log("REFRESHING:" + username);
                                if (new Date(connectUser.created).getTime() < new Date(new Date()).getTime() - (1000 * 60 * 60 * 24 * 7)) {
                                    connectUser = refreshSteemConnectUser(username);
                                    resolve('refreshing user ' + username);
                                    return;
                                }

                            }
                            var api = sc2.Initialize({
                                app: 'minnowschool',
                                callbackURL: 'http://127.0.0.1:3000/connectDone/',
                                accessToken: connectUser.access_token,
                                scope: ['vote', 'comment', 'offline']
                            });
                            console.log('voting via steemconnect');
                            api.vote(connectUser.username, author, permlink, weight, Meteor.bindEnvironment((err, res) => {
                                if (!err) {
                                    account.lastLoad = new Date(new Date().getTime - 1000 * 60 * 60 * 24 * 30);
                                    SteemAuthors.upsert({ name: account.name }, { $set: account });
                                    if (weight != 0) {
                                        console.log("voted");
                                        Meteor.call('updateVote', [author, connectUser.username, weight, permlink, false]);
                                        resolve("voted");
                                    } else {
                                        SteemVotes.upsert({ author, permlink }, { $set: { weight, modified: new Date() } });
                                        SteemPromotion.upsert({ author, permlink }, { $set: { cheetah: true } });
                                        console.log("unvoted");
                                        resolve("unvoted");
                                    }
                                } else {
                                    SteemVotes.insert({ username, author, permlink }, { $set: { username, author, permlink, weight } });
                                    SteemPromotion.upsert({ author, permlink }, { $inc: { votes: 1 } });
                                    console.error(err);
                                    Meteor.setServer(err);
                                    reject(err);
                                }
                            }));
                        }
                    }
                },
            );
        })
    },
    steemGetAccount(username, docache = false) {
        if (this.connection == null) {
            //do something
        } else {
            throw (new Meteor.Error(500, 'Permission denied!'));
        }
        return new Promise((resolve, reject) => {
            let cache = null;
            if (docache) {
                cache = SteemAuthors.findOne({ name: username });
            }
            if (cache && new Date().getTime() - cache.lastLoad < 60 * 1000 * 15) {
                console.log('steemGetAccount', 'resolving via cache', username);
                resolve(cache);
            } else {
                try {
                    steem.api.getAccounts([username], Meteor.bindEnvironment(function (err, result) {
                        if (!err) {
                            const [account] = result;
                            account.lastLoad = new Date();
                            if (docache) SteemAuthors.upsert({ name: account.name }, { $set: account });
                            console.log('steemGetAccount', 'resolving via api', username);
                            resolve(result.pop());
                        }
                        else {

                            Meteor.setServer(err);
                            reject(err);
                        }
                    }
                    ));
                } catch (e) {
                    Meteor.setServer(e);
                    reject(e);
                }
            }
        });
    },
    steemApiCall: ([name, args]) => {
        if (this.connection == null) {
            //do something
        } else {
            throw (new Meteor.Error(500, 'Permission denied!'));
        }
        return new Promise(
            (resolve, reject) => {
                apiLimiter.add(() => {
                    try {
                        let parameters = args;
                        if (!Array.isArray(parameters)) parameters = [args];
                        if (parameters.length) parameters.pop();
                        parameters.push(function (err, result) {
                            if (err) {
                                Meteor.setServer(err);
                                reject(err);
                            }
                            else resolve(result);
                        })
                        console.log("steem api:", name, parameters);
                        steem.api[name].apply(null, parameters);
                    } catch (error) {
                        Meteor.setServer(error);
                        reject(error);
                    }
                });
            }
        )
    }


});