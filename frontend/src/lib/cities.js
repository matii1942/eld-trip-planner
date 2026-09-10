/**
 * Major US cities and freight hubs, used for instant local type-ahead.
 *
 * The reason this list exists rather than a network call per keystroke:
 * Nominatim's usage policy forbids autocomplete outright ("strictly
 * forbidden and will get you banned"), and Photon's public instance asks
 * that request volume stay reasonable. Filtering a local list costs nothing,
 * responds instantly, and keeps the geocoders for what they are good at --
 * resolving the three locations once, when the trip is actually planned.
 *
 * Anything not on this list still works: the field accepts free text and the
 * backend geocodes it at plan time.
 */
export const CITIES = [
  "New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX",
  "Phoenix, AZ", "Philadelphia, PA", "San Antonio, TX", "San Diego, CA",
  "Dallas, TX", "San Jose, CA", "Austin, TX", "Jacksonville, FL",
  "Fort Worth, TX", "Columbus, OH", "Charlotte, NC", "Indianapolis, IN",
  "San Francisco, CA", "Seattle, WA", "Denver, CO", "Washington, DC",
  "Boston, MA", "El Paso, TX", "Nashville, TN", "Oklahoma City, OK",
  "Las Vegas, NV", "Detroit, MI", "Portland, OR", "Memphis, TN",
  "Louisville, KY", "Milwaukee, WI", "Baltimore, MD", "Albuquerque, NM",
  "Tucson, AZ", "Fresno, CA", "Sacramento, CA", "Mesa, AZ",
  "Kansas City, MO", "Atlanta, GA", "Omaha, NE", "Colorado Springs, CO",
  "Raleigh, NC", "Virginia Beach, VA", "Long Beach, CA", "Miami, FL",
  "Oakland, CA", "Minneapolis, MN", "Tulsa, OK", "Bakersfield, CA",
  "Wichita, KS", "Arlington, TX", "Aurora, CO", "Tampa, FL",
  "New Orleans, LA", "Cleveland, OH", "Honolulu, HI", "Anaheim, CA",
  "Lexington, KY", "Stockton, CA", "Corpus Christi, TX", "Henderson, NV",
  "Riverside, CA", "Newark, NJ", "Saint Paul, MN", "Santa Ana, CA",
  "Cincinnati, OH", "Irvine, CA", "Orlando, FL", "Pittsburgh, PA",
  "St. Louis, MO", "Greensboro, NC", "Jersey City, NJ", "Anchorage, AK",
  "Lincoln, NE", "Plano, TX", "Durham, NC", "Buffalo, NY",
  "Chandler, AZ", "Chula Vista, CA", "Toledo, OH", "Madison, WI",
  "Gilbert, AZ", "Reno, NV", "Fort Wayne, IN", "North Las Vegas, NV",
  "St. Petersburg, FL", "Lubbock, TX", "Irving, TX", "Laredo, TX",
  "Winston-Salem, NC", "Chesapeake, VA", "Glendale, AZ", "Scottsdale, AZ",
  "Garland, TX", "Boise, ID", "Norfolk, VA", "Spokane, WA",
  "Fremont, CA", "Richmond, VA", "Santa Clarita, CA", "San Bernardino, CA",
  "Baton Rouge, LA", "Hialeah, FL", "Tacoma, WA", "Modesto, CA",
  "Port St. Lucie, FL", "Huntsville, AL", "Des Moines, IA", "Moreno Valley, CA",
  "Fontana, CA", "Frisco, TX", "Rochester, NY", "Yonkers, NY",
  "Fayetteville, NC", "Worcester, MA", "Columbus, GA", "Cape Coral, FL",
  "McKinney, TX", "Little Rock, AR", "Oxnard, CA", "Amarillo, TX",
  "Augusta, GA", "Salt Lake City, UT", "Montgomery, AL", "Birmingham, AL",
  "Grand Rapids, MI", "Grand Prairie, TX", "Overland Park, KS", "Tallahassee, FL",
  "Huntington Beach, CA", "Sioux Falls, SD", "Peoria, AZ", "Knoxville, TN",
  "Glendale, CA", "Vancouver, WA", "Providence, RI", "Akron, OH",
  "Brownsville, TX", "Mobile, AL", "Newport News, VA", "Tempe, AZ",
  "Shreveport, LA", "Chattanooga, TN", "Fort Lauderdale, FL", "Aurora, IL",
  "Elk Grove, CA", "Ontario, CA", "Salem, OR", "Cary, NC",
  "Santa Rosa, CA", "Rancho Cucamonga, CA", "Eugene, OR", "Oceanside, CA",
  "Clarksville, TN", "Garden Grove, CA", "Lancaster, CA", "Springfield, MO",
  "Pembroke Pines, FL", "Fort Collins, CO", "Palmdale, CA", "Salinas, CA",
  "Hayward, CA", "Corona, CA", "Paterson, NJ", "Murfreesboro, TN",
  "Macon, GA", "Lakewood, CO", "Killeen, TX", "Springfield, MA",
  "Alexandria, VA", "Kansas City, KS", "Sunnyvale, CA", "Hollywood, FL",
  "Roseville, CA", "Charleston, SC", "Escondido, CA", "Joliet, IL",
  "Jackson, MS", "Bellevue, WA", "Surprise, AZ", "Naperville, IL",
  "Pasadena, TX", "Pomona, CA", "Bridgeport, CT", "Denton, TX",
  "Rockford, IL", "Mesquite, TX", "Savannah, GA", "Syracuse, NY",
  "McAllen, TX", "Torrance, CA", "Olathe, KS", "Visalia, CA",
  "Thornton, CO", "Fullerton, CA", "Gainesville, FL", "Waco, TX",
  "West Valley City, UT", "Warren, MI", "Hampton, VA", "Dayton, OH",
  "Columbia, SC", "Orange, CA", "Cedar Rapids, IA", "Stamford, CT",
  "Victorville, CA", "Pasadena, CA", "Elizabeth, NJ", "New Haven, CT",
  "Miramar, FL", "Kent, WA", "Sterling Heights, MI", "Carrollton, TX",
  "Coral Springs, FL", "Midland, TX", "Norman, OK", "Athens, GA",
  "Santa Clara, CA", "Columbia, MO", "Fargo, ND", "Pearland, TX",
  "Simi Valley, CA", "Topeka, KS", "Meridian, ID", "Allentown, PA",
  "Thousand Oaks, CA", "Abilene, TX", "Vallejo, CA", "Concord, CA",
  "Round Rock, TX", "Arvada, CO", "Clovis, CA", "Palm Bay, FL",
  "Independence, MO", "Lafayette, LA", "Ann Arbor, MI", "Rochester, MN",
  "Hartford, CT", "College Station, TX", "Fairfield, CA", "Wilmington, NC",
  "North Charleston, SC", "Billings, MT", "West Palm Beach, FL", "Berkeley, CA",
  "Cambridge, MA", "Clearwater, FL", "West Jordan, UT", "Evansville, IN",
  "Richardson, TX", "Broken Arrow, OK", "Richmond, CA", "League City, TX",
  "Manchester, NH", "Lakeland, FL", "Carlsbad, CA", "Antioch, CA",
  "Westminster, CO", "High Point, NC", "Provo, UT", "Lowell, MA",
  "Elgin, IL", "Waterbury, CT", "Springfield, IL", "Gresham, OR",
  "Murrieta, CA", "Lewisville, TX", "Las Cruces, NM", "Lansing, MI",
  "Beaumont, TX", "Odessa, TX", "Pueblo, CO", "Peoria, IL",
  "Downey, CA", "Pompano Beach, FL", "Miami Gardens, FL", "Temecula, CA",
  "Everett, WA", "Costa Mesa, CA", "San Buenaventura, CA", "Sparks, NV",
  "Santa Maria, CA", "Sugar Land, TX", "Greeley, CO", "South Fulton, GA",
  "Dearborn, MI", "Concord, NC", "Tyler, TX", "Sandy Springs, GA",
  "West Covina, CA", "Green Bay, WI", "Centennial, CO", "Jurupa Valley, CA",
  "El Monte, CA", "Allen, TX", "Hillsboro, OR", "Menifee, CA",
  "Nampa, ID", "Spokane Valley, WA", "Rio Rancho, NM", "Brockton, MA",
];

/** Case-insensitive prefix-then-substring match, best matches first. */
export function searchCities(query, limit = 6) {
  const q = (query || "").trim().toLowerCase();
  if (q.length < 2) return [];

  const starts = [];
  const contains = [];
  for (const city of CITIES) {
    const lower = city.toLowerCase();
    if (lower.startsWith(q)) starts.push(city);
    else if (lower.includes(q)) contains.push(city);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
