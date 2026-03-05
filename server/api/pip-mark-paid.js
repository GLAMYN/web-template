const { getSdk, getTrustedSdk, handleError, serialize } = require('../api-util/sdk');

module.exports = (req, res) => {
    const { transactionId } = req.body;
    const sdk = getSdk(req, res);

    // 1. Fetch transaction to verify role and state
    sdk.transactions
        .show({ id: transactionId, include: ['provider'] })
        .then(async response => {
            const tx = response.data.data;
            const providerId = tx.relationships.provider.data.id.uuid;

            // Get current user to verify they are the provider
            const currentUserResponse = await sdk.currentUser.show();
            const currentUserId = currentUserResponse.data.data.id.uuid;

            if (currentUserId !== providerId) {
                return res.status(403).json({ error: 'Only the provider can mark a PIP payment as received.' });
            }

            const paymentMethodSelected = tx.attributes.protectedData?.paymentMethodSelected;
            if (paymentMethodSelected !== 'in_person_deposit') {
                return res.status(400).json({ error: 'This transaction is not a Pay-In-Person booking.' });
            }

            // Valid states for marking as paid are 'accepted' or 'deposit-paid' (custom state)
            const validTransitions = ['transition/paid-in-person-confirmed'];

            // Use Trusted SDK to perform the privileged transition
            const trustedSdk = await getTrustedSdk(req);
            return trustedSdk.transactions.transition({
                id: transactionId,
                transition: 'transition/paid-in-person-confirmed',
                params: {},
            });
        })
        .then(apiResponse => {
            const { status, statusText, data } = apiResponse;
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
