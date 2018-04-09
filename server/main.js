import { Meteor } from 'meteor/meteor';
import '/imports/';
import util from 'util';
import '../imports/startup/server';

const exec = util.promisify(require('child_process').exec);

global.Electron = new Mongo.Collection('electron');
if (!Electron.findOne()) {
    Electron.insert({ lastrun: false });
}

Meteor.publish("allUserData", function () {
    return Meteor.users.find({}, { fields: { 'steem.username': 1 } });
});

Meteor.publish("steem-authors", function () {
    return SteemAuthors.find({}, { sort: { vote_payout: -1 }, limit: 50 });
});

Meteor.publish("userData", function () {
    return Meteor.users.find({ _id: this.userId },
        { fields: { 'steem.username': 1 } });
});



