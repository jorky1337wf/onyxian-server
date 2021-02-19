const Contract = require('../models/TradeGuard')

var io = null

var users = []

const joinContract = user => {
  users.push(user)
  return user
}

const userIsJoined = id => {
  return users.findIndex(u => u.id == id) != -1
}

const leaveContract = id => {
  const index = users.findIndex(u => u.id == id)

  if (index != -1) {
    users = users.splice(index, 1)
    return users
  } else {
    return users
  }
}

const sendMessage = (contract, message, side, icon) => {
  message = {
    id: message.id,
    text: message.text,
    at: +new Date(),
    side,
    icon,
  }

  io.to(contract._id).emit('message', message)

  Contract.findById(contract._id, (err, doc) => {
    if (doc) {
      doc.messages.push(message)
      doc.save(null)
    }
  })
}

const emit = (contract, event, payload) => {
  if(payload) {
    io.to(contract._id).emit(event, payload)
  } else {
    io.to(contract._id).emit(event)
  }
}

const defineIO = value => {
  io = value

  io.on('connection', socket => {
    socket.on('typing', ({contract, email}) => {
      socket.broadcast.to(contract._id).emit('typing')
    })

    socket.on('join-contract', ({ email, contract }) => {
      Contract.findById(contract._id, (err, doc) => {
        if (doc) {
          socket.emit('connected')

          if (userIsJoined(socket.id)) {
            // to avoid extra connections
            return
          } else {
            const user = joinContract({
              id: socket.id,
              contract_id: doc._id,
              email,
            })

            socket.join(user.contract_id) // join contract chat
          }

          socket.on('message', message => {
            sendMessage(doc, message, doc.creator != email ? 'seller' : 'buyer')
          })
        } else {
          leaveContract(user.id)
          socket.emit('disconnected')
        }
      })
    })

    socket.on('disconnect', () => {
      leaveContract(socket.id)
    })
  })
}

module.exports = {
  defineIO,
  sendMessage,
  emit
}
