import express from 'express';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const app = express();
app.use(express.json());

const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
if (!accessToken) {
  console.warn('⚠️  MERCADO_PAGO_ACCESS_TOKEN não configurado em .env.local');
}

const client = new MercadoPagoConfig({
  accessToken: accessToken || '',
});
const payment = new Payment(client);

app.post('/api/process_payment', async (req, res) => {
  try {
    const { inscricao, ...paymentData } = req.body;

    const result = await payment.create({
      body: {
        ...paymentData,
        description: `Inscrição 4º Encontrão - ${inscricao?.nome || 'Participante'}`,
      },
      requestOptions: { idempotencyKey: crypto.randomUUID() },
    });

    res.json({ status: result.status, id: result.id });
  } catch (error) {
    console.error('Erro no pagamento:', error);
    res.status(500).json({ error: 'Falha ao processar pagamento' });
  }
});

const PORT = Number(process.env.API_PORT) || 3001;
app.listen(PORT, () => {
  console.log(`✅ API de pagamentos rodando em http://localhost:${PORT}`);
});
