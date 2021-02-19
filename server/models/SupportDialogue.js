const mongoose = require('mongoose')
const nanoid = require('nanoid').nanoid

const Role = require('../user/roles')

const SupportDialogue = new mongoose.Schema({
  _id: { type: String, default: nanoid },
  user: String,
  unread: { type: Number, default: 0 },
  supportUnread: { type: Number, default: 0 },
  messages: { type: Array, default: [] },
})

module.exports = mongoose.model('support-dialogues', SupportDialogue)
