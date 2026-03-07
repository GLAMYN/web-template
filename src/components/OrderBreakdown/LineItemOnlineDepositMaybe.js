import React from 'react';
import { bool } from 'prop-types';
import { FormattedMessage, intlShape } from '../../util/reactIntl';
import { formatMoney } from '../../util/currency';
import { LINE_ITEM_PIP_BALANCE_ADJUSTMENT, propTypes } from '../../util/types';

import css from './OrderBreakdown.module.css';

const LineItemOnlineDepositMaybe = props => {
    const { transaction, isProvider, intl } = props;

    // This component only shows for providers in Pay-In-Person transactions
    const isPip = !!transaction.attributes.lineItems?.find(
        item => item.code === LINE_ITEM_PIP_BALANCE_ADJUSTMENT && !item.reversal
    );

    if (!isProvider || !isPip) {
        return null;
    }

    const payinTotal = transaction.attributes.payinTotal;
    const formattedPayin = formatMoney(intl, payinTotal);

    return (
        <div className={css.lineItem}>
            <span className={css.itemLabel}>
                <FormattedMessage id="OrderBreakdown.onlineDeposit" />
            </span>
            <span className={css.itemValue}>{formattedPayin}</span>
        </div>
    );
};

LineItemOnlineDepositMaybe.propTypes = {
    transaction: propTypes.transaction.isRequired,
    isProvider: bool.isRequired,
    intl: intlShape.isRequired,
};

export default LineItemOnlineDepositMaybe;
