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
const { UUID } = require('sharetribe-flex-integration-sdk').types;
const { geocodeAddress } = require('../api-util/geocodeAddress');

async function getTransactions(integrationSdk, customerId, listingId) {
  return integrationSdk.transactions.query({
    customerId,
    listingId,
    lastTransitions:
      'transition/accept,transition/complete,transition/operator-accept,transition/review-1-by-provider,transition/review-2-by-provider,transition/review-1-by-customer,transition/review-2-by-customer,transition/expire-customer-review-period,transition/expire-provider-review-period,transition/expire-review-period,transition/confirm-payment',
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
    };

    // Check if max redemptions reached and update isActive if needed
    if (
      updatedCoupons[couponIndex].maxRedemptions &&
      updatedCoupons[couponIndex].usedCount >= updatedCoupons[couponIndex].maxRedemptions
    ) {
      updatedCoupons[couponIndex].isActive = false;
    }
    console.log('updatedCouponssecccccccc', providerId, {
      ...privateData,
      coupons: updatedCoupons,
    });
    // Update provider profile
    await integrationSdk.users.updateProfile({
      id: new UUID(providerId),
      privateData: {
        ...privateData,
        coupons: updatedCoupons,
      },
    });

    console.log(`Coupon ${couponCode} usage count updated successfully`);
    return true;
  } catch (error) {
    console.error('Error updating coupon usage count:', error);
    return error;
  }
}

module.exports = (req, res) => {
  const { isSpeculative, orderData, bodyParams, queryParams, pageData, coupanCode } = req.body;
  const selectedLocationType = pageData?.orderData?.locationChoice;
  const selectedLocation =
    selectedLocationType === 'mylocation'
      ? pageData?.orderData?.location?.selectedPlace?.address
      : `https://www.google.com/maps?q=${pageData?.listing?.attributes?.geolocation?.lat},${pageData?.listing?.attributes?.geolocation?.lng}`;

  const coupanCodes = coupanCode || pageData?.orderData?.coupanCode;
  console.log('coupanCode', coupanCode);

  const integrationSdk = getIntegrationSdk();

  const sdk = getSdk(req, res);
  let lineItems = null;
  let couponData = {};
  let listing = null; // Store listing for later use

  const listingPromise = () =>
    sdk.listings.show({ id: bodyParams?.params?.listingId, include: ['author', 'publicData.travel_time'] });

  // Get current user to get customerId
  const currentUserPromise = sdk.currentUser.show();

  Promise.all([listingPromise(), fetchCommission(sdk), currentUserPromise])
    .then(async ([showListingResponse, fetchAssetsResponse, currentUserResponse]) => {
      listing = showListingResponse.data.data; // Assign to outer variable
      const commissionAsset = fetchAssetsResponse.data.data[0];
      const customerId = currentUserResponse.data.data.id.uuid;
      const listing_Id = bodyParams?.params?.listingId?.uuid || bodyParams?.params?.listingId;

      const user = showListingResponse.data.included?.find(i => i.type === 'user');
      const author = await sdk.users.show({ id: user.id?.uuid });
      const customer = await sdk.users.show({ id: customerId });
      const customCommission =
        author?.data?.data?.attributes?.profile?.publicData?.customCommission;
      const customerCustomCommission =
        customer?.data?.data?.attributes?.profile?.publicData?.customCommission;

      const { providerCommission, customerCommission } =
        commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};

      // Get previous transactions between this customer and listing
      const transactions = await getTransactions(integrationSdk, customerId, listing_Id);

      // Apply the same logic as in transaction-line-items.js
      const hasTransactions = transactions?.data?.data?.length > 0;

      const getCommissionValue = (
        recurringValue,
        customValue,
        defaultValue,
        isCustomer = false
      ) => {
        if (hasTransactions && !isCustomer) return recurringValue;
        customValue ||= undefined;
        if (customValue || Number(customValue) === 0) return Number(customValue);
        return defaultValue;
      };

      customerCommission.percentage = getCommissionValue(
        recurringCommission.customerCommission.percentage,
        customerCustomCommission?.percentage,
        customerCommission.percentage,
        true
      );

      customerCommission.minimum_amount = getCommissionValue(
        recurringCommission.customerCommission.minimum_amount,
        customerCustomCommission?.minimum_amount,
        customerCommission.minimum_amount,
        true
      );

      providerCommission.percentage = getCommissionValue(
        recurringCommission.providerCommission.percentage,
        customCommission?.percentage,
        providerCommission.percentage
      );

      providerCommission.minimum_amount = getCommissionValue(
        recurringCommission.providerCommission.minimum_amount,
        customCommission?.minimum_amount,
        providerCommission.minimum_amount
      );

      // We need to fetch coupon details from the provider's private data
      // Using the outer couponData variable
      if (coupanCodes) {
        try {
          // Get provider ID from listing
          const providerId = listing.relationships?.author?.data?.id?.uuid;
          console.log('providerId>>>>>>>>>>>>>>>>', providerId);
          if (providerId) {
            // Use Integration SDK to get provider's coupons
            const providerResponse = await integrationSdk.users.show({
              id: providerId,
              include: ['profileImage'],
              'fields.user': ['profile.privateData.coupons'],
            });

            const privateData = providerResponse.data.data.attributes.profile?.privateData;
            const providerCoupons = privateData?.coupons || [];
            console.log('privateData>>>>>>>>>>>>>>>>', privateData);

            // Find the matching coupon - validate code, active status and expiration date
            const coupon = providerCoupons.find(
              c =>
                c.code === coupanCodes.toUpperCase() &&
                c.isActive &&
                (!c.expiresAt || new Date(c.expiresAt) > new Date()) &&
                (!c.maxRedemptions || c.usedCount < c.maxRedemptions)
            );

            if (coupon) {
              // Check if coupon is applicable to this listing
              if (
                coupon.applicableListingIds &&
                coupon.applicableListingIds.length > 0 &&
                !coupon.applicableListingIds.includes(bodyParams?.params?.listingId)
              ) {
                console.log(`Coupon ${coupon.code} is not applicable to this listing`);
              } else {
                console.log('Found valid coupon for checkout:', coupon);
                couponData = {
                  coupon: {
                    code: coupon.code,
                    type: coupon.type,
                    amount: coupon.amount,
                  },
                  couponCode: coupon.code,
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
      const { params } = bodyParams;

      // Add lineItems to the body params
      const body = {
        ...bodyParams,
        params: {
          ...params,
          lineItems,
        },
      };

      if (isSpeculative) {
        return trustedSdk.transactions.initiateSpeculative(body, queryParams);
      }
      return trustedSdk.transactions.initiate(body, queryParams);
    })
    .then(async apiResponse => {
      const { status, statusText, data } = apiResponse;

      // Only update coupon usage for non-speculative transactions
      if (!isSpeculative && couponData?.coupon) {
        // Get provider ID from the listing
        const providerId = listing?.relationships?.author?.data?.id?.uuid;
        if (providerId && couponData.coupon.code) {
          // Update coupon usage count
          await updateCouponUsage(integrationSdk, providerId, couponData.coupon.code);
        }
      }

      if (pageData?.listing?.attributes?.geolocation?.lat) {
        const { bookingQuestion1, bookingQuestion2, bookingQuestion3 } = pageData?.orderData;
        
        // Extract state/province and country from listing address using geocoding API
        const address = listing?.attributes?.publicData?.location?.address;
        const locationMetadata = await geocodeAddress(address);
        
        await integrationSdk.transactions
          .updateMetadata(
            {
              id: data.data.id,
              metadata: {
                travelTime: listing?.attributes?.publicData?.travel_time,
                selectedLocationType: selectedLocationType,
                selectedLocation: selectedLocation,
                location: pageData?.orderData?.location,
                ...(locationMetadata.stateName && { stateName: locationMetadata.stateName }),
                ...(locationMetadata.stateCode && { stateCode: locationMetadata.stateCode }),
                ...(locationMetadata.country && { country: locationMetadata.country }),
                ...(bookingQuestion1 && { bookingQuestion1 }),
                ...(bookingQuestion2 && { bookingQuestion2 }),
                ...(bookingQuestion3 && { bookingQuestion3 }),
                ...(couponData?.coupon && {
                  couponCode: couponData.coupon.code,
                  couponType: couponData.coupon.type,
                  couponAmount: couponData.coupon.amount,
                }),
                ...(coupanCodes && !couponData?.coupon && { couponCode: coupanCodes }),
              },
            },
            {
              expand: true,
            }
          )
          .then(res => {
            // res.data contains the response data
          });
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
