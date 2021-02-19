const axios = require('axios')

module.exports = {
  get: () => {
    return new Promise((resolve, reject) => {
      axios
        .get('https://api.ipify.org?format=json')
        .then(response => {
          resolve(response.data.ip)
        })
        .catch(e => {
          reject(e)
        })
    })
  },
}
