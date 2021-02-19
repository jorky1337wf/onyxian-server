const EXP_TIME = 5 * 60 // 5 minutes

const dict = {}

const getExpiration = ts => {
  return EXP_TIME - Math.floor((+new Date() - ts) / 1000)
}

const generate = chat => {
  const code = {
    chat,
    code: Math.floor(100000 + Math.random() * 899999),
    at: +new Date(),
  }

  dict[chat.id] = code

  return code
}

const getCode = chat => {
  const code = dict[chat.id]

  if (!code || getExpiration(code.at) <= 0) {
    return generate(chat)
  } else {
    return code
  }
}

const validateCode = (chat, code) => {
  const codeEntity = dict[chat.id]
  const valid =
    codeEntity && codeEntity.code == code && getExpiration(codeEntity.at) > 0

  if (valid) {
    generate(chat)
  }

  if (getExpiration(codeEntity.at) <= 0) return 'expired'
  else if (valid) return 'valid'
  else return 'invalid'
}

const findChatByCode = code => {
  let result = null

  Object.entries(dict).forEach(entry => {
    if (code == entry[1].code) result = entry[1]
  })

  return result
}

module.exports = {
  getCode,
  validateCode,
  getExpiration,
  findChatByCode,
}
