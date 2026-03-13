import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const attendeesController = async (_req: Request, res: Response): Promise<void> => {
  try {
    const orders = await prisma.order.findMany({
      where: { status: 'APPROVED' },
      include: { user: true },
      orderBy: { user: { name: 'asc' } },
    });

    const attendees = orders.map((order) => ({
      id: order.id,
      nome: order.user.name,
      cpf: order.user.cpf,
      checked_in: order.checked_in,
    }));

    res.status(200).json(attendees);
  } catch (error) {
    console.error('Erro ao buscar participantes:', error);
    res.status(500).json({ error: 'Erro interno ao buscar participantes' });
  }
};
