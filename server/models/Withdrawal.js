const mongoose = require('mongoose')
const nanoid = require('nanoid').nanoid
const time = require('../time')

const Withdrawal = new mongoose.Schema({
  _id: { type: String, default: nanoid },
  at: {
    type: Number,
    default: time.now,
  },
  name: { type: String, default: 'Withdrawal' },
  user: String,
  address: { type: String, required: true },
  visible: { type: Boolean, default: true },
  amount: Number,
  network: String,
  status: {
    type: String,
    default: 'await approval',
  },
})

module.exports = mongoose.model('withdrawals', Withdrawal)
