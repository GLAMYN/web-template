import { storableError } from '../../util/errors';
import { addMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import * as apiClient from '../../util/api';

// ================ Action types ================ //

export const FETCH_COUPONS_REQUEST = 'app/CouponsPage/FETCH_COUPONS_REQUEST';
export const FETCH_COUPONS_SUCCESS = 'app/CouponsPage/FETCH_COUPONS_SUCCESS';
export const FETCH_COUPONS_ERROR = 'app/CouponsPage/FETCH_COUPONS_ERROR';

export const CREATE_COUPON_REQUEST = 'app/CouponsPage/CREATE_COUPON_REQUEST';
export const CREATE_COUPON_SUCCESS = 'app/CouponsPage/CREATE_COUPON_SUCCESS';
export const CREATE_COUPON_ERROR = 'app/CouponsPage/CREATE_COUPON_ERROR';

export const UPDATE_COUPON_REQUEST = 'app/CouponsPage/UPDATE_COUPON_REQUEST';
export const UPDATE_COUPON_SUCCESS = 'app/CouponsPage/UPDATE_COUPON_SUCCESS';
export const UPDATE_COUPON_ERROR = 'app/CouponsPage/UPDATE_COUPON_ERROR';

export const DELETE_COUPON_REQUEST = 'app/CouponsPage/DELETE_COUPON_REQUEST';
export const DELETE_COUPON_SUCCESS = 'app/CouponsPage/DELETE_COUPON_SUCCESS';
export const DELETE_COUPON_ERROR = 'app/CouponsPage/DELETE_COUPON_ERROR';

export const CLEAR_COUPON_ERRORS = 'app/CouponsPage/CLEAR_COUPON_ERRORS';

// ================ Reducer ================ //

const initialState = {
  coupons: [],
  fetchCouponsInProgress: false,
  fetchCouponsError: null,
  createCouponInProgress: false,
  createCouponError: null,
  updateCouponInProgress: false,
  updateCouponError: null,
  deleteCouponInProgress: false,
  deleteCouponError: null,
};

export default function couponsPageReducer(state = initialState, action = {}) {
  const { type, payload } = action;
  switch (type) {
    case FETCH_COUPONS_REQUEST:
      return {
        ...state,
        fetchCouponsInProgress: true,
        fetchCouponsError: null,
      };
    case FETCH_COUPONS_SUCCESS:
      return {
        ...state,
        coupons: payload.coupons,
        fetchCouponsInProgress: false,
      };
    case FETCH_COUPONS_ERROR:
      return {
        ...state,
        fetchCouponsInProgress: false,
        fetchCouponsError: payload,
      };

    case CREATE_COUPON_REQUEST:
      return {
        ...state,
        createCouponInProgress: true,
        createCouponError: null,
      };
    case CREATE_COUPON_SUCCESS:
      return {
        ...state,
        coupons: [...state.coupons, payload.coupon],
        createCouponInProgress: false,
      };
    case CREATE_COUPON_ERROR:
      return {
        ...state,
        createCouponInProgress: false,
        createCouponError: payload,
      };

    case UPDATE_COUPON_REQUEST:
      return {
        ...state,
        updateCouponInProgress: true,
        updateCouponError: null,
      };
    case UPDATE_COUPON_SUCCESS:
      return {
        ...state,
        coupons: state.coupons.map(coupon =>
          coupon.id === payload.coupon.id ? payload.coupon : coupon
        ),
        updateCouponInProgress: false,
      };
    case UPDATE_COUPON_ERROR:
      return {
        ...state,
        updateCouponInProgress: false,
        updateCouponError: payload,
      };

    case DELETE_COUPON_REQUEST:
      return {
        ...state,
        deleteCouponInProgress: true,
        deleteCouponError: null,
      };
    case DELETE_COUPON_SUCCESS:
      return {
        ...state,
        coupons: state.coupons.filter(coupon => coupon.id !== payload.couponId),
        deleteCouponInProgress: false,
      };
    case DELETE_COUPON_ERROR:
      return {
        ...state,
        deleteCouponInProgress: false,
        deleteCouponError: payload,
      };

    case CLEAR_COUPON_ERRORS:
      return {
        ...state,
        fetchCouponsError: null,
        createCouponError: null,
        updateCouponError: null,
        deleteCouponError: null,
      };

    default:
      return state;
  }
}

// ================ Action creators ================ //

export const fetchCouponsRequest = () => ({ type: FETCH_COUPONS_REQUEST });
export const fetchCouponsSuccess = coupons => ({
  type: FETCH_COUPONS_SUCCESS,
  payload: { coupons },
});
export const fetchCouponsError = e => ({
  type: FETCH_COUPONS_ERROR,
  payload: e,
  error: true,
});

export const createCouponRequest = () => ({ type: CREATE_COUPON_REQUEST });
export const createCouponSuccess = coupon => ({
  type: CREATE_COUPON_SUCCESS,
  payload: { coupon },
});
export const createCouponError = e => ({
  type: CREATE_COUPON_ERROR,
  payload: e,
  error: true,
});

export const updateCouponRequest = () => ({ type: UPDATE_COUPON_REQUEST });
export const updateCouponSuccess = coupon => ({
  type: UPDATE_COUPON_SUCCESS,
  payload: { coupon },
});
export const updateCouponError = e => ({
  type: UPDATE_COUPON_ERROR,
  payload: e,
  error: true,
});

export const deleteCouponRequest = () => ({ type: DELETE_COUPON_REQUEST });
export const deleteCouponSuccess = couponId => ({
  type: DELETE_COUPON_SUCCESS,
  payload: { couponId },
});
export const deleteCouponError = e => ({
  type: DELETE_COUPON_ERROR,
  payload: e,
  error: true,
});

export const clearCouponErrors = () => ({ type: CLEAR_COUPON_ERRORS });

// ================ Thunks ================ //

export const fetchCoupons = () => (dispatch, getState, sdk) => {
  dispatch(fetchCouponsRequest());

  return apiClient.fetchCoupons()
    .then(response => {
      dispatch(fetchCouponsSuccess(response.data || response));
      return response;
    })
    .catch(e => {
      dispatch(fetchCouponsError(storableError(e)));
      throw e;
    });
};

export const createCoupon = couponData => (dispatch, getState, sdk) => {
  dispatch(createCouponRequest());

  return apiClient.createCoupon(couponData)
    .then(response => {
      dispatch(createCouponSuccess(response.data || response));
      return response;
    })
    .catch(e => {
      dispatch(createCouponError(storableError(e)));
      throw e;
    });
};

export const updateCoupon = (couponId, couponData) => (dispatch, getState, sdk) => {
  dispatch(updateCouponRequest());

  return apiClient.updateCoupon(couponId, couponData)
    .then(response => {
      dispatch(updateCouponSuccess(response.data || response));
      return response;
    })
    .catch(e => {
      dispatch(updateCouponError(storableError(e)));
      throw e;
    });
};

export const deleteCoupon = couponId => (dispatch, getState, sdk) => {
  dispatch(deleteCouponRequest());

  return apiClient.deleteCoupon(couponId)
    .then(response => {
      dispatch(deleteCouponSuccess(couponId));
      return response;
    })
    .catch(e => {
      dispatch(deleteCouponError(storableError(e)));
      throw e;
    });
};
