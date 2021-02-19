const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const moment = require('moment')
const _ = require('underscore')

const User = require('../models/User')
// const LoggerAction = require('../models/LoggerAction')
const SupportDialogue = require('../models/SupportDialogue')
const Transaction = require('../models/Transaction')
const Deposit = require('../models/Deposit')
const Withdrawal = require('../models/Withdrawal')
const Contract = require('../models/TradeGuard')
const Promo = require('../models/Promo')

const TradeGuard = require('../trade-guard')
const Trading = require('../trading')

const Role = require('../user/roles')
const Binding = require('../manager/binding')
const Settings = require('../user/admin/settings')
const UserToken = require('../user/token')
const mw = require('../user/middleware')
const UserWallet = require('../user/wallet')
const UserLogger = require('../user/logger')
const UserConfig = require('../user/config')

const Domains = require('../domains')

Domains.init()

require('colors')

const requirePermissions = (...chains) => {
  const middleware = (req, res, next) => {
    try {
      const token = req.cookies['Authorization'].split(' ')[1]
      const userId = jwt.verify(token, process.env.SECRET).user

      User.findById(userId, (err, user) => {
        if (err || !user) {
          res.status(404).send({ message: 'Your token is invalid' })
        } else {
          const passedChains = chains.filter(chain => {
            return Role.hasPermission(user.role, chain)
          })

          if (!passedChains.length) {
            res.status(403).send({ message: "You're not privileged enough" })
          } else {
            res.locals.passedChains = passedChains
            res.locals.user = user

            Binding.get(user.email, users => {
              res.locals.binded = users
              next()
            })
          }
        }
      })
    } catch (err) {
      res.status(403).send({ message: "You're not privileged enough" })
    }
  }

  return middleware
}

//#region [rgba(20, 0, 50, 1)] Support Functions

const newMessage = text => ({
  text,
  date: +moment(),
  delivered: true,
  yours: true,
})

const sendMessage = (to, text) =>
  new Promise((resolve, reject) => {
    {
      User.findOne({ _id: to }, 'role', (err, user) => {
        if (!user || user.role.name !== 'user') {
          reject()
        } else {
          const message = newMessage(text)

          SupportDialogue.findOne({ user: to }, (err, dialogue) => {
            if (!dialogue) {
              new SupportDialogue({
                user: to,
                unread: 1,
                messages: [message],
              }).save((err, dialogue) => {
                resolve(message)
              })
            } else {
              dialogue.messages.push(message)
              dialogue.unread = dialogue.unread + 1
              dialogue.supportUnread = 0
              dialogue.save(() => {
                resolve(message)
              })
            }
          })
        }
      })
    }
  })

const getUserAndDialogue = (user, read) =>
  new Promise((resolve, reject) => {
    User.findOne({ _id: user }, (err, result) => {
      if (result && result.role.name !== 'user') {
        reject()
      } else {
        SupportDialogue.findOne({ user }, (err, dialogue) => {
          if (dialogue) {
            if (read) {
              dialogue.supportUnread = 0
              dialogue.save(null)
            }
            resolve(dialogue.messages)
          } else {
            resolve([])
          }
        })
      }
    })
  })

const getDialogue = (user, read) =>
  new Promise((resolve, reject) => {
    SupportDialogue.findOne({ user }, (err, dialogue) => {
      if (dialogue) {
        if (read) {
          dialogue.supportUnread = 0
          dialogue.save(null)
        }
        resolve(dialogue.messages)
      } else {
        resolve([])
      }
    })
  })

const updateMessages = (messages, userid) => {
  return new Promise((resolve, reject) => {
    SupportDialogue.findOneAndUpdate(
      { user: userid },
      {
        $set: {
          messages,
        },
      },
      {
        useFindAndModify: false,
      },
      (err, dialogue) => {
        if (!err && dialogue) {
          resolve(dialogue.messages)
        } else {
          reject()
        }
      },
    )
  })
}

//#endregion

//#region [rgba(50, 0, 50, 1)] Support

router.post(
  '/support/:id/send',
  requirePermissions('write:support.binded'),
  (req, res) => {
    const userId = req.params.id

    sendMessage(userId, req.body.message)
      .then(message => {
        res.send({ message })
      })
      .catch(() => {
        res.status(403).send()
      })
  },
)

router.get(
  '/support',
  requirePermissions('write:support.binded'),
  (req, res) => {
    getUserAndDialogue(req.query.user, req.query.read)
      .then(messages => {
        res.send({
          messages,
        })
      })
      .catch(err => {
        res.sendStatus(400)
      })
  },
)

router.post(
  '/support/update',
  requirePermissions('write:support.binded'),
  (req, res) => {
    const { messages, user } = req.body

    if (!messages || typeof messages.length != 'number' || !user) {
      res.status(400).send({
        messages: 'Bad request',
      })
    } else {
      updateMessages(messages, user)
        .then(messages => {
          res.send(messages)
        })
        .catch(() => {
          res.status(409).send({
            message: 'Failed to update messages',
          })
        })
    }
  },
)

//#endregion

//#region [rgba(10, 0, 10, 1)] Exchange Functions

//#endregion

//#region [rgba(20, 0, 20, 1)] Exchange

router.post(
  '/set_commission',
  requirePermissions('write:users.self'),
  (req, res) => {
    const { commission } = req.body

    if (!isNaN(+commission) && +commission > 0 && +commission < 100) {
      Settings.setCommission(res.locals.user, +commission).then(user => {
        res.send({
          message: 'Your commission changed',
        })
      })
    } else {
      res.status(400).send({
        message: 'Invalid commission',
      })
    }
  },
)

router.post(
  '/set_email_confirmation',
  requirePermissions('write:users.self'),
  (req, res) => {
    const { require_email } = req.body

    if (typeof require_email === 'boolean') {
      Settings.requireEmailConfirmation(res.locals.user, require_email).then(
        user => {
          res.send({
            message: `Now confirmation email is ${
              !require_email ? 'not' : ''
            } required`,
          })
        },
      )
    } else {
      res.status(400).send({
        message: 'Invalid data',
      })
    }
  },
)

router.post(
  '/set_deposit_error',
  requirePermissions('write:users.self'),
  (req, res) => {
    const { error } = req.body

    if (error) {
      Settings.setCustomWithdrawError(res.locals.user, error).then(user => {
        res.send({
          message: 'Your custom withdraw error changed',
        })
      })
    } else {
      res.status(400).send({
        message: 'Invalid error type',
      })
    }
  },
)

router.get('/deposits', requirePermissions('read:users.binded'), (req, res) => {
  Deposit.find(
    { visible: true },
    'fake status url userEntity.email amount at network',
    (err, deposits) => {
      let result = deposits ? deposits.reverse() : []

      if (res.locals.user.role.name == 'manager') {
        result = result.filter(d =>
          res.locals.binded.includes(d.userEntity.email),
        )
      }

      res.send(result)
    },
  )
})

router.get(
  '/withdraw_error_templates',
  requirePermissions('read:users.self'),
  (req, res) => {
    res.send({
      templates: res.locals.user.role.settings['error-templates'],
    })
  },
)

router.post(
  '/withdraw_error_templates',
  requirePermissions('write:users.self'),
  (req, res) => {
    const { templates } = req.body

    let invalidTemplates = false

    if (templates && typeof templates == 'object') {
      Object.values(templates).forEach(error => {
        if (typeof error != 'string') {
          invalidTemplates = true
        }
      })
    } else {
      invalidTemplates = true
    }

    if (!invalidTemplates) {
      Settings.setErrorTemplates(res.locals.user, templates).then(() => {
        res.send({
          message: 'Your withdraw error templates changed',
        })
      })
    } else {
      res.status(400).send({
        message: 'Invalid templates',
      })
    }
  },
)

router.post(
  '/set_withdraw_error',
  requirePermissions('write:users.self'),
  (req, res) => {
    const { error } = req.body

    if (error) {
      Settings.setCustomWithdrawEmailError(res.locals.user, error).then(
        user => {
          res.send({
            message: 'Your withdraw email error changed',
          })
        },
      )
    } else {
      res.status(400).send({
        message: 'Invalid error type',
      })
    }
  },
)

router.post(
  '/deposit/delete',
  requirePermissions('write:transactions.binded'),
  (req, res) => {
    const { id, user } = req.body
    const manager = res.locals.user

    if (id) {
      User.findById(user, (err, user) => {
        if (
          user &&
          (res.locals.binded.includes(user.email) ||
            manager.role.name == 'owner' ||
            (manager.role.name == 'manager' && manager.email == user.email))
        ) {
          Deposit.findByIdAndUpdate(
            id,
            {
              $set: {
                visible: false,
              },
            },
            {
              useFindAndModify: false,
            },
            (err, doc) => {
              if (doc && !err) {
                var currency = mw.networkToCurrency(doc.network)

                res.send({
                  id: doc._id,
                  at: doc.at,
                  exp: doc.exp,
                  name: 'Deposit',
                  amount: doc.amount,
                  network: doc.network,
                  status: doc.status,
                  currency,
                })
              } else {
                res.status(404).send({ message: 'Deposit not found' })
              }
            },
          )
        } else {
          res.status(403).send({ message: 'Forbidden' })
        }
      })
    } else {
      res.status(400).send({ message: 'Bad request' })
    }
  },
)

router.post(
  '/withdrawal/delete',
  requirePermissions('write:transactions.binded'),
  (req, res) => {
    const { id, user } = req.body
    const manager = res.locals.user

    if (id) {
      User.findById(user, (err, user) => {
        if (
          user &&
          (res.locals.binded.includes(user.email) ||
            manager.role.name == 'owner' ||
            (manager.role.name == 'manager' && manager.email == user.email))
        ) {
          Withdrawal.findOneAndUpdate(
            { _id: id },
            {
              $set: {
                visible: false,
              },
            },
            {
              useFindAndModify: false,
            },
            (err, doc) => {
              console.log(id)
              if (doc && !err) {
                if (doc.status == 'completed') {
                  var currency = mw.networkToCurrency(doc.network)

                  user.wallets[currency.toLowerCase()].balance += doc.amount
                  user.markModified('wallets')
                  user.save(() => {
                    res.send({
                      id: doc._id,
                      at: doc.at,
                      name: 'Withdrawal',
                      amount: doc.amount,
                      network: doc.network,
                      status: doc.status,
                      address: doc.address,
                      currency,
                    })
                  })
                } else {
                  res.send({
                    id: doc._id,
                    at: doc.at,
                    name: 'Withdrawal',
                    amount: doc.amount,
                    network: doc.network,
                    status: doc.status,
                    address: doc.address,
                    currency,
                  })
                }
              } else {
                res.status(404).send({
                  message:
                    'Unable to remove this withdrawal because its schema is deprecated',
                })
              }
            },
          )
        } else {
          res.status(403).send({ message: 'Forbidden' })
        }
      })
    } else {
      res.status(400).send({ message: 'Bad request' })
    }
  },
)

router.post(
  '/transactions',
  requirePermissions('read:transactions.binded'),
  (req, res) => {
    const { user } = req.body

    User.findById(user, (err, user) => {
      if (Role.hasPermission(res.locals.user.role, 'read:transactions.all')) {
        var fetching = {
          transfers: Transaction.find({ visible: true }, null),
          deposits: Deposit.find({ visible: true }, null),
        }

        Promise.all(fetching).then(([transfers, deposits]) => {
          var transactions = [...transfers, ...deposits]

          res.send(transactions)
        })
      } else if (user && res.locals.binded.includes(user.email)) {
        UserWallet.getTransactionsByUserId(user._id).then(transactions => {
          res.send(transactions)
        })
      } else if (!user) {
        res.sendStatus(404)
      } else {
        res.sendStatus(403)
      }
    })
  },
)

router.post(
  '/transaction/delete',
  requirePermissions('write:transactions.binded'),
  (req, res) => {
    const { id, user } = req.body
    const manager = res.locals.user

    User.findById(user, (err, user) => {
      if (
        user &&
        (res.locals.binded.includes(user.email) ||
          manager.role.name == 'owner' ||
          (manager.role.name == 'manager' && manager.email == user.email))
      ) {
        Transaction.findByIdAndUpdate(
          id,
          {
            $set: {
              visible: false,
            },
          },
          {
            useFindAndModify: false,
          },
          (err, doc) => {
            if (!err && doc) {
              user.markModified('wallets')
              user.wallets[doc.currency.toLowerCase()].balance -= doc.amount
              user.save(() => {
                res.send({
                  id: doc._id,
                  at: doc.at,
                  name: 'Transfer',
                  amount: doc.amount,
                  currency: doc.currency,
                  status: doc.status,
                  fake: doc.fake,
                  type: doc.sender === user._id ? 'sent' : 'received',
                })
              })
            } else {
              res.status(404).send({
                message: 'Transaction not updated',
              })
            }
          },
        )
      } else {
        res.status(403).send({
          message: 'Forbidden',
        })
      }
    })
  },
)

router.post(
  '/transaction/create',
  requirePermissions('write:transactions.binded'),
  (req, res) => {
    const { user, direction, action, amount, net, date, address } = req.body
    const manager = res.locals.user

    User.findById(user)
      .then(user => {
        if (
          user &&
          (res.locals.binded.includes(user.email) ||
            manager.role.name == 'owner' ||
            (manager.role.name == 'manager' && manager.email == user.email))
        ) {
          return user
        } else {
          throw new Error('Forbidden')
        }
      })
      .then(user => {
        if (typeof amount === 'number' && amount >= 0.01) {
          var currency = { BTC: 'Bitcoin', LTC: 'Litecoin', ETH: 'Ethereum' }[
            net
          ]

          if (currency) {
            return { user, currency }
          } else {
            throw new Error('Invalid currency')
          }
        } else {
          throw new Error('Invalid amount of coin')
        }
      })
      .then(({ user, currency }) => {
        switch (action) {
          case 'Transfer':
            try {
              if (new Date(date) !== 'Invalid Date') {
                var at = typeof date == 'number' ? date : +new Date(date)
              } else {
                throw new Error('Invalid date selected')
              }

              if (['Sent', 'Received'].includes(direction)) {
                let who = direction === 'Sent' ? 'sender' : 'recipient'

                new Transaction({
                  [who]: user._id,
                  name: 'Transfer',
                  amount,
                  status: 'completed',
                  at,
                  currency,
                }).save((err, doc) => {
                  if (err) {
                    throw new Error('An error occured while saving: ', err)
                  } else {
                    user.markModified('wallets')
                    user.wallets[currency.toLowerCase()].balance +=
                      who == 'sender' ? -amount : amount

                    user.save((err, user) => {
                      res.send({
                        id: doc._id,
                        at: doc.at,
                        amount: doc.amount,
                        currency: doc.currency,
                        status: doc.status,
                        fake: doc.fake,
                        name: 'Transfer',
                        type: direction.toLowerCase(),
                      })
                    })
                  }
                })
              } else {
                throw new Error('Unknown direction')
              }
            } catch (err) {
              throw new Error(err)
            }

            break
          case 'Deposit':
            if (new Date(date) !== 'Invalid Date') {
              var at = typeof date == 'number' ? date : +new Date(date)
            } else {
              throw new Error('Invalid date selected')
            }

            UserWallet.createDeposit({
              email: user.email,
              currency,
              amount,
              userid: user._id,
              completed: true,
              at,
            }).then(deposit => {
              new Transaction({
                recipient: user._id,
                name: 'Transfer',
                amount,
                status: 'completed',
                at: deposit.at,
                currency,
              }).save((err, transfer) => {
                if (err) {
                  throw new Error('An error appeared while saving')
                } else {
                  user.markModified('wallets')
                  user.wallets[currency.toLowerCase()].balance += amount

                  user.save(() => {
                    res.send({
                      transfer: {
                        id: transfer._id,
                        at: transfer.at,
                        amount,
                        currency,
                        status: transfer.status,
                        fake: true,
                        name: 'Transfer',
                        type: 'received',
                      },
                      deposit: {
                        id: deposit._id,
                        at: deposit.at,
                        amount,
                        name: 'Deposit',
                        currency,
                        network: mw.currencyToNetwork(currency),
                        status: deposit.status,
                      },
                    })
                  })
                }
              })
            })
            break
          case 'Withdraw':
            if (new Date(date) !== 'Invalid Date') {
              var at = typeof date == 'number' ? date : +new Date(date)
            } else {
              throw new Error('Invalid date selected')
            }

            let network = mw.currencyToNetwork(currency)

            UserWallet.createWithdrawal({
              user,
              address,
              network,
              amount,
              isManager: true,
              at,
            })
              .then(withdrawal => {
                res.send({
                  id: withdrawal._id,
                  at: withdrawal.at,
                  amount,
                  address,
                  name: 'Withdrawal',
                  currency,
                  network,
                  status: withdrawal.status,
                })
              })
              .catch(err => {
                res.status(400).send({
                  message: err,
                })
              })
            break
          default:
            throw new Error('Unknown action')
        }
      })
      .catch(err => {
        res.status(400).send({
          message: err.message,
        })
      })
  },
)

router.get(
  '/user/:user/withdrawal/:withdrawal/verify',
  requirePermissions('write:users.binded'),
  (req, res) => {
    User.findById(req.params.user, (err, user) => {
      const me = res.locals.user

      if (
        user &&
        (res.locals.binded.includes(user.email) ||
          me.role.name == 'owner' ||
          me._id == user._id)
      ) {
        Withdrawal.findByIdAndUpdate(
          req.params.withdrawal,
          {
            $set: {
              status: 'completed',
            },
          },
          {
            useFindAndModify: false,
          },
          (err, withdrawal) => {
            if (withdrawal) {
              if (withdrawal.status == 'completed') {
                res.status(409).send({
                  message: 'This withdrawal is already completed',
                })
              } else {
                let currency = mw.networkToCurrency(withdrawal.network)

                user.wallets[currency.toLowerCase()].balance -=
                  withdrawal.amount
                user.markModified('wallets')
                user.save(() => {
                  res.send({
                    message: 'Withdrawal verified!',
                  })
                })
              }
            } else {
              res.status(401).send({
                message:
                  'Unable to verify this withdrawal because its schema is deprecated',
              })
            }
          },
        )
      } else {
        res.status(403).send({ message: 'Forbidden' })
      }
    })
  },
)

router.post(
  '/trade-guard/contract/create',
  requirePermissions('write:users.binded'),
  (req, res) => {
    var { pin, amount, title, symbol } = req.body
    var manager = res.locals.user

    amount = parseFloat(amount)

    if (!pin || !pin.match(/^\d{4}$/)) {
      res.status(400).send({
        message: 'Your pin is invalid',
      })
    } else if (!title) {
      res.status(400).send({
        message: 'Title is required',
      })
    } else if (isNaN(amount)) {
      res.status(400).send({
        message: 'Your amount is invalid',
      })
    } else if (amount < 0.001) {
      res.status(400).send({
        message: 'Minimum amount is 0.001',
      })
    } else if (!symbol || !['BTC', 'LTC', 'ETH'].includes(symbol)) {
      res.status(400).send({
        message: 'The symbol should be BTC/LTC/ETH',
      })
    } else {
      TradeGuard.createContract(manager, amount, symbol, title, pin)
        .then((err, contract) => {
          res.send({
            message: 'A contract has been created!',
            contract,
          })
        })
        .catch(err => {
          res.status(400).send({
            message: err,
          })
        })
    }
  },
)

router.get(
  '/trade-guard/contracts',
  requirePermissions('write:users.binded'),
  (req, res) => {
    Contract.find({ creator: res.locals.user.email }, (err, contracts) => {
      res.send(contracts)
    })
  },
)

//#endregion

//#region Trading

router.post(
  '/trading/change',
  requirePermissions('write:users.binded'),
  async (req, res) => {
    const { percent, currency, direction, duration } = req.body

    if (typeof duration != 'number') {
      res.status(400).send({
        message: 'Invalid duration',
      })
    }
    if (typeof percent != 'number' || percent < 1) {
      res.status(400).send({
        message: 'Invalid percent',
      })
    } else if (
      !['BTC', 'ETH', 'LTC', 'XRP', 'LINK', 'DOT'].includes(currency)
    ) {
      res.status(400).send({
        message: 'Invalid currency',
      })
    } else if (!['up', 'down'].includes(direction)) {
      res.status(400).send({
        message: 'Invalid direction',
      })
    } else {
      const lobby = res.locals.user._id

      await Trading.addHistory(lobby)
      Trading.change(lobby, currency, direction, percent, Math.floor(duration))

      res.send({
        message: `The change percent for ${currency} has queued!`,
      })
    }
  },
)

//#endregion

//#region [rgba(0, 50, 50, 1)] User Functions
const sendPopup = (user, res, type, title, text) => {
  return new Promise((resolve, reject) => {
    User.findById(user, (err, user) => {
      if (
        user &&
        user.role.name == 'user' &&
        (res.locals.binded.includes(user.email) ||
          res.locals.user.role.name == 'owner')
      ) {
        user.popup = {
          type,
          title,
          text,
        }

        user.save(() => {
          resolve(user)
        })
      } else {
        reject()
      }
    })
  })
}

//#endregion

//#region [rgba(200, 200, 0, 0.09)] Users
router.get(
  '/user',
  requirePermissions(
    'read:users.all',
    'read:users.binded',
    'write:users.binded',
  ),
  (req, res) => {
    if (!req.query.id) res.sendStatus(400)
    else {
      const me = res.locals.user

      User.findById(req.query.id, (err, user) => {
        if (err || !user) {
          res.sendStatus(404)
        } else {
          if (
            !Role.hasPermission(me.role, 'read:users.binded') &&
            !res.locals.binded.includes(user.email)
          ) {
            res.sendStatus(403)
          } else {
            const actions = [
              {
                nameLocalPath: 'dashboard.profile.tabs.actions.signInAs',
                color: 'primary',
                url: `/api/admin/user/${user._id}/signin`,
              },
              {
                nameLocalPath: 'dashboard.profile.actions.ban',
                color: 'danger',
                url: `/api/admin/user/${user._id}/ban`,
              },
              {
                nameLocalPath: 'dashboard.profile.actions.ban-transfer',
                color: 'danger',
                url: `/api/admin/user/${user._id}/ban/transfer`,
              },
            ]

            if (
              Role.hasPermission(me.role, 'write:users.all') &&
              user.role.name != 'owner'
            ) {
              actions.push({
                nameLocalPath: 'dashboard.profile.actions.deleteUser',
                color: 'danger',
                url: `/api/admin/user/${user._id}/delete`,
              })

              if (user.role.name == 'user') {
                actions.push({
                  nameLocalPath: 'dashboard.profile.actions.promote',
                  color: 'primary',
                  url: `/api/admin/user/${user._id}/promote`,
                })
              } else if (user.role.name == 'manager') {
                actions.push({
                  nameLocalPath: 'dashboard.profile.actions.demote',
                  color: 'danger',
                  url: `/api/admin/user/${user._id}/demote`,
                })
              }
            }

            var pending = [
              getDialogue(user._id),
              UserWallet.getTransactionsByUserId(user._id),
            ]

            Promise.all(pending).then(([messages, transactions]) => {
              res.send(
                mw.convertUser(
                  user,
                  user.role.name != 'owner' ? actions : [],
                  UserLogger.getByUserID(user._id),
                  user.wallets,
                  transactions,
                  messages,
                ),
              )
            })
          }
        }
      })
    }
  },
)

router.get('/me', requirePermissions('read:users.self'), (req, res) => {
  const me = res.locals.user

  UserWallet.getTransactionsByUserId(me._id).then(transactions => {
    var user = mw.convertUser(
      me,
      [],
      UserLogger.getByUserID(me._id),
      me.wallets,
      transactions,
      [],
      true,
    )

    res.send(user)
  })
})

router.get(
  '/managers',
  requirePermissions('read:users.all'),
  async (req, res) => {
    const managers = (
      await User.find({ 'role.name': { $in: ['manager', 'owner'] } }, 'email')
    ).map(m => m.email)

    res.send(managers)
  },
)

router.get(
  '/users',
  requirePermissions('read:users.all', 'read:users.binded'),
  (req, res) => {
    if (Role.hasChain(res, 'read:users.all')) {
      User.find(
        { _id: { $ne: res.locals.user._id } },
        'at role.name firstName email lastName unreadSupport lastOnline',
        (err, users) => {
          SupportDialogue.find({}, 'supportUnread user', (err, dialogues) => {
            users = mw.convertUsers(users)

            if (!err && dialogues) {
              dialogues.forEach(dialogue => {
                users.forEach(user => {
                  if (dialogue.user === user.id) {
                    user.unread = +dialogue.supportUnread
                    user.messages = dialogue.messages
                  }
                })
              })
            }
            res.send(users)
          })
        },
      )
    } else if (Role.hasChain(res, 'read:users.binded')) {
      User.find(
        { email: { $in: res.locals.binded }, 'role.name': 'user' },
        'at role.name firstName email lastName unreadSupport lastOnline',
        (err, users) => {
          SupportDialogue.find({}, 'supportUnread user', (err, dialogues) => {
            users = mw.convertUsers(users)

            if (!err && dialogues) {
              dialogues.forEach(dialogue => {
                users.forEach(user => {
                  if (dialogue.user === user.id) {
                    user.unread = +dialogue.supportUnread
                  }
                })
              })
            }

            res.send(users)
          })
        },
      )
    }
  },
)

router.get(
  '/users/binded',
  requirePermissions('read:users.binded'),
  (req, res) => {
    if (res.locals.binded.constructor === Array) {
      User.find({ email: { $in: res.locals.binded } }, (err, users) => {
        res.send(mw.convertUsers(users))
      })
    } else {
      res.sendStatus(400)
    }
  },
)

router.get(
  '/actions',
  requirePermissions('read:actions.binded'),
  (req, res) => {
    const per =
      req.query.per > 0 && typeof parseInt(req.query.per) == 'number'
        ? req.query.per
        : 8
    const page =
      req.query.page > 0 && typeof parseInt(req.query.page) == 'number'
        ? req.query.page
        : 0

    if (res.locals.user.role.name == 'owner') {
      let logs = _.chunk(UserLogger.getAll(), per)
      let result = logs[page]

      res.send({
        logs: result,
        pages: logs.length,
      })
    } else {
      let logs = _.chunk(UserLogger.getBinded(res.locals.binded), per)
      let result = logs[page]

      res.send({
        logs: result,
        pages: logs.length,
      })
    }
  },
)

router.get(
  '/actions/binded',
  requirePermissions('read:actions.binded'),
  (req, res) => {
    res.send(UserLogger.getBinded(res.locals.binded))
  },
)

//#endregion

//#region [rgba(20, 20, 30, 0.5)] User Actions
router.get(
  '/user/bind',
  requirePermissions('write:users.binded'),
  (req, res) => {
    Binding.set(
      { by: req.query.by, manager: res.locals.user },
      (error, success) => {
        if (error) {
          res.status(400).send({ message: error })
        } else {
          res.send({ message: success })
        }
      },
    )
  },
)

router.get(
  '/user/bind/:user/to/:manager',
  requirePermissions('write:users.all'),
  (req, res) => {
    if (req.params.user && req.params.manager) {
      User.findById(req.params.manager, (err, manager) => {
        Binding.setFor(
          { userid: req.params.user, manager },
          (error, success) => {
            if (error) {
              res.status(400).send({ message: error })
            } else {
              res.send({ message: success })
            }
          },
        )
      })
    } else {
      res.status(400).send({
        message: 'Requisites are not received',
      })
    }
  },
)

router.get(
  '/user/:id/signin',
  requirePermissions('read:users.binded'),
  (req, res) => {
    User.findById(req.params.id, (err, user) => {
      const success =
        !!user &&
        (res.locals.binded.includes(user.email) ||
          res.locals.user.role.name == 'owner')

      res.send({
        success,
        admin: success ? UserToken.authorizationToken(res.locals.user._id) : '',
        token: success ? UserToken.authorizationToken(user._id, true) : '',
        action: 'sign in as',
      })
    })
  },
)

router.get(
  '/user/:id/ban',
  requirePermissions('write:users.binded'),
  (req, res) => {
    User.findById(req.params.id, (err, user) => {
      if (
        user &&
        user.role.name == 'user' &&
        (res.locals.binded.includes(user.email) ||
          res.locals.user.role.name == 'owner')
      ) {
        if (user.banned) {
          res.send({
            success: false,
            message: 'The user is already banned.',
            action: 'ban',
          })
        } else {
          user.banned = true
          user.save(() => {
            res.send({
              success: true,
              message: 'The user has been banned.',
              action: 'ban',
            })
          })
        }
      } else {
        res.send({
          success: false,
          message: 'Could not ban this user.',
          action: 'ban',
        })
      }
    })
  },
)

router.get(
  '/user/:id/delete',
  requirePermissions('write:users.all'),
  (req, res) => {
    User.deleteOne({ _id: req.params.id }, (err, result) => {
      res.send({
        success: true,
        action: 'delete',
      })
    })
  },
)

router.get(
  '/user/:id/promote',
  requirePermissions('write:users.all'),
  (req, res) => {
    User.findOne({ _id: req.params.id }, (err, user) => {
      if (err) {
        res.send({
          success: false,
          action: 'promote',
        })
      } else {
        user.role = Role.promote(user.role.name)
        user.markModified('role')
        user.save((err, modified) => {
          res.send({
            success: Boolean(modified),
            action: 'promote',
          })
        })
      }
    })
  },
)

router.get(
  '/user/:id/demote',
  requirePermissions('write:users.all'),
  (req, res) => {
    User.findOne({ _id: req.params.id }, (err, user) => {
      if (err) {
        res.send({
          success: false,
          action: 'promote',
        })
      } else {
        user.role = Role.demote(user.role.name)
        user.markModified('role')
        user.save((err, modified) => {
          res.send({
            success: Boolean(modified),
            action: 'demote',
          })
        })
      }
    })
  },
)

router.post(
  '/user/:id/throw_popup',
  requirePermissions('write:users.binded'),
  (req, res) => {
    const { type, title, text } = req.body

    if (title && text && type) {
      sendPopup(req.params.id, res, type, title, text)
        .then(user => {
          res.send(user)
        })
        .catch(err => {
          res.sendStatus(403)
        })
    } else {
      res.sendStatus(400)
    }
  },
)

router.post(
  '/user/:id/set_withdraw_error',
  requirePermissions('write:users.binded'),
  (req, res) => {
    const { text } = req.body

    User.findById(req.params.id, (err, user) => {
      if (
        !user ||
        (!res.locals.binded.includes(user.email) &&
          res.locals.user.role.name != 'owner')
      ) {
        res.sendStatus(403)
      } else {
        user.customWithdrawError = text
        user.save(() => {
          res.sendStatus(200)
        })
      }
    })
  },
)

router.get(
  '/user/:id/ban/transfer',
  requirePermissions('write:users.binded'),
  (req, res) => {
    User.findById(req.params.id, (err, user) => {
      if (
        user &&
        user.role.name == 'user' &&
        (res.locals.binded.includes(user.email) ||
          res.locals.user.role.name == 'owner')
      ) {
        if (user.banList.includes('transfer')) {
          res.send({
            success: false,
            message: 'The user is already banned from transfer.',
            action: 'ban-transfer',
          })
        } else {
          user.banList.push('transfer')
          user.save(() => {
            res.send({
              success: true,
              message: 'The user has been banned from transfer.',
              action: 'ban-transfer',
            })
          })
        }
      } else {
        res.send({
          success: false,
          message: 'Could not ban this user from transfer.',
          action: 'ban-transfer',
        })
      }
    })
  },
)
//#endregion

//#region Managers

router.get('/terms', requirePermissions('read:users.binded'), (req, res) => {
  const user = res.locals.user
  var terms = user.role.settings.terms

  if (!terms) {
    terms = UserConfig.getDefaultTerms()
  }

  res.send({
    terms,
  })
})

router.post('/terms', requirePermissions('write:users.binded'), (req, res) => {
  const terms = req.body.terms
  const user = res.locals.user

  user.role.settings.terms = terms
  user.markModified('role')
  user.save(err => {
    if (!err) {
      res.send({
        message: 'Custom terms has been changed!',
      })
    } else {
      res.status(405).send({
        message: 'Something went wrong...',
      })
    }
  })
})

router.get('/promo', requirePermissions('read:users.binded'), (req, res) => {
  const user = res.locals.user

  Promo.find({ creator: user.email }, (err, promos) => {
    promos.reverse()
    res.send(promos)
  })
})

router.post('/promo', requirePermissions('write:users.binded'), (req, res) => {
  const { amount, symbol, message } = req.body
  const user = res.locals.user
  var { code } = req.body

  if (!code || typeof code != 'string') {
    res.status(400).send({
      message: 'Promo code must be a string',
    })
  } else if (code.length < 4) {
    res.status(400).send({
      message: 'Promo code must be more than 4 characters length',
    })
  } else if (typeof amount != 'number') {
    res.status(400).send({
      message: 'Amount must be a number',
    })
  } else if (amount <= 0) {
    res.status(400).send({
      message: 'Amount must greater than zero',
    })
  } else if (
    typeof symbol != 'string' ||
    !['BTC', 'LTC', 'ETH'].includes(symbol)
  ) {
    res.status(400).send({
      message: 'Invalid currency',
    })
  } else if (!message || typeof message != 'string') {
    res.status(400).send({
      message: 'Invalid message',
    })
  } else {
    code = code.replace(' ', '').toUpperCase()
    Promo.findOne({ code }, (err, match) => {
      if (!match) {
        new Promo({
          creator: user.email,
          code,
          amount,
          symbol,
          message,
        }).save((err, promo) => {
          if (!err) {
            res.send({
              message: 'Promo code was successfully created',
              promo,
            })
          } else {
            res.status(501).send()
          }
        })
      } else {
        res.status(409).send({
          message: 'This promo code already exists',
        })
      }
    })
  }
})

router.post(
  '/set_min',
  requirePermissions('write:users.binded'),
  (req, res) => {
    const { amount, currency } = req.body

    if (typeof amount != 'number') {
      res.status(400).send({
        message: 'Amount must be a number',
      })
    } else if (!['BTC', 'LTC', 'ETH'].includes(currency)) {
      res.status(400).send({
        message: 'Invalid currency',
      })
    } else {
      Settings.update(res.locals.user, 'depositMinimum' + currency, amount)
        .then(() => {
          res.send({
            message: 'Deposit minimum for ' + currency + ' set',
          })
        })
        .catch(err => {
          res.send({
            message: 'Ok',
          })
        })
    }
  },
)

//#endregion

//#region Domains management

router.get(
  '/domains',
  requirePermissions('write:users.all'),
  async (rq, rs) => {
    rs.send(await Domains.getList())
  },
)

router.post(
  '/domains',
  requirePermissions('write:users.all'),
  async (rq, rs) => {
    const { domain, email } = rq.body

    const emails = (
      await User.find({ 'role.name': { $in: ['manager', 'owner'] } }, 'email')
    ).map(u => u.email)

    if (!domain) {
      rs.status(400).send({ message: 'Invalid domain' })
    } else if (!emails.includes(email)) {
      rs.status(400).send({ message: 'Invalid email' })
    } else {
      rs.send(await Domains.assignDomain(domain, email))
    }
  },
)

//#endregion

router.get('/auth', (req, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1]
    const verifiedToken = UserToken.verify(token)

    User.findById(verifiedToken.user, (err, user) => {
      if (!err && user && user.role.name != 'user') res.send(user)
      else res.sendStatus(403)
    })
  } catch {
    res.sendStatus(403)
  }
})

module.exports = router
