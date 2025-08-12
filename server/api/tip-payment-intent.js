const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { includes } = require('lodash');
const { getSdk, getIntegrationSdk } = require('../api-util/sdk');

module.exports = async (req, res) => {
  const sdk = getSdk(req, res);
  const integrationSdk = getIntegrationSdk();
  const { amount, customerEmail, providerId } = req.body;
  
  try {
    // Get provider's Stripe account ID
    const providerResponse = await integrationSdk.users.show({id: providerId, include: ['stripeAccount']});
    const providerStripeAccountId = providerResponse?.data?.included?.[0]?.attributes?.stripeAccountId;

    if (!providerStripeAccountId) {
      return res.status(400).send({ 
        error: 'Provider does not have a Stripe account set up' 
      });
    }

    // Create payment intent without confirming it
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'cad',
      confirmation_method: 'manual', // Don't confirm automatically
      receipt_email: customerEmail,
      description: 'Tip to provider',
      on_behalf_of: providerStripeAccountId,
      transfer_data: {
        destination: providerStripeAccountId,
      },
      metadata: {
        type: 'tip',
        providerId: providerId,
        customerEmail: customerEmail
      }
    });

    res.status(200).send({ 
      success: true, 
      paymentIntent: {
        id: paymentIntent.id,
        client_secret: paymentIntent.client_secret,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency
      }
    });
  } catch (err) {
    console.error('Tip payment intent creation error:', err);
    res.status(400).send({ 
      error: err.message || 'Failed to create payment intent' 
    });
  }
};
