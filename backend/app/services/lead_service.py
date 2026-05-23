"""
Serviço de negócio para Lead
Lógica de criação, atualização e consulta de leads
"""
from datetime import datetime
from sqlalchemy.orm import Session
from typing import List, Optional

from app.models import Lead
from app.schemas.lead import LeadCreate, LeadUpdate

class LeadService:
    """Serviço para gerenciar leads"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def create_lead(self, lead_data: LeadCreate) -> Lead:
        """Criar um novo lead"""
        db_lead = Lead(
            name=lead_data.name,
            email=lead_data.email,
            phone=lead_data.phone,
            whatsapp=lead_data.whatsapp,
            business_name=lead_data.business_name,
            business_type=lead_data.business_type,
            business_url=lead_data.business_url,
            business_description=lead_data.business_description,
            city=lead_data.city,
            region=lead_data.region,
            source=lead_data.source,
            utm_source=lead_data.utm_source,
            utm_medium=lead_data.utm_medium,
            utm_campaign=lead_data.utm_campaign,
            budget_range=lead_data.budget_range,
            notes=lead_data.notes,
        )
        self.db.add(db_lead)
        self.db.commit()
        self.db.refresh(db_lead)
        return db_lead
    
    def get_lead_by_id(self, lead_id: int) -> Optional[Lead]:
        """Obter lead por ID"""
        return self.db.query(Lead).filter(Lead.id == lead_id).first()
    
    def get_lead_by_email(self, email: str) -> Optional[Lead]:
        """Obter lead por email"""
        return self.db.query(Lead).filter(Lead.email == email).first()
    
    def list_leads(
        self,
        skip: int = 0,
        limit: int = 10,
        status_filter: Optional[str] = None,
        city: Optional[str] = None
    ) -> List[Lead]:
        """Listar leads com filtros opcionais"""
        query = self.db.query(Lead)
        
        if status_filter:
            query = query.filter(Lead.status == status_filter)
        
        if city:
            query = query.filter(Lead.city == city)
        
        return query.offset(skip).limit(limit).all()
    
    def update_lead(self, lead_id: int, lead_data: LeadUpdate) -> Optional[Lead]:
        """Atualizar um lead existente"""
        db_lead = self.get_lead_by_id(lead_id)
        if not db_lead:
            return None
        
        # Atualizar apenas campos fornecidos
        for field, value in lead_data.model_dump(exclude_unset=True).items():
            setattr(db_lead, field, value)
        
        db_lead.updated_at = datetime.now()
        self.db.commit()
        self.db.refresh(db_lead)
        return db_lead
    
    def delete_lead(self, lead_id: int) -> bool:
        """Eliminar um lead"""
        db_lead = self.get_lead_by_id(lead_id)
        if not db_lead:
            return False
        
        self.db.delete(db_lead)
        self.db.commit()
        return True
    
    def mark_contacted(self, lead_id: int) -> Optional[Lead]:
        """Marcar um lead como contactado"""
        db_lead = self.get_lead_by_id(lead_id)
        if not db_lead:
            return None
        
        db_lead.status = "contacted"
        db_lead.last_contacted = datetime.now()
        self.db.commit()
        self.db.refresh(db_lead)
        return db_lead
    
    def mark_interested(self, lead_id: int) -> Optional[Lead]:
        """Marcar um lead como interessado"""
        db_lead = self.get_lead_by_id(lead_id)
        if not db_lead:
            return None
        
        db_lead.interested = True
        db_lead.status = "proposal_sent"
        self.db.commit()
        self.db.refresh(db_lead)
        return db_lead
