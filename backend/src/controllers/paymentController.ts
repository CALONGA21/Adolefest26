import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const cpfDigits = (value: string): string => value.replace(/\D/g, '');

const isValidCpf = (value: string): boolean => {
  const cpf = cpfDigits(value);

  if (cpf.length !== 11 || /(\d)\1{10}/.test(cpf)) {
    return false;
  }

  const calculateDigit = (base: string, factor: number): number => {
    let total = 0;
    for (const digit of base) {
      total += Number(digit) * factor;
      factor -= 1;
    }

    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const digit1 = calculateDigit(cpf.slice(0, 9), 10);
  const digit2 = calculateDigit(cpf.slice(0, 10), 11);

  return cpf[9] === String(digit1) && cpf[10] === String(digit2);
};

const checkoutPayloadSchema = z.object({
  cpf: z.string().trim().refine(isValidCpf, { message: 'CPF invalido' }),
  nome: z.string().trim().min(3, 'Nome deve ter ao menos 3 caracteres'),
  email: z.string().trim().email('Email invalido'),
  id_evento: z.number().int().positive('id_evento deve ser inteiro positivo'),
});

type CheckoutPayload = z.infer<typeof checkoutPayloadSchema>;

class SoldOutError extends Error {}
class EventNotFoundError extends Error {}

export const createProcessPaymentController = (accessToken: string) => {
  const mpClient = new MercadoPagoConfig({ accessToken });
  const preferenceApi = new Preference(mpClient);

  return async (req: Request, res: Response): Promise<void> => {
    const parsed = checkoutPayloadSchema.safeParse(req.body);

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

    const payload: CheckoutPayload = parsed.data;
    const { email } = payload;
    const normalizedCpf = cpfDigits(payload.cpf);
    const idempotencyKey = randomUUID();

    try {
      const transactionResult = await prisma.$transaction(async (tx) => {
        const lockedEventRows = await tx.$queryRaw<Array<{ id: number; total_tickets: number; price: Prisma.Decimal }>>`
          SELECT id, total_tickets, price
          FROM events
          WHERE id = ${payload.id_evento}
          FOR UPDATE
        `;

        const eventRow = lockedEventRows[0];
        if (!eventRow) {
          throw new EventNotFoundError('Evento nao encontrado');
        }

        // Lock matching order rows before counting, serializing concurrent checkouts.
        const reservedRows = await tx.$queryRaw<Array<{ reserved_tickets: number }>>`
          WITH locked_orders AS (
            SELECT id
            FROM orders
            WHERE event_id = ${payload.id_evento}
              AND status IN ('APPROVED', 'PENDING')
            FOR UPDATE
          )
          SELECT COUNT(*)::int AS reserved_tickets
          FROM locked_orders
        `;

        const reservedTickets = reservedRows[0]?.reserved_tickets ?? 0;
        if (reservedTickets >= eventRow.total_tickets) {
          throw new SoldOutError('Esgotado');
        }

        const user = await tx.user.upsert({
          where: { cpf: normalizedCpf },
          update: {
            name: payload.nome,
            email: payload.email,
          },
          create: {
            cpf: normalizedCpf,
            name: payload.nome,
            email: payload.email,
          },
        });

        const order = await tx.order.create({
          data: {
            status: 'PENDING',
            idempotency_key: idempotencyKey,
            user_id: user.id,
            event_id: eventRow.id,
          },
        });

        return {
          orderId: order.id,
          evento: {
            id: eventRow.id,
            price: eventRow.price,
          },
        };
      });

      const unitPrice = Number(transactionResult.evento.price);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        res.status(500).json({ error: 'Valor do ingresso invalido para criar a preferencia.' });
        return;
      }

      const preference = await preferenceApi.create({
        body: {
          items: [
            {
              id: String(transactionResult.evento.id),
              title: 'Ingresso 4o Encontrao',
              quantity: 1,
              currency_id: 'BRL',
              unit_price: unitPrice,
            },
          ],
          payer: {
            email,
          },
          external_reference: String(transactionResult.orderId),
          metadata: {
            order_id: transactionResult.orderId,
            event_id: transactionResult.evento.id,
          },
        },
        requestOptions: {
          idempotencyKey,
        },
      });

      res.status(200).json({ preference_id: preference.id });
    } catch (error) {
      if (error instanceof SoldOutError) {
        res.status(400).json({ error: 'Esgotado' });
        return;
      }

      if (error instanceof EventNotFoundError) {
        res.status(404).json({ error: 'Evento nao encontrado' });
        return;
      }

      console.error('Erro ao processar checkout:', error);
      res.status(500).json({ error: 'Falha ao processar pagamento' });
    }
  };
};
