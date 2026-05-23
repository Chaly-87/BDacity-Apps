"""
Serviço de WhatsApp - Integração para envio de mensagens
Futuro: Integração com WhatsApp Business API
"""
from typing import Optional

class WhatsAppService:
    """Serviço para gerenciar integração WhatsApp"""
    
    def __init__(self, api_key: Optional[str] = None, phone_number: Optional[str] = None):
        """
        Inicializar serviço WhatsApp
        
        Args:
            api_key: Chave de API WhatsApp Business
            phone_number: Número de telefone WhatsApp Business
        """
        self.api_key = api_key
        self.phone_number = phone_number
    
    def send_message(self, recipient_number: str, message: str) -> bool:
        """
        Enviar mensagem WhatsApp
        
        TODO: Implementar integração real com WhatsApp Business API
        """
        if not self.api_key or not self.phone_number:
            raise ValueError("WhatsApp API key e phone number não configurados")
        
        # TODO: Implementar chamada à API WhatsApp
        print(f"[PLACEHOLDER] Enviando mensagem WhatsApp para {recipient_number}: {message}")
        return True
    
    def send_lead_proposal(self, lead_phone: str, business_name: str, proposal_url: str) -> bool:
        """Enviar proposta de landing page via WhatsApp"""
        message = f"""
Olá! 👋

Temos uma proposta especial para {business_name}!

Criámos uma landing page profissional que vai converter visitantes em clientes.

👉 Vê a proposta aqui: {proposal_url}

Quer saber mais?
        """
        
        return self.send_message(lead_phone, message.strip())
