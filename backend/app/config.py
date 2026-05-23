"""
Configuração de ambiente e variáveis globais
"""
import os
from functools import lru_cache
from typing import Optional

class Settings:
    """Configurações da aplicação"""
    
    # Aplicação
    APP_NAME: str = "AI Growth Studio"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "False") == "True"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    
    # API
    API_PREFIX: str = "/api/v1"
    CORS_ORIGINS: list = os.getenv("CORS_ORIGINS", "*").split(",")
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite:///./ai_growth_studio.db"
    )
    
    # Email / WhatsApp
    WHATSAPP_API_KEY: Optional[str] = os.getenv("WHATSAPP_API_KEY")
    WHATSAPP_PHONE_NUMBER: Optional[str] = os.getenv("WHATSAPP_PHONE_NUMBER")
    
    # AI Service
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
    AI_MODEL: str = os.getenv("AI_MODEL", "gpt-3.5-turbo")
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    class Config:
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    """Retorna instância única das configurações"""
    return Settings()

# Instância global
settings = get_settings()
