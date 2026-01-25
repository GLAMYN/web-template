const { transactionLineItems } = require('../api-util/lineItems');
const {
  getSdk,
  handleError,
  serialize,
  fetchCommission,
  getIntegrationSdk,
} = require('../api-util/sdk');
const { constructValidLineItems } = require('../api-util/lineItemHelpers');
const { validateCouponData } = require('./coupons');
const { recurringCommission } = require('../constants/commissions');
async function getTransactions(integrationSdk, customerId, listingId) {
  return integrationSdk.transactions.query({
    customerId,
    listingId,
    lastTransitions:
      'transition/accept,transition/complete,transition/operator-accept,transition/review-1-by-provider,transition/review-2-by-provider,transition/review-1-by-customer,transition/review-2-by-customer,transition/expire-customer-review-period,transition/expire-provider-review-period,transition/expire-review-period,transition/confirm-payment',
  });
}
module.exports = async (req, res) => {
  const { isOwnListing, listingId, orderData, coupon } = req.body;

  const sdk = getSdk(req, res);
  const integrationSdk = getIntegrationSdk();

  // Check if there's a coupon code in the request
  const couponCode = orderData?.couponCode || coupon?.code;

  const currentUser = await sdk.currentUser.show();
  const customerId = currentUser.data.data.id.uuid;
  const listing_Id = listingId?.uuid || listingId;

  const listingPromise = () =>
    isOwnListing
      ? sdk.ownListings.show({ id: listingId })
      : sdk.listings.show({ id: listingId, include: ['author'] });

  Promise.all([
    listingPromise(),
    fetchCommission(sdk),
    getTransactions(integrationSdk, customerId, listing_Id),
  ])
    .then(async ([showListingResponse, fetchAssetsResponse, transactions]) => {
      const listing = showListingResponse.data.data;
      const commissionAsset = fetchAssetsResponse.data.data[0];

      const user = showListingResponse.data.included?.find(i => i.type === 'user');
      const author = await sdk.users.show({ id: user.id?.uuid });
      const customer = await sdk.users.show({ id: customerId });
      const customCommission =
        author?.data?.data?.attributes?.profile?.publicData?.customCommission;
      const customerCustomCommission =
        customer?.data?.data?.attributes?.profile?.publicData?.customCommission;

      const { providerCommission, customerCommission } =
        commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};

      // customerCommission.percentage = transactions?.data?.data?.length > 0 ? 0 : customerCommission.percentage;
      // customerCommission.minimum_amount = transactions?.data?.data?.length > 0 ? 0 : customerCommission.minimum_amount;

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

      // If there's a coupon code but no coupon object, validate and get the coupon
      let updatedOrderData = { ...orderData };

      // Get provider ID from listing
      const providerId = listing.relationships?.author?.data?.id?.uuid;
      if (!providerId) {
        throw new Error('Provider ID not found in listing');
      }

      // Use Integration SDK to get provider's coupons
      const integrationSdk = getIntegrationSdk();
      const providerResponse = await integrationSdk.users.show({
        id: providerId,
        include: ['profileImage'],
        'fields.user': ['profile.privateData.coupons', 'profile.publicData.salesTaxes'],
      });


      const privateData = providerResponse?.data?.data?.attributes?.profile?.privateData;
      const providerCoupons = privateData?.coupons || [];
      const salesTaxes = providerResponse?.data?.data?.attributes?.profile?.publicData?.salesTaxes;

      if (couponCode && !orderData.coupon) {
        try {
          console.log('Validating coupon code:', couponCode);
          // Find the matching coupon
          const coupon = providerCoupons.find(
            c => c.code === couponCode.toUpperCase() && c.isActive
          );

          if (coupon) {
            console.log('Found valid coupon:', coupon);
            updatedOrderData.coupon = {
              code: coupon.code,
              type: coupon.type,
              discount: coupon.type === 'percentage' ? coupon.amount : coupon.amount,
              currency: coupon.currency,
            };
          } else {
            console.log('No valid coupon found with code:', couponCode);
          }
        } catch (error) {
          console.error('Error validating coupon:', error);
          // Continue without coupon if validation fails
        }
      }

      const lineItems = await transactionLineItems(
        listing,
        updatedOrderData,
        providerCommission,
        customerCommission,
        salesTaxes
      );

      // Because we are using returned lineItems directly in this template we need to use the helper function
      // to add some attributes like lineTotal and reversal that Marketplace API also adds to the response.
      const validLineItems = constructValidLineItems(lineItems);

      res
        .status(200)
        .set('Content-Type', 'application/transit+json')
        .send(serialize({ data: validLineItems }))
        .end();
    })
    .catch(e => {
      handleError(res, e);
    });
};
