import nodemailer, { SendMailOptions, createTransport } from 'nodemailer'
import { config } from './config.js'
import { debugLog } from './debug.js'

let log = debugLog('email.ts')
log.enabled = true

let transport = createTransport(config.email)

export interface SentMessageInfo {
  accepted: string[]
  rejected: string[]
  response: string // e.g. '250 2.0.0 OK  1703241394 b11-xxxx.299 - gsmtp',
  envelope: { from: string; to: string[] }
  messageId: string
}

export async function sendEmail(
  options: SendMailOptions,
): Promise<SentMessageInfo> {
  if (config.email.auth.user === 'skip') {
    log('sendEmail:', options)
    let to: string[] = Array.isArray(options.to)
      ? (options.to as string[])
      : [options.to as string]
    return {
      accepted: to,
      rejected: [],
      response: '250 2.0.0 OK',
      envelope: { from: options.from as string, to },
      messageId: 'mock-message-id',
    }
  }
  let info = await transport.sendMail(options)
  return info as SentMessageInfo
}
