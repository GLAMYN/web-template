const { transactionLineItems } = require('../api-util/lineItems');
const {
  getSdk,
  getTrustedSdk,
  handleError,
  serialize,
  fetchCommission,
  getIntegrationSdk,
} = require('../api-util/sdk');
const { UUID } = require('sharetribe-flex-integration-sdk').types;

module.exports = (req, res) => {
  const { isSpeculative, orderData, bodyParams, queryParams,pageData } = req.body;
const selectedLocationType=pageData?.orderData?.locationChoice
const selectedLocation=selectedLocationType === "mylocation" ? pageData?.orderData?.location?.selectedPlace?.address : `https://www.google.com/maps?q=${pageData?.listing?.attributes?.geolocation?.lat},${pageData?.listing?.attributes?.geolocation?.lng}`

  const integrationSdk = getIntegrationSdk();

  const sdk = getSdk(req, res);
  let lineItems = null;

  const listingPromise = () => sdk.listings.show({ id: bodyParams?.params?.listingId });

  Promise.all([listingPromise(), fetchCommission(sdk)])
    .then(([showListingResponse, fetchAssetsResponse]) => {
      const listing = showListingResponse.data.data;
      const commissionAsset = fetchAssetsResponse.data.data[0];

      const { providerCommission, customerCommission } =
        commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};
// console.log('providerCommission',providerCommission)
// console.log('customerCommission',providerCommission)

      lineItems = transactionLineItems(
        listing,
        { ...orderData, ...bodyParams.params },
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
    .then( async apiResponse => {
      const { status, statusText, data } = apiResponse;
if(pageData?.listing?.attributes?.geolocation?.lat){
const {bookingQuestion1,bookingQuestion2,bookingQuestion3}=pageData?.orderData
console.log('selectedLocationType',pageData?.orderData?.location)
await integrationSdk.transactions.updateMetadata({
  id: data.data.id,
  metadata: {
    selectedLocationType: selectedLocationType,
    selectedLocation: selectedLocation,
    location: pageData?.orderData?.location,
     ...(bookingQuestion1 && { bookingQuestion1 }),
  ...(bookingQuestion2 && { bookingQuestion2 }),
  ...(bookingQuestion3 && { bookingQuestion3 })
  }
}, {
  expand: true
}).then(res => {
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
