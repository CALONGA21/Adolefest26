import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const checkInSchema = z.object({
  order_id: z.number().int().positive('order_id deve ser um inteiro positivo'),
});

export const checkInController = async (req: Request, res: Response): Promise<void> => {
  const parsed = checkInSchema.safeParse(req.body);

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

  const { order_id } = parsed.data;

  try {
    // Atomic conditional update: only succeeds when the order exists, is APPROVED,
    // and has not yet been checked in. Eliminates the TOCTOU race condition that
    // would allow two scanners hitting the same QR code simultaneously to both
    // receive a success response.
    const updated = await prisma.order.updateMany({
      where: { id: order_id, status: 'APPROVED', checked_in: false },
      data: { checked_in: true },
    });

    if (updated.count === 1) {
      const order = await prisma.order.findUnique({
        where: { id: order_id },
        include: { user: true },
      });
      res.status(200).json({
        success: true,
        participante: {
          nome: order!.user.name,
          cpf: order!.user.cpf,
        },
      });
      return;
    }

    // Zero rows updated — diagnose the exact reason to return an actionable error.
    const order = await prisma.order.findUnique({ where: { id: order_id } });

    if (!order) {
      res.status(404).json({ error: 'Pedido nao encontrado' });
      return;
    }

    if (order.status !== 'APPROVED') {
      res.status(402).json({ error: 'Pagamento nao confirmado para este pedido' });
      return;
    }

    // Status is APPROVED but checked_in is already true.
    res.status(409).json({ error: 'Ingresso ja utilizado' });
  } catch (error) {
    console.error('Erro ao realizar check-in:', error);
    res.status(500).json({ error: 'Erro interno ao realizar check-in' });
  }
};
