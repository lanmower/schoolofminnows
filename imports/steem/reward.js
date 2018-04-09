import steem from 'steem';
import moment from 'moment';

function calculateWeight(shares) {
  return Math.sqrt(shares);
}

function calculatePenalty(post_created, current_time) {
  return Math.min(1, Math.max(0,
    (current_time - post_created) / (30 * 60 * 1000)
  ));
}
function getVoteShares(voter_effective_shares, voter_voting_power, vote_strength) {
  voter_voting_power = voter_voting_power || 10000;
  vote_strength = vote_strength || 10000;
  return Math.floor(voter_effective_shares * getUsedSharesRatio(voter_voting_power, vote_strength));
  function getUsedSharesRatio(voter_voting_power, vote_strength) {
    voter_voting_power *= vote_strength / 10000;
    var used_power = voter_voting_power * 2 / 100;
    used_power += 98 / 100;
    return used_power / 10000;
  }
}
function getEffectiveVestingShares(account) {
  const vesting_shares = Number(account['vesting_shares'].replace(" VESTS", '')) * 1000000;
  const received_vesting_shares = Number(account['received_vesting_shares'].replace(" VESTS", '')) * 1000000;
  const delegated_vesting_shares = Number(account['delegated_vesting_shares'].replace(" VESTS", '')) * 1000000;

  return vesting_shares + received_vesting_shares - delegated_vesting_shares;
}

function predictVoteCalc(account) {
      const dynamic_global_properties = Meteor.call("steemDynamicGlobalProperties");
      const reward_fund = Meteor.call("steemRewardFund");
      const steemPrice = Meteor.call("steemCurrentMedianHistoryPrice");

      var effective_vesting_shares = getEffectiveVestingShares(account);
      var vote_shares = getVoteShares(effective_vesting_shares, account.voting_power);
      const totalSteem = Number(dynamic_global_properties.total_vesting_fund_steem.split(' ')[0]);
      const totalVests = Number(dynamic_global_properties.total_vesting_shares.split(' ')[0]);
      const userVests = effective_vesting_shares;
      const sp = totalSteem * (userVests / totalVests) / 1000000;

      const reward_fraction = vote_shares
        / parseInt(reward_fund.recent_claims, 10);

      const vote_expected_payout = reward_fraction * parseFloat(reward_fund.reward_balance.replace(' STEEM', '')) * parseFloat(steemPrice.base.replace(' SBD', '')) ;
      account.vote_payout = vote_expected_payout;
      account.vote_ratio = 10 / vote_expected_payout;
      SteemAuthors.upsert({ id: account.id }, { $set: { vote_payout:account.vote_payout } });
      return vote_expected_payout;
}

Meteor.methods({
  predictVote(args) {
    return new Promise((resolve, reject) => {
      const [name,data] = args;
      let post_expected_payout, promises = [];
      console.log('getting account for vote predict');
      const account = Meteor.call("steemGetAccount", name, true);
      console.log('calculating vote predict');
      resolve(predictVoteCalc(account));
    });
  },
  discordclaimabalances([username, reply]) {
      const account = Meteor.call("steemGetAccount", username, true);
      const user = SteemUsers.findOne({username});
      steem.broadcast.claimRewardBalance(user.wif, user.username, account.reward_steem_balance, account.reward_sbd_balance, account.reward_vesting_balance, function(err, result) {
        console.log(err, result);
      });
      reply(account.reward_steem_balance+"STEEM "+account.reward_sbd_balance+"SBD "+account.reward_vesting_balance);
  }
});


