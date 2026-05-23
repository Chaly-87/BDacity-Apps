"""
Modelo de Lead - Contatos capturados através de formulários
"""
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, Text, Boolean
from sqlalchemy.sql import func
from . import Base

class Lead(Base):
    """Modelo para armazenar leads capturados"""
    
    __tablename__ = "leads"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Informações básicas
    name = Column(String(255), nullable=False, index=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    phone = Column(String(20), nullable=True)
    whatsapp = Column(String(20), nullable=True, index=True)
    
    # Negócio
    business_name = Column(String(255), nullable=False)
    business_type = Column(String(100), nullable=False)  # restaurante, barbearia, etc
    business_url = Column(String(500), nullable=True)
    business_description = Column(Text, nullable=True)
    
    # Localização
    city = Column(String(100), nullable=False, index=True)
    region = Column(String(100), nullable=True)
    
    # Status
    status = Column(String(50), default="new", index=True)  # new, contacted, proposal_sent, closed
    notes = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_contacted = Column(DateTime(timezone=True), nullable=True)
    
    # Marketing
    source = Column(String(50), default="landing_page")  # landing_page, whatsapp, referral
    utm_source = Column(String(100), nullable=True)
    utm_medium = Column(String(100), nullable=True)
    utm_campaign = Column(String(100), nullable=True)
    
    # Engagement
    interested = Column(Boolean, default=False)
    budget_range = Column(String(100), nullable=True)  # e.g., "150-300", "300-500"
    
    def __repr__(self) -> str:
        return f"<Lead(id={self.id}, name={self.name}, business={self.business_name})>"
