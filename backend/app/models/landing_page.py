"""
Modelo de Landing Page - Landing pages geradas para clientes
"""
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, Text, Boolean, ForeignKey
from sqlalchemy.sql import func
from . import Base

class LandingPage(Base):
    """Modelo para armazenar landing pages geradas com IA"""
    
    __tablename__ = "landing_pages"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Relação com Lead
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False, index=True)
    
    # Identificação
    slug = Column(String(255), unique=True, index=True, nullable=False)
    title = Column(String(255), nullable=False)
    
    # Conteúdo gerado
    headline = Column(String(500), nullable=False)
    subheadline = Column(Text, nullable=True)
    hero_section = Column(Text, nullable=True)
    services_section = Column(Text, nullable=True)
    testimonials_section = Column(Text, nullable=True)
    cta_section = Column(Text, nullable=True)
    footer_section = Column(Text, nullable=True)
    
    # Metadados
    meta_description = Column(String(500), nullable=True)
    meta_keywords = Column(String(500), nullable=True)
    
    # Configuração
    business_name = Column(String(255), nullable=False)
    business_type = Column(String(100), nullable=False)
    whatsapp_number = Column(String(20), nullable=True)
    contact_email = Column(String(255), nullable=True)
    business_phone = Column(String(20), nullable=True)
    
    # Status
    status = Column(String(50), default="draft")  # draft, published, archived
    is_active = Column(Boolean, default=True)
    
    # IA metadata
    ai_model_used = Column(String(100), nullable=True)
    ai_generation_date = Column(DateTime(timezone=True), nullable=True)
    ai_parameters = Column(Text, nullable=True)  # JSON serializado
    
    # Analytics
    views = Column(Integer, default=0)
    conversions = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    published_at = Column(DateTime(timezone=True), nullable=True)
    
    def __repr__(self) -> str:
        return f"<LandingPage(id={self.id}, slug={self.slug}, status={self.status})>"
