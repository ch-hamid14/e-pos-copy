import type { Knex } from 'knex'
import { randomInt } from 'crypto'

export type OtpPurpose = 'email_verify' | 'device_reset'

const OTP_TTL_MINUTES = 10

export function generateOtpCode(): string {
  return String(randomInt(100000, 999999))
}

export async function createOtp(
  db: Knex,
  email: string,
  purpose: OtpPurpose
): Promise<string> {
  const code = generateOtpCode()
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)

  await db('otp_codes')
    .where({ email, purpose, used: false })
    .update({ used: true })

  await db('otp_codes').insert({
    email: email.toLowerCase(),
    code,
    purpose,
    expires_at: expiresAt,
    used: false
  })

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[OTP] ${purpose} for ${email}: ${code}`)
  }

  return code
}

export async function verifyOtp(
  db: Knex,
  email: string,
  code: string,
  purpose: OtpPurpose
): Promise<boolean> {
  const row = await db('otp_codes')
    .where({
      email: email.toLowerCase(),
      code,
      purpose,
      used: false
    })
    .where('expires_at', '>', new Date())
    .orderBy('created_at', 'desc')
    .first()

  if (!row) return false

  await db('otp_codes').where({ id: row.id }).update({ used: true })
  return true
}
