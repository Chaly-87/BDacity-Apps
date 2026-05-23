"""
Schemas para Lead validation
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime

class LeadCreate(BaseModel):
    """Schema para criar um novo lead"""
    
    name: str = Field(..., min_length=2, max_length=255)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=20)
    whatsapp: Optional[str] = Field(None, max_length=20)
    
    business_name: str = Field(..., min_length=2, max_length=255)
    business_type: str = Field(..., min_length=2, max_length=100)
    business_url: Optional[str] = Field(None, max_length=500)
    business_description: Optional[str] = None
    
    city: str = Field(..., min_length=2, max_length=100)
    region: Optional[str] = Field(None, max_length=100)
    
    source: str = Field(default="landing_page", max_length=50)
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    
    budget_range: Optional[str] = None
    notes: Optional[str] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "João Silva",
                "email": "joao@example.com",
                "phone": "+351 912 345 678",
                "whatsapp": "+351 912 345 678",
                "business_name": "Silva's Restaurant",
                "business_type": "restaurante",
                "business_url": "www.silvasrestaurant.pt",
                "business_description": "Restaurante de comida tradicional portuguesa",
                "city": "Lisboa",
                "region": "Lisboa",
                "source": "landing_page",
                "budget_range": "150-300",
                "notes": "Muito interessado em landing page + WhatsApp integration"
            }
        }

class LeadUpdate(BaseModel):
    """Schema para atualizar um lead"""
    
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    
    business_name: Optional[str] = None
    business_type: Optional[str] = None
    business_url: Optional[str] = None
    business_description: Optional[str] = None
    
    city: Optional[str] = None
    region: Optional[str] = None
    
    status: Optional[str] = None
    notes: Optional[str] = None
    interested: Optional[bool] = None
    budget_range: Optional[str] = None

class LeadResponse(BaseModel):
    """Schema para resposta de lead"""
    
    id: int
    name: str
    email: str
    phone: Optional[str]
    whatsapp: Optional[str]
    business_name: str
    business_type: str
    city: str
    region: Optional[str]
    status: str
    interested: bool
    budget_range: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class LeadDetailResponse(LeadResponse):
    """Schema detalhado de lead"""
    
    business_url: Optional[str]
    business_description: Optional[str]
    source: str
    utm_source: Optional[str]
    utm_medium: Optional[str]
    utm_campaign: Optional[str]
    notes: Optional[str]
    last_contacted: Optional[datetime]
    
    class Config:
        from_attributes = True
