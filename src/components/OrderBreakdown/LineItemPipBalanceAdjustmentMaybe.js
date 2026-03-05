import React from 'react';
import { FormattedMessage, intlShape } from '../../util/reactIntl';
import { formatMoney } from '../../util/currency';
import { LINE_ITEM_PIP_BALANCE_ADJUSTMENT, propTypes } from '../../util/types';

import css from './OrderBreakdown.module.css';

const LineItemPipBalanceAdjustmentMaybe = props => {
    const { lineItems, intl } = props;

    const pipAdjustment = lineItems.find(
        item => item.code === LINE_ITEM_PIP_BALANCE_ADJUSTMENT && !item.reversal
    );

    return pipAdjustment ? (
        <div className={css.lineItem}>
            <span className={css.itemLabel}>
                <FormattedMessage id="OrderBreakdown.pipBalanceAdjustment" />
            </span>
            <span className={css.itemValue}>{formatMoney(intl, pipAdjustment.lineTotal)}</span>
        </div>
    ) : null;
};

LineItemPipBalanceAdjustmentMaybe.propTypes = {
    lineItems: propTypes.lineItems.isRequired,
    intl: intlShape.isRequired,
};

export default LineItemPipBalanceAdjustmentMaybe;
