const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3001;
const DB_FILE = path.join(__dirname, "licenses.json");

app.use(cors());
app.use(express.json());

function readDb() {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
}

function writeDb(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function nowIso() {
    return new Date().toISOString();
}

function addDays(dateIso, days) {
    const d = new Date(dateIso);
    d.setDate(d.getDate() + days);
    return d.toISOString();
}

function isExpired(expiresAt) {
    return new Date(expiresAt).getTime() < Date.now();
}

app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "license-server" });
});

app.post("/activate", (req, res) => {
    const { licenseKey, machineId } = req.body || {};

    if (!licenseKey || !machineId) {
        return res.status(400).json({
            ok: false,
            message: "licenseKey e machineId são obrigatórios"
        });
    }

    const db = readDb();
    const lic = db.find(x => x.key === licenseKey);

    if (!lic) {
        return res.json({ ok: false, message: "Licença não encontrada" });
    }

    if (!lic.active) {
        return res.json({ ok: false, message: "Licença desativada" });
    }

    // primeira ativação
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

    // mesma máquina
    if (lic.machine_id === machineId) {
        if (isExpired(lic.expires_at)) {
            return res.json({
                ok: false,
                message: "Licença expirada",
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

    // outra máquina
    return res.json({
        ok: false,
        message: "Esta licença já está vinculada a outro computador"
    });
});

app.post("/validate", (req, res) => {
    const { licenseKey, machineId } = req.body || {};

    if (!licenseKey || !machineId) {
        return res.status(400).json({
            ok: false,
            message: "licenseKey e machineId são obrigatórios"
        });
    }

    const db = readDb();
    const lic = db.find(x => x.key === licenseKey);

    if (!lic) {
        return res.json({ ok: false, message: "Licença não encontrada" });
    }

    if (!lic.active) {
        return res.json({ ok: false, message: "Licença desativada" });
    }

    if (lic.machine_id !== machineId) {
        return res.json({ ok: false, message: "Licença não pertence a esta máquina" });
    }

    if (!lic.expires_at || isExpired(lic.expires_at)) {
        return res.json({
            ok: false,
            message: "Licença expirada",
            expires_at: lic.expires_at
        });
    }

    return res.json({
        ok: true,
        message: "Licença válida",
        customer: lic.customer,
        expires_at: lic.expires_at
    });
});
app.get("/licenses", (_req, res) => {
  const db = readDb();
  res.json(db);
});
app.listen(PORT, () => {
    console.log(`License server rodando em http://localhost:${PORT}`);
});
