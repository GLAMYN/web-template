import React from 'react';
import { FormattedMessage } from '../../util/reactIntl';
import classNames from 'classnames';
import { ACCOUNT_SETTINGS_PAGES } from '../../routing/routeConfiguration';
import { LinkTabNavHorizontal } from '../../components';
import { useConfiguration } from '../../context/configurationContext';
import { showCouponsForUser } from '../../util/userHelpers';

import css from './UserNav.module.css';
import { useSelector } from 'react-redux';

/**
 * A component that renders a navigation bar for a user-specific pages.
 *
 * @component
 * @param {Object} props
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {string} props.currentPage - The current page (e.g. 'ManageListingsPage')
 * @param {Object} props.currentUser - Current user object
 * @returns {JSX.Element} User navigation component
 */
const UserNav = props => {
  const { className, rootClassName, currentPage, showManageListingsLink,currentUser } = props;
  const config = useConfiguration();
  const classes = classNames(rootClassName || css.root, className);
  // const currentUser = useSelector(state => state.currentUser);
  // Check if the current user is a provider and should see the coupons tab
  console.log('UserNav - currentUser:', currentUser);
  const showCoupons = showCouponsForUser(config, currentUser);
 
  const manageListingsTabMaybe = showManageListingsLink
    ? [
        {
          text: <FormattedMessage id="UserNav.yourListings" />,
          selected: currentPage === 'ManageListingsPage',
          linkProps: {
            name: 'ManageListingsPage',
          },
        },
      ]
    : [];

  // Only show coupons tab for providers
  const couponsTabMaybe = showCoupons
    ? [
        {
          text: <FormattedMessage id="UserNav.coupons" />,
          selected: currentPage === 'CouponsPage',
          disabled: false,
          linkProps: {
            name: 'CouponsPage',
          },
        },
      ]
    : [];

  const tabs = [
    ...manageListingsTabMaybe,
    {
      text: <FormattedMessage id="UserNav.profileSettings" />,
      selected: currentPage === 'ProfileSettingsPage',
      disabled: false,
      linkProps: {
        name: 'ProfileSettingsPage',
      },
    },
    ...couponsTabMaybe,
    {
      text: <FormattedMessage id="UserNav.accountSettings" />,
      selected: ACCOUNT_SETTINGS_PAGES.includes(currentPage) && currentPage !== 'CouponsPage',
      disabled: false,
      linkProps: {
        name: 'ContactDetailsPage',
      },
    },
  ];

  return (
    <LinkTabNavHorizontal className={classes} tabRootClassName={css.tab} tabs={tabs} skin="dark" />
  );
};

export default UserNav;
