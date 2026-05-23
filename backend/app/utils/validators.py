"""
Custom validators for business logic
"""
import re
from typing import Optional

def validate_phone(phone: str) -> bool:
    """
    Validar formato de telefone português
    
    Aceita:
    - 912345678
    - +351912345678
    - +351 912 345 678
    - 9 1 2 3 4 5 6 7 8
    """
    # Remove todos os caracteres que não sejam dígitos
    cleaned = re.sub(r'\D', '', phone)
    
    # Deve ter 9 ou 11 dígitos
    # 9 dígitos = número nacional
    # 11 dígitos = +351 + 9 dígitos
    if len(cleaned) == 9:
        # Número nacional português
        return cleaned[0] in ['2', '3', '9']
    elif len(cleaned) == 11:
        # Com país code
        return cleaned.startswith('351')
    
    return False

def validate_business_type(business_type: str) -> bool:
    """Validar tipo de negócio"""
    valid_types = [
        'restaurante',
        'barbearia',
        'ginasio',
        'clinica',
        'loja',
        'servicos',
        'hotel',
        'cafe',
        'salao_beleza',
        'consultorio',
        'outro'
    ]
    return business_type.lower() in valid_types

def normalize_phone(phone: str) -> str:
    """
    Normalizar telefone para formato internacional
    
    Returns: +351912345678
    """
    # Remove espaços e hífens
    cleaned = re.sub(r'[\s\-]', '', phone)
    
    # Remove +351 se existir e adiciona novamente
    cleaned = re.sub(r'^(\+351|00351)', '', cleaned)
    
    # Se começa com 0, remove-o
    if cleaned.startswith('0'):
        cleaned = cleaned[1:]
    
    return f"+351{cleaned}"

def normalize_slug(text: str) -> str:
    """
    Converter texto em slug válido
    
    Example: "Silva's Restaurant" -> "silvas-restaurant"
    """
    # Converter para lowercase
    slug = text.lower()
    
    # Remover caracteres especiais
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    
    # Remover hífens no início e fim
    slug = slug.strip('-')
    
    # Remover hífens múltiplos
    slug = re.sub(r'-+', '-', slug)
    
    return slug

def truncate_string(text: str, max_length: int = 255) -> str:
    """Truncar string para tamanho máximo"""
    if len(text) > max_length:
        return text[:max_length-3] + "..."
    return text

def is_valid_lead_data(data: dict) -> tuple[bool, Optional[str]]:
    """
    Validação completa de dados de lead
    
    Returns: (is_valid, error_message)
    """
    # Campos obrigatórios
    required_fields = ['name', 'email', 'business_name', 'business_type', 'city']
    for field in required_fields:
        if not data.get(field):
            return False, f"Campo obrigatório: {field}"
    
    # Validar nome
    if len(data['name']) < 2:
        return False, "Nome deve ter pelo menos 2 caracteres"
    
    # Validar negócio
    if not validate_business_type(data['business_type']):
        return False, "Tipo de negócio inválido"
    
    # Validar telefone se fornecido
    if data.get('phone') and not validate_phone(data['phone']):
        return False, "Telefone inválido"
    
    return True, None
