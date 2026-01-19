const { serialize, getSdk, getIntegrationSdk } = require('../api-util/sdk');
const { updateTransactionMetaData } = require('../api-util/transactionHelper');
const moment = require('moment');

module.exports = async (req, res) => {
  const { transactionId, params, action, cancelBy, cancellationFeedback } = req.body;

  const integration = getIntegrationSdk();
  const sdk = getSdk(req, res);

  const transactionRes = await integration.transactions.show({
    id: transactionId?.uuid,
    include: ['booking', 'provider', 'customer', 'listing'],
  });

  const transaction = transactionRes?.data?.data;
  const cancellationObject = {
    cancellationFeedback: cancellationFeedback,
    cancelBy: cancelBy === 'provider' ? 'provider' : 'customer',
    cancelledAt: moment().toISOString(),
    refundIssued: false
  }

  const included = transactionRes.data.included;
  const booking = included?.find(item => item.type === 'booking') || {};
  const listing = included?.find(item => item.type === 'listing') || {};
  const provider = included.find(
    item => item.type === 'user' && item.id.uuid === transaction.relationships.provider.data.id.uuid
  );
  const customer = included.find(
    item => item.type === 'user' && item.id.uuid === transaction.relationships.customer.data.id.uuid
  );

  const bookingStartDate = booking?.attributes?.start;
  const timeFrame = (listing?.attributes?.publicData?.cancellation_listingfield || 0) * 24;
  const hoursUntilBooking = moment(bookingStartDate).diff(moment(), 'hours');
  const isBetweenTimeFrame = hoursUntilBooking < timeFrame;

  let currentUser;

  const {
    data: { data },
  } = (await sdk.currentUser.show({ include: ['publicData'] })) || {};
  currentUser = data;

  //Authorize if current user is a valid user
  const isAuthorize =
    cancelBy === 'provider'
      ? currentUser?.id?.uuid === provider?.id?.uuid
      : currentUser?.id?.uuid === customer.id.uuid;
  if (!isAuthorize) {
    res
      .status(200)
      .set('Content-Type', 'application/transit+json')
      .send(serialize({ success: false, message: 'Unauthorize access' }))
      .end();
  }

  //function to cancel transaction
  const cancelTransaction = async (processName = 'transition/cancel') => {
    const response = await integration.transactions.transition(
      {
        id: transactionId,
        transition: processName,
        params: params || {},
      },
      {
        expand: true,
      }
    );
    cancellationObject.refundIssued = processName === 'transition/cancel' ;
    return response;
  };

  //cancel if the user has cancelled the transaction directly
  if (isBetweenTimeFrame && cancelBy === 'customer') {
    await cancelTransaction('transition/cancel-no-refund');
  } else {
    await cancelTransaction();
  }

  //set notification true
  const toNotify = cancelBy === 'provider' ? `customer_notify` : 'provider_notify';
  await updateTransactionMetaData(transactionId, { [toNotify]: true, cancellationObject: cancellationObject });
  res
    .status(200)
    .set('Content-Type', 'application/transit+json')
    .send(serialize({ success: true }))
    .end();
};
