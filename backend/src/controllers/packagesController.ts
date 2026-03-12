import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const listPackagesController = async (_req: Request, res: Response): Promise<void> => {
  try {
    const packages = await prisma.package.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        type: true,
        price: true,
      },
    });

    res.status(200).json(packages);
  } catch (error) {
    console.error('Erro ao listar pacotes:', error);
    res.status(500).json({ error: 'Falha ao listar pacotes' });
  }
};
