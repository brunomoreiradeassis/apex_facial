# Plano de Integração e Regras de Negócio: APEX Facial + Railway

Este documento detalha o plano evolutivo do **APEX Facial**, transformando-o em um dispositivo inteligente de portaria conectado à nuvem (Railway).

## 1. Regras de Acesso e Categorias
O sistema irá separar o fluxo de autorização com base no nível da pessoa. As categorias são: **Proprietários, Parentescos, Visitantes, Prestadores de Serviços e Esporádicos**.

### Lógica do Dispositivo (Catraca/Portão):
- **Proprietários**:
  Possuem acesso livre e direto pelo reconhecimento facial a qualquer momento. Não necessitam de aprovação de terceiros (desde que `acesso_bloqueado` seja "nao").
- **Visitantes, Prestadores de Serviços, Esporádicos e Parentescos**:
  O acesso pelo rosto **não** é automático diário. Eles precisam ser vinculados a uma "autorização" prévia criada por um Proprietário.
  A catraca só será liberada se:
  1. O rosto for reconhecido.
  2. O sistema consultar a data atual e coincidir exatamente com a `data_visita` previamente cadastrada no banco de dados.

## 2. Identidade e Relacionamento de Dados
- **Identificador Único**: O CPF será o elo entre a Tabela de `Autenticacao` (painel/app) e a Tabela de `Cadastros` (dados demográficos e faciais).
- Toda vez que alguém se autenticar no sistema, o banco cruzará o CPF com a base de `Cadastros` para saber a qual categoria e permissões aquela pessoa pertence.

## 3. Estrutura do Banco de Dados (Railway)
Abaixo estão as tabelas e os campos que estruturarão a API no Railway:

### 3.1 Tabela: Autenticacao
Focada apenas no login e credenciais de acesso ao painel de administração/aplicativo:
- `nome_completo`
- `email`
- `senha`
- `cpf` (Cadastrado no momento da criação, usado para vincular com a tabela de Cadastros)

### 3.2 Tabela: Cadastros
Centraliza a base de rostos e informações fixas das pessoas:
- `data_criacao`
- `nome_completo`
- `cpf`
- `categoria` (Proprietário, Visitante, etc.)
- `telefone`
- `url_facial` (Link da imagem do rosto. *Nota: É recomendado que a API também gere e armazene a assinatura matemática em texto a partir dessa URL para manter a inicialização do dispositivo ultra rápida.*)
- `placa_veiculo`
- `acesso_bloqueado` (sim ou nao)
- `numero_estacionamento`

### 3.3 Tabela: Portaria
Atua como um livro de registros e autorizações temporárias. Aqui é onde a mágica das visitas de data agendada acontece:
- `data_criacao`
- `nome_proprietario`
- `nome_categoria` (Nome da pessoa que fará a visita)
- `cpf_prorpietario` (Vínculo de quem liberou)
- `cpf_categoria` (Vínculo de quem está sendo liberado)
- `data_visita` (Data exata onde o acesso facial funcionará)
- `horario_visita`
- `categoria` (Visitante, Parentesco, Prestador, Esporádico)
- `placa_veiculo` (Preenchimento opcional)
- `numero_estacionamento` (Preenchimento opcional)
- `informacoes_visita`
- `acesso_bloqueado` (sim ou nao)
- `data_ultima_visita` (Data e hora do último acesso ocorrido)
- `url_facial_proprietario`
- `url_facial_categoria`
- `telefone_proprietario`
- `telefone_categoria`

## 4. Fluxo de Execução do APEX Facial (Na prática)
1. **Sincronização Rápida**: O dispositivo na portaria inicia e consome os dados do Railway.
2. **Reconhecimento Visual**: A câmera capta um rosto e encontra seu respectivo `cpf`.
3. **Decisão Automática**:
   - A pessoa é "Proprietário"? E não está bloqueada? -> Toca áudio de liberação e abre o portão.
   - A pessoa é de outra categoria? O sistema consulta a tabela `Portaria` com o `cpf_categoria`.
   - Se existir registro cuja `data_visita` for HOJE e `acesso_bloqueado` for "nao" -> Libera o acesso e atualiza o `data_ultima_visita`.
   - Se for data errada ou registro inexistente -> Toca áudio de não identificada/bloqueada.
