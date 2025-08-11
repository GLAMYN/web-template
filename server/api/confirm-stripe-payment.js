const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  try {
    const { clientSecret, paymentMethodId, paymentIntentId, returnUrl } = req.body;
    if (!paymentIntentId || !paymentMethodId) {
      return res.status(400).json({ error: 'Missing required parameters.' });
    }

    // Confirm the payment intent using the PaymentIntent ID
    const paymentIntent = await stripe.paymentIntents.confirm(
      paymentIntentId,
      { payment_method: paymentMethodId,
        return_url: returnUrl,
       }
    );

    res.status(200).json({ paymentIntent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}; 