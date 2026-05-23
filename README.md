# 🚀 AI Growth Studio

**Micro-agência SaaS para marketing de negócios locais**

Transforme visitantes em clientes reais com landing pages profissionais + conteúdo gerado com IA.

---

## 📋 O que é AI Growth Studio?

AI Growth Studio é uma plataforma SaaS que oferece:

- ✅ Landing pages profissionais otimizadas para conversão
- ✅ Conteúdo de marketing gerado com IA
- ✅ Integração com WhatsApp para captar leads
- ✅ Formulários inteligentes de contacto
- ✅ Analytics e tracking de conversões
- ✅ Conteúdo para redes sociais (Instagram, TikTok)

**Target**: Negócios locais (Restaurantes, Barbearias, Ginásios, Clínicas, etc)

---

## 🏗️ Estrutura do Projeto

```
BDacity-Apps/
├── backend/                    # API FastAPI
│   ├── app/
│   │   ├── main.py             # Aplicação principal
│   │   ├── config.py           # Configurações
│   │   ├── models/             # Modelos SQLAlchemy
│   │   ├── schemas/            # Schemas Pydantic
│   │   ├── routes/             # Endpoints da API
│   │   ├── services/           # Lógica de negócio
│   │   └── database/           # Configuração DB
│   ├── requirements.txt
│   ├── .env.example
│   └── run.py
│
├── frontend/                   # Landing page
│   ├── index.html
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   └── main.js
│   └── assets/
│
├── docker-compose.yml
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js/npm (opcional, para frontend tooling)
- PostgreSQL (recomendado para produção)

### 1. Setup Backend

```bash
cd backend

# Criar virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Instalar dependencies
pip install -r requirements.txt

# Configurar environment
cp .env.example .env
# Editar .env com as tuas configurações
```

### 2. Executar Backend

```bash
python run.py
```

A API estará disponível em: `http://localhost:8000`

- Docs Swagger: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### 3. Servir Frontend

```bash
# Opção 1: Com Python
cd frontend
python -m http.server 8080

# Opção 2: Com Node.js
npx http-server frontend -p 8080

# Opção 3: Com Live Server no VS Code
```

Landing page estará disponível em: `http://localhost:8080`

---

## 📚 API Endpoints

### Health Check
```
GET /health
```

### Leads
```
POST   /api/v1/leads                    # Criar novo lead
GET    /api/v1/leads                    # Listar leads
GET    /api/v1/leads/{lead_id}          # Obter lead
PUT    /api/v1/leads/{lead_id}          # Atualizar lead
DELETE /api/v1/leads/{lead_id}          # Eliminar lead
GET    /api/v1/leads/search/by-email/{email}
POST   /api/v1/leads/{lead_id}/mark-contacted
POST   /api/v1/leads/{lead_id}/mark-interested
```

### Landing Pages
```
POST   /api/v1/landing-pages                      # Criar página
GET    /api/v1/landing-pages                      # Listar páginas
GET    /api/v1/landing-pages/{page_id}            # Obter página
GET    /api/v1/landing-pages/slug/{slug}          # Obter por slug
POST   /api/v1/landing-pages/{page_id}/publish    # Publicar
POST   /api/v1/landing-pages/{page_id}/track-view
POST   /api/v1/landing-pages/{page_id}/track-conversion
DELETE /api/v1/landing-pages/{page_id}            # Eliminar
```

---

## 🗄️ Database Models

### Lead
- id, name, email, phone, whatsapp
- business_name, business_type, business_url, business_description
- city, region
- status (new, contacted, proposal_sent, closed)
- interested, budget_range
- utm tracking fields
- timestamps

### LandingPage
- id, lead_id, slug
- title, headline, subheadline
- sections (hero, services, testimonials, cta, footer)
- meta (description, keywords)
- contact info (whatsapp, email, phone)
- status (draft, published, archived)
- analytics (views, conversions)
- timestamps

---

## 🔧 Configuração

### Variáveis de Ambiente (.env)

```env
# App
ENVIRONMENT=development
DEBUG=True

# Database
DATABASE_URL=sqlite:///./ai_growth_studio.db
# PostgreSQL: postgresql://user:password@localhost:5432/ai_growth_studio

# Security
SECRET_KEY=your-secret-key-change-in-production

# WhatsApp (future)
WHATSAPP_API_KEY=
WHATSAPP_PHONE_NUMBER=

# OpenAI (future)
OPENAI_API_KEY=
AI_MODEL=gpt-3.5-turbo
```

---

## 🧠 Arquitetura e Decisões

### Tech Stack
- **Backend**: FastAPI (async, modern, performant)
- **Database**: SQLAlchemy ORM (SQLite dev, PostgreSQL prod)
- **Frontend**: HTML/CSS/JS vanilla (lightweight, no dependencies)
- **Authentication**: JWT (preparado para futuro)

### Princípios de Design
1. **Escalabilidade**: Estrutura modular, pronta para crescimento
2. **Separação de Responsabilidades**: Services, Routes, Schemas bem definidos
3. **Documentação Automática**: FastAPI Swagger/ReDoc
4. **CORS Ready**: Preparado para multi-origin
5. **CI/CD Ready**: Docker, environment configs prontos

---

## 🚀 Roadmap - Próximas Features

### Phase 1 (MVP - Atual)
- ✅ Captação de leads com formulário
- ✅ CRUD básico de leads e landing pages
- ✅ Landing page estática da agência

### Phase 2 (Next Sprint)
- 🔄 Integração WhatsApp Business API
- 🔄 Geração de conteúdo com OpenAI
- 🔄 Template builder para landing pages
- 🔄 Analytics dashboard

### Phase 3 (Growth)
- 📊 Multi-tenant (SaaS completo)
- 💳 Stripe integration (pagamentos)
- 🔑 Admin dashboard
- 📧 Email automation
- 🎨 Design templates library

### Phase 4 (Scale)
- 🤖 AI-powered A/B testing
- 📈 Advanced analytics
- 🌐 CDN + Caching
- 📱 Mobile app

---

## 📝 Development

### Criar novo endpoint

```python
# routes/leads.py
@router.get("/{lead_id}")
def get_lead(lead_id: int, db: Session = Depends(get_db)):
    service = LeadService(db)
    lead = service.get_lead_by_id(lead_id)
    if not lead:
        raise HTTPException(status_code=404)
    return lead
```

### Criar novo service

```python
# services/email_service.py
class EmailService:
    def __init__(self):
        pass
    
    def send_to_lead(self, email: str, subject: str):
        # TODO: Implementar
        pass
```

---

## 🧪 Testing

```bash
# Testar API (usando curl ou Insomnia)
curl -X POST http://localhost:8000/api/v1/leads \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João Silva",
    "email": "joao@example.com",
    "phone": "+351 912 345 678",
    "business_name": "Silva Restaurant",
    "business_type": "restaurante",
    "city": "Lisboa"
  }'
```

---

## 🐳 Docker

```bash
# Build e run com docker-compose
docker-compose up --build

# Backend em localhost:8000
# Database em localhost:5432
```

---

## 📞 Suporte e Contacto

- 📧 Email: suporte@aigrowthstudio.com
- 💬 WhatsApp: [Contactar]
- 🐛 Issues: GitHub Issues

---

## 📄 Licença

Proprietary - AI Growth Studio © 2024

---

## 👥 Team

Criado pela equipa BDacity Apps para transformar negócios locais.

**Let's build the future of local business marketing! 🚀**
