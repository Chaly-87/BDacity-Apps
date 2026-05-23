"""
Endpoints para gerenciamento de landing pages
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List

from app.database.connection import get_db
from app.models import LandingPage
from app.schemas.landing_page import LandingPageCreate, LandingPageResponse, LandingPageDetailResponse
from app.services.landing_page_service import LandingPageService

router = APIRouter(prefix="/landing-pages", tags=["landing_pages"])

@router.post("/", response_model=LandingPageDetailResponse, status_code=status.HTTP_201_CREATED)
def create_landing_page(
    landing_page_data: LandingPageCreate,
    db: Session = Depends(get_db)
):
    """
    Criar uma nova landing page com IA
    
    - **lead_id**: ID do lead associado
    - **title**: Título da landing page
    - **business_type**: Tipo de negócio
    """
    service = LandingPageService(db)
    return service.create_landing_page(landing_page_data)

@router.get("/", response_model=List[LandingPageResponse])
def list_landing_pages(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    status: str = Query(None),
):
    """
    Listar todas as landing pages
    
    - **skip**: Número de registos a saltar (paginação)
    - **limit**: Número máximo de registos a retornar
    - **status**: Filtrar por status (draft, published, archived)
    """
    service = LandingPageService(db)
    return service.list_landing_pages(skip=skip, limit=limit, status_filter=status)

@router.get("/{page_id}", response_model=LandingPageDetailResponse)
def get_landing_page(page_id: int, db: Session = Depends(get_db)):
    """Obter detalhes de uma landing page específica"""
    service = LandingPageService(db)
    page = service.get_landing_page_by_id(page_id)
    if not page:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Landing page não encontrada"
        )
    return page

@router.get("/slug/{slug}", response_model=LandingPageDetailResponse)
def get_landing_page_by_slug(slug: str, db: Session = Depends(get_db)):
    """Obter landing page por slug"""
    service = LandingPageService(db)
    page = service.get_landing_page_by_slug(slug)
    if not page:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Landing page não encontrada"
        )
    return page

@router.post("/{page_id}/publish", response_model=LandingPageDetailResponse)
def publish_landing_page(page_id: int, db: Session = Depends(get_db)):
    """Publicar uma landing page (mudar de draft para published)"""
    service = LandingPageService(db)
    page = service.publish_landing_page(page_id)
    if not page:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Landing page não encontrada"
        )
    return page

@router.post("/{page_id}/track-view")
def track_page_view(page_id: int, db: Session = Depends(get_db)):
    """Registar uma visita à landing page"""
    service = LandingPageService(db)
    success = service.track_view(page_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Landing page não encontrada"
        )
    return {"message": "View tracked successfully"}

@router.post("/{page_id}/track-conversion")
def track_page_conversion(page_id: int, db: Session = Depends(get_db)):
    """Registar uma conversão na landing page"""
    service = LandingPageService(db)
    success = service.track_conversion(page_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Landing page não encontrada"
        )
    return {"message": "Conversion tracked successfully"}

@router.delete("/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_landing_page(page_id: int, db: Session = Depends(get_db)):
    """Eliminar uma landing page"""
    service = LandingPageService(db)
    deleted = service.delete_landing_page(page_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Landing page não encontrada"
        )
    return None
