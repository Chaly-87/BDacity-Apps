/**
 * Stripe Checkout Integration for AI Prompt Pack
 *
 * IMPORTANT: Replace the placeholder values below with your real Stripe keys:
 * 1. Replace 'pk_test_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' with your
 *    Stripe publishable key from https://dashboard.stripe.com/apikeys
 * 2. Replace 'price_XXXXXXXXXXXXXXXXXXXXXXXX' with the Price ID you created
 *    in Stripe for the $47 AI Prompt Pack product.
 *
 * To create a Price ID in Stripe:
 * - Go to https://dashboard.stripe.com/products
 * - Create a new product called "AI Prompt Pack"
 * - Set the price to $47.00 (one-time)
 * - Copy the price ID (starts with "price_")
 */

// Replace with your real Stripe publishable key
const STRIPE_PUBLISHABLE_KEY = 'pk_test_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

// Replace with your real Stripe Price ID for the $47 AI Prompt Pack
const PRICE_ID = 'price_XXXXXXXXXXXXXXXXXXXXXXXX';

// Initialize Stripe
const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);

// Get the checkout button
const checkoutButton = document.getElementById('checkout-button');

if (checkoutButton) {
    checkoutButton.addEventListener('click', function () {
        // Redirect to Stripe Checkout
        stripe.redirectToCheckout({
            lineItems: [{
                price: PRICE_ID,
                quantity: 1,
            }],
            mode: 'payment',
            successUrl: window.location.origin + window.location.pathname.replace('index.html', '') + 'success.html',
            cancelUrl: window.location.href,
        }).then(function (result) {
            if (result.error) {
                // Display error to the customer
                alert(result.error.message);
            }
        });
    });
}
