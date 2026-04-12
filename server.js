const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, "licenses.json");

app.use(cors());
app.use(express.json());

function ensureDbFile() {
  const dir = path.dirname(DB_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, "[]", "utf-8");
  }
}

function readDb() {
  ensureDbFile();
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
}

function writeDb(data) {
  ensureDbFile();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function nowIso() {
  return new Date().toISOString();
}

function addDays(dateIso, days) {
  const d = new Date(dateIso);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString();
}

function isExpired(expiresAt) {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < Date.now();
}

app.get("/", (_req, res) => {
  res.send("Servidor de licença Medeiros online.");
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "license-server",
    db_file: DB_FILE
  });
});

app.post("/activate", (req, res) => {
  try {
    const { licenseKey, machineId } = req.body || {};

    if (!licenseKey || !machineId) {
      return res.status(400).json({
        ok: false,
        message: "licenseKey e machineId são obrigatórios"
      });
    }

    const db = readDb();
    const lic = db.find((x) => x.key === licenseKey);

    if (!lic) {
      return res.json({
        ok: false,
        message: "Licença não encontrada"
      });
    }

    if (!lic.active) {
      return res.json({
        ok: false,
        message: "Licença desativada"
      });
    }

    if (!lic.machine_id) {
      lic.machine_id = machineId;
      lic.activated_at = nowIso();
      lic.expires_at = addDays(lic.activated_at, lic.duration_days);

      writeDb(db);

      return res.json({
        ok: true,
        message: "Licença ativada com sucesso",
        customer: lic.customer,
        expires_at: lic.expires_at
      });
    }

    if (lic.machine_id === machineId) {
      if (isExpired(lic.expires_at)) {
        return res.json({
          ok: false,
          message: "Licença expirada",
          customer: lic.customer,
          expires_at: lic.expires_at
        });
      }

      return res.json({
        ok: true,
        message: "Licença válida para esta máquina",
        customer: lic.customer,
        expires_at: lic.expires_at
      });
    }

    return res.json({
      ok: false,
      message: "Esta licença já está vinculada a outro computador"
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: "Erro interno ao ativar licença",
      error: e.message
    });
  }
});

app.post("/validate", (req, res) => {
  try {
    const { licenseKey, machineId } = req.body || {};

    if (!licenseKey || !machineId) {
      return res.status(400).json({
        ok: false,
        message: "licenseKey e machineId são obrigatórios"
      });
    }

    const db = readDb();
    const lic = db.find((x) => x.key === licenseKey);

    if (!lic) {
      return res.json({
        ok: false,
        message: "Licença não encontrada"
      });
    }

    if (!lic.active) {
      return res.json({
        ok: false,
        message: "Licença desativada"
      });
    }

    if (lic.machine_id !== machineId) {
      return res.json({
        ok: false,
        message: "Licença não pertence a esta máquina"
      });
    }

    if (!lic.expires_at || isExpired(lic.expires_at)) {
      return res.json({
        ok: false,
        message: "Licença expirada",
        customer: lic.customer,
        expires_at: lic.expires_at
      });
    }

    return res.json({
      ok: true,
      message: "Licença válida",
      customer: lic.customer,
      expires_at: lic.expires_at
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: "Erro interno ao validar licença",
      error: e.message
    });
  }
});

app.get("/licenses", (_req, res) => {
  try {
    const db = readDb();
    res.json(db);
  } catch (e) {
    res.status(500).json({
      ok: false,
      message: "Erro ao listar licenças",
      error: e.message
    });
  }
});

app.get("/licenses/used", (_req, res) => {
  try {
    const db = readDb();
    res.json(db.filter((x) => !!x.machine_id));
  } catch (e) {
    res.status(500).json({
      ok: false,
      message: "Erro ao listar licenças usadas",
      error: e.message
    });
  }
});

app.get("/licenses/free", (_req, res) => {
  try {
    const db = readDb();
    res.json(db.filter((x) => !x.machine_id && x.active));
  } catch (e) {
    res.status(500).json({
      ok: false,
      message: "Erro ao listar licenças livres",
      error: e.message
    });
  }
});

app.get("/license/:key", (req, res) => {
  try {
    const db = readDb();
    const lic = db.find((x) => x.key === req.params.key);

    if (!lic) {
      return res.status(404).json({
        ok: false,
        message: "Licença não encontrada"
      });
    }

    res.json(lic);
  } catch (e) {
    res.status(500).json({
      ok: false,
      message: "Erro ao consultar licença",
      error: e.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`License server rodando na porta ${PORT}`);
  console.log(`Arquivo de dados: ${DB_FILE}`);
});
