const { serialize, getSdk } = require('../api-util/sdk');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  try {
    const { amount, currency, userId } = req.body;
    if (!amount || !currency || !userId) {
      return res.status(400).json({ error: 'Missing required parameters.' });
    }

    // Create a PaymentIntent with Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // amount in smallest currency unit (e.g., cents)
      currency,
      metadata: {
        userId,
        reason: 'Seller cancellation fine',
      },
      description: 'Seller cancellation fine payment',
    });

    res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}; 