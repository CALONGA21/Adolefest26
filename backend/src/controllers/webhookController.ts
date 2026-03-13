import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { prisma } from '../lib/prisma';

const parseSignatureHeader = (value: string): { ts?: string; v1?: string } => {
  const parts = value.split(',').map((part) => part.trim());
  const result: { ts?: string; v1?: string } = {};

  for (const part of parts) {
    const [key, parsedValue] = part.split('=');
    if (key === 'ts' && parsedValue) {
      result.ts = parsedValue;
    }
    if (key === 'v1' && parsedValue) {
      result.v1 = parsedValue;
    }
  }

  return result;
};

type SignatureValidationResult = {
  valid: boolean;
  reason?: string;
  manifest?: string;
  expected?: string;
  provided?: string;
  paymentId?: string;
  ts?: string;
  requestId?: string;
};

const getPaymentIdFromWebhook = (req: Request): string | null => {
  const queryDataId = req.query['data.id'];
  if (typeof queryDataId === 'string' && queryDataId.length > 0) {
    return queryDataId;
  }

  const bodyData = req.body as { data?: { id?: unknown } };
  const bodyDataId = bodyData?.data?.id;

  if (typeof bodyDataId === 'string' && bodyDataId.length > 0) {
    return bodyDataId;
  }

  if (typeof bodyDataId === 'number') {
    return String(bodyDataId);
  }

  return null;
};

const validateMercadoPagoSignature = (req: Request, webhookSecret: string): SignatureValidationResult => {
  const signatureHeader = req.header('x-signature');
  const requestId = req.header('x-request-id');

  if (!signatureHeader || !requestId) {
    return {
      valid: false,
      reason: 'missing_signature_or_request_id',
      requestId: requestId ?? undefined,
    };
  }

  const { ts, v1 } = parseSignatureHeader(signatureHeader);
  const paymentId = getPaymentIdFromWebhook(req);

  if (!ts || !v1 || !paymentId) {
    return {
      valid: false,
      reason: 'missing_ts_v1_or_payment_id',
      provided: v1,
      paymentId: paymentId ?? undefined,
      ts,
      requestId,
    };
  }

  // Mercado Pago signature manifest: id + request-id + timestamp.
  const manifest = `id:${paymentId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = createHmac('sha256', webhookSecret).update(manifest).digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(v1, 'utf8');

  if (expectedBuffer.length !== providedBuffer.length) {
    return {
      valid: false,
      reason: 'length_mismatch',
      manifest,
      expected,
      provided: v1,
      paymentId,
      ts,
      requestId,
    };
  }

  const valid = timingSafeEqual(expectedBuffer, providedBuffer);

  return {
    valid,
    reason: valid ? undefined : 'hash_mismatch',
    manifest,
    expected,
    provided: v1,
    paymentId,
    ts,
    requestId,
  };
};

const extractOrderId = (paymentDetails: {
  external_reference?: string | null;
  metadata?: Record<string, unknown> | null;
}): number | null => {
  const externalReference = paymentDetails.external_reference;
  if (externalReference) {
    const parsedExternalRef = Number(externalReference);
    if (Number.isInteger(parsedExternalRef) && parsedExternalRef > 0) {
      return parsedExternalRef;
    }
  }

  const metadataOrderId = paymentDetails.metadata?.order_id;
  if (typeof metadataOrderId === 'number' && Number.isInteger(metadataOrderId) && metadataOrderId > 0) {
    return metadataOrderId;
  }

  if (typeof metadataOrderId === 'string') {
    const parsedMetadataOrderId = Number(metadataOrderId);
    if (Number.isInteger(parsedMetadataOrderId) && parsedMetadataOrderId > 0) {
      return parsedMetadataOrderId;
    }
  }

  return null;
};

export const createMercadoPagoWebhookController = (accessToken: string, webhookSecret: string) => {
  const mpClient = new MercadoPagoConfig({ accessToken });
  const paymentApi = new Payment(mpClient);

  return async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('[MP WEBHOOK] ===== INICIO =====');
      console.log('[MP WEBHOOK] Metodo:', req.method);
      console.log('[MP WEBHOOK] URL:', req.originalUrl);
      console.log('[MP WEBHOOK] Headers:', JSON.stringify(req.headers, null, 2));
      console.log('[MP WEBHOOK] Query:', JSON.stringify(req.query, null, 2));
      console.log('[MP WEBHOOK] Body:', JSON.stringify(req.body, null, 2));

      const signatureValidation = validateMercadoPagoSignature(req, webhookSecret);

      if (!signatureValidation.valid) {
        console.log('[MP WEBHOOK] Assinatura invalida. x-signature:', req.header('x-signature'));
        console.log('[MP WEBHOOK] Assinatura invalida. x-request-id:', req.header('x-request-id'));
        console.log('[MP WEBHOOK] Assinatura invalida. reason:', signatureValidation.reason);
        console.log('[MP WEBHOOK] Assinatura invalida. manifest:', signatureValidation.manifest);
        console.log('[MP WEBHOOK] Assinatura invalida. expected:', signatureValidation.expected);
        console.log('[MP WEBHOOK] Assinatura invalida. provided:', signatureValidation.provided);
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const paymentId = getPaymentIdFromWebhook(req);
      if (!paymentId) {
        console.log('[MP WEBHOOK] Sem paymentId em query/body. topic/type:', {
          topic: req.query.topic,
          type: req.query.type,
          action: req.query.action,
        });
        res.status(400).json({ error: 'ID de pagamento ausente no webhook' });
        return;
      }

      console.log('[MP WEBHOOK] paymentId recebido:', paymentId);

      let paymentDetails;

      try {
        paymentDetails = await paymentApi.get({ id: paymentId });
      } catch (error) {
        const webhookBody = req.body as { live_mode?: boolean; action?: string; type?: string };

        if (webhookBody.live_mode === false) {
          console.log('[MP WEBHOOK] Notificacao de simulacao validada. Ignorando consulta de payment inexistente:', {
            paymentId,
            action: webhookBody.action,
            type: webhookBody.type,
          });
          res.status(200).json({ received: true, simulated: true });
          return;
        }

        throw error;
      }

      console.log('[MP WEBHOOK] payment status:', paymentDetails.status, 'external_reference:', paymentDetails.external_reference);

      if (paymentDetails.status === 'approved') {
        const orderId = extractOrderId(paymentDetails);

        if (!orderId) {
          res.status(400).json({ error: 'Nao foi possivel identificar o pedido para aprovacao' });
          return;
        }

        const updated = await prisma.order.updateMany({
          where: { id: orderId },
          data: { status: 'APPROVED' },
        });

        console.log('[MP WEBHOOK] Pedido atualizado para APPROVED:', { orderId, updatedCount: updated.count });

        if (updated.count === 0) {
          res.status(404).json({ error: 'Pedido nao encontrado para aprovacao' });
          return;
        }
      }

      console.log('[MP WEBHOOK] Finalizado com sucesso');
      console.log('[MP WEBHOOK] ===== FIM =====');

      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Erro no webhook do Mercado Pago:', error);
      res.status(500).json({ error: 'Falha ao processar webhook' });
    }
  };
};
