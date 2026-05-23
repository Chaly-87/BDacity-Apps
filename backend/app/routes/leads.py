"""
Endpoints para gerenciamento de leads
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List

from app.database.connection import get_db
from app.models import Lead
from app.schemas.lead import LeadCreate, LeadUpdate, LeadResponse, LeadDetailResponse
from app.services.lead_service import LeadService

router = APIRouter(prefix="/leads", tags=["leads"])

@router.post("/", response_model=LeadDetailResponse, status_code=status.HTTP_201_CREATED)
def create_lead(
    lead_data: LeadCreate,
    db: Session = Depends(get_db)
):
    """
    Criar um novo lead
    
    - **name**: Nome do contacto
    - **email**: Email válido
    - **business_name**: Nome do negócio
    - **business_type**: Tipo de negócio (restaurante, barbearia, etc)
    - **city**: Cidade
    """
    service = LeadService(db)
    return service.create_lead(lead_data)

@router.get("/", response_model=List[LeadResponse])
def list_leads(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    status: str = Query(None),
    city: str = Query(None),
):
    """
    Listar todos os leads com filtros opcionais
    
    - **skip**: Número de registos a saltar (paginação)
    - **limit**: Número máximo de registos a retornar
    - **status**: Filtrar por status (new, contacted, proposal_sent, closed)
    - **city**: Filtrar por cidade
    """
    service = LeadService(db)
    return service.list_leads(skip=skip, limit=limit, status_filter=status, city=city)

@router.get("/{lead_id}", response_model=LeadDetailResponse)
def get_lead(lead_id: int, db: Session = Depends(get_db)):
    """Obter detalhes de um lead específico"""
    service = LeadService(db)
    lead = service.get_lead_by_id(lead_id)
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead não encontrado"
        )
    return lead

@router.put("/{lead_id}", response_model=LeadDetailResponse)
def update_lead(
    lead_id: int,
    lead_data: LeadUpdate,
    db: Session = Depends(get_db)
):
    """Atualizar um lead existente"""
    service = LeadService(db)
    lead = service.update_lead(lead_id, lead_data)
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead não encontrado"
        )
    return lead

@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lead(lead_id: int, db: Session = Depends(get_db)):
    """Eliminar um lead"""
    service = LeadService(db)
    deleted = service.delete_lead(lead_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead não encontrado"
        )
    return None

@router.get("/search/by-email/{email}", response_model=LeadDetailResponse)
def get_lead_by_email(email: str, db: Session = Depends(get_db)):
    """Procurar lead por email"""
    service = LeadService(db)
    lead = service.get_lead_by_email(email)
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead não encontrado"
        )
    return lead

@router.post("/{lead_id}/mark-contacted", response_model=LeadDetailResponse)
def mark_lead_contacted(lead_id: int, db: Session = Depends(get_db)):
    """Marcar um lead como contactado"""
    service = LeadService(db)
    lead = service.mark_contacted(lead_id)
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead não encontrado"
        )
    return lead

@router.post("/{lead_id}/mark-interested", response_model=LeadDetailResponse)
def mark_lead_interested(lead_id: int, db: Session = Depends(get_db)):
    """Marcar um lead como interessado"""
    service = LeadService(db)
    lead = service.mark_interested(lead_id)
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead não encontrado"
        )
    return lead
