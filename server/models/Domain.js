const mongoose = require('mongoose')
const nanoid = require('nanoid').nanoid

const Domain = new mongoose.Schema({
  _id: { type: String, default: nanoid },
  manager: String,
  name: String,
})

module.exports = mongoose.model('domains', Domain)
