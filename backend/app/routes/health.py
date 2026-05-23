"""
Health check endpoints
"""
from fastapi import APIRouter, status

router = APIRouter(tags=["health"])

@router.get("/health", status_code=status.HTTP_200_OK)
def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "AI Growth Studio API",
        "version": "1.0.0"
    }

@router.get("/", status_code=status.HTTP_200_OK)
def root():
    """Root endpoint"""
    return {
        "message": "AI Growth Studio API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "health": "/health",
            "leads": "/api/v1/leads",
            "landing_pages": "/api/v1/landing-pages"
        }
    }
