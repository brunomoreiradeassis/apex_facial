const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Garantir que a pasta de uploads exista
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Servir arquivos estáticos (fotos de rostos)
app.use('/uploads', express.static(uploadDir));

// Configuração do Multer para upload de fotos no disco local do container (Railway)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// ==========================================
// ROTAS PARA O TOTEN E PAINEL DA PORTARIA
// ==========================================

// Rota de teste
app.get('/', (req, res) => {
    res.json({ message: 'API APEX Facial rodando no Railway!' });
});

// Rota de diagnóstico de banco
app.get('/health', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT 1 as ok');
        res.json({ status: 'ok', db: 'connected', result: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', detail: err.message, code: err.code });
    }
});

// 1. Tabela: Cadastros
app.get('/cadastros', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM Cadastros');
        res.json(rows);
    } catch (err) {
        console.error('Erro /cadastros:', err);
        res.status(500).json({ error: err.message, code: err.code, sqlState: err.sqlState });
    }
});

// Criar novo cadastro (Ex: Portaria gerencia) e envia a foto
app.post('/cadastros', upload.single('foto'), async (req, res) => {
    try {
        const { nome_completo, cpf, categoria, telefone, placa_veiculo, numero_estacionamento } = req.body;
        const url_facial = req.file ? `/uploads/${req.file.filename}` : req.body.url_facial || null;
        const acesso_bloqueado = req.body.acesso_bloqueado || 'nao';
        
        const [result] = await db.query(
            `INSERT INTO Cadastros 
             (nome_completo, cpf, categoria, telefone, url_facial, placa_veiculo, acesso_bloqueado, numero_estacionamento) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [nome_completo, cpf, categoria, telefone, url_facial, placa_veiculo || null, acesso_bloqueado, numero_estacionamento || null]
        );
        res.status(201).json({ id: result.insertId, message: 'Cadastro criado com sucesso', url_facial });
    } catch (err) {
        console.error('Erro /cadastros POST:', err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Tabela: Portaria (Registro de visitas e verificação de acesso)
app.get('/portaria/verificar/:cpf', async (req, res) => {
    try {
        const { cpf } = req.params;
        const data_hoje = new Date().toISOString().split('T')[0];
        
        const [rows] = await db.query(
            `SELECT * FROM Portaria 
             WHERE cpf_categoria = ? 
             AND data_visita = ? 
             AND acesso_bloqueado = 'nao'`,
            [cpf, data_hoje]
        );
        
        res.json({ permitido: rows.length > 0, registros: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Listar todas as autorizações (Histórico/Painel)
app.get('/portaria', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM Portaria ORDER BY data_visita DESC, horario_visita DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Criar registro de visita completo
app.post('/portaria', async (req, res) => {
    try {
        const d = req.body;
        const query = `INSERT INTO Portaria (
            nome_proprietario, nome_categoria, cpf_prorpietario, cpf_categoria, 
            data_visita, horario_visita, categoria, placa_veiculo, numero_estacionamento, 
            informacoes_visita, url_facial_proprietario, url_facial_categoria, 
            telefone_proprietario, telefone_categoria
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const valores = [
            d.nome_proprietario, d.nome_categoria, d.cpf_prorpietario, d.cpf_categoria,
            d.data_visita, d.horario_visita, d.categoria, d.placa_veiculo || null, 
            d.numero_estacionamento || null, d.informacoes_visita || '', 
            d.url_facial_proprietario || null, d.url_facial_categoria || null, 
            d.telefone_proprietario || d.telefone_categoria, d.telefone_categoria
        ];

        const [result] = await db.query(query, valores);
        res.status(201).json({ id: result.insertId, message: 'Visita agendada com sucesso' });
    } catch (err) {
        console.error('Erro /portaria POST:', err);
        res.status(500).json({ error: err.message });
    }
});

// Atualizar acesso (quando a catraca do APEX Facial liberar)
app.post('/portaria/registrar_acesso', async (req, res) => {
     const { cpf_categoria } = req.body;
     try {
         // Atualiza o timestamp da última visita onde a visita era para hoje
         const data_hoje = new Date().toISOString().split('T')[0];
         await db.query(
             `UPDATE Portaria SET data_ultima_visita = NOW() 
              WHERE cpf_categoria = ? AND data_visita = ?`, 
             [cpf_categoria, data_hoje]
         );
         res.json({ success: true, message: 'Acesso registrado com sucesso.' });
     } catch (err) {
         res.status(500).json({ error: err.message });
     }
});

// 3. Tabela: Autenticacao (Login App/Painel)
app.post('/autenticacao/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        // NOTA: Em produção, usar bcrypt para comparar senhas!
        const [rows] = await db.query(`SELECT id, nome_completo, cpf, email FROM Autenticacao WHERE email = ? AND senha = ?`, [email, senha]);
        
        if (rows.length > 0) {
            res.json({ success: true, user: rows[0] });
        } else {
            res.status(401).json({ success: false, message: 'Credenciais inválidas' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/cadastros/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM Cadastros WHERE id = ?', [id]);
        res.json({ message: 'Cadastro removido com sucesso' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Node.js rodando na porta ${PORT}`);
});
