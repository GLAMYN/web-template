import { types as sdkTypes } from '../../util/sdkLoader';
import { userLocation } from '../../util/maps';

const { LatLng: SDKLatLng, LatLngBounds: SDKLatLngBounds } = sdkTypes;

export const CURRENT_LOCATION_ID = 'current-location';

const GENERATED_BOUNDS_DEFAULT_DISTANCE = 500; // meters

// Distances for generated bounding boxes for different Mapbox place types
const PLACE_TYPE_BOUNDS_DISTANCES = {
  address: 500,
  country: 2000,
  region: 2000,
  postcode: 2000,
  district: 2000,
  place: 2000,
  locality: 2000,
  neighborhood: 2000,
  poi: 2000,
  'poi.landmark': 2000,
};

/**
 * Generate bounds around a lat/lng with a given distance.
 */
const locationBounds = (latlng, distance) => {
  if (!latlng) return null;

  const bounds = new window.mapboxgl.LngLat(latlng.lng, latlng.lat).toBounds(distance);

  // Correct coordinate order: southwest -> northeast
  return new SDKLatLngBounds(
    new SDKLatLng(bounds.getSouth(), bounds.getWest()),
    new SDKLatLng(bounds.getNorth(), bounds.getEast())
  );
};

/**
 * Extract origin (lat/lng) from a Mapbox prediction.
 */
const placeOrigin = prediction => {
  if (prediction && Array.isArray(prediction.center) && prediction.center.length === 2) {
    // Mapbox stores coordinates as [lng, lat]
    return new SDKLatLng(prediction.center[1], prediction.center[0]);
  }
  return null;
};

/**
 * Compute bounds for a given Mapbox prediction.
 */
const placeBounds = prediction => {
  if (prediction) {
    if (Array.isArray(prediction.bbox) && prediction.bbox.length === 4) {
      // bbox format: [west, south, east, north]
      const [west, south, east, north] = prediction.bbox;
      return new SDKLatLngBounds(
        new SDKLatLng(south, west),
        new SDKLatLng(north, east)
      );
    } else {
      // Fallback: generate bounds around origin
      const placeType = Array.isArray(prediction.place_type) && prediction.place_type[0];
      const distance =
        (placeType && PLACE_TYPE_BOUNDS_DISTANCES[placeType]) || GENERATED_BOUNDS_DEFAULT_DISTANCE;

      return locationBounds(placeOrigin(prediction), distance);
    }
  }
  return null;
};

/**
 * Extracts state and country information from Mapbox prediction context.
 *
 * @param {Object} prediction - Mapbox prediction/feature object
 * @returns {Object} Object containing stateName, stateCode, and country
 */
const extractMapboxLocationMetadata = prediction => {
  let stateName = null;
  let stateCode = null;
  let country = null;

  if (prediction && Array.isArray(prediction.context)) {
    prediction.context.forEach(contextItem => {
      const id = contextItem.id || '';

      // region.* represents a state/province
      if (id.startsWith('region.')) {
        stateName = contextItem.text || null;
        stateCode = contextItem.short_code?.toUpperCase() || contextItem.text || null;
      }

      // country.* represents the country
      if (id.startsWith('country.')) {
        country = contextItem.short_code?.toUpperCase() || contextItem.text || null;
      }
    });
  }

  return { stateName, stateCode, country };
};

export const GeocoderAttribution = () => null;

/**
 * A forward geocoding (place name -> coordinates) implementation
 * using the Mapbox Geocoding API.
 */
class GeocoderMapbox {
  getClient() {
    const libLoaded = typeof window !== 'undefined' && window.mapboxgl && window.mapboxSdk;
    if (!libLoaded) {
      throw new Error('Mapbox libraries are required for GeocoderMapbox');
    }

    if (!window.mapboxgl.accessToken) {
      throw new Error('Mapbox access token not found in window.mapboxgl.accessToken');
    }

    if (!this._client) {
      this._client = window.mapboxSdk({
        accessToken: window.mapboxgl.accessToken,
      });
    }

    return this._client;
  }

  /**
   * Search places with the given name.
   *
   * @param {String} search - query for place names
   * @param {String[]} countryLimit - optional list of country codes to limit search
   * @param {String} locale - optional language code
   *
   * @return {Promise<{ search: String, predictions: Array<Object>}>}
   */
  getPlacePredictions(search, countryLimit, locale) {
    const limitCountriesMaybe = countryLimit ? { countries: countryLimit } : {};

    return this.getClient()
      .geocoding.forwardGeocode({
        query: search,
        limit: 5,
        ...limitCountriesMaybe,
        language: locale ? [locale] : undefined,
      })
      .send()
      .then(response => ({
        search,
        predictions: response.body.features,
      }));
  }

  /**
   * Get the ID of the given prediction.
   */
  getPredictionId(prediction) {
    return prediction.id;
  }

  /**
   * Get the address text of the given prediction.
   */
  getPredictionAddress(prediction) {
    if (prediction.predictionPlace) {
      return prediction.predictionPlace.address;
    }
    return prediction.place_name;
  }

  /**
   * Fetch or read place details from the selected prediction.
   *
   * @param {Object} prediction - selected prediction object
   * @param {Number} currentLocationBoundsDistance - optional bounds distance
   *
   * @return {Promise<Object>} a place object
   */
  getPlaceDetails(prediction, currentLocationBoundsDistance) {
    if (this.getPredictionId(prediction) === CURRENT_LOCATION_ID) {
      return userLocation().then(latlng => ({
        address: '',
        origin: latlng,
        bounds: locationBounds(latlng, currentLocationBoundsDistance),
      }));
    }

    if (prediction.predictionPlace) {
      return Promise.resolve(prediction.predictionPlace);
    }

    // Extract location metadata (state, country, etc.)
    const locationMetadata = extractMapboxLocationMetadata(prediction);

    return Promise.resolve({
      address: this.getPredictionAddress(prediction),
      origin: placeOrigin(prediction),
      bounds: placeBounds(prediction),
      ...locationMetadata,
    });
  }
}

export default GeocoderMapbox;
