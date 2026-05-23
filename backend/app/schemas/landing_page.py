"""
Schemas para Landing Page validation
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class LandingPageCreate(BaseModel):
    """Schema para criar uma nova landing page"""
    
    lead_id: int
    title: str = Field(..., min_length=5, max_length=255)
    business_type: str
    
    class Config:
        json_schema_extra = {
            "example": {
                "lead_id": 1,
                "title": "Silva's Restaurant - Comida Tradicional Portuguesa",
                "business_type": "restaurante"
            }
        }

class LandingPageResponse(BaseModel):
    """Schema para resposta de landing page"""
    
    id: int
    slug: str
    title: str
    status: str
    business_name: str
    business_type: str
    views: int
    conversions: int
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class LandingPageDetailResponse(LandingPageResponse):
    """Schema detalhado de landing page"""
    
    headline: str
    subheadline: Optional[str]
    hero_section: Optional[str]
    services_section: Optional[str]
    testimonials_section: Optional[str]
    cta_section: Optional[str]
    footer_section: Optional[str]
    meta_description: Optional[str]
    meta_keywords: Optional[str]
    whatsapp_number: Optional[str]
    contact_email: Optional[str]
    business_phone: Optional[str]
    is_active: bool
    
    class Config:
        from_attributes = True
