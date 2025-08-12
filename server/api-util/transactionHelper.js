const { getIntegrationSdk } = require('./sdk');

exports.updateTransactionMetaData = async function updateTransactionMetaData(transactionId, metaData) {
  const integrationSdk = getIntegrationSdk();
  const response = integrationSdk.transactions.updateMetadata({
    id: transactionId,
    metadata: metaData,
  });
  return response;
};
