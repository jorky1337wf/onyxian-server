const namecheap = require('./namecheap')
const launch = require('../launchLog')

const User = require('../models/User')
const Domain = require('../models/Domain')

async function main() {
  await namecheap.init()

  launch.log('Domains initializated')
}

async function getManager(domain) {
  const d = await Domain.findOne({ name: domain })

  if (d) {
    return d.manager
  } else {
    return 'Nobody'
  }
}

async function getList() {
  const domains = (
    await namecheap.getList()
  ).response[0].DomainGetListResult[0].Domain.map(d => d.$)
  const domainsObjects = await Domain.find({})

  domains.forEach(domain => {
    const search = domainsObjects.filter(d => d.name == domain.Name)

    domain.Assigned = search.length ? search[0].manager : 'Nobody'
  })

  return domains
}

async function assignDomain(domain, email) {
  try {
    await namecheap.setDNSRecords(domain, [
      {
        type: 'A',
        host: 'www',
        value: namecheap.getIP(),
      },
      {
        type: 'A',
        host: '@',
        value: namecheap.getIP(),
      },
    ])

    const manager = await getManager(domain)

    if (manager == 'Nobody') {
      await new Domain({
        name: domain,
        manager: email,
      }).save(null)
    } else {
      const domainObject = await Domain.findOne({ name: domain })
      domainObject.manager = email
      await domainObject.save(null)
    }

    return { message: 'Domain was added and configured' }
  } catch (e) {
    if (e.response) {
      const msg = e.response.data.error.message

      throw new Error(msg)
    } else {
      const msg = e.message

      if (msg.startsWith('2019166')) {
        throw new Error('You have not purchased this domain')
      } else {
        throw e
      }
    }
  }
}

const parseDomain = url => {
  if (typeof url == 'string') {
    return new URL(url).hostname.replace('www.', '')
  } else {
    return new URL('https://' + url.headers.host).hostname.replace('www.', '')
  }
}

const getProjectName = url => {
  const capitalize = (str, lower = false) =>
    (lower ? str.toLowerCase() : str).replace(/(?:^|\s|["'([{])+\S/g, match =>
      match.toUpperCase(),
    )

  let name = parseDomain(url)
    .replace(/www\./, '')
    .replace(new RegExp('(.\\w+)$', 'g'), '')

  return name
    .replace(new RegExp('[_-]', 'g'), ' ')
    .split(' ')
    .map(w => capitalize(w))
    .join('')
}

module.exports = {
  init: main,
  assignDomain,
  getIP: namecheap.getIP,
  getList,
  getManager,
  parseDomain,
  getProjectName,
}
