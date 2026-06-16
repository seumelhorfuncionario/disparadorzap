import { NextRequest, NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'
import { requireSessionOrApiKey } from '@/lib/request-auth'

export const dynamic = 'force-dynamic'

const APP_ID = '1430587438753533'
const APP_VERSION = 'v25.0'
const GRAPH_BASE = `https://graph.facebook.com/${APP_VERSION}`

// Troca o code OAuth pelo access_token usando o APP_SECRET (nunca sai do servidor).
// O frontend envia apenas: code, waba_id, phone_number_id — sem tocar no secret.
export async function POST(request: NextRequest) {
  // Exige session do dashboard ou API key válida — endpoint é destrutivo (sobrescreve credenciais)
  const authError = await requireSessionOrApiKey(request)
  if (authError) return authError

  const appSecret = process.env.META_EMBEDDED_SIGNUP_SECRET
  if (!appSecret) {
    return NextResponse.json(
      { error: 'META_EMBEDDED_SIGNUP_SECRET não configurado no servidor' },
      { status: 500 }
    )
  }

  let body: { code?: string; waba_id?: string; phone_number_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { code, waba_id, phone_number_id } = body

  if (!code || !waba_id || !phone_number_id) {
    return NextResponse.json(
      { error: 'Campos obrigatórios: code, waba_id, phone_number_id' },
      { status: 400 }
    )
  }

  // 1. Trocar code por access_token
  const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`)
  tokenUrl.searchParams.set('client_id', APP_ID)
  tokenUrl.searchParams.set('client_secret', appSecret)
  tokenUrl.searchParams.set('code', code)

  const tokenRes = await fetch(tokenUrl.toString())
  const tokenJson = await tokenRes.json()

  if (!tokenRes.ok || !tokenJson.access_token) {
    console.error('[embedded-signup] token exchange failed:', tokenJson)
    return NextResponse.json(
      {
        error: 'Falha ao trocar o código pelo token',
        details: tokenJson?.error?.message || JSON.stringify(tokenJson),
      },
      { status: 400 }
    )
  }

  const accessToken: string = tokenJson.access_token

  // 2. Salvar credenciais no banco (mesmo schema que o fluxo manual)
  try {
    await settingsDb.saveAll({
      phoneNumberId: phone_number_id,
      businessAccountId: waba_id,
      accessToken,
      isConnected: true,
    })
  } catch (err) {
    console.error('[embedded-signup] saveAll failed:', err)
    return NextResponse.json(
      { error: 'Falha ao salvar credenciais no banco' },
      { status: 500 }
    )
  }

  // 3. Subscrever webhooks (best-effort — não bloqueia o sucesso)
  try {
    const webhookRes = await fetch(`${GRAPH_BASE}/${waba_id}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!webhookRes.ok) {
      const err = await webhookRes.json()
      console.warn('[embedded-signup] webhook subscription warning:', err)
    }
  } catch (err) {
    console.warn('[embedded-signup] webhook subscription failed (non-fatal):', err)
  }

  return NextResponse.json({
    success: true,
    waba_id,
    phone_number_id,
    message: 'Credenciais salvas com sucesso via Embedded Signup.',
  })
}
