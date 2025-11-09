/**
 * Extracts state/province name, state/province code, and country from an address string
 * using Google Maps Geocoding API or Mapbox Geocoding API.
 *
 * @param {string} address - The formatted address string (e.g., "14532 S Outer Forty Rd, Chesterfield, MO 63017, USA")
 * @returns {Promise<{stateName: string|null, stateCode: string|null, country: string|null}>}
 */
const geocodeAddress = async address => {
    if (!address || typeof address !== 'string') {
      return { stateName: null, stateCode: null, country: null };
    }
  
    const googleMapsAPIKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
    const mapboxAccessToken = process.env.REACT_APP_MAPBOX_ACCESS_TOKEN;
  
    // Try Google Maps first (if key is available)
    if (false) {
      try {
        const result = await geocodeWithGoogleMaps(address, googleMapsAPIKey);
        if (result) return result;
        console.log('result', result);
      } catch (error) {
        console.error('Google Maps geocoding error:', error);
      }
    }
  
    // Try Mapbox next (if token is available)
    if (mapboxAccessToken) {
      try {
        const result = await geocodeWithMapbox(address, mapboxAccessToken);
        if (result) return result;
      } catch (error) {
        console.error('Mapbox geocoding error:', error);
      }
    }
  
    // Fallback
    return { stateName: null, stateCode: null, country: null };
  };
  
  /**
   * Geocode address using Google Maps Geocoding API
   *
   * @param {string} address - The address string to geocode
   * @param {string} apiKey - Google Maps API key
   * @returns {Promise<{stateName: string|null, stateCode: string|null, country: string|null}|null>}
   */
  const geocodeWithGoogleMaps = async (address, apiKey) => {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;
  
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Google Maps API error: ${response.status} ${response.statusText}`);
        return null;
      }
  
      const data = await response.json();
      console.log('data', data);
      if (data.status !== 'OK' || !data.results?.length) return null;
  
      const components = data.results[0].address_components || [];
      console.log('components', components);
      let stateName = null;
      let stateCode = null;
      let country = null;
  
      for (const c of components) {
        const types = c.types || [];
  
        if (types.includes('administrative_area_level_1')) {
          stateName = c.long_name || null;
          stateCode = c.short_name?.toUpperCase() || null;
        }
        if (types.includes('country')) {
          country = c.short_name?.toUpperCase() || c.long_name || null;
        }
      }
  
      return { stateName, stateCode, country };
    } catch (error) {
      console.error('Error geocoding with Google Maps:', error);
      return null;
    }
  };
  
  /**
   * Geocode address using Mapbox Geocoding API
   *
   * @param {string} address - The address string to geocode
   * @param {string} accessToken - Mapbox access token
   * @returns {Promise<{stateName: string|null, stateCode: string|null, country: string|null}|null>}
   */
  const geocodeWithMapbox = async (address, accessToken) => {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${accessToken}&limit=1`;
  
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Mapbox API error: ${response.status} ${response.statusText}`);
        return null;
      }
  
      const data = await response.json();
      if (!data.features?.length) return null;
  
      const feature = data.features[0];
      const context = feature.context || [];
      let stateName = null;
      let stateCode = null;
      let country = null;
  
      for (const item of context) {
        const id = item.id || '';
  
        if (id.startsWith('region.')) {
          stateName = item.text || null;
          stateCode = item.short_code?.toUpperCase() || item.text || null;
        }
  
        if (id.startsWith('country.')) {
          country = item.short_code?.toUpperCase() || item.text || null;
        }
      }
  
      return { stateName, stateCode, country };
    } catch (error) {
      console.error('Error geocoding with Mapbox:', error);
      return null;
    }
  };
  
  module.exports = { geocodeAddress };
  