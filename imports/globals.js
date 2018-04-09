import steem from 'steem';
global.SteemNodes = new Mongo.Collection('steem-nodes');
global.SteemUsers = new Mongo.Collection('steem-users');
global.SteemAuthors = new Mongo.Collection('steem-authors');
Meteor.currentserver = null;
Meteor.setServer = (error) => {
    console.log("SERVER RESET");
    if(error && error.message && Meteor.currentserver) SteemNodes.update(Meteor.currentserver, { $push: { error: "name:" + error.message } });
    if(error) {
        console.error(error);
    }
    if(Meteor.currentserver) {
        Meteor.currentserver = SteemNodes.update(Meteor.currentserver, {$inc:{fails:1}});
    }
    const node = SteemNodes.find({},{sort:{fails:1}}).fetch()[0];
    if(node) {
        steem.api.setOptions({ url:node.url });
        Meteor.currentserver = node._id;
        SteemAuthors.find({}).forEach((user)=>{
            SteemAuthors.update(user._id, {$unset:{lastLoad:true}});
        });
   }
    console.log("STEEM NODE SET:",node.url);
}
Meteor.setServer();

global.disable = Meteor.settings.disable;
global.stream = Meteor.settings.stream;
