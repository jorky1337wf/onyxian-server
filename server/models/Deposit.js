const mongoose = require('mongoose')
const nanoid = require('nanoid').nanoid
const Time = require('../time')

require('dotenv/config')

const Deposit = new mongoose.Schema({
  _id: { type: String, default: nanoid },
  at: {
    type: Number,
    default: Time.now,
  },
  exp: {
    type: Number,
    default: () => Time.getExpiration(Time.now(), 20),
  },
  fake: { type: Boolean, default: false },
  address: String,
  url: String,
  name: { type: String, default: 'Deposit' },
  user: String,
  userEntity: Object,
  visible: { type: Boolean, default: true },
  amount: Number,
  network: String,
  status: {
    type: String,
    default: 'processing',
  },
})

module.exports = mongoose.model('deposits', Deposit)
