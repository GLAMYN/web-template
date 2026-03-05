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
const { types: sdkTypes } = require('sharetribe-flex-sdk');
const { Money: SdkMoney } = sdkTypes;
const { geocodeAddress } = require('../api-util/geocodeAddress');
const moment = require('moment');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const marketplaceRootURL = process.env.REACT_APP_CANONICAL_ROOT_URL;

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
  const {
    isSpeculative,
    orderData,
    bodyParams,
    queryParams,
    pageData,
    coupanCode,
    paymentMethodSelected,
    isFarFuture: isFarFutureFromClient,
  } = req.body;
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
  // PIP: snapshots computed at initiation time
  let pipProtectedData = {};
  let isFarFuture = false;
  let stripeCustomerId = null;
  // Promoted to outer scope so they are accessible in the second .then() chain
  // (where currentUserResponse would otherwise be out of scope)
  let customerId = null;
  let currentUserEmail = null;

  const listingPromise = () =>
    sdk.listings.show({
      id: bodyParams?.params?.listingId,
      include: ['author', 'publicData.travel_time'],
    });

  // Get current user to get customerId and stripeCustomerId
  const currentUserPromise = sdk.currentUser.show({ include: ['stripeCustomer'] });

  Promise.all([listingPromise(), fetchCommission(sdk), currentUserPromise])
    .then(async ([showListingResponse, fetchAssetsResponse, currentUserResponse]) => {
      listing = showListingResponse.data.data; // Assign to outer variable
      const commissionAsset = fetchAssetsResponse.data.data[0];
      customerId = currentUserResponse.data.data.id.uuid; // assigned to outer-scope var
      currentUserEmail = currentUserResponse.data.data.attributes.email; // assigned to outer-scope var
      // Extract the real Stripe cus_... ID from the included stripeCustomer entity.
      // NOTE: relationships.stripeCustomer.data.id is a Sharetribe-internal UUID, NOT a Stripe ID.
      // The actual cus_... ID lives in the included entity's attributes.stripeCustomerId.
      const stripeCustomerRef = currentUserResponse.data.data.relationships?.stripeCustomer?.data;
      if (stripeCustomerRef) {
        const stripeCustomerEntity = currentUserResponse.data.included?.find(
          entity => entity.type === 'stripeCustomer' && entity.id?.uuid === stripeCustomerRef.id?.uuid
        );
        stripeCustomerId = stripeCustomerEntity?.attributes?.stripeCustomerId || null;
      }
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
        // Always use recurringValue as the base for provider commission
        // Only use customValue if explicitly set for this provider
        if (!isCustomer && hasTransactions) return recurringValue;
        customValue ||= undefined;
        if (customValue || Number(customValue) === 0) return Number(customValue);
        // Use recurringValue instead of defaultValue from Console asset
        return recurringValue !== undefined ? recurringValue : defaultValue;
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

      // Get provider ID from listing
      const providerId = listing.relationships?.author?.data?.id?.uuid;
      // Use Integration SDK to get provider's coupons
      const providerResponse = await integrationSdk.users.show({
        id: providerId,
        include: ['profileImage'],
        'fields.user': ['profile.privateData.coupons', 'profile.publicData.salesTaxes'],
      });

      const privateData = providerResponse?.data?.data?.attributes.profile?.privateData;
      const providerCoupons = privateData?.coupons || [];
      const salesTaxes = providerResponse?.data?.data?.attributes?.profile?.publicData?.salesTaxes;

      // We need to fetch coupon details from the provider's private data
      // Using the outer couponData variable
      if (coupanCodes) {
        try {

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
        } catch (error) {
          console.error('Error fetching coupon details:', error);
          // If there's an error, we'll continue without the coupon
        }
      }

      lineItems = await transactionLineItems(
        listing,
        { ...orderData, ...bodyParams.params, ...couponData, paymentMethodSelected },
        providerCommission,
        customerCommission,
        salesTaxes
      );

      // Determine if booking is more than 90 days from now
      const bookingEnd = orderData?.bookingEnd || bodyParams?.params?.bookingEnd;
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

      if (pipAllowed && balanceAdj) {
        const balanceCents = Math.abs(balanceAdj.unitPrice.amount);
        const currency = listing.attributes.price.currency;

        // Re-calculate subtotal for snapshot
        const customerSubtotalCents = lineItems
          .filter(
            item =>
              item.includeFor.includes('customer') &&
              !item.code.includes('commission') &&
              item.code !== 'line-item/pip-balance-adjustment'
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

      return getTrustedSdk(req);
    })
    .then(async trustedSdk => {
      const { params } = bodyParams;

      // Merge PIP protectedData into the transaction's protectedData
      const existingProtectedData = params?.protectedData || {};

      // If far future and not speculative, create a SetupIntent
      let setupIntentSecret = null;
      if (isFarFuture && !isSpeculative) {
        try {
          // If stripeCustomerId is missing (new user), create one in Stripe and associate with Sharetribe user
          if (!stripeCustomerId) {
            const customer = await stripe.customers.create({
              email: currentUserEmail,
              metadata: { userId: customerId },
            });
            stripeCustomerId = customer.id;
            // Associate Stripe customer with Sharetribe user using the user's SDK
            await sdk.stripeCustomer.create({ stripeCustomerId });
          }

          if (stripeCustomerId) {
            const setupIntent = await stripe.setupIntents.create({
              customer: stripeCustomerId,
              usage: 'off_session',
              metadata: { listingId: bodyParams?.params?.listingId?.uuid || bodyParams?.params?.listingId },
            });
            setupIntentSecret = setupIntent.client_secret;
            // Store stripeCustomerId in protectedData for the scanner
            pipProtectedData.stripeCustomerId = stripeCustomerId;
          } else {
            console.error('initiate-privileged - stripeCustomerId missing, cannot create SetupIntent');
          }
        } catch (error) {
          console.error('initiate-privileged - Error creating SetupIntent:', error);
          // Fallback or handle error
        }
      }

      // Add lineItems to the body params
      const body = {
        ...bodyParams,
        params: {
          ...params,
          lineItems,
          protectedData: {
            ...existingProtectedData,
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

      // Helper function to serialize line items for metadata storage
      // Converts Money objects to plain objects with amount and currency
      const serializeLineItem = lineItem => {
        const serialized = { ...lineItem };
        if (
          lineItem.unitPrice &&
          typeof lineItem.unitPrice === 'object' &&
          lineItem.unitPrice.amount !== undefined
        ) {
          serialized.unitPrice = {
            amount: lineItem.unitPrice.amount,
            currency: lineItem.unitPrice.currency,
          };
        }
        if (
          lineItem.lineTotal &&
          typeof lineItem.lineTotal === 'object' &&
          lineItem.lineTotal.amount !== undefined
        ) {
          serialized.lineTotal = {
            amount: lineItem.lineTotal.amount,
            currency: lineItem.lineTotal.currency,
          };
        }
        return serialized;
      };

      // Helper function to identify sale line items
      // Sale line items are base price items (night, day, hour, item, fixed) or price variant items
      const isSaleLineItem = lineItem => {
        return lineItem.code.includes('Sales Tax');
      };

      // Extract sale line items and other line items, then serialize them
      const saleLineItems = lineItems
        ? lineItems.filter(isSaleLineItem).map(serializeLineItem)
        : [];
      const lineItemsWithoutSale = lineItems
        ? lineItems.filter(item => !isSaleLineItem(item)).map(serializeLineItem)
        : [];

      // Prepare base metadata with sale line items and line items
      const baseMetadata = {
        // Add sale line items and line items without sale line items
        ...(saleLineItems.length > 0 && {
          saleLineItem: saleLineItems?.map(item => {
            item.code = item?.code?.replace('line-item/', '');
            item.linetotal = {
              amount: Number(item.unitPrice?.amount / 100) * Number(item.quantity || 1),
              currency: 'USD',
            };
            return item;
          }),
        }),
        ...(lineItemsWithoutSale.length > 0 && {
          lineItems: lineItemsWithoutSale?.map(item => {
            item.code = item?.code?.replace('line-item/', '');
            item.linetotal = {
              amount: Number(item.unitPrice?.amount / 100) * Number(item.quantity || 1),
              currency: 'USD',
            };
            return item;
          }),
        }),
        ...{
          serviceTotal: {
            amount:
              lineItemsWithoutSale?.filter(item => !item.code.includes("provider-commission"))?.reduce(
                (total, item) =>
                  total + Number(item.unitPrice?.amount || 0) * Number(item.quantity || 1),
                0
              ) / 100,
            currency: 'USD',
          },
        },
      };

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
                ...baseMetadata,
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
