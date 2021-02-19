const express = require('express')
const router = new express.Router()

const jwt = require('jsonwebtoken')
const moment = require('moment')

const TelegramBot = require('../telegram-bot')

const SupportDialogue = require('../models/SupportDialogue')
const UserMiddleware = require('../user/middleware')
const User = require('../models/User')

//#region [rgba(10,10,10,1)] Functions

const newMessage = text => ({
  text,
  date: +moment(),
  delivered: true,
  yours: false,
})

const sendMessage = (from, text) =>
  new Promise((resolve, reject) => {
    {
      User.findOne(
        { _id: from },
        'role email firstName lastName bindedTo',
        (err, user) => {
          if (user.role.name !== 'user') {
            reject()
          } else {
            const message = newMessage(text)

            SupportDialogue.findOne({ user: from }, (err, dialogue) => {
              if (!dialogue) {
                new SupportDialogue({
                  user: from,
                  supportUnread: 1,
                  messages: [message],
                }).save((err, dialogue) => {
                  resolve(message)
                })
              } else {
                dialogue.messages.push(message)
                dialogue.supportUnread += 1

                if (dialogue.supportUnread > 1) {
                  TelegramBot.notifyManager(
                    user,
                    `📬 You have ${dialogue.supportUnread} unanswered messages from this user and here is another one!\n\nfrom: ${user.email}\n\n«${message.text}»`,
                  )
                } else {
                  TelegramBot.notifyManager(
                    user,
                    `✉️ You've got new message!\n\nfrom: ${user.email}\n\n«${message.text}»`,
                  )
                }

                dialogue.save(() => {
                  resolve(message)
                })
              }
            })
          }
        },
      )
    }
  })

const getDialogue = user =>
  new Promise((resolve, reject) => {
    User.findOne({ _id: user }, 'role', (err, result) => {
      if (result.role.name !== 'user') {
        reject()
      } else {
        SupportDialogue.findOne({ user }, (err, dialogue) => {
          if (dialogue) {
            dialogue.unread = 0
            dialogue.save(null)
          }

          resolve(dialogue ? dialogue.messages : [])
        })
      }
    })
  })

//#endregion

router.post('/', (req, res) => {
  try {
    const userId = jwt.verify(req.body.token.split(' ')[1], process.env.SECRET)
      .user

    sendMessage(userId, req.body.message)
      .then(message => res.send({ message }))
      .catch(err => {
        console.log('err: ' + err)
        res.sendStatus(400)
      })
  } catch {
    res.sendStatus(403)
  }
})

router.get('/', (req, res) => {
  const userId = UserMiddleware.parseUserId(req, res)

  if (!userId) return false

  getDialogue(userId)
    .then(messages => {
      res.send({
        messages: messages.map(msg => {
          msg.yours = !msg.yours

          return msg
        }),
      })
    })
    .catch(err => {
      console.log('err: ' + err)
      res.sendStatus(400)
    })
})

module.exports = router
