"""
Serviço de negócio para Landing Page
Lógica para geração, gestão e analytics de landing pages
"""
from datetime import datetime
from sqlalchemy.orm import Session
from typing import List, Optional
import re

from app.models import LandingPage, Lead
from app.schemas.landing_page import LandingPageCreate

class LandingPageService:
    """Serviço para gerenciar landing pages"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def _generate_slug(self, title: str, lead_id: int) -> str:
        """Gerar slug único a partir do título"""
        # Remove caracteres especiais e converte para lowercase
        slug = re.sub(r'[^a-z0-9]+', '-', title.lower().strip())
        slug = slug.strip('-')
        
        # Adiciona lead_id para garantir unicidade
        slug = f"{slug}-{lead_id}"
        
        return slug
    
    def create_landing_page(self, page_data: LandingPageCreate) -> LandingPage:
        """
        Criar uma nova landing page
        Futuramente irá gerar conteúdo com IA
        """
        # Validar que o lead existe
        lead = self.db.query(Lead).filter(Lead.id == page_data.lead_id).first()
        if not lead:
            raise ValueError(f"Lead {page_data.lead_id} não encontrado")
        
        # Gerar slug
        slug = self._generate_slug(page_data.title, page_data.lead_id)
        
        # TODO: Aqui será chamado serviço de IA para gerar conteúdo
        # Por agora, criamos um placeholder
        db_page = LandingPage(
            lead_id=page_data.lead_id,
            slug=slug,
            title=page_data.title,
            business_name=lead.business_name,
            business_type=page_data.business_type,
            whatsapp_number=lead.whatsapp,
            contact_email=lead.email,
            business_phone=lead.phone,
            
            # Placeholder - será preenchido pela IA
            headline=f"{lead.business_name} - {page_data.business_type.title()}",
            subheadline=f"Transforme seu negócio com presença online profissional",
            status="draft",
            is_active=True,
        )
        
        self.db.add(db_page)
        self.db.commit()
        self.db.refresh(db_page)
        return db_page
    
    def get_landing_page_by_id(self, page_id: int) -> Optional[LandingPage]:
        """Obter landing page por ID"""
        return self.db.query(LandingPage).filter(LandingPage.id == page_id).first()
    
    def get_landing_page_by_slug(self, slug: str) -> Optional[LandingPage]:
        """Obter landing page por slug"""
        return self.db.query(LandingPage).filter(
            LandingPage.slug == slug,
            LandingPage.is_active == True
        ).first()
    
    def list_landing_pages(
        self,
        skip: int = 0,
        limit: int = 10,
        status_filter: Optional[str] = None
    ) -> List[LandingPage]:
        """Listar landing pages com filtros opcionais"""
        query = self.db.query(LandingPage)
        
        if status_filter:
            query = query.filter(LandingPage.status == status_filter)
        
        query = query.filter(LandingPage.is_active == True)
        
        return query.offset(skip).limit(limit).all()
    
    def publish_landing_page(self, page_id: int) -> Optional[LandingPage]:
        """Publicar uma landing page (mudar de draft para published)"""
        db_page = self.get_landing_page_by_id(page_id)
        if not db_page:
            return None
        
        db_page.status = "published"
        db_page.published_at = datetime.now()
        self.db.commit()
        self.db.refresh(db_page)
        return db_page
    
    def track_view(self, page_id: int) -> bool:
        """Registar uma visita à landing page"""
        db_page = self.get_landing_page_by_id(page_id)
        if not db_page:
            return False
        
        db_page.views += 1
        self.db.commit()
        return True
    
    def track_conversion(self, page_id: int) -> bool:
        """Registar uma conversão na landing page"""
        db_page = self.get_landing_page_by_id(page_id)
        if not db_page:
            return False
        
        db_page.conversions += 1
        self.db.commit()
        return True
    
    def delete_landing_page(self, page_id: int) -> bool:
        """Eliminar/arquivar uma landing page"""
        db_page = self.get_landing_page_by_id(page_id)
        if not db_page:
            return False
        
        db_page.is_active = False
        db_page.status = "archived"
        self.db.commit()
        return True
