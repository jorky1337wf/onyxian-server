const { passwordResetToken } = require('./token')
const { confirmationEmailTemplate, passwordResetTemplate } = require('./config')
const { parseDomain } = require('../domains')

const nodemailer = require('nodemailer')

const supportEmail = url => 'support@' + parseDomain(url)

const createTransport = url => {
  const user = supportEmail(url)
  const { SUPPORT_PASS: pass } = process.env

  return nodemailer.createTransport({
    host: 'mail.privateemail.com',
    port: 465,
    secure: true,
    auth: {
      user,
      pass,
    },
  })
}

module.exports = {
  send: (url, to, code) => {
    const user = supportEmail(url)
    return createTransport(url).sendMail({
      from: user,
      to,
      subject: 'Email Confirmation',
      html: confirmationEmailTemplate(code),
    })
  },
  passwordResetEmail: (url, to, userID) => {
    const user = supportEmail(url)
    const token = passwordResetToken({ userID })
    const resetUrl = `${url}/reset?token=` + token

    return createTransport(url).sendMail({
      from: user,
      to,
      subject: 'Password Reset Requested',
      html: passwordResetTemplate(resetUrl),
    })
  },
}
