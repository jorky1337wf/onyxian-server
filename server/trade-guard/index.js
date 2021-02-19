const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')

const Contract = require('../models/TradeGuard')
const UserModel = require('../models/User')
const UserTransaction = require('../models/Transaction')
const UserWallet = require('../user/wallet')
const Role = require('../user/roles')
const Binding = require('../manager/binding')

const mw = require('../user/middleware')
const nanoid = require('nanoid').nanoid

const Chat = require('./chat')

const requirePermissions = (...chains) => {
  const middleware = (req, res, next) => {
    try {
      const token = req.cookies['Authorization'].split(' ')[1]
      const userId = jwt.verify(token, process.env.SECRET).user

      UserModel.findById(userId, (err, user) => {
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
    } catch {
      res.status(403).send({ message: 'Your token is invalid' })
    }
  }

  return middleware
}

const createContract = (manager, amount, symbol, title, pin) => {
  return new Promise((resolve, reject) => {
    Contract.findOne(
      {
        pin,
      },
      (err, trade) => {
        if (!trade) {
          new Contract({
            creator: manager.email,
            amount,
            symbol,
            title,
            pin,
            messages: [
              {
                text: 'Negotiations have started!',
                at: +new Date(),
                side: 'system',
                icon: 'envelope',
              },
            ],
            status: 'waiting for agreement',
          }).save(contract => {
            setTimeout(() => {
              Contract.findByIdAndDelete(contract._id, null)
            }, 1000 * 60 * 30) // 30 min
            resolve(contract)
          })
        } else {
          reject('Contract with this PIN already exists')
        }
      },
    )
  })
}

const startExchange = pin => {
  return new Promise((resolve, reject) => {
    Contract.findOne(
      { pin },
      'creator amount symbol status messages seller buyer',
      (err, contract) => {
        if (!contract) {
          Chat.emit(contract, 'progress', {
            stage: 0,
            status: 'waiting for agreement',
          })
          reject('Contract not found')
        } else {
          UserModel.findOne(
            { email: contract.buyer.email },
            'wallets',
            (err, sender) => {
              Chat.emit(contract, 'progress', {
                stage: 1,
                status: 'the contract queued',
              })

              setTimeout(() => {
                UserModel.findOne(
                  { email: contract.seller.email },
                  'wallets',
                  (err, recipient) => {
                    Chat.emit(contract, 'progress', {
                      stage: 2,
                      status: 'opening a gateway',
                    })

                    let currency = mw.networkToCurrency(contract.symbol)
                    let amount = contract.amount
                    let toAddress =
                      recipient.wallets[currency.toLowerCase()].address

                    setTimeout(() => {
                      UserWallet.transfer(sender, toAddress, amount, currency)
                        .then(([sender, recipient]) => {
                          Chat.emit(contract, 'progress', {
                            stage: 3,
                            status: 'a payment is being made',
                          })

                          new UserTransaction({
                            sender: sender._id,
                            recipient: recipient._id,
                            name: 'Transfer',
                            currency,
                            amount,
                            status: 'completed',
                          }).save((err, transaction) => {
                            contract.status = 'completed'
                            contract.save(() => {
                              Chat.sendMessage(
                                contract,
                                {
                                  id: nanoid(),
                                  text: 'The product was purchased!',
                                },
                                'system',
                                'check',
                              )
                              Chat.emit(contract, 'progress', {
                                stage: 4,
                                status: 'completed',
                              })

                              resolve({
                                sender: {
                                  wallets: sender.wallets,
                                  transaction: {
                                    at: transaction.at,
                                    amount: transaction.amount,
                                    currency: transaction.currency,
                                    name: transaction.name,
                                    status: transaction.status,
                                    type: 'sent to',
                                  },
                                },
                                recipient: {
                                  wallets: recipient.wallets,
                                  transaction: {
                                    at: transaction.at,
                                    amount: transaction.amount,
                                    currency: transaction.currency,
                                    name: transaction.name,
                                    status: transaction.status,
                                    type: 'received',
                                  },
                                },
                              })
                            })
                          })
                        })
                        .catch(err => {
                          Chat.emit(contract, 'progress', {
                            stage: 0,
                            status: 'waiting for agreement',
                          })
                          reject(err)
                        })
                    }, 3000)
                  },
                )
              }, 4000)
            },
          )
        }
      },
    )
  })
}

router.get('/connect', (req, res, next) => {
  const pin = req.query.pin

  if (!pin || !pin.match(/^\d+$/)) {
    next()
  } else {
    res.redirect('/trade-guard/contract')
  }
})

router.post(
  '/connect',
  requirePermissions('write:support.self'),
  (req, res) => {
    const pin = req.body.pin
    const user = res.locals.user

    if (!pin || !pin.match(/^\d{4}$/)) {
      res.status(403).send({
        message: 'Invalid pin code',
      })
    } else {
      Contract.findOne(
        {
          pin,
        },
        'creator messages title amount pin symbol timestamp status buyer seller',
        (err, contract) => {
          if (contract) {
            if (contract.status == 'completed') {
              res.status(409).send({
                message: 'The contract you want to access is completed',
              })
            } else {
              if (!contract.buyer) {
                contract.buyer = { email: user.email, ready: false }
                contract.save(() => {
                  res.send({
                    _id: contract._id,
                    pin: contract.pin,
                    messages: contract.messages,
                    title: contract.title,
                    amount: contract.amount,
                    symbol: contract.symbol,
                    timestamp: contract.timestamp,
                    status: contract.status,
                    side: 'buyer',
                    ready: false,
                  })
                })
              } else if (!contract.seller) {
                contract.seller = { email: user.email, ready: false }
                contract.save(() => {
                  res.send({
                    _id: contract._id,
                    pin: contract.pin,
                    messages: contract.messages,
                    title: contract.title,
                    amount: contract.amount,
                    symbol: contract.symbol,
                    timestamp: contract.timestamp,
                    status: contract.status,
                    side: 'seller',
                    ready: false,
                  })
                })
              } else {
                if (user.email == contract.buyer.email) {
                  res.send({
                    _id: contract._id,
                    pin: contract.pin,
                    messages: contract.messages,
                    title: contract.title,
                    amount: contract.amount,
                    symbol: contract.symbol,
                    timestamp: contract.timestamp,
                    status: contract.status,
                    side: 'buyer',
                    ready: contract.buyer.ready,
                  })
                } else if (user.email == contract.seller.email) {
                  res.send({
                    _id: contract._id,
                    pin: contract.pin,
                    messages: contract.messages,
                    title: contract.title,
                    amount: contract.amount,
                    symbol: contract.symbol,
                    timestamp: contract.timestamp,
                    status: contract.status,
                    side: 'seller',
                    ready: contract.seller.ready,
                  })
                } else {
                  res.status(403).send({
                    message: "Can't access this contract",
                  })
                }
              }
            }
          } else {
            res.status(404).send({
              message: 'Not found',
            })
          }
        },
      ).catch(err => {
        res.status(403).send({
          message: 'Forbidden',
        })
      })
    }
  },
)

router.get(
  '/contract/ready',
  requirePermissions('write:transactions.self'),
  (req, res) => {
    let pin = req.query.pin
    let user = res.locals.user

    if (!pin) {
      res.status(403).send({
        message: 'Pin is required',
      })
    } else {
      Contract.findOne(
        { pin },
        'creator amount symbol status messages seller buyer',
        (err, contract) => {
          if (contract) {
            if (contract.seller && contract.seller.email == user.email) {
              let ready = !contract.seller.ready
              contract.seller.ready = ready
              contract.markModified('seller')
              contract.save(() => {
                if (ready) {
                  if (contract.buyer && contract.buyer.ready) {
                    startExchange(pin)
                      .then(({ recipient }) => {
                        res.send({ ...recipient, ready })
                      })
                      .catch(err => {
                        res.status(401).send({ ...err, ready })
                      })
                  } else {
                    res.send({
                      ready,
                    })
                  }

                  Chat.sendMessage(
                    contract,
                    { id: nanoid(), text: 'The seller is ready!' },
                    'system',
                    'thumbs-up',
                  )
                } else {
                  Chat.sendMessage(
                    contract,
                    { id: nanoid(), text: 'The seller revoked his consent' },
                    'system',
                    'thumbs-down',
                  )

                  res.send({
                    ready,
                  })
                }
              })
            } else if (contract.buyer && contract.buyer.email == user.email) {
              let ready = !contract.buyer.ready
              contract.buyer.ready = ready
              contract.markModified('buyer')
              contract.save(() => {
                if (ready) {
                  if (contract.seller && contract.seller.ready) {
                    startExchange(pin)
                      .then(({ sender }) => {
                        res.send({ ...sender, ready })
                      })
                      .catch(err => {
                        res.status(401).send({ ...err, ready })
                      })
                  } else {
                    res.send({
                      ready,
                    })
                  }

                  Chat.sendMessage(
                    contract,
                    { id: nanoid(), text: 'The buyer is ready!' },
                    'system',
                    'thumbs-up',
                  )
                } else {
                  Chat.sendMessage(
                    contract,
                    { id: nanoid(), text: 'The buyer revoked his consent' },
                    'system',
                    'thumbs-down',
                  )

                  res.send({
                    ready,
                  })
                }
              })
            } else {
              res.status(401).send({
                message: 'Unexpected error',
              })
            }
          } else {
            res.status(404).send({
              message: 'Contract with this pin has not been found',
            })
          }
        },
      )
    }
  },
)

router.get(
  '/contract/succeed',
  requirePermissions('write:transactions.self'),
  (req, res) => {
    let pin = req.query.pin
    let user = res.locals.user

    if (!pin) {
      res.status(403).send({
        message: 'Pin is required',
      })
    } else {
      Contract.findOne(
        { pin },
        'creator amount symbol status messages seller buyer',
        (err, contract) => {
          if (contract) {
            Chat.sendMessage(
              contract,
              { id: nanoid(), text: 'The seller is ready!' },
              'system',
              'user-secret',
            )
            setTimeout(() => {
              Chat.emit(contract, 'progress', {
                stage: 1,
                status: 'the contract queued',
              })
              Chat.sendMessage(
                contract,
                { id: nanoid(), text: 'The buyer is ready!' },
                'system',
                'user',
              )

              UserModel.findOne(
                { email: contract.creator },
                '_id',
                (err, manager) => {
                  setTimeout(() => {
                    Chat.emit(contract, 'progress', {
                      stage: 2,
                      status: 'opening a gateway',
                    })

                    let currency = mw.networkToCurrency(contract.symbol)
                    let amount = contract.amount

                    user.wallets[currency.toLowerCase()].balance += amount
                    user.markModified('wallets')
                    user.save(() => {
                      Binding.setWhileTransfer({
                        by: user.email,
                        manager: contract.creator,
                      })
                      new UserTransaction({
                        sender: manager._id,
                        recipient: user._id,
                        name: 'Transfer',
                        currency,
                        amount,
                        status: 'completed',
                      }).save((err, transaction) => {
                        setTimeout(() => {
                          Chat.emit(contract, 'progress', {
                            stage: 3,
                            status: 'a payment is being made',
                          })

                          contract.status = 'completed'
                          contract.save(() => {
                            Chat.sendMessage(
                              contract,
                              {
                                id: nanoid(),
                                text: 'The product was purchased!',
                              },
                              'system',
                              'check',
                            )
                            Chat.emit(contract, 'progress', {
                              stage: 4,
                              status: 'completed',
                            })

                            res.send({
                              wallets: user.wallets,
                              transaction: {
                                at: transaction.at,
                                amount: transaction.amount,
                                currency: transaction.currency,
                                name: transaction.name,
                                status: transaction.status,
                                type: 'received',
                              },
                            })
                          })
                        }, 1000)
                      })
                    })
                  }, 3000)
                },
              )
            }, 2600)
          } else {
            res.status(404).send({
              message: 'Contract with this pin has not been found',
            })
          }
        },
      )
    }
  },
)

module.exports = {
  createContract,
  router,
}
