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

const isValidMercadoPagoSignature = (req: Request, webhookSecret: string): boolean => {
  const signatureHeader = req.header('x-signature');
  const requestId = req.header('x-request-id');

  if (!signatureHeader || !requestId) {
    return false;
  }

  const { ts, v1 } = parseSignatureHeader(signatureHeader);
  const paymentId = getPaymentIdFromWebhook(req);

  if (!ts || !v1 || !paymentId) {
    return false;
  }

  // Mercado Pago signature manifest: id + request-id + timestamp.
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const expected = createHmac('sha256', webhookSecret).update(manifest).digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(v1, 'utf8');

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
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
      const validSignature = isValidMercadoPagoSignature(req, webhookSecret);

      if (!validSignature) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const paymentId = getPaymentIdFromWebhook(req);
      if (!paymentId) {
        res.status(400).json({ error: 'ID de pagamento ausente no webhook' });
        return;
      }

      const paymentDetails = await paymentApi.get({ id: paymentId });

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

        if (updated.count === 0) {
          res.status(404).json({ error: 'Pedido nao encontrado para aprovacao' });
          return;
        }
      }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Erro no webhook do Mercado Pago:', error);
      res.status(500).json({ error: 'Falha ao processar webhook' });
    }
  };
};
