# 🌈 L'Arcobaleno dei Bimbi — Sistema Iscrizioni

Backend **Node.js + Express + SQLite** completo.  
Tutti i dati sul tuo server/PC. Nessun servizio esterno.

---

## Struttura del progetto

```
arcobaleno/
├── server/
│   └── index.js          ← Backend API (Express + SQLite)
├── public/
│   └── index.html        ← Frontend (modulo + gestione)
├── data/
│   └── iscrizioni.db     ← Database SQLite (creato automaticamente)
├── package.json
└── README.md
```

---

## ⚡ Installazione (5 minuti)

### 1. Requisiti
- **Node.js 18+** → scarica da https://nodejs.org
- Nessun database esterno, nessun cloud

### 2. Installa le dipendenze

```bash
cd arcobaleno
npm install
```

### 3. Avvia il server

```bash
npm start
```

Il server parte su **http://localhost:3000**

---

## 🌐 Accesso da tutti i dispositivi

Per rendere il modulo accessibile da **telefoni, tablet e PC** della rete locale:

1. Trova l'IP del PC dove gira il server:
   - Windows: apri il Prompt → digita `ipconfig` → cerca "Indirizzo IPv4"
   - Mac/Linux: `ifconfig` o `ip addr`
   - Es: `192.168.1.50`

2. Da qualsiasi dispositivo della stessa rete WiFi, apri il browser e vai su:
   ```
   http://192.168.1.50:3000
   ```

3. **I genitori compilano** il modulo dal loro telefono
4. **La segreteria vede tutto** dalla propria postazione

---

## 🔐 Password di accesso alla Gestione

La password di default è: **`arcobaleno2026`**

Per cambiarla, avvia il server con:

```bash
ADMIN_PWD=nuovapassword npm start
```

Oppure su Windows:

```cmd
set ADMIN_PWD=nuovapassword && npm start
```

---

## 🔒 Sicurezza in produzione

Se esponi il server su Internet (non solo rete locale), aggiungi **HTTPS**.  
Il modo più semplice è usare [Caddy](https://caddyserver.com) come reverse proxy:

```
# Caddyfile
asilo.esempio.it {
    reverse_proxy localhost:3000
}
```

---

## 💾 Backup del database

Il database è un singolo file: `data/iscrizioni.db`  
Copialo su una chiavetta USB o cartella cloud periodicamente.

```bash
# Backup manuale
cp data/iscrizioni.db backup/iscrizioni_$(date +%Y%m%d).db
```

---

## 🔄 Avvio automatico al riavvio del PC (Windows)

1. Crea un file `avvia.bat` nella cartella del progetto:
   ```bat
   @echo off
   cd /d C:\percorso\arcobaleno
   node server/index.js
   ```
2. Premi Win+R → `shell:startup`
3. Copia `avvia.bat` nella cartella che si apre

---

## API disponibili

| Metodo | URL | Auth | Descrizione |
|--------|-----|------|-------------|
| `POST` | `/api/iscrizioni` | No | Salva nuova iscrizione |
| `POST` | `/api/admin/login` | No | Login admin → restituisce token |
| `POST` | `/api/admin/logout` | Token | Logout |
| `GET`  | `/api/admin/iscrizioni` | Token | Lista iscrizioni |
| `GET`  | `/api/admin/iscrizioni/:id` | Token | Dettaglio (con firme) |
| `DELETE` | `/api/admin/iscrizioni/:id` | Token | Elimina (soft delete) |
| `GET`  | `/api/admin/stats` | Token | Statistiche |
| `GET`  | `/api/admin/export/csv` | Token | Esporta CSV |

---

## 🛠 Sviluppo

```bash
npm run dev   # avvia con --watch (ricarica automatico)
```
