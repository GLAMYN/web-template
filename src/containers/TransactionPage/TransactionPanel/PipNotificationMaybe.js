import PropTypes from 'prop-types';
import { FormattedMessage, intlShape } from '../../../util/reactIntl';
import { formatMoney } from '../../../util/currency';
import { propTypes } from '../../../util/types';
import { types } from '../../../util/sdkLoader';
import moment from 'moment';

import css from './TransactionPanel.module.css';

const { Money } = types;

const PipNotificationMaybe = props => {
    const { transaction, transactionRole, intl, otherUserDisplayNameString } = props;
    const protectedData = transaction?.attributes?.protectedData || {};
    const {
        paymentMethodSelected,
        depositAmount,
        balanceAmount,
        scheduledChargeAt
    } = protectedData;

    const isPip = paymentMethodSelected === 'in_person_deposit';
    if (!isPip) {
        return null;
    }

    const isCustomer = transactionRole === 'customer';

    const formattedDeposit = depositAmount
        ? formatMoney(intl, new Money(depositAmount.amount, depositAmount.currency))
        : null;
    const formattedBalance = balanceAmount
        ? formatMoney(intl, new Money(balanceAmount.amount, balanceAmount.currency))
        : null;
    const formattedChargeDate = scheduledChargeAt ? moment(scheduledChargeAt).format('LL') : null;

    const chargeDatePassed = scheduledChargeAt && moment(scheduledChargeAt).isBefore(moment());
    const isScheduled = scheduledChargeAt && !chargeDatePassed;

    return (
        <div className={css.pipNotification}>
            <h4 className={css.pipNotificationTitle}>
                <FormattedMessage id="TransactionPanel.pipNotification.title" />
            </h4>
            <p className={css.pipNotificationMessage}>
                {isCustomer ? (
                    <>
                        {isScheduled ? (
                            <FormattedMessage
                                id="TransactionPanel.pipNotification.customer.depositScheduled"
                                values={{ depositAmount: formattedDeposit, date: formattedChargeDate }}
                            />
                        ) : (
                            <FormattedMessage
                                id="TransactionPanel.pipNotification.customer.depositPaid"
                                values={{ depositAmount: formattedDeposit }}
                            />
                        )}
                        <br />
                        <FormattedMessage
                            id="TransactionPanel.pipNotification.customer.balanceDue"
                            values={{ balanceAmount: formattedBalance, providerName: otherUserDisplayNameString }}
                        />
                        {isScheduled && (
                            <>
                                <br />
                                <strong>
                                    <FormattedMessage
                                        id="TransactionPanel.pipNotification.customer.scheduledCharge"
                                        values={{ date: formattedChargeDate }}
                                    />
                                </strong>
                            </>
                        )}
                    </>
                ) : (
                    <>
                        {isScheduled ? (
                            <FormattedMessage
                                id="TransactionPanel.pipNotification.provider.depositScheduled"
                                values={{ depositAmount: formattedDeposit, date: formattedChargeDate }}
                            />
                        ) : (
                            <FormattedMessage
                                id="TransactionPanel.pipNotification.provider.depositCollected"
                                values={{ depositAmount: formattedDeposit }}
                            />
                        )}
                        <br />
                        <FormattedMessage
                            id="TransactionPanel.pipNotification.provider.balanceDue"
                            values={{ balanceAmount: formattedBalance }}
                        />
                    </>
                )}
            </p>
        </div>
    );
};

PipNotificationMaybe.propTypes = {
    transaction: propTypes.transaction.isRequired,
    transactionRole: PropTypes.oneOf(['customer', 'provider']).isRequired,
    intl: intlShape.isRequired,
    otherUserDisplayNameString: PropTypes.string.isRequired,
};

export default PipNotificationMaybe;
