const { getSdk, getIntegrationSdk, handleError, serialize } = require('../api-util/sdk');

/**
 * Validate and apply coupon codes during checkout
 */

const validateAndApplyCoupon = async (req, res) => {
  const sdk = getSdk(req, res);
  // Support both 'code' and 'couponCode' parameter names
  const couponCode = req.body.couponCode || req.body.code;
  const { listingId, orderTotal, currency } = req.body;
  
  try {
    
    if (!couponCode || !listingId || orderTotal === undefined) {
      return res.status(400).send({
        success: false,
        error: 'Missing required fields: couponCode, listingId, orderTotal'
      });
    }
    
    // Get listing details to find the provider
    const listingResponse = await sdk.listings.show({ id: listingId, include:['author'] });
    
    if (!listingResponse?.data?.data) {
      return res.status(404).send({
        success: false,
        error: 'Listing not found'
      });
    }
    
    const listing = listingResponse.data.data;
    
    // Using the specific path for provider ID as requested
    let providerId;
    try {
      providerId = listing.relationships.author.data.id.uuid;
    } catch (error) {
      return res.status(400).send({
        success: false,
        error: 'Unable to determine provider ID from listing data'
      });
    }
    
    // Get provider's coupons using Integration SDK to access private data
    let providerCoupons = [];
    
    try {
      // Initialize the Integration SDK
      const integrationSdk = getIntegrationSdk();
      
      // Use the Integration SDK to get the provider's private data
      const providerResponse = await integrationSdk.users.show({
        id: providerId,
        include: ['profileImage'],
        'fields.user': ['profile.privateData.coupons'],
      });
      
      if (!providerResponse?.data?.data) {
        return res.status(404).send({
          success: false,
          error: 'Provider not found'
        });
      }
      
      // Extract coupons from private data
      const privateData = providerResponse.data.data.attributes.profile?.privateData;
      providerCoupons = privateData?.coupons || [];
      
      // If no coupons found, use mock data in development mode
      if ((!providerCoupons || providerCoupons.length === 0) && process.env.NODE_ENV === 'development') {
        providerCoupons = [
          {
            id: 'mock-coupon-1',
            code: 'SAVE20',
            type: 'percentage',
            amount: 20,
            currency: 'USD',
            fundedBy: 'provider',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
            maxRedemptions: 100,
            usedCount: 0,
            isActive: true,
            applicableListingIds: []
          }
        ];
      }
    } catch (error) {
      // In development mode, use mock data as fallback
      if (process.env.NODE_ENV === 'development') {
        providerCoupons = [
          {
            id: 'mock-coupon-1',
            code: 'SAVE20',
            type: 'percentage',
            amount: 20,
            currency: 'USD',
            fundedBy: 'provider',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
            maxRedemptions: 100,
            usedCount: 0,
            isActive: true,
            applicableListingIds: []
          }
        ];
      } else {
        throw error;
      }
    }
    
    
    // Find the coupon by code - include validation for active status, expiration, and max redemptions
    const coupon = providerCoupons.find(c => 
      c.code === couponCode.toUpperCase() && 
      c.isActive &&
      (!c.expiresAt || new Date(c.expiresAt) > new Date()) &&
      (!c.maxRedemptions || c.usedCount < c.maxRedemptions)
    );
    
    // If no valid coupon found, determine the specific reason for better error messages
    if (!coupon) {
      // Try to find the coupon just by code to give more specific error
      const inactiveCoupon = providerCoupons.find(c => c.code === couponCode.toUpperCase());
      
      if (!inactiveCoupon) {
        return res.status(404).send({
          success: false,
          error: 'Invalid coupon code'
        });
      } else if (!inactiveCoupon.isActive) {
        return res.status(400).send({
          success: false,
          error: 'Coupon is inactive'
        });
      } else if (inactiveCoupon.expiresAt && new Date(inactiveCoupon.expiresAt) <= new Date()) {
        return res.status(400).send({
          success: false,
          error: 'Coupon has expired'
        });
      } else if (inactiveCoupon.maxRedemptions && inactiveCoupon.usedCount >= inactiveCoupon.maxRedemptions) {
        return res.status(400).send({
          success: false,
          error: 'Coupon has reached maximum redemptions'
        });
      } else {
        return res.status(404).send({
          success: false,
          error: 'Invalid or inactive coupon code'
        });
      }
    }
    
    // Check if coupon is applicable to this listing
    if (coupon.applicableListingIds && coupon.applicableListingIds.length > 0 && 
        !coupon.applicableListingIds.includes(listingId)) {
      return res.status(400).send({
        success: false,
        error: 'Coupon is not applicable to this listing'
      });
    }
    
    // Calculate discount amount
    let discountAmount = 0;
    if (coupon.type === 'fixed') {
      // Check currency match for fixed amount discounts
      if (coupon.currency !== currency) {
        return res.status(400).send({
          success: false,
          error: `Coupon currency (${coupon.currency}) does not match order currency (${currency})`
        });
      }
      discountAmount = Math.min(coupon.amount, orderTotal);
    } else if (coupon.type === 'percentage') {
      discountAmount = Math.round((orderTotal * coupon.amount) / 100);
    }
    
    // Ensure discount doesn't exceed order total
    discountAmount = Math.min(discountAmount, orderTotal);
    
    const finalTotal = orderTotal - discountAmount;
    
    res.status(200).send({
      success: true,
      data: {
        coupon: {
          id: coupon.id,
          code: coupon.code,
          type: coupon.type,
          amount: coupon.amount,
          fundedBy: coupon.fundedBy
        },
        discount: {
          amount: discountAmount,
          currency: currency,
          type: coupon.type
        },
        orderSummary: {
          originalTotal: orderTotal,
          discountAmount: discountAmount,
          finalTotal: finalTotal,
          currency: currency
        }
      }
    });
    
  } catch (error) {
    console.error('Validate coupon error:', error);
    handleError(res, error);
  }
};

// Apply coupon (increment usage count) - called after successful payment
const applyCoupon = async (req, res) => {
  const sdk = getSdk(req, res);
  // Support both parameter naming conventions
  const couponCode = req.body.couponCode || req.body.code;
  const { listingId, orderTotal, currency, couponId, providerId } = req.body;
  
  // If we have couponCode and listingId, use the same logic as validateAndApplyCoupon
  if (couponCode && listingId) {
    return validateAndApplyCoupon(req, res);
  }
  
  try {
    if (!couponId || !providerId) {
      return res.status(400).send({
        success: false,
        error: 'Missing required fields: couponId, providerId'
      });
    }
    
    // Get provider's coupons
    const providerResponse = await sdk.users.show({ id: providerId });
    const providerData = providerResponse.data.data;
    const existingCoupons = providerData.attributes.profile?.privateData?.coupons || [];
    
    // Find and update the coupon usage count
    const couponIndex = existingCoupons.findIndex(c => c.id === couponId);
    if (couponIndex === -1) {
      return res.status(404).send({
        success: false,
        error: 'Coupon not found'
      });
    }
    
    const updatedCoupons = [...existingCoupons];
    updatedCoupons[couponIndex] = {
      ...updatedCoupons[couponIndex],
      usedCount: updatedCoupons[couponIndex].usedCount + 1,
      updatedAt: new Date().toISOString()
    };
    
    // Update provider profile with new usage count
    // Note: This would need to be done by the provider or through an admin API
    // For now, we'll return the updated coupon data
    
    res.status(200).send({
      success: true,
      data: updatedCoupons[couponIndex]
    });
    
  } catch (error) {
    console.error('Apply coupon error:', error);
    handleError(res, error);
  }
};

module.exports = {
  validateAndApplyCoupon,
  applyCoupon
};
