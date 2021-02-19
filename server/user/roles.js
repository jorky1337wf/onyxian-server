const { roles, actions, reservation } = require('./config')

const updateUsersRoles = () =>
  new Promise(resolve => {
    const User = require('../models/User')

    User.find({}, (err, users) => {
      users.forEach(user => {
        const role =
          roles[
            Object.keys(reservation).includes(user.email)
              ? reservation[user.email]
              : user.role.name
          ]

        user.role = role
        user.save((err, user) => {
          if (err) resolve(err)
        })
      })

      resolve(err)
    })
  })

const hasChain = (res, chain) => res.locals.passedChains.includes(chain)

const hasPermission = (dominatedRole, surrenderChain) => {
  const validateChain = chain => !!chain.match(/^\w+:\w+\.\w+$/)
  const splitChain = chain => {
    if (validateChain(chain)) {
      let type = chain.split(':')[0]
      let field = chain.split(':')[1].split('.')[0]
      let access = chain.split(':')[1].split('.')[1]

      return {
        type,
        field,
        access,
      }
    } else {
      return null
    }
  }

  if (!validateChain(surrenderChain)) return false
  else {
    let dominated = dominatedRole.permissions

    for (let chain of dominated) {
      if (!validateChain(chain)) return false

      s = splitChain(surrenderChain)
      d = splitChain(chain)

      const typeMap = 'read -> write'
      const accessMap = 'self -> binded -> all'

      const type =
        typeMap.search(s.type) >= 0 &&
        typeMap.search(d.type) >= 0 &&
        typeMap.search(d.type) >= typeMap.search(s.type) &&
        ['read', 'write'].includes(s.type) &&
        ['read', 'write'].includes(d.type)
      const field = s.field === d.field
      const access =
        accessMap.search(s.access) >= 0 &&
        accessMap.search(d.access) >= 0 &&
        accessMap.search(d.access) >= accessMap.search(s.access) &&
        ['self', 'binded', 'all'].includes(s.access) &&
        ['self', 'binded', 'all'].includes(d.access)

      const assert = type && field && access

      if (assert) return true
      else continue
    }

    return false
  }
}

module.exports = {
  hasChain,
  hasPermission,
  updateUsersRoles,
  reservation,
  ...roles,
  promote: () => roles['manager'],
  demote: () => roles['user'],
  actions,
}
