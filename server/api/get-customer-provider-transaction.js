const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { includes } = require('lodash');
const { getSdk, getIntegrationSdk } = require('../api-util/sdk');

module.exports = async (req, res) => {
  const integrationSdk = getIntegrationSdk();
  const { listingId, customerId } = req.body;

  try {
    // Get provider's Stripe account ID
    const tranactions = await integrationSdk.transactions.query({ customerId: customerId, listingId: listingId });

    res.status(200).send({
      success: true,
      tranaction: tranactions,
    
    });
  } catch (err) {
    console.error('Tip payment intent creation error:', err);
    res.status(400).send({
      error: err.message || 'Failed to create payment intent'
    });
  }
};
