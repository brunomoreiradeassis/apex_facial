const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const db = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Servir arquivos estáticos (fotos de rostos)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

// 1. Tabela: Cadastros
app.get('/cadastros', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM Cadastros');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Criar novo cadastro (Ex: Portaria gerencia) e envia a foto
app.post('/cadastros', upload.single('foto'), async (req, res) => {
    try {
        const { nome_completo, cpf, categoria, telefone, placa_veiculo, numero_estacionamento } = req.body;
        // Se houver arquivo anexado, gera URL, se não envia URL nula ou um link em nuvem externo
        const url_facial = req.file ? `/uploads/${req.file.filename}` : req.body.url_facial || null;
        const acesso_bloqueado = req.body.acesso_bloqueado || 'nao';
        
        const [result] = await db.query(
            `INSERT INTO Cadastros 
             (nome_completo, cpf, categoria, telefone, url_facial, placa_veiculo, acesso_bloqueado, numero_estacionamento) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [nome_completo, cpf, categoria, telefone, url_facial, placa_veiculo, acesso_bloqueado, numero_estacionamento]
        );
        res.status(201).json({ id: result.insertId, message: 'Cadastro criado com sucesso', url_facial });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Tabela: Portaria (Registro de visitas e verificação de acesso)
app.get('/portaria/verificar/:cpf', async (req, res) => {
    try {
        const { cpf } = req.params;
        const data_hoje = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD
        
        // Verifica na tabela Portaria se há permissão para a data de hoje e se não está bloqueado
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

// Criar registro de visita (Feito pelo Proprietário ou Portaria)
app.post('/portaria', async (req, res) => {
    try {
        const dados = req.body;
        const query = `INSERT INTO Portaria (
            nome_proprietario, nome_categoria, cpf_prorpietario, cpf_categoria, 
            data_visita, horario_visita, categoria, placa_veiculo, numero_estacionamento, 
            informacoes_visita, url_facial_proprietario, url_facial_categoria, 
            telefone_proprietario, telefone_categoria
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const valores = [
            dados.nome_proprietario, dados.nome_categoria, dados.cpf_prorpietario, dados.cpf_categoria,
            dados.data_visita, dados.horario_visita, dados.categoria, dados.placa_veiculo || null, 
            dados.numero_estacionamento || null, dados.informacoes_visita || '', 
            dados.url_facial_proprietario || null, dados.url_facial_categoria || null, 
            dados.telefone_proprietario || null, dados.telefone_categoria || null
        ];

        const [result] = await db.query(query, valores);
        res.status(201).json({ id: result.insertId, message: 'Visita agendada com sucesso' });
    } catch (err) {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Node.js rodando na porta ${PORT}`);
});
