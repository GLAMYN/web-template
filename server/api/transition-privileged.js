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
  const { isSpeculative, orderData, bodyParams, queryParams, coupanCode } = req.body;

  const sdk = getSdk(req, res);
  const integrationSdk = getIntegrationSdk();
  let lineItems = null;
  let couponData = {};
  let listing = null; // Store listing for later use

  const listingPromise = () => sdk.listings.show({ id: bodyParams?.params?.listingId, include: ['author'] });

  // Get current user to get customerId
  const currentUserPromise = sdk.currentUser.show();
  
  Promise.all([listingPromise(), fetchCommission(sdk), currentUserPromise])
    .then(async ([showListingResponse, fetchAssetsResponse, currentUserResponse]) => {
      listing = showListingResponse.data.data; // Assign to outer variable
      const commissionAsset = fetchAssetsResponse.data.data[0];
      const customerId = currentUserResponse.data.data.id.uuid;
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
        { ...orderData, ...bodyParams.params, ...couponData },
        providerCommission,
        customerCommission
      );

      return getTrustedSdk(req);
    })
    .then(trustedSdk => {
      // Omit listingId from params (transition/request-payment-after-inquiry does not need it)
      const { listingId, ...restParams } = bodyParams?.params || {};

      // Add lineItems to the body params
      const body = {
        ...bodyParams,
        params: {
          ...restParams,
          lineItems,
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
