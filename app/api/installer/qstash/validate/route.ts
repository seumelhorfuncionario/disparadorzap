import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/installer/qstash/validate
 *
 * Valida o token do QStash fazendo uma request à API.
 * Usado no step 4 do wizard de instalação.
 */
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    // Validação básica
    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Token QStash é obrigatório' },
        { status: 400 }
      );
    }

    // Validar token via management API (URL global — independente da região de publicação)
    const qstashRes = await fetch('https://qstash.upstash.io/v2/schedules', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!qstashRes.ok) {
      if (qstashRes.status === 401 || qstashRes.status === 403) {
        return NextResponse.json(
          { error: 'Token QStash inválido. Verifique se copiou o QSTASH_TOKEN correto no painel do Upstash.' },
          { status: 401 }
        );
      }

      const errorText = await qstashRes.text().catch(() => '');
      return NextResponse.json(
        { error: `Erro ao validar token: ${errorText || qstashRes.statusText}` },
        { status: qstashRes.status }
      );
    }

    return NextResponse.json({
      valid: true,
      message: 'Token QStash válido',
    });

  } catch (error) {
    console.error('[installer/qstash/validate] Erro:', error);
    return NextResponse.json(
      { error: 'Erro interno ao validar token' },
      { status: 500 }
    );
  }
}
