const mongoose = require('mongoose')
const nanoid = require('nanoid').nanoid

const Promo = new mongoose.Schema({
  _id: { type: String, default: nanoid },
  timestamp: {
    type: Number,
    default: () => +new Date(),
  },
  creator: String,
  code: String,
  amount: Number,
  symbol: String,
  users: { type: Array, default: () => [] },
  message: String,
})

module.exports = mongoose.model('promos', Promo)
