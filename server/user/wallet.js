const _ = require('underscore')
const Client = require('coinbase/lib/Client')
const CoinGecko = require('coingecko-api')
const CoinGeckoClient = new CoinGecko()
const CAValidator = require('cryptocurrency-address-validator')
const WAValidator = require('@swyftx/api-crypto-address-validator')

const User = require('../models/User')
const Transaction = require('../models/Transaction')
const Deposit = require('../models/Deposit')
const Withdrawal = require('../models/Withdrawal')

const { networkToCurrency } = require('./middleware')

const Role = require('./roles')

const launch = require('../launchLog')
const time = require('../time')
const garbageCollector = require('../garbageCollector')

require('dotenv/config')
require('colors')

CoinGecko.TIMEOUT = 9999999

var currentPriceList = {}
const CoinbaseClient = new Client({
  apiKey: process.env.COINBASE_KEY,
  apiSecret: process.env.COINBASE_SECRET,
  strictSSL: false,
  version: '2020-06-30',
})

ExchangeBase = {
  accounts: {
    // base sctructure
    BTC: [],
    ETH: [],
    LTC: [],
  },
  addresses: {
    BTC: [],
    ETC: [],
    LTC: [],
  },
  transactions: [
    {
      email: 'a@b.c',
      transaction: {},
      address: 'iosajdajdisoajd9asdkaskd',
    },
  ],
  availableAddresses: [],
}

const fetchCoinbaseData = done => {
  return new Promise(resolve => {
    launch.log('Fetching Coinbase data')
    CoinbaseClient.getAccounts(null, (err, accs) => {
      if (err) {
        launch.error('Failed to connect to Coinbase account (' + err + ')')
      } else {
        accs = accs.filter(a => ['BTC', 'ETH', 'LTC'].includes(a.currency.code))

        launch.sublog('accounts: ' + accs.length)

        if (accs && accs.length != 3) {
          console.log(
            'CoinBase: The list of available accounts is not complete.',
          )
          return
        }

        accs.forEach(acc => {
          ExchangeBase.accounts[acc.currency.code] = acc
          // acc.getTransactions({}, (err, data) => {
          //   console.log(
          //     data.filter(
          //       t => +new Date(t.created_at) > +new Date() - 24 * 60 * 60000,
          //     ),
          //   )
          // })
        })

        getAvailableAddresses().then(availableAddresses => {
          launch.sublog('available addresses: ' + availableAddresses.length)
          getAllAddresses().then(async addresses => {
            launch.sublog("addresses' objects: " + addresses.length)
            refreshTransactions(addresses, 4).then(transactions => {
              launch.sublog(
                "transactions' objects: " + ExchangeBase.transactions.length,
              )
              console.log('\nAll Coinbase data has been fetched.'.grey)
              done()
              resolve()
            })
          })
        })
      }
    })
  })
}

launch.log("Let's go!", done => {
  fetchCoinbaseData(done).then(() => {
    garbageCollector.collect().then(() => {
      syncTransactions()
    })
  })
})

////////

const getAvailableAddresses = () => {
  return new Promise(resolve => {
    var addresses = []

    Deposit.find({ visible: true }, (err, deposits) => {
      User.find({}, (err, users) => {
        var usersIDS = users.map(u => u._id)
        deposits = deposits.filter(
          d => usersIDS.includes(d.user) && d.status != 'failed',
        )

        deposits.forEach(d => {
          addresses.push(d.address)
        })

        users.forEach(u => {
          addresses.push(u.wallets.bitcoin.address)
          addresses.push(u.wallets.litecoin.address)
          addresses.push(u.wallets.ethereum.address)
        })

        ExchangeBase.availableAddresses = addresses
        resolve(addresses)
      })
    })
  })
}

const getAccountAddresses = network => {
  return new Promise(resolve => {
    const NET = network.toUpperCase()
    if (ExchangeBase.accounts[NET]) {
      ExchangeBase.accounts[NET].getAddresses({}, (err, addresses) => {
        if (!err) {
          addresses = addresses.filter(a =>
            ExchangeBase.availableAddresses.includes(a.address),
          )
          ExchangeBase.addresses[NET] = addresses
          resolve(addresses)
        } else console.log('ExchangeBase.accounts[NET].getAddresses: ' + err)
      })
    } else {
      resolve([])
    }
  })
}

const getAllAddresses = onlyAddresses => {
  return new Promise((resolve, reject) => {
    var result = {
      bitcoin: [],
      litecoin: [],
      ethereum: [],
    }

    getAccountAddresses('btc')
      .then(btc => {
        getAccountAddresses('ltc')
          .then(ltc => {
            getAccountAddresses('eth')
              .then(eth => {
                var addresses = [...btc, ...ltc, ...eth]

                if (onlyAddresses) {
                  addresses.forEach(address => {
                    result[address.uri_scheme].push({
                      address: address.address,
                      user: address.name,
                    })
                  })

                  resolve(result)
                } else {
                  resolve(addresses)
                }
              })
              .catch(err => {
                reject(err)
                console.log('err: ' + err)
              })
          })
          .catch(err => {
            reject(err)
            console.log('err: ' + err)
          })
      })
      .catch(err => {
        reject(err)
        console.log('err: ' + err)
      })
  })
}

const refreshTransactions = async (addresses, maxConcurrent) => {
  ExchangeBase.transactions = []

  for (let net of Object.keys(addresses)) {
    var chunks = _.chunk(addresses[net], maxConcurrent)

    for (let chunk of chunks) {
      await new Promise(resolve => {
        var pending = []

        for (let address of chunk) {
          pending.push(
            new Promise(resolve => {
              address.getTransactions({}, (err, transactions) => {
                ExchangeBase.transactions = !transactions
                  ? [...ExchangeBase.transactions]
                  : [
                      ...ExchangeBase.transactions,
                      ...transactions.map(t => {
                        return {
                          email: address.name,
                          entity: t,
                          address: address.address,
                        }
                      }),
                    ]
                resolve()
              })
            }),
          )
        }

        Promise.all(pending).then(() => {
          resolve()
        })
      })
    }
  }

  return ExchangeBase.transactions
}

////////

const currencyToNET = currency =>
  ({
    bitcoin: 'BTC',
    litecoin: 'LTC',
    ethereum: 'ETH',
  }[currency.toLowerCase()])

const netToCurrency = net =>
  ({
    BTC: 'bitcoin',
    LTC: 'litecoin',
    ETH: 'ethereum',
  }[net.toUpperCase()])

////////

const getLinearChartPrices = () => {
  CoinGeckoClient.coins.all().then(prices => {
    prices.data.forEach(coin => {
      currentPriceList[coin.id] = {
        id: coin.id,
        price: coin.market_data.current_price.usd,
      }
    })
  })
}

////////

const createNewAddress = (NET, email) => {
  return new Promise((resolve, reject) => {
    ExchangeBase.accounts[NET].createAddress(
      {
        name: email,
      },
      (err, address) => {
        if (!err) {
          if (!ExchangeBase.addresses[address.account.currency.code]) {
            reject()
          } else {
            ExchangeBase.addresses[address.account.currency.code].push(address)
            ExchangeBase.availableAddresses.push(address.address)

            resolve(address)
          }
        } else {
          reject(err)
        }
      },
    )
  })
}

const createUserWallets = async email => {
  let wallets = {}
  let currencies = Object.keys(ExchangeBase.accounts)

  for (let NET of currencies) {
    await new Promise(resolve => {
      createNewAddress(NET, email)
        .then(newAddress => {
          const address = newAddress.deposit_uri.split(':')[1]
          const currency = newAddress.deposit_uri.split(':')[0]

          wallets[currency] = {
            balance: 0,
            address,
          }

          resolve(wallets)
        })
        .catch(err => {
          console.log('err: ' + err)
          throw err
        })
    })
  }

  return wallets
}

const createDeposit = ({ email, currency, amount, userid, completed, at }) => {
  return new Promise((resolve, reject) => {
    if (!at) at = +new Date()
    let NET = currencyToNET(currency)

    createNewAddress(NET, email)
      .then(depositAddress => {
        const address = depositAddress.deposit_uri.split(':')[1]
        const type = CAValidator.getAddressType(depositAddress.address)
        var url = ''

        ExchangeBase.addresses[depositAddress.account.currency.code].push(
          depositAddress,
        )

        if (type === null) {
          url = 'https://www.blockchain.com/eth/address/' + address
        } else if (type == '05') {
          url = 'https://www.blockchain.com/btc/address/' + address
        } else if (type == 32) {
          url = 'https://live.blockcypher.com/ltc/address/' + address
        }

        User.findById(userid, (err, user) => {
          if (!err) {
            Deposit.find({}, (err, deposits) => {
              if (!err && deposits) {
                let payment = deposits.length

                new Deposit({
                  at,
                  address,
                  user: userid,
                  userEntity: user,
                  network: NET,
                  amount,
                  fake: true,
                  url,
                  status: completed ? 'completed' : 'processing',
                }).save((err, deposit) => {
                  if (!err && deposit) {
                    resolve({
                      payment,
                      address,
                      network: NET,
                      amount,
                      user: userid,
                      name: deposit.name,
                      status: deposit.status,
                      at: deposit.at,
                      exp: deposit.exp,
                    })
                  } else {
                    console.log('id9Dras err: ' + err)
                    reject()
                  }
                })
              } else {
                reject({
                  message: "Can't get a number of payment.",
                })
              }
            })
          } else {
            console.log('err: ' + err)
            reject({
              message: "Can't find the user.",
            })
          }
        })
      })
      .catch(err => {
        console.log('d0ka8 err: ' + err)
        reject({
          message: "Can't create a deposit address.",
        })
      })
  })
}

const createWithdrawal = ({
  user,
  address,
  network,
  amount,
  isManager,
  at,
}) => {
  return new Promise((resolve, reject) => {
    if (!at) at = +new Date()

    const currency = networkToCurrency(network).toLowerCase()

    var finish = user => {
      if (isManager) {
        if (user.wallets[currency].balance >= amount) {
          new Withdrawal({
            user,
            address,
            network,
            amount,
            at,
          }).save((e, withdrawal) => {
            if (!e && withdrawal) resolve(withdrawal)
            else reject(e)
          })
        } else {
          reject("You don't have enough amount of coins")
        }
      } else {
        User.findOne({ email: user.bindedTo }, (err, manager) => {
          var message = Role.manager.settings.withdrawErrorMessage

          if (manager) {
            message = manager.role.settings.withdrawErrorMessage
          }

          const currency = {
            BTC: 'bitcoin',
            LTC: 'litecoin',
            ETH: 'ethereum',
          }[network.toUpperCase()]

          if (user.wallets[currency].balance >= amount) {
            new Withdrawal({
              user,
              address,
              network,
              amount,
              at,
            }).save((e, withdrawal) => {
              if (!e && withdrawal) resolve({ ...withdrawal, message })
              else reject(e)
            })
          } else {
            reject("You don't have enough amount of coins")
          }
        })
      }
    }

    const valid = WAValidator.validate(address, network)

    if (!valid) {
      reject(
        'Address validation error. Make sure you select the correct cryptocurrency.',
      )
    } else {
      if (typeof user == 'string') {
        User.findById(user, (err, user) => {
          if (!err && user) {
            finish(user)
          } else {
            reject('User has not been found')
          }
        })
      } else {
        finish(user)
      }
    }
  })
}

////////

const getTransactionsByAddress = address => {
  return new Promise(resolve => {
    var transactions = ExchangeBase.transactions
      .filter(t => t.address == address)
      .map(t => t.entity)

    resolve(transactions)
  })
}

const getTransactionsByUserId = id =>
  new Promise(resolve => {
    var fetching = {
      transfers: Transaction.find(
        {
          visible: true,
          $or: [{ sender: id }, { recipient: id, status: 'completed' }],
        },
        'fake status sender recipient name currency amount at',
        null,
      ),
      deposits: Deposit.find(
        { user: id, visible: true },
        'name status network at exp url amount user address',
        null,
      ),
      withdrawals: Withdrawal.find(
        { user: id, visible: true },
        'name status amount at network user address',
        null,
      ),
    }

    Promise.all(Object.values(fetching)).then(
      ([transfers, deposits, withdrawals]) => {
        resolve([...transfers, ...deposits, ...withdrawals])
      },
    )
  })

const getWithdrawalsByUserId = id => {
  return new Promise(resolve => {
    Withdrawal.find({ visible: true, user: id }, (err, withdrawals) => {
      var pending = []

      Promise.all(pending).then(() => {
        resolve(
          withdrawals.map(d => ({
            at: d.at,
            exp: d.exp,
            address: d.address,
            name: d.name,
            amount: d.amount,
            network: d.network,
            status: d.status,
          })),
        )
      })
    })
  })
}
const getDepositsByUserId = id => {
  return new Promise(resolve => {
    Deposit.find({ visible: true, user: id }, (err, deposits) => {
      var pending = []

      deposits.forEach(deposit => {
        if (
          time.now() > deposits.exp &&
          (deposit.status == 'processing' || deposit.status == 'pending')
        ) {
          deposit.status = 'failed'
          pending.push(deposit.save(null))
        }
      })

      Promise.all(pending).then(() => {
        resolve(
          deposits.map(d => ({
            at: d.at,
            exp: d.exp,
            address: d.address,
            name: d.name,
            amount: d.amount,
            network: d.network,
            status: d.status,
          })),
        )
      })
    })
  })
}

const getBalanceByAddress = (network, address) => {
  return new Promise(resolve => {
    getTransactionsByAddress(address).then(transactions => {
      transactions = transactions.map(t => ({
        status: t.status,
        type: t.type,
        amount: +t.amount.amount,
      }))

      if (transactions.length === 1) {
        if (transactions[0].status === 'completed') {
          if (transactions[0].type === 'send') {
            resolve(transactions[0].amount)
          }
        }
      } else if (transactions.length) {
        const result = transactions.reduce((balance, t) => {
          if (t.status === 'completed') {
            if (t.type === 'send') {
              return balance + t.amount
            }
          }
        })
        resolve(result)
      } else {
        resolve(0)
      }
    })
  })
}

const getUserByEmail = email => {
  return new Promise(resolve => {
    User.findOne({ email }, (err, user) => {
      resolve(user)
    })
  })
}

const getUserByAddress = (userAddress, fromCurrency) => {
  return new Promise((resolve, reject) => {
    var currency = fromCurrency.toLowerCase()

    User.findOne(
      { ['wallets.' + currency + '.address']: userAddress },
      (err, user) => {
        if (!err) resolve({ currency, user })
        else reject()
      },
    )
  })
}

const getWalletByUserId = id => {
  return new Promise((resolve, reject) => {
    if (typeof id !== 'string') {
      reject('invalid argument')
    } else {
      User.findById(id, (err, user) => {
        if (user) resolve(user.wallets)
        else reject(err.message)
      })
    }
  })
}

const getOurTransactionsIDs = cb =>
  new Promise(resolve => {
    Transaction.find({ visible: true }, (e, ts) => {
      if (ts) {
        cb(ts.map(t => t._id))
        resolve(ts.map(t => t._id))
      } else {
        resolve([])
      }
    })
  })

////////

const transferToWallet = (sender, recipient, amount, currency) => {
  return new Promise((resolve, reject) => {
    var commission = 1

    User.findOne({ email: sender.bindedTo }, (err, manager) => {
      if (manager) commission = manager.role.settings.commission

      let amountWithCommission = amount + amount * (commission / 100)

      if (sender.wallets[currency].balance >= amountWithCommission) {
        sender.wallets[currency].balance -= amountWithCommission
        recipient.wallets[currency].balance += amount
      } else {
        reject({
          message: "You don't have enough coins.",
        })
      }

      if (!recipient._id) {
        reject({
          message: 'Recipient not found.',
        })
      } else if (recipient._id === sender._id) {
        reject({
          message: "You can't be a recipient.",
        })
      } else {
        sender.markModified('wallets')
        recipient.markModified('wallets')

        Promise.all([sender.save(), recipient.save()]).then(data => {
          resolve(data)
        })
      }
    })
  })
}

const transferToAddress = (fromUser, toAddress, amount, fromCurrency) => {
  return new Promise((resolve, reject) => {
    User.findById(fromUser, (err, sender) => {
      if (sender) {
        getUserByAddress(toAddress, fromCurrency)
          .then(({ currency, user: recipient }) => {
            if (recipient) {
              if (currency === fromCurrency.toLowerCase()) {
                transferToWallet(sender, recipient, amount, currency)
                  .then(data => {
                    resolve(data)
                  })
                  .catch(err => {
                    reject(err)
                  })
              } else {
                reject({
                  message: 'The address is not intended for ' + fromCurrency,
                })
              }
            } else {
              reject({
                message: "We don't have any user with this address.",
              })
            }
          })
          .catch(() => {
            reject({
              message: "We don't have any user with this address.",
            })
          })
      } else {
        reject({
          message: "Can't find this user.",
        })
      }
    })
  })
}

const computeCommission = (amount, manager) => {
  return new Promise(resolve => {
    if (!manager) {
      resolve(amount * 0.01)
    } else {
      if (typeof manager == 'string') {
        User.findOne(
          {
            email: manager,
            'role.name': { $in: ['manager', 'owner'] },
          },
          (err, manager) => {
            if (manager) {
              let commission = manager.role.settings.commission
              resolve(amount * (commission / 100))
            } else {
              resolve(amount * 0.01)
            }
          },
        )
      } else {
        let commission = manager.role.settings.commission
        resolve(amount * (commission / 100))
      }
    }
  })
}

const applyCommission = (amount, managerEmail) => {
  return new Promise(resolve => {
    computeCommission(amount, managerEmail).then(commission => {
      resolve(+(amount - commission).toFixed(7))
    })
  })
}

const syncDeposit = deposit => {
  return new Promise(resolve => {
    getTransactionsByAddress(deposit.address).then(transactions => {
      if (
        transactions &&
        transactions.length &&
        deposit.status !=
          'completed' /* &&
        transactions[0].status == 'completed' */
      ) {
        var transactionAmount = +transactions[0].amount.amount

        deposit.status = 'completed'
        deposit.fake = false

        if (transactionAmount != deposit.amount) {
          deposit.amount = transactionAmount
        }

        applyCommission(deposit.amount, deposit.userEntity.bindedTo).then(
          newAmount => {
            deposit.amount = newAmount
            deposit.save((e, d) => {
              console.log(' NEW '.bgBrightGreen.black + ' Deposit confirmed.')
              resolve(d)
            })
          },
        )
      } else {
        resolve(null)
      }
    })
  })
}

const syncDeposits = () => {
  return new Promise(resolve => {
    Deposit.find(
      { visible: true, status: 'processing' },
      async (err, deposits) => {
        if (deposits) {
          var pending = []

          for (let deposit of deposits) {
            var promise = syncDeposit(deposit)

            pending.push(promise)
          }

          Promise.all(pending).then(data => {
            resolve(data.filter(t => t))
          })
        } else {
          resolve([])
        }
      },
    )
  })
}

const syncTransaction = transaction =>
  new Promise(resolve => {
    let realTransaction = transaction.entity
    let amount = realTransaction.amount.amount
    let currency = realTransaction.account.currency.name
    let { type, status } = realTransaction

    if (type === 'send' && status === 'completed') {
      getUserByEmail(transaction.email).then(user => {
        if (user) {
          let recipient = user._id

          applyCommission(amount, user.bindedTo).then(newAmount => {
            new Transaction({
              _id: realTransaction.id,
              name: 'Transfer',
              fake: false,
              amount: newAmount,
              recipient,
              currency,
              status,
              url: realTransaction.network.transaction_url,
            }).save((err, doc) => {
              user.wallets[currency.toLowerCase()].balance += newAmount // FIXED
              user.markModified('wallets')
              user.save(() => {
                console.log(
                  ' '.bgBlack +
                    ' NEW '.bgBrightGreen.black +
                    ' Transaction confirmed.',
                )
                resolve(doc)
              })
            })
          })
        } else {
          resolve()
        }
      })
    } else {
      resolve()
    }
  })

const syncTransactions = () => {
  return new Promise(resolve => {
    console.log(' TRAN '.bgCyan + ' Transactions are being synchronized...')
    refreshTransactions(ExchangeBase.addresses, 4).then(() => {
      try {
        var aas = ExchangeBase.availableAddresses.length

        var _as = ExchangeBase.addresses
        _as = [...(_as.BTC || []), ...(_as.ETH || []), ...(_as.LTC || [])]
          .length

        var ts = ExchangeBase.transactions.length

        console.log('       ExchangeBase status: '.grey)
        console.log(`         ${aas} available addresses;`.grey)
        console.log(`         ${_as} addresses;`.grey)
        console.log(`         ${ts} transactions.`.grey)
      } catch (err) {
        console.log(err)
      }

      getOurTransactionsIDs(async ourTransactionsIDs => {
        let transfers = []

        for (let t of ExchangeBase.transactions) {
          transfers.push(
            await new Promise(resolve => {
              if (!ourTransactionsIDs.includes(t.entity.id)) {
                syncTransaction(t).then(data => {
                  resolve(data)
                })
              } else {
                Transaction.findByIdAndUpdate(
                  t.entity.id,
                  { status: t.entity.status },
                  { useFindAndModify: false },
                  (err, doc) => {
                    if (doc) {
                      resolve(doc)
                    }
                  },
                )
              }
            }),
          )
        }

        console.log('       Up to date ✔\n')
        console.log(' DEPO '.bgMagenta + ' Deposits are being synchronized...')

        await syncDeposits().then(deposits => {
          console.log('       Up to date ✔\n')
          setTimeout(syncTransactions, 1000 * 30)
          resolve({
            deposits: deposits.filter(d => d),
            transfers: transfers.filter(t => t),
          })
        })
      })
    })
  })
}

getLinearChartPrices()
setInterval(getLinearChartPrices, 1000 * 60 * 10)

module.exports = {
  create: createUserWallets,
  find: getWalletByUserId,
  prices: currentPriceList,
  transfer: transferToAddress,
  getTransactionsByAddress,
  getTransactionsByUserId,
  getDepositsByUserId,
  getWithdrawalsByUserId,
  getBalanceByAddress,
  createNewAddress,
  createDeposit,
  createWithdrawal,
  currencyToNET,
  netToCurrency,
  computeCommission,
  applyCommission,
}
