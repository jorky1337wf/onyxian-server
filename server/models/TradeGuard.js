const mongoose = require('mongoose')
const nanoid = require('nanoid').nanoid

const TradeGuard = new mongoose.Schema({
  _id: { type: String, default: nanoid },
  timestamp: {
    type: Number,
    default: () => +new Date(),
  },
  creator: String,
  pin: String,
  title: String,
  amount: Number,
  symbol: String,
  status: String,
  seller: Object,
  buyer: Object,
  messages: { type: Array, default: [] },
})

module.exports = mongoose.model('trade-guard-contracts', TradeGuard)
