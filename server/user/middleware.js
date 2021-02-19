const jwt = require('jsonwebtoken')
const Joi = require('@hapi/joi')
const User = require('../models/User')
const moment = require('moment')

const Logger = require('./logger')

// const wallet = require('./wallet')

const currencyToNetwork = currency =>
  ({
    bitcoin: 'BTC',
    litecoin: 'LTC',
    ethereum: 'ETH',
  }[currency.toLowerCase()])
const networkToCurrency = network =>
  ({
    BTC: 'Bitcoin',
    LTC: 'Litecoin',
    ETH: 'Ethereum',
  }[network.toUpperCase()])

const convertUsers = users => {
  let result = users
    .map(user => {
      let action = { at: 0 }
      let log = Logger.getByUserID(user._id).sort((a, b) =>
        a.at < b.at ? 1 : a.at > b.at ? -1 : 0,
      )

      if (log.length) action = log[0]

      return {
        id: user._id,
        at: user.at,
        lastActionAt: action.at,
        role: user.role.name,
        name:
          user.firstName != user.email
            ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''} (${
                user.email
              })`
            : user.email,
        email: user.email,
        unread: user.unreadSupport,
        status: ['offline', 'online'][
          +(user.lastOnline > Date.now() - 5 * 60 * 1000)
        ],
      }
    })
    .sort((a, b) =>
      a.lastActionAt < b.lastActionAt
        ? 1
        : a.lastActionAt > b.lastActionAt
        ? -1
        : 0,
    )

  let online = result.filter(user => user.status == 'online'),
    offline = result.filter(user => user.status == 'offline')

  return [...online, ...offline]
}

const convertUser = (
  user,
  actions,
  log,
  wallets,
  transactions,
  messages,
  me,
) => ({
  id: user._id,
  role: user.role.name,
  banned: !!user.banned,
  name: `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`,
  email: user.email,
  registered: user.at,
  bindedTo: user.bindedTo || '',
  status: ['offline', 'online'][
    +(user.lastOnline > Date.now() - 5 * 60 * 1000)
  ],
  wallets,
  actions,
  log,
  me: !!me,
  messages,
  customWithdrawError: user.customWithdrawError,
  location: user.location,
  transfers:
    transactions && transactions.length
      ? transactions
          .filter(t => !t.fake && t.name == 'Transfer')
          .map(t => ({
            net: currencyToNetwork(t.currency),
            amount: t.amount,
            url: t.url,
          }))
      : '...',
  transactions: transactions
    ? transactions.map(t => {
        if (t.name === 'Transfer') {
          return {
            id: t._id,
            at: t.at,
            name: t.name,
            amount: t.amount,
            currency: t.currency,
            type: t.type,
            status: t.status,
            fake: t.fake,
            type: t.sender === user._id ? 'sent' : 'received',
          }
        } else if (t.name === 'Deposit') {
          return {
            id: t._id,
            at: t.at,
            exp: t.exp,
            name: t.name,
            amount: t.amount,
            network: t.network,
            status: t.status,
          }
        } else if (t.name === 'Withdrawal') {
          return {
            id: t._id,
            at: t.at,
            name: t.name,
            amount: t.amount,
            network: t.network,
            status: t.status,
            address: t.address,
          }
        }
      })
    : [],
})

module.exports = {
  convertUser,
  convertUsers,
  currencyToNetwork,
  networkToCurrency,
  parseUserId: (req, res) => {
    try {
      const token = req.headers.authorization.split(' ')[1]
      return jwt.verify(token, process.env.SECRET).user
    } catch {
      res.sendStatus(403)
      return false
    }
  },
  requireAccess: (req, res, next) => {
    try {
      const token = req.header('Authorization').split(' ')[1]
      const userId = jwt.verify(token, process.env.SECRET).user

      User.findById(userId, (err, match) => {
        if (match) {
          res.locals.user = match
          next()
        } else {
          res.sendStatus(404)
        }
      })
    } catch (err) {
      res.sendStatus(403)
    }
  },
  validateSignup: (req, res, next) => {
    try {
      const error = Joi.object({
        password: Joi.string()
          .pattern(
            /^[0-9A-Za-z#$%=@!{},`~&*()'<>?.:;_|^\/+\t\r\n\[\]"-]{6,32}$/,
          )
          .required()
          .error(new Error('Password must contain 6 to 32 characters.')),
        repeatPassword: Joi.any()
          .valid(Joi.ref('password'))
          .required()
          .error(new Error('Passwords do not match.')),
      }).validate({
        password: req.body.password,
        repeatPassword: req.body.repeatPassword,
      }).error

      if (error) {
        res.status(406).send({
          stage: 'Validation',
          message: error.message,
        })
      } else {
        next()
      }
    } catch (err) {
      res.sendStatus(400)
    }
  },
  validateSignin: (req, res, next) => {
    try {
      const error = Joi.object({
        password: Joi.string()
          .pattern(
            /^[0-9A-Za-z#$%=@!{},`~&*()'<>?.:;_|^\/+\t\r\n\[\]"-]{6,32}$/,
          )
          .required()
          .error(new Error('Password must contain 6 to 32 characters.')),
      }).validate({
        password: req.body.password,
      }).error

      if (error) {
        res.status(406).send({
          stage: 'Validation',
          message: error.message,
        })
      } else {
        next()
      }
    } catch (err) {
      res.sendStatus(400)
    }
  },
  getCommission: (manager, currency) => {
    let commission = 0.01
    const net = currencyToNetwork(currency)

    if (manager) {
      const c = manager.role.settings['depositMinimum' + net]

      if (typeof c == 'number') {
        commission = c
      }
    }

    return commission
  },
}
