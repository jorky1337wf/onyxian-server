const User = require('../models/User')

const getBlackList = () => {
  return new Promise(resolve => {
    User.find({}, (err , users) => {
      let result = []

      if (users) {
        users = users.filter(user => user.location && user.banned)

        
        users.forEach(user => {
          result.push(user.location.ip)
        })
      }

      resolve(result)
    })
  })
}

module.exports = { 
  get: getBlackList
}