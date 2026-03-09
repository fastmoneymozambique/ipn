require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// ===== CONFIGURAÇÕES ===== //
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'sourcefluent';
const COLLECTION = 'pagamentos';
const PORT = process.env.PORT || 3000;

// Nodemailer seguro
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendEmail(payerEmail, amount, currency, status) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: 'Novo pagamento recebido',
    text: `Pagamento recebido!\n\nE-mail: ${payerEmail}\nValor: ${amount} ${currency}\nStatus: ${status}`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('E-mail de notificação enviado.');
  } catch (err) {
    console.error('Erro ao enviar e-mail:', err);
  }
}

// ===== Conexão MongoDB ===== //
let dbClient;
MongoClient.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(client => {
    dbClient = client;
    console.log('Conectado ao MongoDB');
  })
  .catch(err => console.error('Erro ao conectar ao MongoDB:', err));

// ===== Endpoint IPN ===== //
app.post('/ipn', async (req, res) => {
  res.sendStatus(200);

  const body = 'cmd=_notify-validate&' + new URLSearchParams(req.body).toString();

  try {
    const response = await fetch('https://ipnpb.paypal.com/cgi-bin/webscr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    });
    const text = await response.text();

    if (text === 'VERIFIED') {
      const payerEmail = req.body.payer_email;
      const paymentStatus = req.body.payment_status;
      const amount = req.body.mc_gross;
      const currency = req.body.mc_currency;

      console.log(`Pagamento VERIFICADO: ${payerEmail} pagou ${amount} ${currency} | Status: ${paymentStatus}`);

      // Salvar no MongoDB
      const db = dbClient.db(DB_NAME);
      const collection = db.collection(COLLECTION);
      await collection.insertOne({
        payerEmail,
        paymentStatus,
        amount,
        currency,
        date: new Date()
      });

      // Enviar e-mail de notificação
      await sendEmail(payerEmail, amount, currency, paymentStatus);

    } else {
      console.log('IPN inválido');
    }
  } catch (err) {
    console.error('Erro ao validar IPN:', err);
  }
});

// ===== Iniciar servidor ===== //
app.listen(PORT, () => console.log(`Servidor IPN rodando na porta ${PORT}`));