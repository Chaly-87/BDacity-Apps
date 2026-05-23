"""
FastAPI Application - AI Growth Studio
Micro-agência SaaS para marketing de negócios locais
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.database.connection import init_db
from app.routes import health, leads, landing_pages

# Inicializar banco de dados ao startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup e shutdown events"""
    # Startup
    init_db()
    print("✅ Database initialized")
    print("🚀 AI Growth Studio API is running")
    yield
    # Shutdown
    print("🛑 Shutting down...")

# Criar app FastAPI
app = FastAPI(
    title=settings.APP_NAME,
    description="Plataforma SaaS para criar landing pages e captar leads com IA",
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Middleware de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware de segurança
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])

# Registar rotas
app.include_router(health.router)
app.include_router(leads.router, prefix=settings.API_PREFIX)
app.include_router(landing_pages.router, prefix=settings.API_PREFIX)

# Informações da aplicação
@app.get("/")
def root():
    """Endpoint raiz - Info da API"""
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "status": "running",
        "endpoints": {
            "docs": "/docs",
            "redoc": "/redoc",
            "health": "/health",
            "leads": "/api/v1/leads",
            "landing_pages": "/api/v1/landing-pages"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
