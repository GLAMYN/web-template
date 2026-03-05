const { transactionLineItems } = require('../api-util/lineItems');
const {
  getSdk,
  getTrustedSdk,
  handleError,
  serialize,
  fetchCommission,
  getIntegrationSdk,
} = require('../api-util/sdk');
const { recurringCommission } = require('../constants/commissions');
const moment = require('moment');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function getTransactions(integrationSdk, customerId, listingId) {
  return integrationSdk.transactions.query({
    customerId,
    listingId,
    lastTransitions: "transition/accept,transition/complete,transition/operator-accept,transition/review-1-by-provider,transition/review-2-by-provider,transition/review-1-by-customer,transition/review-2-by-customer,transition/expire-customer-review-period,transition/expire-provider-review-period,transition/expire-review-period,transition/confirm-payment"
  });
}

// Function to update coupon usage count
async function updateCouponUsage(integrationSdk, providerId, couponCode) {
  if (!providerId || !couponCode) {
    console.log('Missing providerId or couponCode for updating usage count');
    return false;
  }

  try {
    // Get provider data
    const providerResponse = await integrationSdk.users.show({
      id: providerId,
      include: ['profileImage'],
      'fields.user': ['profile.privateData.coupons'],
    });

    const privateData = providerResponse.data.data.attributes.profile?.privateData;
    const coupons = privateData?.coupons || [];

    // Find the coupon by code
    const couponIndex = coupons.findIndex(c => c.code === couponCode);
    if (couponIndex === -1) {
      console.log(`Coupon ${couponCode} not found for provider ${providerId}`);
      return false;
    }

    // Increment the usage count
    const updatedCoupons = [...coupons];
    updatedCoupons[couponIndex] = {
      ...updatedCoupons[couponIndex],
      usedCount: (updatedCoupons[couponIndex].usedCount || 0) + 1,
      updatedAt: new Date().toISOString()
    };

    // Check if max redemptions reached and update isActive if needed
    if (updatedCoupons[couponIndex].maxRedemptions &&
      updatedCoupons[couponIndex].usedCount >= updatedCoupons[couponIndex].maxRedemptions) {
      updatedCoupons[couponIndex].isActive = false;
    }

    // Update provider profile
    await integrationSdk.users.updateProfile({
      userId: providerId,
      privateData: {
        ...privateData,
        coupons: updatedCoupons
      }
    });

    console.log(`Coupon ${couponCode} usage count updated successfully`);
    return true;
  } catch (error) {
    console.error('Error updating coupon usage count:', error);
    return false;
  }
}

module.exports = (req, res) => {
  const {
    isSpeculative,
    orderData,
    bodyParams,
    queryParams,
    coupanCode,
    paymentMethodSelected,
    isFarFuture: isFarFutureFromClient,
  } = req.body;

  const sdk = getSdk(req, res);
  const integrationSdk = getIntegrationSdk();
  let lineItems = null;
  let couponData = {};
  let listing = null; // Store listing for later use
  let isFarFuture = false;
  let stripeCustomerId = null;
  let pipProtectedData = {};

  const listingPromise = () => sdk.listings.show({ id: bodyParams?.params?.listingId, include: ['author'] });

  // Get current user to get customerId and stripeCustomerId
  const currentUserPromise = sdk.currentUser.show({ include: ['stripeCustomer'] });

  Promise.all([listingPromise(), fetchCommission(sdk), currentUserPromise])
    .then(async ([showListingResponse, fetchAssetsResponse, currentUserResponse]) => {
      listing = showListingResponse.data.data; // Assign to outer variable
      const commissionAsset = fetchAssetsResponse.data.data[0];
      const customerId = currentUserResponse.data.data.id.uuid;
      stripeCustomerId = currentUserResponse.data.data.relationships?.stripeCustomer?.data?.id?.uuid;
      const listing_Id = bodyParams?.params?.listingId?.uuid || bodyParams?.params?.listingId;

      const { providerCommission, customerCommission } =
        commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};

      // Get previous transactions between this customer and listing
      const transactions = await getTransactions(integrationSdk, customerId, listing_Id);
      const hasTransactions = transactions?.data?.data?.length > 0;

      // Helper function to get commission values, prioritizing recurringCommission
      const getCommissionValue = (recurringValue, defaultValue) => {
        return recurringValue !== undefined ? recurringValue : defaultValue;
      };

      // Apply recurring commission values for provider
      providerCommission.percentage = getCommissionValue(
        recurringCommission.providerCommission.percentage,
        providerCommission.percentage
      );
      providerCommission.minimum_amount = getCommissionValue(
        recurringCommission.providerCommission.minimum_amount,
        providerCommission.minimum_amount
      );

      // Apply the same logic as in transaction-line-items.js for customer
      customerCommission.percentage = hasTransactions ? 0 : getCommissionValue(
        recurringCommission.customerCommission.percentage,
        customerCommission.percentage
      );
      customerCommission.minimum_amount = hasTransactions ? 0 : getCommissionValue(
        recurringCommission.customerCommission.minimum_amount,
        customerCommission.minimum_amount
      );

      // We need to fetch coupon details from the provider's private data
      // Using the outer couponData variable
      if (coupanCode) {
        try {
          // Get provider ID from listing
          const providerId = listing.relationships?.author?.data?.id?.uuid;

          if (providerId) {
            // Use Integration SDK to get provider's coupons
            const providerResponse = await integrationSdk.users.show({
              id: providerId,
              include: ['profileImage'],
              'fields.user': ['profile.privateData.coupons'],
            });

            const privateData = providerResponse.data.data.attributes.profile?.privateData;
            const providerCoupons = privateData?.coupons || [];

            // Find the matching coupon - validate code, active status and expiration date
            const coupon = providerCoupons.find(c =>
              c.code === coupanCode.toUpperCase() &&
              c.isActive &&
              (!c.expiresAt || new Date(c.expiresAt) > new Date()) &&
              (!c.maxRedemptions || c.usedCount < c.maxRedemptions)
            );

            if (coupon) {
              // Check if coupon is applicable to this listing
              if (coupon.applicableListingIds &&
                coupon.applicableListingIds.length > 0 &&
                !coupon.applicableListingIds.includes(bodyParams?.params?.listingId)) {
                console.log(`Coupon ${coupon.code} is not applicable to this listing`);
              } else {
                console.log('Found valid coupon for transition:', coupon);
                couponData = {
                  coupon: {
                    code: coupon.code,
                    type: coupon.type,
                    amount: coupon.amount
                  },
                  couponCode: coupon.code
                };
              }
            }
          }
        } catch (error) {
          console.error('Error fetching coupon details:', error);
          // If there's an error, we'll continue without the coupon
        }
      }

      lineItems = await transactionLineItems(
        listing,
        { ...orderData, ...bodyParams.params, ...couponData, paymentMethodSelected },
        providerCommission,
        customerCommission
      );

      // Determine if booking is more than 90 days from now
      const bookingEnd = bodyParams?.params?.bookingEnd;
      let scheduledChargeAt = null;
      isFarFuture = !!isFarFutureFromClient;

      // Fallback calculation if flag not provided
      if (isFarFutureFromClient === undefined && bookingEnd) {
        const bookingEndDate = new Date(bookingEnd);
        const now = new Date();
        const daysUntilEnd = (bookingEndDate - now) / (1000 * 60 * 60 * 24);
        if (daysUntilEnd > 90) {
          isFarFuture = true;
        }
      }

      if (isFarFuture && bookingEnd) {
        const bookingEndDate = new Date(bookingEnd);
        const chargeDate = new Date(bookingEndDate);
        chargeDate.setDate(chargeDate.getDate() - 60);
        scheduledChargeAt = chargeDate.toISOString();
      }


      // ─── PIP: Compute snapshots from line items ──────────────────────────────
      const isPipValueTrue = val => val === true || val?.toLowerCase() === 'yes';
      const pipAllowed =
        isPipValueTrue(listing.attributes.publicData?.pay_in_person_allowed) ||
        isPipValueTrue(listing.attributes.publicData?.payinPersonAllowed);

      const balanceAdj = lineItems.find(item => item.code === 'line-item/pip-balance-adjustment');
      pipProtectedData = {};

      if (pipAllowed && balanceAdj) {
        const balanceCents = Math.abs(balanceAdj.unitPrice.amount);
        const currency = listing.attributes.price.currency;

        // Re-calculate subtotal for snapshot
        const customerSubtotalCents = lineItems
          .filter(
            item =>
              item.includeFor.includes('customer') &&
              !item.code.includes('commission')
          )
          .reduce((sum, item) => {
            const quantity =
              item.quantity || (item.units && item.seats ? item.units * item.seats : 1);
            return sum + item.unitPrice.amount * quantity;
          }, 0);

        const depositCents = customerSubtotalCents - balanceCents;

        const depositPct = Number(
          listing.attributes.publicData?.deposit_percentage ||
          listing.attributes.publicData?.depositAmount ||
          listing.attributes.publicData?.depositPercentage ||
          0
        );

        pipProtectedData = {
          pipAllowedSnapshot: true,
          depositPctSnapshot: depositPct,
          paymentMethodSelected: 'in_person_deposit',
          depositAmount: { amount: depositCents, currency },
          balanceAmount: { amount: balanceCents, currency },
          ...(scheduledChargeAt ? { scheduledChargeAt } : {}),
        };
      } else {
        // Full online payment
        const currency = listing.attributes.price.currency;
        const customerSubtotalCents = lineItems
          .filter(
            item =>
              item.includeFor.includes('customer') &&
              !item.code.includes('commission')
          )
          .reduce((sum, item) => {
            const quantity =
              item.quantity || (item.units && item.seats ? item.units * item.seats : 1);
            return sum + item.unitPrice.amount * quantity;
          }, 0);

        pipProtectedData = {
          pipAllowedSnapshot: pipAllowed,
          paymentMethodSelected: 'online_full',
          fullAmount: { amount: customerSubtotalCents, currency },
          ...(scheduledChargeAt ? { scheduledChargeAt } : {}),
        };
      }

      // ─── End PIP Snapshots ──────────────────────────────────────────────────

      return getTrustedSdk(req);
    })
    .then(async trustedSdk => {
      // Omit listingId from params (transition/request-payment-after-inquiry does not need it)
      const { listingId, ...restParams } = bodyParams?.params || {};

      // If far future and not speculative, create a SetupIntent
      let setupIntentSecret = null;
      if (isFarFuture && !isSpeculative) {
        try {
          if (stripeCustomerId) {
            const setupIntent = await stripe.setupIntents.create({
              customer: stripeCustomerId,
              usage: 'off_session',
              metadata: { transactionId: bodyParams?.id?.uuid || bodyParams?.id },
            });
            setupIntentSecret = setupIntent.client_secret;
            // Store stripeCustomerId in protectedData for the scanner
            pipProtectedData.stripeCustomerId = stripeCustomerId;
          } else {
            console.error('transition-privileged - stripeCustomerId missing, cannot create SetupIntent');
          }
        } catch (error) {
          console.error('transition-privileged - Error creating SetupIntent:', error);
          // Fallback or handle error
        }
      }

      // Add lineItems to the body params
      const body = {
        ...bodyParams,
        params: {
          ...restParams,
          lineItems,
          protectedData: {
            ...bodyParams?.params?.protectedData,
            ...pipProtectedData,
            ...(setupIntentSecret
              ? {
                setupIntentClientSecret: setupIntentSecret,
              }
              : {}),
          },
        },
      };


      if (isSpeculative) {
        return trustedSdk.transactions.transitionSpeculative(body, queryParams);
      }
      return trustedSdk.transactions.transition(body, queryParams);
    })
    .then(async apiResponse => {
      const { status, statusText, data } = apiResponse;

      // Only update coupon usage for non-speculative transactions
      // For transitions that confirm payment
      if (!isSpeculative && couponData?.coupon &&
        bodyParams?.transition &&
        (bodyParams.transition === 'transition/confirm-payment' ||
          bodyParams.transition === 'transition/confirm-payment-after-enquiry')) {

        // Get provider ID from the listing
        const providerId = listing?.relationships?.author?.data?.id?.uuid;
        if (providerId && couponData.coupon.code) {
          // Update coupon usage count
          await updateCouponUsage(integrationSdk, providerId, couponData.coupon.code);
        }
      }

      res
        .status(status)
        .set('Content-Type', 'application/transit+json')
        .send(
          serialize({
            status,
            statusText,
            data,
          })
        )
        .end();
    })
    .catch(e => {
      handleError(res, e);
    });
};
