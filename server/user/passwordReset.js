const Joi = require('@hapi/joi')
const Logger = require('./logger')
const bcrypt = require('bcryptjs')

const { verify } = require('./token')

const User = require('../models/User')
const UserMiddleware = require('../user/middleware')

const updatePassword = (userId, req) => {
  return new Promise((resolve, reject) => {
    if (req.body.newPassword && req.body.repeatNewPassword) {
      const validationError = Joi.object({
        newPassword: Joi.string()
          .pattern(/^[a-zA-Z0-9]{6,32}$/)
          .required()
          .error(
            new Error(
              'Passwords must contain 6 to 32 alphanumeric characters.',
            ),
          ),
        repeatNewPassword: Joi.string()
          .valid(Joi.ref('newPassword'))
          .required()
          .error(new Error("New passwords don't match.")),
      }).validate({
        newPassword: req.body.newPassword,
        repeatNewPassword: req.body.repeatNewPassword,
      }).error

      User.findById(userId, (err, user) => {
        if (err || !user) {
          reject({
            stage: 'Token validation error',
            message: 'Password reset token is invalid or has expired.',
          })
        } else if (validationError) {
          reject({
            stage: 'Password reset',
            message: validationError.message,
          })
        } else {
          const salt = bcrypt.genSaltSync(7)
          user.password = bcrypt.hashSync(req.body.newPassword, salt)

          user.save((err, user) => {
            Logger.register(
              UserMiddleware.convertUser(user),
              200,
              'password_changed',
              'action.user.passwordChanged',
            )
            resolve({
              stage: 'Password reset',
              message: "You've successfully changed your password!",
            })
          })
        }
      })
    } else {
      reject({
        stage: 'Error 400',
        message: 'Bad Request. Provide new password.',
      })
    }
  })
}

module.exports = {
  reset: (req, token) => {
    return new Promise((resolve, reject) => {
      var verified = verify(token)

      if (verified) {
        updatePassword(verified.userID, req)
          .then(response => {
            resolve(response)
          })
          .catch(response => {
            reject(response)
          })
      } else {
        reject({
          stage: 'Token validation error',
          message: 'Password reset token is invalid or has expired.',
        })
      }
    })
  },
}
