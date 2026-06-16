'use client';

import React from 'react';
import { Settings, Clock, ShieldCheck, Zap } from 'lucide-react';
import { OnboardingPath } from '../hooks/useOnboardingProgress';
import { EmbeddedSignupButton } from '@/components/features/settings/EmbeddedSignupButton';

interface WelcomeStepProps {
  onSelectPath: (path: OnboardingPath) => void;
  /** Chamado quando o Embedded Signup conclui com sucesso (marca onboarding completo) */
  onEmbeddedSuccess?: () => void | Promise<void>;
}

export function WelcomeStep({ onSelectPath, onEmbeddedSuccess }: WelcomeStepProps) {
  return (
    <div className="space-y-5 pt-2">
      {/* Opção principal: Cadastro Incorporado (Embedded Signup) via Meta */}
      <div className="p-5 rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 relative overflow-hidden">
        <div className="absolute top-3 right-3">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-semibold uppercase tracking-wide">
            Recomendado
          </span>
        </div>

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <Zap className="w-6 h-6 text-emerald-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white mb-1">Conectar com a Meta</h3>
            <p className="text-sm text-zinc-400 mb-3">
              Conecte seu WhatsApp Business em poucos cliques pelo fluxo oficial da Meta.
              Sem criar aplicativo, sem copiar tokens.
            </p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500 mb-4">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                ~2 minutos
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Conexão segura e oficial
              </span>
            </div>

            <EmbeddedSignupButton onSuccess={() => onEmbeddedSuccess?.()} />
          </div>
        </div>
      </div>

      {/* Divisória */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-zinc-800" />
        <span className="text-xs text-zinc-600 uppercase tracking-wide">ou</span>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>

      {/* Opção secundária: Configuração manual (avançado) */}
      <button
        onClick={() => onSelectPath('guided')}
        className="w-full p-4 rounded-xl border border-zinc-700/60 hover:border-zinc-600 hover:bg-zinc-800/50 transition-all text-left group"
      >
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0 group-hover:bg-zinc-700 transition-colors">
            <Settings className="w-5 h-5 text-zinc-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-zinc-200 mb-1 text-sm">Configuração manual (avançado)</h3>
            <p className="text-xs text-zinc-500 mb-1.5">
              Guia passo a passo para criar o app no Meta e copiar as credenciais manualmente.
            </p>
            <div className="flex items-center gap-1.5 text-xs text-zinc-600">
              <Clock className="w-3 h-3" />
              <span>~20-30 minutos</span>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}
