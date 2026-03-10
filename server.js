import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* =========================
   MongoDB
========================= */
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("MongoDB conectado"))
.catch(err => console.error("Erro MongoDB:", err));

const UserSchema = new mongoose.Schema({
  email: String,
  transactionId: String,
  amount: String,
  currency: String,
  status: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model("User", UserSchema);

/* =========================
   Verificar pagamento PDT
========================= */
app.get("/verify-payment", async (req, res) => {
  const tx = req.query.tx;

  if (!tx) {
    console.error("TX não fornecido");
    return res.json({ success: false, error: "no_tx" });
  }

  try {
    const params = new URLSearchParams();
    params.append("cmd", "_notify-synch");
    params.append("tx", tx);
    params.append("at", process.env.PAYPAL_PDT_TOKEN);

    const response = await fetch("https://www.paypal.com/cgi-bin/webscr", {
      method: "POST",
      body: params
    });

    const text = await response.text();

    if (!text.startsWith("SUCCESS")) {
      console.error("Pagamento inválido ou PDT falhou");
      return res.json({ success: false });
    }

    const lines = text.split("\n").slice(1);
    const data = {};

    lines.forEach(line => {
      const [key, value] = line.split("=");
      if (key) data[key] = decodeURIComponent(value);
    });

    console.log("Dados PayPal recebidos:", data);

    // Validação básica de segurança
    if (
      data.payment_status !== "Completed" ||
      data.receiver_email !== process.env.PAYPAL_RECEIVER_EMAIL
    ) {
      console.error("Pagamento não aprovado ou não enviado para sua conta");
      return res.json({ success: false });
    }

    // Salvar usuário
    const user = new User({
      email: data.payer_email,
      transactionId: data.txn_id,
      amount: data.mc_gross,
      currency: data.mc_currency,
      status: data.payment_status
    });

    await user.save();
    console.log("Usuário salvo:", data.payer_email);

    return res.json({ success: true });

  } catch (err) {
    console.error("Erro verificação PDT:", err);
    return res.json({ success: false });
  }
});

/* =========================
   Servidor
========================= */
app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});