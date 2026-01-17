import React from 'react';
import classNames from 'classnames';
import { FormattedMessage } from '../../../util/reactIntl';

import { InlineTextButton } from '../../../components';

import css from './TransactionPanel.module.css';

// Functional component as a helper to build ActionButtons
// Currently this is used to show "dispute order" and "reschedule booking" buttons,
// but like ActionButtonsMaybe, this could be customized to handle different actions too.
// Essentially, this is just a placeholder for diminished actions.
const DiminishedActionButtonMaybe = props => {
  const {
    className,
    rootClassName,
    showDispute,
    onOpenDisputeModal,
    showReschedule,
    onOpenRescheduleModal,
    rescheduleDisabled,
    rescheduleTooltip,
  } = props;

  const disputeButton = onOpenDisputeModal ? (
    <InlineTextButton className={css.diminishedActionButton} onClick={onOpenDisputeModal}>
      <FormattedMessage id="TransactionPanel.disputeOrder" />
    </InlineTextButton>
  ) : null;

  const rescheduleButton = onOpenRescheduleModal ? (
    <InlineTextButton
      className={css.diminishedActionButton}
      onClick={onOpenRescheduleModal}
      disabled={rescheduleDisabled}
      title={rescheduleTooltip}
    >
      <FormattedMessage id="TransactionPanel.rescheduleBooking" />
    </InlineTextButton>
  ) : null;

  const classes = classNames(rootClassName || css.diminishedActionButtonRoot, className);

  const showButtons = showDispute || showReschedule;

  return showButtons ? (
    <div className={classes}>
      {showReschedule ? rescheduleButton : null}
      {showDispute ? disputeButton : null}
    </div>
  ) : null;
};

export default DiminishedActionButtonMaybe;
