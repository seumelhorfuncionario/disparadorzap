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

    const existing = document.getElementById('fb-sdk')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      return
    }

    ;(window as any).fbAsyncInit = () => {
      ;(window as any).FB.init({ appId, version, cookie: true, xfbml: false })
      resolve()
    }

    const script = document.createElement('script')
    script.id = 'fb-sdk'
    script.src = FB_SDK_URL
    script.async = true
    script.defer = true
    document.head.appendChild(script)
  })
}

export function EmbeddedSignupButton({ onSuccess }: EmbeddedSignupButtonProps) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<'idle' | 'loading' | 'exchanging' | 'done' | 'error'>('idle')
  const sessionDataRef = useRef<{ waba_id: string; phone_number_id: string } | null>(null)

  // Captura a mensagem de session info enviada pela Meta durante o fluxo
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com') return
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (data?.type === 'WA_EMBEDDED_SIGNUP' && data?.event === 'FINISH') {
          sessionDataRef.current = {
            waba_id: data.data?.waba_id ?? '',
            phone_number_id: data.data?.phone_number_id ?? '',
          }
        }
      } catch {
        // mensagem não-JSON — ignorar
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handleClick = useCallback(async () => {
    setStatus('loading')
    sessionDataRef.current = null

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
      async (response: any) => {
        if (response.authResponse?.code) {
          const code: string = response.authResponse.code

          // A mensagem postMessage pode chegar ligeiramente antes ou depois do callback.
          // Aguardamos até 2 s para ter o sessionData.
          let session = sessionDataRef.current
          if (!session?.waba_id) {
            await new Promise<void>((resolve) => {
              const deadline = Date.now() + 2000
              const poll = setInterval(() => {
                if (sessionDataRef.current?.waba_id || Date.now() > deadline) {
                  clearInterval(poll)
                  resolve()
                }
              }, 100)
            })
            session = sessionDataRef.current
          }

          if (!session?.waba_id || !session?.phone_number_id) {
            toast.error('Não foi possível obter o número de telefone da Meta. Tente novamente.')
            setStatus('error')
            return
          }

          setStatus('exchanging')

          try {
            const res = await fetch('/api/settings/embedded-signup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code,
                waba_id: session.waba_id,
                phone_number_id: session.phone_number_id,
              }),
            })

            const json = await res.json()

            if (!res.ok || !json.success) {
              throw new Error(json.error || 'Falha ao salvar credenciais')
            }

            setStatus('done')
            toast.success('WhatsApp conectado com sucesso via Embedded Signup!')
            // Refresca as settings na UI sem reload de página
            queryClient.invalidateQueries({ queryKey: ['allSettings'] })
            queryClient.invalidateQueries({ queryKey: ['settings'] })
            onSuccess?.({ wabaId: session.waba_id, phoneNumberId: session.phone_number_id })
          } catch (err: any) {
            toast.error(err?.message || 'Erro ao salvar credenciais')
            setStatus('error')
          }
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
          setup: {},
          featureType: '',
          sessionInfoVersion: '2',
        },
      }
    )
  }, [onSuccess])

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
