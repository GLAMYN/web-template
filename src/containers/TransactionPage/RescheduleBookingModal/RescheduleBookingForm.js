import React from 'react';
import { Form as FinalForm } from 'react-final-form';
import classNames from 'classnames';

import { FormattedMessage } from '../../../util/reactIntl';
import { PrimaryButton } from '../../../components';

import css from './RescheduleBookingModal.module.css';

const RescheduleBookingFormComponent = props => {
  const { onSubmit, inProgress, error, children, childProps = {} } = props;

  return (
    <FinalForm
      onSubmit={onSubmit}
      render={({ handleSubmit, submitting, form, values }) => {
        const submitInProgress = inProgress || submitting;
        const submitDisabled = submitInProgress;

        // Pass form state to children if they need it
        const childrenWithProps = typeof children === 'function'
          ? children({ values, form, ...childProps })
          : React.Children.map(children, child =>
              React.isValidElement(child)
                ? React.cloneElement(child, { values, form, handleFetchLineItems: childProps.handleFetchLineItems, ...childProps })
                : child
            );

        return (
          <form onSubmit={handleSubmit}>
            {childrenWithProps}

            {error ? (
              <p className={css.error}>
                <FormattedMessage id="RescheduleBookingForm.genericError" />
              </p>
            ) : null}

            <PrimaryButton type="submit" inProgress={submitInProgress} disabled={submitDisabled}>
              <FormattedMessage id="RescheduleBookingForm.submitButtonText" />
            </PrimaryButton>
          </form>
        );
      }}
    />
  );
};

export default RescheduleBookingFormComponent;



