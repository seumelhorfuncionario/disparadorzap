import { NextRequest, NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'
import { requireSessionOrApiKey } from '@/lib/request-auth'

export const dynamic = 'force-dynamic'

const APP_ID = '1430587438753533'
const APP_VERSION = 'v25.0'
const GRAPH_BASE = `https://graph.facebook.com/${APP_VERSION}`

// Fluxo Embedded Signup (Tech Provider):
// O frontend envia apenas { code, waba_id } — capturados do FB.login (code) e do
// postMessage WA_EMBEDDED_SIGNUP (waba_id). O APP_SECRET nunca sai do servidor.
// Aqui: 1) troca code por access_token, 2) busca o phone_id na Graph API,
// 3) salva credenciais, 4) subscreve webhooks.
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

  let body: { code?: string; waba_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { code, waba_id } = body

  if (!code || !waba_id) {
    return NextResponse.json(
      { error: 'Campos obrigatórios: code, waba_id' },
      { status: 400 }
    )
  }

  // 1. Trocar code por access_token (System User token)
  const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`)
  tokenUrl.searchParams.set('client_id', APP_ID)
  tokenUrl.searchParams.set('client_secret', appSecret)
  tokenUrl.searchParams.set('code', code)

  const tokenRes = await fetch(tokenUrl.toString(), { method: 'POST' })
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

  // 2. Recuperar o phone_id da WABA via Graph API
  let phoneNumberId = ''
  try {
    const phoneRes = await fetch(
      `${GRAPH_BASE}/${waba_id}/phone_numbers?fields=id&access_token=${accessToken}`
    )
    const phoneJson = await phoneRes.json()

    if (!phoneRes.ok) {
      console.error('[embedded-signup] phone_numbers fetch failed:', phoneJson)
      return NextResponse.json(
        {
          error: 'Falha ao recuperar o número de telefone da conta',
          details: phoneJson?.error?.message || JSON.stringify(phoneJson),
        },
        { status: 400 }
      )
    }

    phoneNumberId = phoneJson?.data?.[0]?.id ?? ''
    if (!phoneNumberId) {
      return NextResponse.json(
        { error: 'Nenhum número de telefone encontrado na conta do WhatsApp Business' },
        { status: 400 }
      )
    }
  } catch (err) {
    console.error('[embedded-signup] phone_numbers fetch error:', err)
    return NextResponse.json(
      { error: 'Erro ao consultar o número de telefone na Meta' },
      { status: 500 }
    )
  }

  // 3. Salvar credenciais no banco (mesmo schema que o fluxo manual)
  try {
    await settingsDb.saveAll({
      phoneNumberId,
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

  // 4. Subscrever webhooks (best-effort — não bloqueia o sucesso)
  try {
    const webhookRes = await fetch(`${GRAPH_BASE}/${waba_id}/subscribed_apps`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
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
    phone_number_id: phoneNumberId,
    message: 'Credenciais salvas com sucesso via Embedded Signup.',
  })
}
