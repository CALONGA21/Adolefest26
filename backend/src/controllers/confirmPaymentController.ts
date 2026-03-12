import type { Request, Response } from 'express';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const confirmPayloadSchema = z.object({
  order_id: z.number().int().positive('order_id deve ser inteiro positivo'),
  formData: z.record(z.string(), z.unknown()),
});

export const createConfirmPaymentController = (accessToken: string) => {
  const mpClient = new MercadoPagoConfig({ accessToken });
  const paymentApi = new Payment(mpClient);

  return async (req: Request, res: Response): Promise<void> => {
    const parsed = confirmPayloadSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Payload invalido',
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    const { order_id, formData } = parsed.data;

    try {
      const order = await prisma.order.findUnique({ where: { id: order_id } });

      if (!order) {
        res.status(404).json({ error: 'Pedido nao encontrado' });
        return;
      }

      // Idempotency: already approved by a previous call or webhook — just confirm success
      if (order.status === 'APPROVED') {
        res.status(200).json({ status: 'approved' });
        return;
      }

      if (order.status !== 'PENDING') {
        res.status(409).json({ error: `Pedido ja processado com status: ${order.status}` });
        return;
      }

      // Create the payment on Mercado Pago using the token/data from the Brick.
      // The idempotency_key from the order prevents double-charging on retries.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payment = await paymentApi.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body: {
          ...formData,
          external_reference: String(order_id),
          metadata: { order_id },
        } as any,
        requestOptions: { idempotencyKey: order.idempotency_key },
      });

      if (payment.status === 'approved') {
        await prisma.order.update({
          where: { id: order_id },
          data: { status: 'APPROVED' },
        });
      } else if (payment.status === 'rejected') {
        await prisma.order.update({
          where: { id: order_id },
          data: { status: 'CANCELLED' },
        });
        res.status(200).json({ status: 'rejected', payment_id: payment.id });
        return;
      }
      // status === 'pending' or 'in_process': order stays PENDING and the webhook will update it

      res.status(200).json({ status: payment.status, payment_id: payment.id });
    } catch (error) {
      console.error('Erro ao confirmar pagamento:', error);
      res.status(500).json({ error: 'Falha ao processar pagamento' });
    }
  };
};
