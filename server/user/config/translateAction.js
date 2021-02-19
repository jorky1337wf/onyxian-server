var dict = {
  action: {
    user: {
      registered: 'User has registered',
      authenticated: 'User is logged in',
      visited: {
        main: 'Visited the main page',
        wallet: 'Visited the wallet',
        profile: 'Visited his profile',
        contract: 'Visited the contract',
        about: 'Visited the about page',
        terms: 'Visited the terms page',
        trading: 'Visited the trading',
        404: 'Got lost',
      },
      transfer: 'Transfered his coins',
      deposit: 'Requested a deposit',
      withdrawal: 'Requested a withdrawal',
      nameChanged: 'User has changed his personality to',
      passwordChanged: 'User has changed his password',
    },
  },
}

module.exports = {
  translate: chain => {
    var separated = chain.split('.')
    var res = dict

    separated.forEach(el => {
      res = res[el]
    })

    return res
  },
}
