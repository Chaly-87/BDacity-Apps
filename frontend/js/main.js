/**
 * AI Growth Studio - Main JavaScript
 * Handles form submissions, interactions, and API communication
 */

const API_BASE_URL = 'http://localhost:8000/api/v1';

// Scroll to contact form
function scrollToContact() {
    const contactSection = document.getElementById('contact');
    if (contactSection) {
        contactSection.scrollIntoView({ behavior: 'smooth' });
        document.getElementById('name').focus();
    }
}

// Handle contact form submission
document.addEventListener('DOMContentLoaded', function() {
    const contactForm = document.getElementById('contactForm');
    
    if (contactForm) {
        contactForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // Collect form data
            const formData = {
                name: document.getElementById('name').value,
                email: document.getElementById('email').value,
                phone: document.getElementById('phone').value,
                whatsapp: document.getElementById('phone').value, // Same as phone for now
                business_name: document.getElementById('business').value,
                business_type: document.getElementById('businessType').value,
                city: document.getElementById('city').value,
                source: 'landing_page',
                notes: document.getElementById('message').value || null,
            };
            
            try {
                // Show loading state
                const submitBtn = contactForm.querySelector('button[type="submit"]');
                const originalText = submitBtn.textContent;
                submitBtn.textContent = '⏳ Enviando...';
                submitBtn.disabled = true;
                
                // Send to backend
                const response = await fetch(`${API_BASE_URL}/leads`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(formData)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    
                    // Success message
                    submitBtn.textContent = '✅ Lead Capturado!';
                    contactForm.reset();
                    
                    // Show success message
                    alert('✅ Obrigado!\n\nRecebemos o teu contacto. Entraremos em contacto em breve!\n\nID do Lead: ' + result.id);
                    
                    // Reset button after 2 seconds
                    setTimeout(() => {
                        submitBtn.textContent = originalText;
                        submitBtn.disabled = false;
                    }, 2000);
                    
                } else {
                    const error = await response.json();
                    alert('❌ Erro ao enviar formulário:\n' + (error.detail || 'Tenta novamente'));
                    
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                }
            } catch (error) {
                console.error('Error:', error);
                alert('❌ Erro de conexão. Tenta novamente mais tarde.');
                
                const submitBtn = contactForm.querySelector('button[type="submit"]');
                submitBtn.textContent = 'Submeter Formulário';
                submitBtn.disabled = false;
            }
        });
    }
});

// Analytics tracking (placeholder for future implementation)
function trackPageView(pageName) {
    console.log(`📊 Page view: ${pageName}`);
    // TODO: Send to analytics service
}

function trackCTAClick(ctaName) {
    console.log(`👆 CTA clicked: ${ctaName}`);
    // TODO: Send to analytics service
}

// Smooth scroll for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href !== '#' && document.querySelector(href)) {
            e.preventDefault();
            document.querySelector(href).scrollIntoView({ behavior: 'smooth' });
        }
    });
});

// Track page load
trackPageView('landing_page_loaded');

// Mobile menu toggle (prepare for future mobile menu)
function toggleMobileMenu() {
    const navbarMenu = document.querySelector('.navbar-menu');
    if (navbarMenu) {
        navbarMenu.classList.toggle('active');
    }
}

// Utility: Format phone number
function formatPhoneNumber(phone) {
    // Remove non-digits
    const cleaned = phone.replace(/\D/g, '');
    // Format as Portuguese phone
    if (cleaned.length === 9) {
        return '+351 ' + cleaned.substring(0, 3) + ' ' + cleaned.substring(3, 6) + ' ' + cleaned.substring(6);
    }
    return phone;
}

console.log('✅ AI Growth Studio frontend loaded');
