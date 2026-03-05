const path = require('path');
const dotenv = require('dotenv');

// Load environmental variables
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const flexIntegrationSdk = require('sharetribe-flex-integration-sdk');
const moment = require('moment');

const INTEGRATION_SDK_CLIENT_ID = process.env.INTEGRATION_SDK_CLIENT_ID;
const INTEGRATION_SDK_CLIENT_SECRET = process.env.INTEGRATION_SDK_CLIENT_SECRET;

if (!INTEGRATION_SDK_CLIENT_ID || !INTEGRATION_SDK_CLIENT_SECRET) {
    console.error('ERROR: INTEGRATION_SDK_CLIENT_ID or INTEGRATION_SDK_CLIENT_SECRET is missing from .env');
    process.exit(1);
}

const integrationSdk = flexIntegrationSdk.createInstance({
    clientId: INTEGRATION_SDK_CLIENT_ID,
    clientSecret: INTEGRATION_SDK_CLIENT_SECRET,
});

async function scan() {
    console.log('--- Starting Transaction Scanner ---', new Date().toISOString());

    try {
        // 1. Find transactions needing scheduled charges (Far-Future bookings)
        // Criteria: last transition was 'transition/confirm-payment-set-card' (they are in 'card-saved' state)
        console.log('Scanning for scheduled charges (Far-Future bookings)...');
        const scheduledRes = await integrationSdk.transactions.query({
            lastTransitions: ['transition/confirm-payment-set-card'],
            'fields.transaction': ['lineItems', 'protectedData', 'lastTransition'],
        });

        for (const tx of scheduledRes.data.data) {
            const { scheduledChargeAt } = tx.attributes.protectedData || {};

            // If the scheduled date has passed, trigger the charge
            if (scheduledChargeAt && moment(scheduledChargeAt).isBefore(moment())) {
                console.log(`Triggering scheduled charge (system-charge-full) for TX: ${tx.id.uuid}`);
                try {
                    // Extract lineItems from the transaction attributes.
                    // lineItems are required for the 'privileged-set-line-items' action.
                    const lineItems = tx.attributes.lineItems;

                    if (!lineItems || lineItems.length === 0) {
                        throw new Error('No lineItems found on transaction. Cannot proceed with privileged-set-line-items.');
                    }

                    await integrationSdk.transactions.transition({
                        id: tx.id,
                        transition: 'transition/system-charge-full',
                        params: {
                            lineItems: lineItems
                        },
                    });
                    console.log(`Successfully charged TX: ${tx.id.uuid}`);
                } catch (err) {
                    console.error(`Failed to charge TX ${tx.id.uuid}:`, JSON.stringify(err.data || err.message || err));
                }
            }
        }

        // 2. Find PIP (Pay In Person) transactions needing auto-completion
        // Criteria: paymentMethodSelected == 'in_person_deposit', state is 'accepted', 24h after bookingEnd
        // Last transitions for 'accepted' state could be 'accept' or 'system-charge-full' (for far-future PIP)
        console.log('Scanning for PIP auto-completions (24h after booking end)...');
        const pipRes = await integrationSdk.transactions.query({
            lastTransitions: ['transition/accept', 'transition/system-charge-full'],
            'fields.transaction': ['protectedData', 'lastTransition'],
            include: ['booking']
        });

        for (const tx of pipRes.data.data) {
            const { paymentMethodSelected } = tx.attributes.protectedData || {};
            const bookingId = tx.relationships.booking?.data?.id;

            if (paymentMethodSelected === 'in_person_deposit' && bookingId) {
                // Fetch booking to get end time
                const bookingRes = await integrationSdk.bookings.show({ id: bookingId });
                const bookingEnd = bookingRes.data.data.attributes.end;

                // Auto-complete 24 hours after booking end
                if (moment(bookingEnd).add(24, 'hours').isBefore(moment())) {
                    console.log(`Auto-completing PIP transaction: ${tx.id.uuid}`);
                    try {
                        await integrationSdk.transactions.transition({
                            id: tx.id,
                            transition: 'transition/auto-complete-pip',
                            params: {},
                        });
                        console.log(`Successfully auto-completed TX: ${tx.id.uuid}`);
                    } catch (err) {
                        console.error(`Failed to auto-complete TX ${tx.id.uuid}:`, err.data || err.message || err);
                    }
                }
            }
        }

        console.log('--- Scanner Finished ---', new Date().toISOString());
    } catch (error) {
        console.error('Scanner encountered a fatal error:', error.data || error.message || error);
    }
}

// Run the scan
scan();
