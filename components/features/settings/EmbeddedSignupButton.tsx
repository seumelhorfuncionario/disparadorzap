'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, MessageSquare } from 'lucide-react'

// Valores públicos do app SmartZap na Meta (nunca o APP_SECRET — fica no backend)
const APP_ID = '1430587438753533'
const CONFIG_ID = '25922cf5b09b2f169e99c21ee0246bd6'
const APP_VERSION = 'v25.0'
const FB_SDK_URL = `https://connect.facebook.net/pt_BR/sdk.js`

interface EmbeddedSignupButtonProps {
  onSuccess?: (credentials: { wabaId: string; phoneNumberId: string }) => void
}

// Injeta o Facebook JS SDK uma única vez na página.
function loadFbSdk(appId: string, version: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve()
    if ((window as any).FB) return resolve()

    ;(window as any).fbAsyncInit = () => {
      ;(window as any).FB.init({
        appId,
        autoLogAppEvents: true,
        xfbml: true,
        version,
      })
      resolve()
    }

    const existing = document.getElementById('fb-sdk')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      return
    }

    const script = document.createElement('script')
    script.id = 'fb-sdk'
    script.src = FB_SDK_URL
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    document.head.appendChild(script)
  })
}

export function EmbeddedSignupButton({ onSuccess }: EmbeddedSignupButtonProps) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<'idle' | 'loading' | 'exchanging' | 'done' | 'error'>('idle')
  // waba_id chega pelo postMessage; code chega pelo callback do FB.login.
  const wabaIdRef = useRef<string>('')

  // Captura a session info enviada pela Meta durante o fluxo (postMessage).
  // O phone_id NÃO vem aqui — ele é recuperado no backend via Graph API.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // A Meta posta de múltiplos subdomínios (www / web / business).
      // Validar host com boundary de ponto + HTTPS — endsWith('facebook.com')
      // sozinho seria burlável por domínios tipo "evilfacebook.com".
      let origin: URL
      try {
        origin = new URL(event.origin)
      } catch {
        return
      }
      const isMetaOrigin =
        origin.protocol === 'https:' &&
        (origin.hostname === 'facebook.com' || origin.hostname.endsWith('.facebook.com'))
      if (!isMetaOrigin) return
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (data?.type === 'WA_EMBEDDED_SIGNUP' && data?.data?.waba_id) {
          wabaIdRef.current = data.data.waba_id
        }
      } catch {
        // mensagem não-JSON — ignorar
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const exchangeAndSave = useCallback(
    async (code: string) => {
      // O postMessage com waba_id pode chegar ligeiramente antes ou depois do callback.
      // Aguardamos até 3s para ter o waba_id.
      let wabaId = wabaIdRef.current
      if (!wabaId) {
        await new Promise<void>((resolve) => {
          const deadline = Date.now() + 3000
          const poll = setInterval(() => {
            if (wabaIdRef.current || Date.now() > deadline) {
              clearInterval(poll)
              resolve()
            }
          }, 100)
        })
        wabaId = wabaIdRef.current
      }

      if (!wabaId) {
        toast.error('Não foi possível obter a conta do WhatsApp Business da Meta. Tente novamente.')
        setStatus('error')
        return
      }

      setStatus('exchanging')

      try {
        const res = await fetch('/api/settings/embedded-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, waba_id: wabaId }),
        })

        const json = await res.json()

        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Falha ao salvar credenciais')
        }

        setStatus('done')
        toast.success('WhatsApp conectado com sucesso!')
        // Refresca as settings na UI sem reload de página
        queryClient.invalidateQueries({ queryKey: ['allSettings'] })
        queryClient.invalidateQueries({ queryKey: ['settings'] })
        queryClient.invalidateQueries({ queryKey: ['healthStatus'] })
        onSuccess?.({ wabaId, phoneNumberId: json.phone_number_id ?? '' })
      } catch (err: any) {
        toast.error(err?.message || 'Erro ao salvar credenciais')
        setStatus('error')
      }
    },
    [onSuccess, queryClient]
  )

  const handleClick = useCallback(async () => {
    setStatus('loading')
    wabaIdRef.current = ''

    try {
      await loadFbSdk(APP_ID, APP_VERSION)
    } catch {
      toast.error('Não foi possível carregar o SDK do Facebook')
      setStatus('error')
      return
    }

    const FB = (window as any).FB
    if (!FB) {
      toast.error('SDK do Facebook não disponível')
      setStatus('error')
      return
    }

    FB.login(
      (response: any) => {
        if (response.authResponse?.code) {
          void exchangeAndSave(response.authResponse.code)
        } else {
          // Usuário fechou ou cancelou o fluxo
          setStatus('idle')
        }
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          version: 'v3',
          setup: {},
          featureType: 'whatsapp_business_app_onboarding',
        },
      }
    )
  }, [exchangeAndSave])

  const isPending = status === 'loading' || status === 'exchanging'
  const label =
    status === 'loading'
      ? 'Abrindo Meta...'
      : status === 'exchanging'
        ? 'Salvando credenciais...'
        : status === 'done'
          ? 'Conectado!'
          : 'Conectar WhatsApp via Meta'

  return (
    <button
      onClick={handleClick}
      disabled={isPending || status === 'done'}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#20ba58] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
    >
      {isPending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <MessageSquare className="w-4 h-4" />
      )}
      {label}
    </button>
  )
}
