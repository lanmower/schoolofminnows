const users = {};

const rateLimiter = (rate, name) => {
    const queue = [];
    var lastrun = new Date();
    const interval = setInterval(Meteor.bindEnvironment(() => {
        if (new Date().getTime() - lastrun.getTime() > rate) {
            if (queue.length == 0) return;
            try {
                queue[0]();
                lastrun = new Date();
            } catch (e) {
                Meteor.setServer(e);
            } finally {
                queue.shift();
            }
        }
    }), 100);
    return {
        add: (call) => {
            try {
                queue.push(call)
            } catch (e) {
                Meteor.setServer(e);
            }
        }
    };
}


export default rateLimiter;