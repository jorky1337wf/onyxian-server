require('dotenv/config')

const moment = require('moment')
const TelegramBot = require('node-telegram-bot-api')

const User = require('../models/User')
const SupportDialogue = require('../models/SupportDialogue')
const TwoFA = require('./2fa')

const Bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })

const newMessage = text => ({
  text,
  date: +moment(),
  delivered: true,
  yours: true,
})

const sendSupportMessage = (email, text) =>
  new Promise((resolve, reject) => {
    {
      User.findOne({ email }, 'role', (err, result) => {
        if (result.role.name !== 'user') {
          reject()
        } else {
          const message = newMessage(text)

          SupportDialogue.findOne({ user: result._id }, (err, dialogue) => {
            if (!dialogue) {
              new SupportDialogue({
                user: result._id,
                unread: 1,
                messages: [message],
              }).save(() => {
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

const sendCode = chat => {
  if(!chat || !chat.id) return

  const code = TwoFA.getCode(chat)
  const expiration = TwoFA.getExpiration(code.at)

  Bot.sendMessage(
    chat.id,
    '🔐 The requested code for 2FA is ' +
      code.code +
      `\n\nExpires in ${expiration} seconds.`,
  )
}

const sendDeactivationCode = chat => {
  if(!chat || !chat.id) return

  const code = TwoFA.getCode(chat)
  const expiration = TwoFA.getExpiration(code.at)

  Bot.sendMessage(
    chat.id,
    '🔑 Here is the 2FA deactivation code:\n\n' +
      code.code +
      `\n\nExpires in ${expiration} seconds.`,
  )
}

const sendActivationCode = chat => {
  if(!chat || !chat.id) return

  const code = TwoFA.getCode(chat)
  const expiration = TwoFA.getExpiration(code.at)

  Bot.sendMessage(
    chat.id,
    '🔑 Here is the 2FA activation code:\n\n' +
      code.code +
      `\n\nExpires in ${expiration} seconds.`,
  )
}

const notifyManager = (user, message) => {
  if (user && user.bindedTo) {
    User.findOne({ email: user.bindedTo }, 'telegram', (err, manager) => {
      if (manager.telegram.chat || manager.telegram.chatId) {
        Bot.sendMessage(manager.telegram.chatId, message)
      }
    })
  }
}

Bot.onText(/\/start/, message => {
  const chat = message.chat.id

  User.findOne({ 'telegram.chatId': chat }, 'telegram', (err, user) => {
    if (user) {
      Bot.sendMessage(chat, 'You have already activated 2FA.')
    } else {
      if(!message.chat || !message.chat.id) return

      const code = TwoFA.getCode(message.chat)
      const expiration = TwoFA.getExpiration(code.at)
      Bot.sendMessage(
        chat,
        '🔑 Here is the 2FA activation code:\n\n' +
          code.code +
          `\n\nExpires in ${expiration} seconds.`,
      )
    }
  })
})

Bot.onText(/^[^/].+/, message => {
  const replied = message.reply_to_message

  if (replied && replied.from.is_bot) {
    if (replied.entities) {
      for (let entity of replied.entities) {
        if (entity.type == 'email') {
          let { offset, length } = entity
          let email = replied.text.substring(offset, offset + length)
          let text = message.text

          sendSupportMessage(email, text)
            .then(() => {
              Bot.sendMessage(
                message.chat.id,
                `📨 Replied to ${email} with:\n\n«${text}»`,
              )
            })
            .catch(err => {
              Bot.sendMessage(
                message.chat.id,
                "❌ Something went wrong while you've tried to reply... Try again later.",
              )
            })

          break
        }
      }
    }
  } else {
    User.findOne(
      { 'telegram.chatId': message.chat.id },
      'role',
      (err, user) => {
        if (user && user.role.name == 'user') {
          Bot.sendMessage(
            message.chat.id,
            '🔒 Sorry, but I can only help you with 2FA.',
          )
        } else if (user && user.role.name != 'user') {
          Bot.sendMessage(
            message.chat.id,
            '🗿 Sorry, but I can only help you with 2FA and notify about new support messages.',
          )
        }
      },
    )
  }
})

module.exports = {
  ...Bot,
  notifyManager,
  sendCode,
  sendActivationCode,
  sendDeactivationCode,
}
