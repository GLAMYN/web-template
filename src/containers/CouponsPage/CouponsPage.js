import React, { Component } from 'react';
import { bool, func, object, shape, string, array } from 'prop-types';
import { compose } from 'redux';
import { connect } from 'react-redux';
import { withRouter } from 'react-router-dom';
import { injectIntl, intlShape, FormattedMessage } from '../../util/reactIntl';
import { useConfiguration } from '../../context/configurationContext';
import { propTypes } from '../../util/types';
import { ensureCurrentUser } from '../../util/data';
import { showCreateListingLinkForUser, showPaymentDetailsForUser, showCouponsForUser } from '../../util/userHelpers';
import { isScrollingDisabled } from '../../ducks/ui.duck';

import {
  Page,
  LayoutSideNavigation,
  Button,
  IconAdd,
  IconEdit,
  IconDelete,
  Modal,
  UserNav,
  H3,
} from '../../components';

import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import {
  fetchCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  clearCouponErrors,
} from './CouponsPage.duck';

import CouponForm from './CouponForm/CouponForm';
import css from './CouponsPage.module.css';

export const CouponsPageComponent = props => {
  const config = useConfiguration();
  const [state, setState] = React.useState({
    isCreateModalOpen: false,
    isEditModalOpen: false,
    editingCoupon: null,
    isDeleteModalOpen: false,
    deletingCoupon: null,
  });
  
  // Check if the current user is a provider and should see the coupons page
  const showCoupons = showCouponsForUser(config, props.currentUser);

  React.useEffect(() => {
    // Only fetch coupons if the user is a provider
    if (showCoupons) {
      props.onFetchCoupons();
    } else {
      // Redirect non-provider users to ContactDetailsPage
      props.history.push('/account/contact-details');
    }
  }, [showCoupons]);

  const openCreateModal = () => {
    setState(prevState => ({ ...prevState, isCreateModalOpen: true }));
    props.onClearErrors();
  };

  const closeCreateModal = () => {
    setState(prevState => ({ ...prevState, isCreateModalOpen: false }));
  };

  const openEditModal = coupon => {
    setState(prevState => ({ 
      ...prevState,
      isEditModalOpen: true, 
      editingCoupon: coupon 
    }));
    props.onClearErrors();
  };

  const closeEditModal = () => {
    setState(prevState => ({ 
      ...prevState,
      isEditModalOpen: false, 
      editingCoupon: null 
    }));
  };

  const openDeleteModal = coupon => {
    setState(prevState => ({ 
      ...prevState,
      isDeleteModalOpen: true, 
      deletingCoupon: coupon 
    }));
  };

  const closeDeleteModal = () => {
    setState(prevState => ({ 
      ...prevState,
      isDeleteModalOpen: false, 
      deletingCoupon: null 
    }));
  };

  const handleCreateCoupon = values => {
    return props.onCreateCoupon(values).then(() => {
      closeCreateModal();
    }).catch(e => {
      // Error handled by reducer
    });
  };

  const handleUpdateCoupon = values => {
    const { editingCoupon } = state;
    return props.onUpdateCoupon(editingCoupon.id, values).then(() => {
      closeEditModal();
    }).catch(e => {
      // Error handled by reducer
    });
  };

  const handleDeleteCoupon = () => {
    const { deletingCoupon } = state;
    return props.onDeleteCoupon(deletingCoupon.id).then(() => {
      closeDeleteModal();
    }).catch(e => {
      // Error handled by reducer
    });
  };

  const formatCurrency = (amount, currency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount / 100);
  };

  const formatDate = dateString => {
    if (!dateString) return 'No expiration';
    return new Date(dateString).toLocaleDateString();
  };

  // Extract props and state
  const {
    coupons,
    fetchCouponsInProgress,
    createCouponInProgress,
    updateCouponInProgress,
    deleteCouponInProgress,
    createCouponError,
    updateCouponError,
    deleteCouponError,
    currentUser,
    scrollingDisabled,
    intl,
  } = props;

  const {
    isCreateModalOpen,
    isEditModalOpen,
    editingCoupon,
    isDeleteModalOpen,
    deletingCoupon,
  } = state;

  const ensuredCurrentUser = ensureCurrentUser(currentUser);
  const currentUserHasListings = showCreateListingLinkForUser(config, currentUser);
  const { showPayoutDetails, showPaymentMethods } = showPaymentDetailsForUser(config, currentUser);
  const title = intl.formatMessage({ id: 'CouponsPage.title' });

  const accountSettingsNavProps = {
    currentPage: 'CouponsPage',
    showPaymentMethods,
    showPayoutDetails,
    currentUser: ensuredCurrentUser,
  };

  return (
      <Page title={title} scrollingDisabled={scrollingDisabled}>
        <LayoutSideNavigation
          topbar={
            <>
              <TopbarContainer />
              <UserNav 
                currentPage="CouponsPage" 
                showManageListingsLink={currentUserHasListings}
                currentUser={ensuredCurrentUser}
              />
            </>
          }
          sideNav={null}
          useAccountSettingsNav
          accountSettingsNavProps={accountSettingsNavProps}
          footer={<FooterContainer />}
        >
            <div className={css.content}>
              <div className={css.headingContainer}>
                <h1 className={css.heading}>
                  <FormattedMessage id="CouponsPage.heading" />
                </h1>
                <Button 
                  className={css.createButton}
                  onClick={openCreateModal}
                >
                  <IconAdd rootClassName={css.createIcon} />
                  <FormattedMessage id="CouponsPage.createCoupon" />
                </Button>
              </div>

              {fetchCouponsInProgress ? (
                <div className={css.loading}>
                  <FormattedMessage id="CouponsPage.loadingCoupons" />
                </div>
              ) : (
                <div className={css.couponsContainer}>
                  {coupons.length === 0 ? (
                    <div className={css.noCoupons}>
                      <FormattedMessage id="CouponsPage.noCoupons" />
                    </div>
                  ) : (
                    <div className={css.couponsList}>
                      {coupons.map(coupon => (
                        <div key={coupon.id} className={css.couponCard}>
                          <div className={css.couponHeader}>
                            <h3 className={css.couponCode}>{coupon.code}</h3>
                            <div className={css.couponActions}>
                              <Button
                                className={css.actionButton}
                                onClick={() => openEditModal(coupon)}
                              >
                                <IconEdit />
                              </Button>
                              <Button
                                className={css.actionButton}
                                onClick={() => openDeleteModal(coupon)}
                              >
                                <IconDelete />
                              </Button>
                            </div>
                          </div>
                          <div className={css.couponDetails}>
                            <div className={css.couponInfo}>
                              <span className={css.label}>
                                <FormattedMessage id="CouponsPage.discountLabel" />:
                              </span>
                              <span className={css.value}>
                                {coupon.type === 'percentage' 
                                  ? `${coupon.amount}%` 
                                  : formatCurrency(coupon.amount, coupon.currency)
                                }
                              </span>
                            </div>
                            <div className={css.couponInfo}>
                              <span className={css.label}>
                                <FormattedMessage id="CouponsPage.typeLabel" />:
                              </span>
                              <span className={css.value}>
                                <FormattedMessage id={`CouponsPage.type.${coupon.type}`} />
                              </span>
                            </div>
                            <div className={css.couponInfo}>
                              <span className={css.label}>
                                <FormattedMessage id="CouponsPage.expiresLabel" />:
                              </span>
                              <span className={css.value}>
                                {formatDate(coupon.expiresAt)}
                              </span>
                            </div>
                            <div className={css.couponInfo}>
                              <span className={css.label}>
                                <FormattedMessage id="CouponsPage.usageLabel" />:
                              </span>
                              <span className={css.value}>
                                {coupon.usedCount} / {coupon.maxRedemptions || '∞'}
                              </span>
                            </div>
                            <div className={css.couponInfo}>
                              <span className={css.label}>
                                <FormattedMessage id="CouponsPage.statusLabel" />:
                              </span>
                              <span className={`${css.value} ${coupon.isActive ? css.active : css.inactive}`}>
                                <FormattedMessage 
                                  id={`CouponsPage.status.${coupon.isActive ? 'active' : 'inactive'}`} 
                                />
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Create Coupon Modal */}
              <Modal
                id="CreateCouponModal"
                isOpen={isCreateModalOpen}
                onClose={closeCreateModal}
                usePortal
                onManageDisableScrolling={(id, isOpen) => {
                  if (isOpen) {
                    document.body.style.overflow = 'hidden';
                  } else {
                    document.body.style.overflow = '';
                  }
                }}
              >
                <div className={css.modalContent}>
                  <h2 className={css.modalTitle}>
                    <FormattedMessage id="CouponsPage.createCouponTitle" />
                  </h2>
                  <CouponForm
                    onSubmit={handleCreateCoupon}
                    inProgress={createCouponInProgress}
                    formError={createCouponError}
                    onCancel={closeCreateModal}
                  />
                </div>
              </Modal>

              {/* Edit Coupon Modal */}
              <Modal
                id="EditCouponModal"
                isOpen={isEditModalOpen}
                onClose={closeEditModal}
                usePortal
                onManageDisableScrolling={(id, isOpen) => {
                  if (isOpen) {
                    document.body.style.overflow = 'hidden';
                  } else {
                    document.body.style.overflow = '';
                  }
                }}
              >
                <div className={css.modalContent}>
                  <h2 className={css.modalTitle}>
                    <FormattedMessage id="CouponsPage.editCouponTitle" />
                  </h2>
                  <CouponForm
                    initialValues={editingCoupon}
                    onSubmit={handleUpdateCoupon}
                    inProgress={updateCouponInProgress}
                    formError={updateCouponError}
                    onCancel={closeEditModal}
                    isEdit={true}
                  />
                </div>
              </Modal>

              {/* Delete Confirmation Modal */}
              <Modal
                id="DeleteCouponModal"
                isOpen={isDeleteModalOpen}
                onClose={closeDeleteModal}
                usePortal
                onManageDisableScrolling={(id, isOpen) => {
                  if (isOpen) {
                    document.body.style.overflow = 'hidden';
                  } else {
                    document.body.style.overflow = '';
                  }
                }}
              >
                <div className={css.modalContent}>
                  <h2 className={css.modalTitle}>
                    <FormattedMessage id="CouponsPage.deleteCouponTitle" />
                  </h2>
                  <p className={css.deleteConfirmText}>
                    <FormattedMessage 
                      id="CouponsPage.deleteCouponConfirm"
                      values={{ code: deletingCoupon?.code }}
                    />
                  </p>
                  <div className={css.modalActions}>
                    <Button
                      className={css.cancelButton}
                      onClick={closeDeleteModal}
                    >
                      <FormattedMessage id="CouponsPage.cancel" />
                    </Button>
                    <Button
                      className={css.deleteButton}
                      onClick={handleDeleteCoupon}
                      inProgress={deleteCouponInProgress}
                    >
                      <FormattedMessage id="CouponsPage.delete" />
                    </Button>
                  </div>
                </div>
              </Modal>
            </div>
        </LayoutSideNavigation>
      </Page>
    );
};

CouponsPageComponent.defaultProps = {
  coupons: [],
  currentUser: null,
  createCouponError: null,
  updateCouponError: null,
  deleteCouponError: null,
};

// PropTypes are imported at the top

CouponsPageComponent.propTypes = {
  coupons: array,
  fetchCouponsInProgress: bool.isRequired,
  createCouponInProgress: bool.isRequired,
  updateCouponInProgress: bool.isRequired,
  deleteCouponInProgress: bool.isRequired,
  createCouponError: propTypes.error,
  updateCouponError: propTypes.error,
  deleteCouponError: propTypes.error,
  currentUser: propTypes.currentUser,
  scrollingDisabled: bool.isRequired,
  intl: intlShape.isRequired,
  onFetchCoupons: func.isRequired,
  onCreateCoupon: func.isRequired,
  onUpdateCoupon: func.isRequired,
  onDeleteCoupon: func.isRequired,
  onClearErrors: func.isRequired,
};

const mapStateToProps = state => {
  const {
    coupons,
    fetchCouponsInProgress,
    createCouponInProgress,
    updateCouponInProgress,
    deleteCouponInProgress,
    createCouponError,
    updateCouponError,
    deleteCouponError,
  } = state.CouponsPage;
  const { currentUser } = state.user;
  return {
    coupons,
    fetchCouponsInProgress,
    createCouponInProgress,
    updateCouponInProgress,
    deleteCouponInProgress,
    createCouponError,
    updateCouponError,
    deleteCouponError,
    currentUser,
    scrollingDisabled: isScrollingDisabled(state),
  };
};

const mapDispatchToProps = dispatch => ({
  onFetchCoupons: () => dispatch(fetchCoupons()),
  onCreateCoupon: couponData => dispatch(createCoupon(couponData)),
  onUpdateCoupon: (couponId, couponData) => dispatch(updateCoupon(couponId, couponData)),
  onDeleteCoupon: couponId => dispatch(deleteCoupon(couponId)),
  onClearErrors: () => dispatch(clearCouponErrors()),
});

const CouponsPage = compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
  injectIntl
)(CouponsPageComponent);

export default CouponsPage;
