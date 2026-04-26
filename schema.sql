-- Executar este arquivo no cliente MySQL (ou painel do Railway) para criar as tabelas

CREATE TABLE IF NOT EXISTS Autenticacao (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome_completo VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    senha VARCHAR(255),
    cpf VARCHAR(14) UNIQUE
);

CREATE TABLE IF NOT EXISTS Cadastros (
    id INT AUTO_INCREMENT PRIMARY KEY,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    nome_completo VARCHAR(255),
    cpf VARCHAR(14) UNIQUE,
    categoria VARCHAR(50),
    telefone VARCHAR(20),
    url_facial VARCHAR(255),
    placa_veiculo VARCHAR(20),
    acesso_bloqueado VARCHAR(3) DEFAULT 'nao',
    numero_estacionamento VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS Portaria (
    id INT AUTO_INCREMENT PRIMARY KEY,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    nome_proprietario VARCHAR(255),
    nome_categoria VARCHAR(255),
    cpf_prorpietario VARCHAR(14),
    cpf_categoria VARCHAR(14),
    data_visita DATE,
    horario_visita TIME,
    categoria VARCHAR(50),
    placa_veiculo VARCHAR(20),
    numero_estacionamento VARCHAR(20),
    informacoes_visita TEXT,
    acesso_bloqueado VARCHAR(3) DEFAULT 'nao',
    data_ultima_visita TIMESTAMP NULL,
    url_facial_proprietario VARCHAR(255),
    url_facial_categoria VARCHAR(255),
    telefone_proprietario VARCHAR(20),
    telefone_categoria VARCHAR(20)
);
