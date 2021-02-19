const User = require('../../models/User')

const updateSettings = (manager, key, value) => {
  return new Promise(resolve => {
    var updatedRole = manager.role
    updatedRole.settings[key] = value

    User.findByIdAndUpdate(
      manager._id,
      {
        $set: {
          role: updatedRole,
        },
      },
      {
        useFindAndModify: false,
      },
      (err, user) => {
        resolve(user)
      },
    )
  })
}

const setErrorTemplates = (manager, templates) => {
  return new Promise(resolve => {
    updateSettings(manager, 'error-templates', templates).then(user => resolve(user))
  })
}

const setCommission = (manager, percent) => {
  return new Promise(resolve => {
    updateSettings(manager, 'commission', percent).then(user => resolve(user))
  })
}

const setCustomWithdrawError = (manager, error) => {
  return new Promise(resolve => {
    updateSettings(manager, 'withdrawErrorMessage', error).then(user =>
      resolve(user),
    )
  })
}

const setCustomWithdrawEmailError = (manager, error) => {
  return new Promise(resolve => {
    updateSettings(manager, 'withdrawEmailErrorMessage', error).then(user =>
      resolve(user),
    )
  })
}

const requireEmailConfirmation = (manager, value) => {
  return new Promise(resolve => {
    updateSettings(manager, 'withdrawEmailConfirmation', value).then(user =>
      resolve(user),
    )
  })
}

module.exports = {
  update: updateSettings,
  setCommission,
  setErrorTemplates,
  setCustomWithdrawError,
  setCustomWithdrawEmailError,
  requireEmailConfirmation,
}
