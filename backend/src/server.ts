import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import path from 'node:path';
import { createProcessPaymentController } from './controllers/paymentController';
import { createMercadoPagoWebhookController } from './controllers/webhookController';

dotenv.config({ path: path.resolve(process.cwd(), '../.env.local') });

const envSchema = z
  .object({
    MERCADO_PAGO_ACCESS_TOKEN: z.string().min(1, 'MERCADO_PAGO_ACCESS_TOKEN e obrigatorio'),
    MERCADO_PAGO_WEBHOOK_SECRET: z.string().min(1, 'MERCADO_PAGO_WEBHOOK_SECRET e obrigatorio'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL e obrigatorio'),
    API_PORT: z.coerce.number().int().positive().optional(),
    FRONTEND_ORIGIN: z.string().url().optional(),
    APP_URL: z.string().url().optional(),
  })
  .refine((data) => Boolean(data.FRONTEND_ORIGIN || data.APP_URL), {
    message: 'Defina FRONTEND_ORIGIN (ou APP_URL) com a URL do frontend para restringir o CORS',
    path: ['FRONTEND_ORIGIN'],
  });

const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
  console.error('Erro na validacao de variaveis de ambiente:');
  parsedEnv.error.issues.forEach((issue) => {
    console.error(`- ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

const env = parsedEnv.data;
const frontendOrigin = env.FRONTEND_ORIGIN ?? env.APP_URL!;

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: frontendOrigin,
  }),
);
app.use(express.json());

const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas no checkout. Tente novamente em 1 minuto.' },
});

app.post('/api/process_payment', checkoutLimiter, createProcessPaymentController(env.MERCADO_PAGO_ACCESS_TOKEN));
app.post(
  '/api/webhook/mercadopago',
  createMercadoPagoWebhookController(env.MERCADO_PAGO_ACCESS_TOKEN, env.MERCADO_PAGO_WEBHOOK_SECRET),
);

const PORT = env.API_PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`✅ API de pagamentos rodando em http://localhost:${PORT}`);
});
