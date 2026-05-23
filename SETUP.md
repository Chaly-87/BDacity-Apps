# 📚 Setup Guide - AI Growth Studio

Guia completo para setup do projeto em diferentes ambientes.

---

## 🔧 Pré-requisitos

- **Python** 3.11 ou superior
- **Node.js** (opcional, só se quer usar npm para frontend)
- **PostgreSQL** (recomendado para produção)
- **Git**

---

## 📦 Setup Local (Desenvolvimento)

### 1. Clone o repositório

```bash
git clone https://github.com/Chaly-87/BDacity-Apps.git
cd BDacity-Apps
```

### 2. Setup Backend

```bash
cd backend

# Criar virtual environment
python3 -m venv venv

# Ativar virtual environment
# No Linux/macOS:
source venv/bin/activate

# No Windows:
venv\Scripts\activate

# Instalar dependencies
pip install -r requirements.txt

# Configurar environment
cp .env.example .env
# Editar .env conforme necessário
```

### 3. Inicializar Database

```bash
# O banco é criado automaticamente no primeiro run
# SQLite por padrão em desenvolvimento
python run.py
```

### 4. Testar Backend

```bash
# A API estará em: http://localhost:8000
# Docs Swagger: http://localhost:8000/docs
# ReDoc: http://localhost:8000/redoc
```

### 5. Setup Frontend

Em outra terminal:

```bash
cd frontend

# Opção 1: Python (já tens instalado)
python -m http.server 8080

# Opção 2: Node.js
npx http-server . -p 8080

# Opção 3: VS Code Live Server (extension)
```

Frontend estará em: `http://localhost:8080`

---

## 🐳 Setup com Docker (Recomendado para Produção)

### 1. Pré-requisitos

- Docker Desktop instalado
- Docker Compose

### 2. Executar

```bash
# Build e run
docker-compose up --build

# Em background
docker-compose up -d --build

# Ver logs
docker-compose logs -f backend
docker-compose logs -f db

# Parar
docker-compose down
```

### 3. Acessar

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:8080`
- Database: `localhost:5432`

### 4. Logs

```bash
# Ver todos os logs
docker-compose logs -f

# Só backend
docker-compose logs -f backend

# Só database
docker-compose logs -f db
```

---

## 🚀 Teste da API

### Criar um Lead

```bash
curl -X POST http://localhost:8000/api/v1/leads \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João Silva",
    "email": "joao@example.com",
    "phone": "+351 912 345 678",
    "whatsapp": "+351 912 345 678",
    "business_name": "Silva Restaurant",
    "business_type": "restaurante",
    "business_url": "www.silvasrestaurant.pt",
    "business_description": "Restaurante de comida tradicional",
    "city": "Lisboa",
    "region": "Lisboa",
    "source": "landing_page",
    "budget_range": "150-300"
  }'
```

### Listar Leads

```bash
curl http://localhost:8000/api/v1/leads
```

### Obter um Lead

```bash
curl http://localhost:8000/api/v1/leads/1
```

### Criar Landing Page

```bash
curl -X POST http://localhost:8000/api/v1/landing-pages \
  -H "Content-Type: application/json" \
  -d '{
    "lead_id": 1,
    "title": "Silva Restaurant - Comida Tradicional",
    "business_type": "restaurante"
  }'
```

---

## 📊 Database

### SQLite (Desenvolvimento)

Arquivo: `backend/ai_growth_studio.db`

Localização automática. Para resetar:

```bash
rm backend/ai_growth_studio.db
python run.py  # Recria automaticamente
```

### PostgreSQL (Produção)

#### Setup no Docker (já incluído em docker-compose.yml)

```bash
# Credenciais padrão:
User: ai_growth
Password: ai_growth_dev_password
Database: ai_growth_studio
Host: localhost
Port: 5432
```

#### Setup Local

```bash
# Criar database
createdb -U postgres ai_growth_studio

# Criar user
createuser -U postgres ai_growth

# Dar permissões
psql -U postgres -d ai_growth_studio \
  -c "GRANT ALL PRIVILEGES ON DATABASE ai_growth_studio TO ai_growth;"
```

#### Connection String

```
postgresql://ai_growth:password@localhost:5432/ai_growth_studio
```

---

## 🧪 Testing

### Testar Endpoints com Insomnia/Postman

1. Importar collection (future - será criada)
2. Usar variáveis de environment
3. Testar cada endpoint

### Health Check

```bash
curl http://localhost:8000/health
```

Response esperada:
```json
{
  "status": "ok",
  "service": "AI Growth Studio API",
  "version": "1.0.0"
}
```

### Testar Formulário Frontend

1. Ir a `http://localhost:8080`
2. Preencher form de contacto
3. Verificar em `http://localhost:8000/docs` se o lead foi criado

---

## 🔧 Configuração

### Variáveis de Ambiente

Copiar `.env.example` para `.env` e ajustar:

```env
# App
ENVIRONMENT=development
DEBUG=True

# Database
DATABASE_URL=sqlite:///./ai_growth_studio.db
# Ou para PostgreSQL:
# DATABASE_URL=postgresql://user:password@localhost:5432/ai_growth_studio

# Security
SECRET_KEY=your-super-secret-key-change-in-production

# WhatsApp (future - deixar vazio por agora)
WHATSAPP_API_KEY=
WHATSAPP_PHONE_NUMBER=

# OpenAI (future - deixar vazio por agora)
OPENAI_API_KEY=
AI_MODEL=gpt-3.5-turbo
```

---

## 🆘 Troubleshooting

### Port 8000 já está em uso

```bash
# Encontrar processo
lsof -i :8000

# Matar processo
kill -9 <PID>

# Ou usar porta diferente em .env
# E atualizar command em docker-compose.yml
```

### Port 5432 (PostgreSQL) em uso

```bash
# Encontrar
lsof -i :5432

# Matar
kill -9 <PID>
```

### Database locked (SQLite)

```bash
# Remover database
rm backend/ai_growth_studio.db

# Será recriado no próximo run
python run.py
```

### Import error - ModuleNotFoundError

```bash
# Certifica-te que estás no virtual environment
source venv/bin/activate  # Linux/macOS
venv\Scripts\activate     # Windows

# Reinstalar requirements
pip install -r requirements.txt
```

### CORS Error ao testar

Verifica se `CORS_ORIGINS` em `.env` está configurado para aceitar a origem:

```env
CORS_ORIGINS=http://localhost:8080,http://localhost:3000,*
```

### Formulário não envia dados

1. Verifica se backend está running: `http://localhost:8000/health`
2. Abre DevTools (F12) no browser e vê errors
3. Verifica logs do backend

---

## 📝 Estrutura do Projeto

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app principal
│   ├── config.py            # Configurações
│   ├── models/
│   │   ├── __init__.py
│   │   ├── lead.py
│   │   └── landing_page.py
│   ├── schemas/             # Pydantic models
│   ├── routes/              # Endpoints
│   │   ├── leads.py
│   │   ├── landing_pages.py
│   │   └── health.py
│   ├── services/            # Business logic
│   │   ├── lead_service.py
│   │   ├── landing_page_service.py
│   │   ├── whatsapp_service.py
│   │   └── ai_service.py
│   ├── database/            # DB config
│   └── utils/               # Helpers
├── requirements.txt
├── .env
├── .env.example
├── Dockerfile
└── run.py

frontend/
├── index.html               # Landing page
├── css/
│   └── styles.css
├── js/
│   └── main.js
└── assets/
```

---

## 🚀 Deploy

### Deploy com Heroku

```bash
# Instalar Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# Login
heroku login

# Criar app
heroku create ai-growth-studio

# Deploy
git push heroku main

# Ver logs
heroku logs --tail
```

### Deploy com Railway/Fly.io/DigitalOcean

(Documentação a chegar)

---

## 📞 Suporte

Se tiveres dúvidas:

1. Verifica as logs: `docker-compose logs -f`
2. Vê a API docs: `http://localhost:8000/docs`
3. Abre uma issue no GitHub
4. Contacta: suporte@aigrowthstudio.com

---

**Happy coding! 🚀**
