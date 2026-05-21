// Approximate geographic centroids for the place names the burningman.org
// events directory uses in its location field (US states, Canadian provinces,
// countries). The directory gives no coordinates, so the bm-directory adapter
// pins those burns at the centroid of their state/province/country — accurate
// enough for a world-overview map. Anything not found here (e.g. "Online")
// stays null and is reported as unmapped.

export const GEO_CENTROIDS = {
  // ----- US states + DC -----
  'Alabama': [32.8, -86.8], 'Alaska': [64.2, -152.0], 'Arizona': [34.2, -111.7],
  'Arkansas': [34.9, -92.4], 'California': [37.2, -119.5], 'Colorado': [39.0, -105.5],
  'Connecticut': [41.6, -72.7], 'Delaware': [39.0, -75.5], 'Florida': [28.6, -82.4],
  'Georgia': [32.6, -83.4], 'Hawaii': [20.8, -156.3], 'Idaho': [44.4, -114.6],
  'Illinois': [40.1, -89.2], 'Indiana': [39.9, -86.3], 'Iowa': [42.0, -93.5],
  'Kansas': [38.5, -98.4], 'Kentucky': [37.5, -85.3], 'Louisiana': [31.0, -92.0],
  'Maine': [45.4, -69.2], 'Maryland': [39.0, -76.8], 'Massachusetts': [42.3, -71.8],
  'Michigan': [44.3, -85.4], 'Minnesota': [46.3, -94.3], 'Mississippi': [32.7, -89.7],
  'Missouri': [38.4, -92.5], 'Montana': [47.0, -109.6], 'Nebraska': [41.5, -99.8],
  'Nevada': [39.3, -116.6], 'New Hampshire': [43.7, -71.6], 'New Jersey': [40.2, -74.7],
  'New Mexico': [34.4, -106.1], 'New York': [42.9, -75.6], 'North Carolina': [35.6, -79.4],
  'North Dakota': [47.5, -100.5], 'Ohio': [40.3, -82.8], 'Oklahoma': [35.6, -97.5],
  'Oregon': [44.0, -120.5], 'Pennsylvania': [40.9, -77.8], 'Rhode Island': [41.7, -71.6],
  'South Carolina': [33.9, -80.9], 'South Dakota': [44.4, -100.2], 'Tennessee': [35.8, -86.4],
  'Texas': [31.5, -99.3], 'Utah': [39.3, -111.7], 'Vermont': [44.1, -72.7],
  'Virginia': [37.5, -78.8], 'Washington': [47.4, -120.5], 'West Virginia': [38.6, -80.6],
  'Wisconsin': [44.6, -89.7], 'Wyoming': [43.0, -107.5], 'District of Columbia': [38.9, -77.0],

  // ----- Canadian provinces & territories -----
  'Alberta': [54.0, -114.5], 'British Columbia': [53.7, -125.0], 'Manitoba': [54.0, -97.0],
  'New Brunswick': [46.5, -66.0], 'Newfoundland and Labrador': [53.0, -60.0],
  'Nova Scotia': [45.0, -63.0], 'Ontario': [50.0, -85.0], 'Prince Edward Island': [46.4, -63.2],
  'Quebec': [52.0, -72.0], 'Saskatchewan': [54.0, -106.0],
  'Northwest Territories': [64.0, -119.0], 'Nunavut': [70.0, -90.0], 'Yukon': [63.0, -135.0],

  // ----- Countries -----
  'Argentina': [-38.0, -63.6], 'Australia': [-25.0, 134.0], 'Austria': [47.6, 14.1],
  'Belgium': [50.6, 4.6], 'Brazil': [-10.0, -53.0], 'Canada': [56.0, -106.0],
  'Chile': [-35.7, -71.5], 'China': [35.0, 105.0], 'Czech Republic': [49.8, 15.5],
  'Czechia': [49.8, 15.5], 'Denmark': [56.0, 10.0], 'Estonia': [58.7, 25.5],
  'Finland': [64.0, 26.0], 'France': [46.6, 2.4], 'Germany': [51.2, 10.4],
  'Hungary': [47.2, 19.5], 'India': [22.0, 79.0], 'Ireland': [53.4, -8.0],
  'Israel': [31.4, 35.0], 'Italy': [42.8, 12.6], 'Japan': [36.5, 138.0],
  'Latvia': [56.9, 24.9], 'Lithuania': [55.3, 23.9], 'Mexico': [23.6, -102.5],
  'Netherlands': [52.1, 5.3], 'New Zealand': [-41.5, 172.8], 'Norway': [64.0, 11.0],
  'Philippines': [12.9, 121.8], 'Poland': [52.0, 19.0], 'Portugal': [39.6, -8.0],
  'Romania': [45.9, 25.0], 'Russia': [61.5, 90.0], 'Singapore': [1.35, 103.8],
  'Slovakia': [48.7, 19.7], 'Slovenia': [46.1, 14.8], 'South Africa': [-29.0, 24.0],
  'South Korea': [36.5, 127.8], 'Spain': [40.2, -3.6], 'Sweden': [62.0, 15.0],
  'Switzerland': [46.8, 8.2], 'Taiwan': [23.8, 121.0], 'Thailand': [15.0, 101.0],
  'Ukraine': [49.0, 32.0], 'United Kingdom': [54.0, -2.5], 'United States': [39.8, -98.6],
};
