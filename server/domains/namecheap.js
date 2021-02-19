const namecheapApi = require('namecheap-api')
const IP = require('./ip')

require('dotenv/config')

const API_USER = process.env.NAMECHEAP_API_USER
const API_KEY = process.env.NAMECHEAP_API_KEY
var CLIENT_IP = ''

async function main() {
  CLIENT_IP = await IP.get()

  namecheapApi.config.set('ApiUser', API_USER)
  namecheapApi.config.set('ApiKey', API_KEY)
  namecheapApi.config.set('UserName', API_USER)
  namecheapApi.config.set('ClientIp', CLIENT_IP)
}

async function query(command, params = {}, sandbox) {
  try {
    return await namecheapApi.apiCall(command, params, sandbox)
  } catch (err) {
    if (err.response) {
      throw new Error(err.response.message)
    } else {
      throw new Error(err)
    }
  }
}

async function getList() {
  return query('namecheap.domains.getList')
}

async function getProfile() {
  return (
    await query(
      'namecheap.users.address.getInfo',
      (params = {
        AddressId: 0,
      }),
    )
  ).response[0].GetAddressInfoResult[0]
}

async function registerNewDomain(domain, years) {
  const profile = await getProfile()
  const res = await query(
    'namecheap.domains.create',
    (params = {
      DomainName: domain,
      Years: years,
      RegistrantFirstName: profile.FirstName[0],
      RegistrantLastName: profile.LastName[0],
      RegistrantAddress1: profile.Address1[0],
      RegistrantCity: profile.City[0],
      RegistrantStateProvince: profile.StateProvince[0],
      RegistrantPostalCode: profile.Zip[0],
      RegistrantCountry: profile.Country[0],
      RegistrantPhone: profile.Phone[0],
      RegistrantEmailAddress: profile.EmailAddress[0],
      TechFirstName: profile.FirstName[0],
      TechLastName: profile.LastName[0],
      TechAddress1: profile.Address1[0],
      TechCity: profile.City[0],
      TechStateProvince: profile.StateProvince[0],
      TechPostalCode: profile.Zip[0],
      TechCountry: profile.Country[0],
      TechPhone: profile.Phone[0],
      TechEmailAddress: profile.EmailAddress[0],
      AdminFirstName: profile.FirstName[0],
      AdminLastName: profile.LastName[0],
      AdminAddress1: profile.Address1[0],
      AdminCity: profile.City[0],
      AdminStateProvince: profile.StateProvince[0],
      AdminPostalCode: profile.Zip[0],
      AdminCountry: profile.Country[0],
      AdminPhone: profile.Phone[0],
      AdminEmailAddress: profile.EmailAddress[0],
      AuxBillingFirstName: profile.FirstName[0],
      AuxBillingLastName: profile.LastName[0],
      AuxBillingAddress1: profile.Address1[0],
      AuxBillingCity: profile.City[0],
      AuxBillingStateProvince: profile.StateProvince[0],
      AuxBillingPostalCode: profile.Zip[0],
      AuxBillingCountry: profile.Country[0],
      AuxBillingPhone: profile.Phone[0],
      AuxBillingEmailAddress: profile.EmailAddress[0],
    }),
  )

  return res.response[0].DomainCreateResult[0].$
}

async function setCustomNameservers(domain, nameservers) {
  const [SLD, TLD] = domain.split('.')

  return query('dns.setCustom', {
    SLD,
    TLD,
    NameServers: nameservers.join(','),
  })
}

async function setDNSRecords(domain, records) {
  const [SLD, TLD] = domain.split('.')
  const parsedRecords = Object.assign(
    { SLD, TLD },
    ...records.map((r, i) => ({
      ['HostName' + (i + 1)]: r.host,
      ['RecordType' + (i + 1)]: r.type,
      ['Address' + (i + 1)]: r.value,
      ['TTL' + (i + 1)]: 60,
    })),
  )

  try {
    const data = await query('namecheap.domains.dns.setHosts', parsedRecords)
    const success =
      data.response[0].DomainDNSSetHostsResult[0].$.IsSuccess == 'true'
        ? true
        : false

    return success
  } catch (e) {
    throw new Error(e.message)
  }
}

module.exports = {
  init: main,
  getList,
  getIP: () => CLIENT_IP,
  setCustomNameservers,
  setDNSRecords,
  registerNewDomain,
}
