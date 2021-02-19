const jwt = require('jsonwebtoken')

module.exports = {
  verify: token => {
    try {
      return jwt.verify(token, process.env.SECRET)
    } catch {
      return null
    }
  },
  passwordResetToken: data => {
    return jwt.sign(data, process.env.SECRET, { expiresIn: '20m' })
  },
  confirmationToken: (code, email) => {
    return (
      'Bearer ' +
      jwt.sign(
        {
          stage: 'confirmation',
          code,
          email,
        },
        process.env.SECRET,
        { expiresIn: '1h' },
      )
    )
  },
  registrationToken: email => {
    return (
      'Bearer ' +
      jwt.sign(
        {
          stage: 'registration',
          email,
        },
        process.env.SECRET,
        {
          expiresIn: '8h',
        },
      )
    )
  },
  authorizationToken: (userid, isAdmin) => {
    var entity = {
      stage: 'authorization',
      user: userid,
    }

    if (isAdmin) {
      entity.lock_location = true
    }

    return 'Bearer ' + jwt.sign(entity, process.env.SECRET, {})
  },
}
