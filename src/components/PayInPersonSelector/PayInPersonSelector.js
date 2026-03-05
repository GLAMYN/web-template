import React from 'react';
import PropTypes from 'prop-types';
import { injectIntl, intlShape } from '../../util/reactIntl';
import { formatMoney } from '../../util/currency';
import { propTypes } from '../../util/types';

import css from './PayInPersonSelector.module.css';

/**
 * Renders a two-option selector for Pay Online (full) vs Pay in Person (deposit).
 * Only rendered when the listing has pay_in_person_allowed = true.
 */
const PayInPersonSelectorComponent = ({
    paymentMethodSelected,
    onSelect,
    depositPct,
    depositAmount,
    balanceAmount,
    intl,
}) => {
    const depositFormatted = depositAmount ? formatMoney(intl, depositAmount) : null;
    const balanceFormatted = balanceAmount ? formatMoney(intl, balanceAmount) : null;

    return (
        <div className={css.root}>
            <p className={css.title}>
                {intl.formatMessage({ id: 'PayInPersonSelector.title' })}
            </p>

            <label
                className={`${css.option} ${paymentMethodSelected === 'online_full' ? css.selected : ''}`}
            >
                <input
                    type="radio"
                    name="pipPaymentMethod"
                    value="online_full"
                    checked={paymentMethodSelected === 'online_full'}
                    onChange={() => onSelect('online_full')}
                    className={css.radio}
                />
                <span className={css.optionContent}>
                    <span className={css.optionTitle}>
                        {intl.formatMessage({ id: 'PayInPersonSelector.onlineFull.title' })}
                    </span>
                    <span className={css.optionDesc}>
                        {intl.formatMessage({ id: 'PayInPersonSelector.onlineFull.description' })}
                    </span>
                </span>
            </label>

            <label
                className={`${css.option} ${paymentMethodSelected === 'in_person_deposit' ? css.selected : ''}`}
            >
                <input
                    type="radio"
                    name="pipPaymentMethod"
                    value="in_person_deposit"
                    checked={paymentMethodSelected === 'in_person_deposit'}
                    onChange={() => onSelect('in_person_deposit')}
                    className={css.radio}
                />
                <span className={css.optionContent}>
                    <span className={css.optionTitle}>
                        {intl.formatMessage(
                            { id: 'PayInPersonSelector.inPersonDeposit.title' },
                            { depositPct }
                        )}
                    </span>
                    <span className={css.optionDesc}>
                        {depositFormatted
                            ? intl.formatMessage(
                                { id: 'PayInPersonSelector.inPersonDeposit.description' },
                                {
                                    depositAmount: depositFormatted,
                                    balanceAmount: balanceFormatted || '',
                                }
                            )
                            : intl.formatMessage(
                                { id: 'PayInPersonSelector.inPersonDeposit.descriptionSimple' },
                                { depositPct }
                            )}
                    </span>
                </span>
            </label>
        </div>
    );
};

PayInPersonSelectorComponent.propTypes = {
    paymentMethodSelected: PropTypes.string.isRequired,
    onSelect: PropTypes.func.isRequired,
    depositPct: PropTypes.number.isRequired,
    depositAmount: propTypes.money,
    balanceAmount: propTypes.money,
    intl: intlShape.isRequired,
};

const PayInPersonSelector = injectIntl(PayInPersonSelectorComponent);

export default PayInPersonSelector;
