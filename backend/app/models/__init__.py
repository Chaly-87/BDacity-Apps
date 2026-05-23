"""
Database models
"""
from sqlalchemy.orm import declarative_base

Base = declarative_base()

from .lead import Lead
from .landing_page import LandingPage

__all__ = ["Lead", "LandingPage", "Base"]
