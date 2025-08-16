const { transactionLineItems } = require('../api-util/lineItems');
const { getSdk, handleError, serialize, fetchCommission, getIntegrationSdk } = require('../api-util/sdk');
const { constructValidLineItems } = require('../api-util/lineItemHelpers');
async function getTransactions(integrationSdk, customerId, listingId) {
  return integrationSdk.transactions.query({
    customerId,
    listingId,
    lastTransitions: "transition/accept,transition/complete,transition/operator-accept,transition/review-1-by-provider,transition/review-2-by-provider,transition/review-1-by-customer,transition/review-2-by-customer,transition/expire-customer-review-period,transition/expire-provider-review-period,transition/expire-review-period,transition/confirm-payment"
  });
}
module.exports = async(req, res) => {
  const { isOwnListing, listingId, orderData } = req.body;

  const sdk = getSdk(req, res);
    const integrationSdk = getIntegrationSdk();
  

  const currentUser = await sdk.currentUser.show();
  const customerId = currentUser.data.data.id.uuid;
  const listing_Id = listingId?.uuid || listingId;


  const listingPromise = () =>
    isOwnListing ? sdk.ownListings.show({ id: listingId }) : sdk.listings.show({ id: listingId });

  Promise.all([listingPromise(), fetchCommission(sdk),getTransactions(integrationSdk, customerId, listing_Id),
  ])
    .then(([showListingResponse, fetchAssetsResponse,transactions]) => {
      const listing = showListingResponse.data.data;
      const commissionAsset = fetchAssetsResponse.data.data[0];

      const { providerCommission, customerCommission } =
        commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};
        
        customerCommission.percentage= transactions?.data?.data?.length > 0 ? 0 : customerCommission.percentage
        customerCommission.minimum_amount= transactions?.data?.data?.length > 0 ? 0 : customerCommission.minimum_amount

      const lineItems = transactionLineItems(
        listing,
        orderData,
        providerCommission,
        customerCommission
      );
      console.log('providerCommission',lineItems,customerCommission)
      console.log('customerCommission',providerCommission)
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
