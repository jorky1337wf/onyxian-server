const Market = require('../crypto/market')

var io,
  Data = {
    orders: {
      BTC: [],
      LTC: [],
      ETH: [],
      DOT: [],
      LINK: [],
      XRP: [],
    },
    history: {},
    realHistory: { BTC: [], LTC: [], ETH: [], DOT: [], LINK: [], XRP: [] },
    graphPricesQeue: {},
  },
  priceList = {},
  coins = [
    ['BTC', 'bitcoin'],
    ['LTC', 'litecoin'],
    ['ETH', 'ethereum'],
    ['DOT', 'polkadot'],
    ['LINK', 'chainlink'],
    ['XRP', 'ripple'],
  ],
  lobbies = []

const Helper = {
  chunkNum(n, times, shuffle) {
    const d = n / times

    let res = []

    for (let i = 0; i < times; i++) {
      res.push(d)
    }

    for (let i = 0; i < shuffle; i++) {
      let f = Math.floor(Math.random() * res.length)
      let t = Math.floor(Math.random() * res.length)

      let temp = res[f] * Math.random()

      res[f] -= temp
      res[t] += temp
    }

    return res
  },
  minusPlus: () => (Math.random() < 0.5 ? 1 : -1),
  randomDelay() {
    return Math.random() * 2000 + 200
  },
}

const Graph = {
  prolongLastChange(lobby, coin, duration) {
    const qeue = Data.graphPricesQeue[lobby][coin]
    const last = qeue[qeue.length - 1]
    const penult = qeue[qeue.length - 2]

    const maxTolerance = last - penult

    for (let i = 0; i < duration; i++) {
      const change = Math.random() * maxTolerance * Helper.minusPlus()

      qeue.push(last + change)
    }
  },
  guideGraph(lobby, coin, direction, percent) {
    const subdividedPercent = Helper.chunkNum(
      percent,
      Math.round(percent) * 6,
      10,
    )

    const hist = Data.history[lobby][coin]['1h']

    for (let p of subdividedPercent) {
      const qeue = Data.graphPricesQeue[lobby][coin]

      const firstQeued = qeue.length ? qeue[qeue.length - 1] : null

      let last = firstQeued || hist[hist.length - 1][1]

      let change = last * (p / 100)
      let newVal = direction == 'up' ? last + change : last - change

      if (p != subdividedPercent[subdividedPercent.length - 1]) {
        newVal += Math.random() * change * Helper.minusPlus()
      }

      Data.graphPricesQeue[lobby][coin].push(newVal)
    }
  },
  change(lobby, coin, direction, percent, duration) {
    percent += (Math.random() / 2) * Helper.minusPlus()

    const reversedDir = direction == 'up' ? 'down' : 'up'

    Graph.guideGraph(lobby, coin, direction, percent)
    Graph.prolongLastChange(lobby, coin, duration)
    Graph.guideGraph(lobby, coin, reversedDir, percent)
  },
  async addHistory(lobby) {
    Data.history[lobby] = {
      BTC: [],
      LTC: [],
      ETH: [],
      DOT: [],
      LINK: [],
      XRP: [],
    }

    Data.graphPricesQeue[lobby] = {
      BTC: [],
      LTC: [],
      ETH: [],
      DOT: [],
      LINK: [],
      XRP: [],
    }

    await Graph.updateHistory(lobby)

    return Data.history[lobby]
  },
  getHistory(lobby) {
    return { lobby, history: Data.history[lobby] }
  },
  async updateAllHistory() {
    const lobbies = Object.keys(Data.history)

    for (let lobby of lobbies) {
      await Graph.updateHistory(lobby)
    }
  },
  async updateRealHistory() {
    for (let [net, currency] of coins) {
      if (!Data.realHistory[net]['1h']) {
        Data.realHistory[net] = await Market.allHistory(currency)
      }
    }

    await Graph.updateAllHistory()

    setTimeout(Graph.updateRealHistory, 10 * 60000)
  },
  async updateHistory(lobby) {
    const historyInstance = Data.history[lobby]
    const real = Graph.getRealHistory()

    for (let net of coins.map(c => c[0])) {
      if (!historyInstance[net]['1h']) {
        historyInstance[net] = real[net]
      } else {
        const h = historyInstance[net]['1h']
        const lastTs = h[h.length - 1][0]

        Object.keys(historyInstance[net]).forEach(range => {
          const newPoints = historyInstance[net][range].filter(
            point => point[0] > lastTs,
          )
          historyInstance[net][range].push(...newPoints)
        })
      }
    }
  },
  getRealHistory() {
    return JSON.parse(JSON.stringify(Data.realHistory))
  },
  getQeued() {
    const result = Object.entries(Data.graphPricesQeue)
      .filter(([lobby, qeue]) => {
        let hasQeue = false

        Object.entries(qeue).forEach(([currency, points]) => {
          if (points.length) {
            hasQeue = true
          }
        })

        return hasQeue
      })
      .map(([lobby, qeue]) => lobby)

    return result
  },
  applyFakedHistory() {
    const lobbies = Graph.getQeued()

    lobbies.forEach(lobby => {
      const historyInstance = Data.history[lobby]
      const canBeFaked = coins.map(c => c[0]).filter(c => historyInstance[c])

      canBeFaked.forEach(c => {
        const h = historyInstance[c]['1h']

        if (!h) return

        const lastTs = h[h.length - 1][0]

        if (
          !Data.graphPricesQeue[lobby][c].length ||
          lastTs + 113598 > +new Date()
        )
          return

        const fakePrice = Data.graphPricesQeue[lobby][c].shift()

        const el = [lastTs + 113598, fakePrice]

        Object.keys(historyInstance[c]).forEach(range => {
          historyInstance[c][range].shift()
          historyInstance[c][range].push(el)
        })
      })
    })
  },
}

const Orders = {
  updatePrice() {
    Market.currentPrice().then(data => {
      data.forEach(coin => {
        priceList[coin.id] = coin.price
      })

      Data.orders.BTC.splice(0, 0, Orders.placeNewOrder('bitcoin'))
      Data.orders.LTC.splice(0, 0, Orders.placeNewOrder('litecoin'))
      Data.orders.ETH.splice(0, 0, Orders.placeNewOrder('ethereum'))
      Data.orders.DOT.splice(0, 0, Orders.placeNewOrder('polkadot'))
      Data.orders.LINK.splice(0, 0, Orders.placeNewOrder('chainlink'))
      Data.orders.XRP.splice(0, 0, Orders.placeNewOrder('ripple'))

      if (Data.orders.BTC.length > 100) Data.orders.BTC.pop()
      if (Data.orders.ETH.length > 100) Data.orders.ETH.pop()
      if (Data.orders.LTC.length > 100) Data.orders.LTC.pop()
      if (Data.orders.DOT.length > 100) Data.orders.DOT.pop()
      if (Data.orders.LINK.length > 100) Data.orders.LINK.pop()
      if (Data.orders.XRP.length > 100) Data.orders.XRP.pop()
    })
  },
  placeNewOrder(currency) {
    var price = priceList[currency]
    var amount = (Math.random() * Math.random()) / 10
    var t = new Date()

    if (Math.random() > 0.9) amount += 1
    else if (Math.random() > 0.9) amount += 0.1

    return {
      price,
      amount: amount.toFixed(10),
      time:
        (t.getHours() < 10 ? '0' + t.getHours() : t.getHours()) +
        ':' +
        (t.getMinutes() < 10 ? '0' + t.getMinutes() : t.getMinutes()) +
        ':' +
        (t.getSeconds() < 10 ? '0' + t.getSeconds() : t.getSeconds()),
      action: Math.random() > 0.5 ? 'buy' : 'sell',
    }
  },
  get(lobby) {
    return Data.orders
  },
}

const defineIO = value => {
  io = value
}

Graph.updateRealHistory()
setInterval(Graph.applyFakedHistory, 4000)
setInterval(Orders.updatePrice, 900)

setInterval(() => {
  lobbies.forEach(lobby => {
    if (!Data.history[lobby]) {
      Graph.addHistory(lobby).then(() => {
        io.emit('update-history', Graph.getHistory(lobby))
      })
    } else {
      // console.log(Graph.getHistory(lobby))
      io.emit('update-history', Graph.getHistory(lobby))
    }
  })
}, 4000)

setInterval(() => {
  lobbies = Array.from(io.sockets.sockets).map(s => s[1].handshake.query.lobby)

  lobbies.forEach(lobby => {
    if (!Data.history[lobby]) {
      Graph.addHistory(lobby).then(history => {
        io.emit('update-history', Graph.getHistory(lobby))
      })
    }

    io.emit('update-orders', Orders.get(/* lobby */))
  })
}, Helper.randomDelay())

module.exports = {
  change: Graph.change,
  addHistory: Graph.addHistory,
  defineIO,
}
