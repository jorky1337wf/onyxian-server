const now = () => {
  return +new Date()
}

const getExpiration = (from, additionalMinutes) => {
  let min = typeof additionalMinutes === 'number' ? additionalMinutes : 0
  return from + 1000 * 60 * min
}

module.exports = {
  now,
  getExpiration,
}
