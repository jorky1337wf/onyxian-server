const moment = require('moment')
const CoinGecko = require('coingecko-api')
const CoinGeckoClient = new CoinGecko()

Array.prototype.max = function () {
  return Math.max.apply(null, this)
}

Array.prototype.min = function () {
  return Math.min.apply(null, this)
}

const normalize = (array, toMin, toMax) => {
  toMin = Math.min(toMin, toMax)
  toMax = Math.max(toMin, toMax)

  let delta = toMax - toMin

  let min = array.min()
  let max = array.max()

  return array.map(value => {
    let n = (value - min) / (max - min)
    return delta * n + toMin
  })
}

const getLinearChart = (maxChartX, maxChartY, data) => {
  var points = data
  var dataPoints = ''

  var min = points.map(point => point[1]).min()
  var max = points.map(point => point[1]).max()

  var timeline = points.map(point => point[0])

  points = normalize(
    points.map(point => maxChartY - point[1]),
    0,
    maxChartY,
  )

  // var interpolated = new Spline(timeline, points);
  // points = points.map((point, i) => interpolated.at(i * 0.1));

  min = points.min()
  max = points.max()

  points.forEach((point, i) => {
    dataPoints += `${Math.floor(
      (maxChartX / points.length) * i + maxChartX / points.length / 2,
    )},${Math.floor((point / max) * maxChartY) + 25} `
  })

  return dataPoints
}

function subdivideGraph(arr, subs) {
  let res = []

  for (let i = 0; i < arr.length; i++) {
    res.push(arr[i])

    let [t, v] = arr[i]

    if (!arr[i + 1]) return res

    let [t2, v2] = arr[i + 1]

    let tstep = (t2 - t) / subs
    let vstep = (v2 - v) / subs
    let subT = t
    let subV = v

    for (let s = 0; s < subs; s++) {
      let r = Math.random() * (vstep * 4) * (Math.random() > 0.5 ? -1 : 1)
      subV += vstep
      subT += tstep
      if (subV != v2 && subT != t2) {
        res.push([Math.floor(subT), subV + r])
      }
    }
  }

  return res
}

module.exports = {
  subdivideGraph,
  currentPrice: async () => {
    let data = await CoinGeckoClient.coins.all()
    return await data.data.map(coin => ({
      id: coin.id,
      price: coin.market_data.current_price.usd,
    }))
    // .filter(coin => ['bitcoin', 'litecoin', 'ethereum'].includes(coin.id));
  },
  allHistory: async coin => {
    const h = 60 * 60
    const d = h * 24
    const w = d * 7
    const m = d * 30

    let hour = await CoinGeckoClient.coins.fetchMarketChartRange(coin, {
      from: moment().unix() - h,
      to: moment().unix(),
      vs_currency: 'usd',
    })

    let day = await CoinGeckoClient.coins.fetchMarketChartRange(coin, {
      from: moment().unix() - d,
      to: moment().unix(),
      vs_currency: 'usd',
    })

    let week = await CoinGeckoClient.coins.fetchMarketChartRange(coin, {
      from: moment().unix() - w,
      to: moment().unix(),
      vs_currency: 'usd',
    })

    let month = await CoinGeckoClient.coins.fetchMarketChartRange(coin, {
      from: moment().unix() - m,
      to: moment().unix(),
      vs_currency: 'usd',
    })

    let months = await CoinGeckoClient.coins.fetchMarketChartRange(coin, {
      from: moment().unix() - m * 3,
      to: moment().unix(),
      vs_currency: 'usd',
    })

    let year = await CoinGeckoClient.coins.fetchMarketChartRange(coin, {
      from: moment().unix() - m * 12,
      to: moment().unix(),
      vs_currency: 'usd',
    })

    let all = await CoinGeckoClient.coins.fetchMarketChartRange(coin, {
      from: moment().unix() - 5 * (m * 12),
      to: moment().unix(),
      vs_currency: 'usd',
    })

    return {
      '1h': subdivideGraph(hour.data.prices, 4),
      '1d': day.data.prices,
      '1w': week.data.prices,
      '1m': month.data.prices,
      '3m': months.data.prices,
      '1y': year.data.prices,
      all: all.data.prices,
    }
  },
  historyLinearChart: async coin => {
    const t1 = moment().unix() - 60 * 60 * 24
    const t2 = moment().unix()

    let data = await CoinGeckoClient.coins.fetchMarketChartRange(coin, {
      from: t1,
      to: t2,
      vs_currency: 'usd',
    })

    const history = await data.data.prices.map((price, i) => {
      price[0] = i
      return price
    })

    return {
      coin,
      raw: history,
      range: '24h',
      points: getLinearChart(200, 50, history),
    }
  },
}
